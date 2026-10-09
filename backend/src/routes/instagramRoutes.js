const express = require("express");
const router = express.Router();
const { igGet } = require("../services/igClient");
const prisma = require("../services/db");
const { getAccount, listActiveAccounts } = require("../services/accountRepository");

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

    res.json({ ...normalized, follows, unfollows, unsupported_metrics: unsupported });
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code });
  }
});

// c) Últimos posts
router.get("/accounts/:apelido/media", async (req, res) => {
  const { apelido } = req.params;
  const { limit = 12 } = req.query;
  const account = await loadAccount(apelido, res, "Apelido não encontrado");
  if (!account) return;

  try {
    const data = await igGet(
      `${account.userId}/media`,
      {
        fields:
          "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count",
        limit,
      },
      account.token,
    );
    res.json(data.data);
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
    const allMetrics = [
      "reach",
      "views",
      "likes",
      "comments",
      "shares",
      "saved",
      "total_interactions",
    ];
    let metrics = allMetrics;
    const unsupported = [];

    let data;
    // Erro 100: remove da lista as métricas citadas na mensagem e repete.
    for (;;) {
      try {
        data = await igGet(
          `${mediaId}/insights`,
          { metric: metrics.join(",") },
          account.token,
        );
        break;
      } catch (e) {
        const bad =
          e.code === 100
            ? metrics.filter((m) => new RegExp(`\\b${m}\\b`).test(e.message))
            : [];
        // sem métrica identificável (ou todas): não dá para degradar, propaga
        if (!bad.length || bad.length === metrics.length) throw e;
        unsupported.push(...bad);
        metrics = metrics.filter((m) => !bad.includes(m));
      }
    }

    const normalized = {};
    allMetrics.forEach((m) => (normalized[m] = null));
    data.data.forEach((item) => {
      normalized[item.name] = item.values?.[0]?.value ?? null;
    });

    res.json({ ...normalized, unsupported_metrics: unsupported });
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code });
  }
});

module.exports = router;
