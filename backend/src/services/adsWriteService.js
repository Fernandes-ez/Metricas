// Fase 2 — escrita segura em anúncios: pausar/ativar e alterar orçamento diário.
//
// Trava do teto (regra de 30/10/2026): só o que AUMENTA o gasto passa por ela.
//   - Sempre liberado: pausar, diminuir orçamento (com ou sem teto).
//   - Ativar ou aumentar: exige teto mensal na conta e recusa se
//       gasto do mês + novo ritmo diário × dias restantes > teto, ou
//       novo ritmo diário × 30,44 > teto.
// O ritmo diário é simulado sobre a estrutura lida na hora (sem cache): campanha ligada + conjunto
// ligado + ao menos um anúncio ligado; o orçamento conta onde está (campanha CBO ou conjuntos).
// Toda tentativa (ok, bloqueada ou com erro) vai para ad_change_log.
const prisma = require("./db");
const { adsPost, invalidate } = require("./adsClient");
const { structure, insights, guard, round2, todaySP } = require("./adsService");

const DAYS_PER_MONTH = 30.44;
// estados em que o objeto não volta a entregar só por estar ACTIVE
const BLOCKED = new Set(["DISAPPROVED", "ARCHIVED", "DELETED"]);
const TYPES = { campanha: "campaign", conjunto: "adset", anuncio: "ad" };

// uma escrita por conta de cada vez (evita dois aumentos simultâneos passarem pela trava)
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(key, run.catch(() => {}));
  return run;
}

class WriteError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.httpStatus = status;
    Object.assign(this, extra);
  }
}

// acha o objeto na estrutura da conta (garante que ele é DESTA conta)
function findObject(campanhas, type, id) {
  for (const c of campanhas) {
    if (type === "campaign" && c.id === id) return { node: c, campaign: c };
    for (const s of c.conjuntos) {
      if (type === "adset" && s.id === id) return { node: s, campaign: c, adset: s };
      for (const a of s.anuncios) if (type === "ad" && a.id === id) return { node: a, campaign: c, adset: s };
    }
  }
  return null;
}

// orçamento diário comprometido simulando uma mudança { id, field: 'status'|'daily_budget', value }
function committedDaily(campanhas, change) {
  const status = (n) => (change && change.id === n.id && change.field === "status" ? change.value : n.status);
  const budget = (n) =>
    change && change.id === n.id && change.field === "daily_budget" ? change.value : n.orcamento_diario;
  const on = (n) => status(n) === "ACTIVE" && !BLOCKED.has(n.status_efetivo);

  let daily = 0;
  for (const c of campanhas) {
    if (!on(c)) continue;
    const live = c.conjuntos.filter((s) => on(s) && s.anuncios.some(on));
    if (!live.length) continue;
    if (c.orcamento_no === "campanha") daily += budget(c) ?? 0;
    else for (const s of live) daily += budget(s) ?? 0;
  }
  return round2(daily);
}

// dias que faltam no mês (incluindo hoje) no fuso da conta
function daysLeftInMonth(timezone) {
  let today;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "America/Sao_Paulo" }).format(new Date());
  } catch {
    today = todaySP();
  }
  const [y, m, d] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return lastDay - d + 1;
}

async function log(entry) {
  await prisma.adChangeLog.create({ data: entry }).catch(console.error);
}

/**
 * Executa (ou simula) uma alteração.
 * req: { tipo: campanha|conjunto|anuncio, id, campo: 'status'|'daily_budget', valor, origem, simular }
 *   status: 'ACTIVE' | 'PAUSED'; daily_budget: número em reais (moeda da conta)
 */
async function applyChange(account, req) {
  const objectType = TYPES[req.tipo];
  if (!objectType) throw new WriteError(400, "tipo deve ser campanha, conjunto ou anuncio");
  if (!/^\d{5,30}$/.test(String(req.id || ""))) throw new WriteError(400, "id inválido");
  const field = req.campo;
  if (field === "status" && !["ACTIVE", "PAUSED"].includes(req.valor))
    throw new WriteError(400, "status deve ser ACTIVE ou PAUSED");
  if (field === "daily_budget") {
    if (objectType === "ad") throw new WriteError(400, "anúncio não tem orçamento; altere a campanha ou o conjunto");
    if (!(typeof req.valor === "number" && Number.isFinite(req.valor) && req.valor > 0))
      throw new WriteError(400, "orcamento_diario deve ser um número positivo (em reais)");
  }
  if (!["status", "daily_budget"].includes(field)) throw new WriteError(400, "campo inválido");
  if (!account.token) throw new WriteError(409, `Token ${account.tokenLabel} inválido; gere outro.`);

  return withLock(account.adAccountId, async () => {
    // estrutura lida na hora, sem cache
    invalidate(account.adAccountId);
    const { campanhas } = await structure(account);
    const found = findObject(campanhas, objectType, String(req.id));
    if (!found) throw new WriteError(404, `${req.tipo} ${req.id} não encontrado(a) na conta ${account.adAccountId} (${account.alias})`);
    const { node, campaign } = found;

    // valor atual e validações específicas do orçamento
    let oldValue;
    let value = req.valor;
    if (field === "status") {
      oldValue = node.status;
    } else {
      if (objectType === "adset" && campaign.orcamento_no === "campanha")
        throw new WriteError(400, `O orçamento desta campanha fica na campanha (CBO). Altere a campanha ${campaign.id} (${campaign.nome}).`);
      if (objectType === "campaign" && campaign.orcamento_no !== "campanha")
        throw new WriteError(400, "Esta campanha não tem orçamento próprio; o orçamento fica nos conjuntos.");
      if (node.orcamento_total && !node.orcamento_diario)
        throw new WriteError(400, "Este objeto usa orçamento vitalício; só orçamento diário pode ser alterado por aqui.");
      oldValue = node.orcamento_diario;
      value = round2(value);
    }

    const change = { id: node.id, field, value };
    const dailyBefore = committedDaily(campanhas);
    const dailyAfter = committedDaily(campanhas, change);
    const increases = dailyAfter > dailyBefore + 0.004;

    const base = {
      adAccountId: account.adAccountId,
      alias: account.alias,
      source: req.origem || "api",
      objectType,
      objectId: node.id,
      objectName: node.nome,
      field,
      oldValue: oldValue === null || oldValue === undefined ? null : String(oldValue),
      newValue: String(value),
      dailyBefore,
      dailyAfter,
    };
    const summary = {
      apelido: account.alias,
      ad_account_id: account.adAccountId,
      objeto: { tipo: req.tipo, id: node.id, nome: node.nome },
      campo: field === "status" ? "status" : "orcamento_diario",
      antes: oldValue ?? null,
      depois: value,
      orcamento_diario_ativo_antes: dailyBefore,
      orcamento_diario_ativo_depois: dailyAfter,
      teto_mensal: account.monthlyCap,
    };

    if (String(oldValue) === String(value))
      return { ...summary, executado: false, mensagem: "Nada a fazer: o valor já é esse." };

    // trava do teto (só para o que aumenta o gasto)
    if (increases) {
      if (!account.monthlyCap) {
        const message = `Conta ${account.alias} sem teto mensal: ativar ou aumentar orçamento está bloqueado. Defina o teto com: npm run ads -- conta ${account.alias} ${account.adAccountId} ${account.tokenLabel} <valor>`;
        if (!req.simular) await log({ ...base, result: "bloqueado", message });
        throw new WriteError(422, message, { detalhe: summary });
      }
      const spent = (await insights(account, { level: "account", preset: "this_month", force: true })).totais.gasto ?? 0;
      const days = daysLeftInMonth(account.timezone);
      const projectedMonth = round2(spent + dailyAfter * days);
      const projectedRate = round2(dailyAfter * DAYS_PER_MONTH);
      Object.assign(summary, {
        gasto_mes: round2(spent),
        dias_restantes: days,
        projecao_fim_do_mes: projectedMonth,
        projecao_mensal_no_ritmo: projectedRate,
      });
      if (projectedMonth > account.monthlyCap || projectedRate > account.monthlyCap) {
        const message =
          `Bloqueado pela trava do teto (R$${account.monthlyCap}): ` +
          `gasto do mês R$${round2(spent)} + R$${dailyAfter}/dia × ${days} dia(s) = R$${projectedMonth}; ` +
          `no ritmo mensal = R$${projectedRate}.`;
        if (!req.simular) await log({ ...base, result: "bloqueado", message });
        throw new WriteError(422, message, { detalhe: summary });
      }
    }

    if (req.simular) return { ...summary, executado: false, simulacao: true, mensagem: "Simulação: nada foi alterado." };

    const params = field === "status" ? { status: value } : { daily_budget: Math.round(value * 100) };
    try {
      await guard(account, () => adsPost(node.id, params, account.token));
    } catch (e) {
      await log({ ...base, result: "erro", message: e.message });
      throw e;
    } finally {
      invalidate(account.adAccountId);
    }
    await log({ ...base, result: "ok", message: null });
    return { ...summary, executado: true, mensagem: "Alteração aplicada na Meta." };
  });
}

async function listChanges(adAccountIds, limit = 20) {
  const rows = await prisma.adChangeLog.findMany({
    where: { adAccountId: { in: adAccountIds } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    quando: r.createdAt,
    ad_account_id: r.adAccountId,
    origem: r.source,
    objeto: { tipo: r.objectType, id: r.objectId, nome: r.objectName },
    campo: r.field,
    antes: r.oldValue,
    depois: r.newValue,
    orcamento_diario_ativo_antes: r.dailyBefore === null ? null : Number(r.dailyBefore),
    orcamento_diario_ativo_depois: r.dailyAfter === null ? null : Number(r.dailyAfter),
    resultado: r.result,
    mensagem: r.message,
  }));
}

module.exports = { applyChange, listChanges, WriteError, withLock, log };
