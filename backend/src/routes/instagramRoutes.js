const express = require("express");
const router = express.Router();
const { igGet, cacheHeader } = require("../services/igClient");
const prisma = require("../services/db");
const { getAccount, listActiveAccounts } = require("../services/accountRepository");
const { dropNegatives, mediaInsights, withMetrics, sortPosts, SORT_KEYS } = require("../services/mediaInsights");

router.use(cacheHeader);

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,media_url,thumbnail_url";

// 404 se não existe, 409 se precisa reconectar; senão devolve a conta (já com token)
async function loadAccount(alias, res, notFoundMsg) {
  const account = alias ? await getAccount(alias) : null;
  if (!account) {
    res.status(404).json({ error: notFoundMsg });
    return null;
  }
  if (account.status === "needs_reauth") {
    res.status(409).json({ error: "Conta precisa ser reconectada" });
    return null;
  }
  return account;
}

// Status dos tokens (sem tokens)
router.get("/accounts/status", async (req, res) => {
  try {
    const rows = await prisma.igAccount.findMany({ orderBy: { alias: "asc" } });
    res.json(
      rows.map((r) => ({
        alias: r.alias,
        username: r.username,
        status: r.status,
        token_expires_at: r.tokenExpiresAt,
        dias_restantes: Math.ceil((r.tokenExpiresAt - Date.now()) / 86400000),
        last_error: r.lastError,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// a) Listar contas
router.get("/accounts", async (req, res) => {
  try {
    const results = [];
    // contas needs_reauth ficam de fora (ver /accounts/status)
    for (const { alias: apelido, token } of await listActiveAccounts()) {
      const data = await igGet(
        "me",
        {
          fields: "user_id,username,followers_count,media_count",
        },
        token,
      );
      const { id, ...rest } = data;
      results.push({ apelido, ...rest });
    }
    res.json(results);
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code });
  }
});

// b) Insights da conta
router.get("/accounts/:apelido/insights", async (req, res) => {
  const { apelido } = req.params;
  const account = await loadAccount(apelido, res, "Apelido não encontrado");
  if (!account) return;

  let { since, until } = req.query;
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60;

  const sinceTimestamp = since
    ? Math.floor(new Date(since).getTime() / 1000)
    : sevenDaysAgo;
  const untilTimestamp = until
    ? Math.floor(new Date(until).getTime() / 1000)
    : now;

  // Validações
  if (untilTimestamp <= sinceTimestamp)
    return res.status(400).json({ error: "until deve ser maior que since" });
  if (untilTimestamp - sinceTimestamp > 30 * 24 * 60 * 60)
    return res.status(400).json({ error: "Intervalo máximo de 30 dias" });
  if (now - sinceTimestamp > 90 * 24 * 60 * 60)
    return res
      .status(400)
      .json({ error: "Since não pode ser mais antigo que 90 dias" });

  const metrics = [
    "reach",
    "views",
    "accounts_engaged",
    "total_interactions",
    "likes",
    "comments",
    "shares",
    "saves",
    "profile_views",
  ];
  const params = {
    period: "day",
    metric_type: "total_value",
    since: sinceTimestamp,
    until: untilTimestamp,
  };

  try {
    const data = await igGet(
      `${account.userId}/insights`,
      { ...params, metric: metrics.join(",") },
      account.token,
    );

    // Normalização
    const normalized = {};
    metrics.forEach((m) => (normalized[m] = null));

    data.data.forEach((item) => {
      normalized[item.name] = item.total_value?.value ?? null;
    });

    // follows_and_unfollows exige breakdown=follow_type (e >=100 seguidores),
    // então vai em chamada separada que não derruba a rota.
    // ponytail: FOLLOWER=follows, NON_FOLLOWER=unfollows (mapeamento a confirmar no payload real)
    let follows = null;
    let unfollows = null;
    const unsupported = [];
    try {
      const f = await igGet(
        `${account.userId}/insights`,
        { ...params, metric: "follows_and_unfollows", breakdown: "follow_type" },
        account.token,
      );
      const results = f.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      const pick = (k) =>
        results.find((r) => r.dimension_values?.[0] === k)?.value ?? null;
      follows = pick("FOLLOWER");
      unfollows = pick("NON_FOLLOWER");
    } catch {
      unsupported.push("follows_and_unfollows");
    }

    const out = { ...normalized, follows, unfollows };
    dropNegatives(out, [...metrics, "follows", "unfollows"], unsupported);
    res.json({ ...out, unsupported_metrics: unsupported });
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code });
  }
});

// c) Últimos posts.
// Sem ?ordenar: comportamento original (lista crua do Instagram).
// Com ?ordenar=data|reach|views|total_interactions|likes|comments|shares|saved[&ordem=asc|desc][&limite=N]:
// ordena entre os N posts mais recentes (máx. 50) usando insights em cache no Postgres; só busca na
// Graph API os posts sem cache ou vencidos (1 h para posts de até 7 dias, 24 h para os mais antigos).
router.get("/accounts/:apelido/media", async (req, res) => {
  const { apelido } = req.params;
  const { ordenar, ordem = "desc" } = req.query;
  const limit = req.query.limite ?? req.query.limit ?? 12;

  if (ordenar !== undefined) {
    if (!SORT_KEYS.includes(ordenar))
      return res.status(400).json({ error: `ordenar deve ser um de: ${SORT_KEYS.join(", ")}` });
    if (!["asc", "desc"].includes(ordem))
      return res.status(400).json({ error: "ordem deve ser asc ou desc" });
  }
  const account = await loadAccount(apelido, res, "Apelido não encontrado");
  if (!account) return;

  try {
    const n = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
    const data = await igGet(
      `${account.userId}/media`,
      { fields: MEDIA_FIELDS, limit: ordenar === undefined ? limit : n },
      account.token,
    );
    if (ordenar === undefined) return res.json(data.data);

    // ordenar=data só lê o cache (não gasta chamadas); as métricas vêm se já existirem
    const { posts, pending } = await withMetrics(account, data.data, { refresh: ordenar !== "data" });
    res.set("X-Insights-Pending", String(pending)); // >0: ainda atualizando em segundo plano
    res.json(sortPosts(posts, ordenar, ordem));
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code });
  }
});

// c2) Últimos posts já com insights (concorrência máx. 4; erro num post não derruba a lista)
router.get("/accounts/:apelido/media-insights", async (req, res) => {
  const { apelido } = req.params;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
  const account = await loadAccount(apelido, res, "Apelido não encontrado");
  if (!account) return;

  try {
    const media = (
      await igGet(`${account.userId}/media`, { fields: MEDIA_FIELDS, limit }, account.token)
    ).data;
    const out = new Array(media.length);
    let next = 0;
    const worker = async () => {
      while (next < media.length) {
        const i = next++;
        try {
          out[i] = { ...media[i], insights: await mediaInsights(media[i].id, account.token) };
        } catch (e) {
          out[i] = { ...media[i], insights: null, error: e.message };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, media.length) }, worker));
    res.json(out);
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code });
  }
});

// d) Insights de um post
router.get("/media/:mediaId/insights", async (req, res) => {
  const { mediaId } = req.params;
  const { account: apelido } = req.query;
  const account = await loadAccount(
    apelido,
    res,
    "Apelido obrigatório e deve existir",
  );
  if (!account) return;

  try {
    res.json(await mediaInsights(mediaId, account.token));
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code });
  }
});

module.exports = router;
