// Rotas de anúncios (Marketing API) — Fase 1: somente leitura.
const express = require("express");
const router = express.Router();
const { listAdAccounts } = require("../services/adsRepository");
const { PRESETS, LEVELS, accountSummary, structure, insights, todaySP } = require("../services/adsService");

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sendError(res, error) {
  if (error.isAuth)
    return res.status(409).json({
      error: "Token de anúncios inválido ou revogado. Gere outro token no usuário do sistema e rode: npm run ads -- token <LABEL>",
      code: error.code,
    });
  if (error.isRateLimit)
    return res.status(429).json({ error: "Limite de chamadas da Marketing API atingido; tente em alguns minutos.", code: error.code });
  if (error.isPermission)
    return res.status(403).json({
      error: `Sem permissão nessa conta de anúncios (confira se ela está atribuída ao usuário do sistema): ${error.message}`,
      code: error.code,
    });
  return res.status(502).json({ error: error.message, code: error.code });
}

// contas do perfil; 404 se não houver nenhuma cadastrada
async function loadAccounts(apelido, res) {
  const alias = String(apelido || "").trim().toUpperCase();
  const accounts = await listAdAccounts(alias);
  if (!accounts.length) {
    res.status(404).json({ error: `Perfil ${alias} sem conta de anúncios cadastrada` });
    return null;
  }
  return { alias, accounts };
}

// por conta: erro de uma conta não derruba as outras
async function perAccount(accounts, fn) {
  return Promise.all(
    accounts.map(async (a) => {
      const base = { ad_account_id: a.adAccountId, nome: a.name, moeda: a.currency };
      if (!a.token) return { ...base, erro: `Token ${a.tokenLabel} inválido: ${a.tokenError ?? "gere outro"}` };
      try {
        return { ...base, ...(await fn(a)) };
      } catch (e) {
        if (accounts.length === 1) throw e;
        return { ...base, erro: e.message, codigo: e.code ?? null };
      }
    }),
  );
}

// a) Todas as contas de anúncios: perfil, nome, status, teto, gasto do mês
router.get("/ads/accounts", async (req, res) => {
  try {
    const accounts = await listAdAccounts();
    res.json(await Promise.all(accounts.map(accountSummary)));
  } catch (error) {
    sendError(res, error);
  }
});

// b) Estrutura do perfil: campanhas > conjuntos > anúncios + orçamento comprometido x teto
//    ?status=todas (padrão; sem excluídas/arquivadas) | ativas (só o que está gastando ou em análise)
router.get("/ads/:apelido/campaigns", async (req, res) => {
  const { status = "todas" } = req.query;
  if (!["todas", "ativas"].includes(status))
    return res.status(400).json({ error: "status deve ser todas ou ativas" });
  try {
    const loaded = await loadAccounts(req.params.apelido, res);
    if (!loaded) return;
    const contas = await perAccount(loaded.accounts, (a) => structure(a, { onlyActive: status === "ativas" }));
    res.json({ apelido: loaded.alias, status, contas });
  } catch (error) {
    sendError(res, error);
  }
});

// c) Insights do perfil
//    ?nivel=conta|campanha (padrão)|conjunto|anuncio
//    ?periodo=hoje|7d|14d|30d (padrão)|mes_atual|mes_passado  — 7d/14d/30d não incluem hoje
//    ou ?desde=YYYY-MM-DD&ate=YYYY-MM-DD (fuso da conta de anúncios)
router.get("/ads/:apelido/insights", async (req, res) => {
  const { nivel = "campanha", periodo, desde, ate } = req.query;
  const level = LEVELS[nivel];
  if (!level) return res.status(400).json({ error: `nivel deve ser um de: ${Object.keys(LEVELS).join(", ")}` });

  let range;
  if (desde || ate) {
    if (!DATE.test(desde || "") || !DATE.test(ate || ""))
      return res.status(400).json({ error: "desde e ate são obrigatórios juntos, no formato YYYY-MM-DD" });
    if (desde > ate) return res.status(400).json({ error: "desde deve ser menor ou igual a ate" });
    if (ate > todaySP()) return res.status(400).json({ error: "ate não pode estar no futuro" });
    range = { since: desde, until: ate };
  } else {
    const preset = PRESETS[periodo ?? "30d"];
    if (!preset) return res.status(400).json({ error: `periodo deve ser um de: ${Object.keys(PRESETS).join(", ")}` });
    range = { preset };
  }

  try {
    const loaded = await loadAccounts(req.params.apelido, res);
    if (!loaded) return;
    const contas = await perAccount(loaded.accounts, (a) => insights(a, { level, ...range }));
    res.json({ apelido: loaded.alias, nivel, contas });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
