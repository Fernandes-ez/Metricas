// Regras de leitura de anúncios: info da conta, estrutura (campanhas > conjuntos > anúncios),
// orçamento comprometido x teto e insights normalizados (com cache no Postgres).
const prisma = require("./db");
const { adsGet, adsGetAll, cached } = require("./adsClient");
const { markTokenInvalid, updateAccountInfo } = require("./adsRepository");

const DAYS_PER_MONTH = 30.44;

// account_status da Marketing API
const ACCOUNT_STATUS = {
  1: "ATIVA",
  2: "DESATIVADA",
  3: "PAGAMENTO_PENDENTE",
  7: "EM_ANALISE_DE_RISCO",
  8: "ACERTO_PENDENTE",
  9: "PERIODO_DE_CARENCIA",
  100: "ENCERRAMENTO_PENDENTE",
  101: "ENCERRADA",
  201: "ATIVA",
  202: "ENCERRADA",
};

// estados que gastam (ou vão gastar assim que aprovados)
const SPENDING = new Set(["ACTIVE", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "PREAPPROVED"]);

const round2 = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
const money = (s) => (s === undefined || s === null || s === "" ? null : Number(s));
// orçamentos vêm em unidade mínima (centavos para BRL/USD)
const budget = (s) => (s === undefined || s === null || s === "" ? null : Number(s) / 100);
const todaySP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

// erro de token derruba o token no banco (status invalid) para não ficar repetindo chamadas
async function guard(account, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.isAuth) await markTokenInvalid(account.tokenId, e.message);
    throw e;
  }
}

// ---------- info da conta ----------

async function accountInfo(account) {
  return guard(account, () =>
    cached(`${account.token}|info|${account.adAccountId}`, async () => {
      const info = await adsGet(
        account.adAccountId,
        { fields: "name,currency,timezone_name,account_status,disable_reason" },
        account.token,
      );
      if (info.name !== account.name || info.currency !== account.currency || info.timezone_name !== account.timezone)
        await updateAccountInfo(account.adAccountId, {
          name: info.name,
          currency: info.currency,
          timezone: info.timezone_name,
        });
      return info;
    }),
  );
}

async function monthSpend(account) {
  const r = await insights(account, { level: "account", preset: "this_month" });
  return r.totais.gasto ?? 0;
}

// resumo para listar_contas_anuncio
async function accountSummary(account) {
  const base = {
    apelido: account.alias,
    ad_account_id: account.adAccountId,
    nome: account.name,
    moeda: account.currency,
    teto_mensal: account.monthlyCap,
    token: account.tokenLabel,
    token_status: account.tokenStatus,
  };
  if (!account.token) return { ...base, erro: `Token ${account.tokenLabel} inválido: ${account.tokenError ?? "gere outro"}` };
  try {
    const info = await accountInfo(account);
    const gasto = await monthSpend(account);
    return {
      ...base,
      nome: info.name,
      moeda: info.currency,
      fuso: info.timezone_name,
      status_conta: ACCOUNT_STATUS[info.account_status] ?? String(info.account_status),
      gasto_mes: round2(gasto),
      uso_teto: account.monthlyCap ? round2(gasto / account.monthlyCap) : null,
    };
  } catch (e) {
    return { ...base, erro: e.message, codigo: e.code ?? null };
  }
}

// ---------- estrutura ----------

const CAMPAIGN_FIELDS =
  "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,created_time";
const ADSET_FIELDS =
  "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,destination_type,billing_event,start_time,end_time,created_time";
const AD_FIELDS = "id,name,adset_id,campaign_id,status,effective_status,created_time,creative{id,name}";

// onlyActive filtra AQUI (não no parâmetro effective_status da Meta, que omitiu anúncio ativo em 30/10/2026)
async function structure(account, { onlyActive = false } = {}) {
  const get = (edge, fields) =>
    cached(`${account.token}|${edge}|${account.adAccountId}|all`, () =>
      adsGetAll(`${account.adAccountId}/${edge}`, { fields, limit: 200 }, account.token),
    );

  let [campaigns, adsets, ads] = await guard(account, () =>
    Promise.all([get("campaigns", CAMPAIGN_FIELDS), get("adsets", ADSET_FIELDS), get("ads", AD_FIELDS)]),
  );
  if (onlyActive) {
    const live = (x) => SPENDING.has(x.effective_status);
    campaigns = campaigns.filter(live);
    adsets = adsets.filter(live);
    ads = ads.filter(live);
  }

  const adsBySet = new Map();
  for (const a of ads) {
    const list = adsBySet.get(a.adset_id) ?? [];
    list.push({
      id: a.id,
      nome: a.name,
      status: a.status,
      status_efetivo: a.effective_status,
      criativo_id: a.creative?.id ?? null,
      criado_em: a.created_time,
    });
    adsBySet.set(a.adset_id, list);
  }

  const setsByCampaign = new Map();
  for (const s of adsets) {
    const list = setsByCampaign.get(s.campaign_id) ?? [];
    list.push({
      id: s.id,
      nome: s.name,
      status: s.status,
      status_efetivo: s.effective_status,
      orcamento_diario: budget(s.daily_budget),
      orcamento_total: budget(s.lifetime_budget),
      otimizacao: s.optimization_goal ?? null,
      destino: s.destination_type ?? null,
      inicio: s.start_time ?? null,
      fim: s.end_time ?? null,
      criado_em: s.created_time,
      anuncios: adsBySet.get(s.id) ?? [],
    });
    setsByCampaign.set(s.campaign_id, list);
  }

  const campanhas = campaigns.map((c) => ({
    id: c.id,
    nome: c.name,
    objetivo: c.objective,
    status: c.status,
    status_efetivo: c.effective_status,
    orcamento_diario: budget(c.daily_budget),
    orcamento_total: budget(c.lifetime_budget),
    orcamento_no: c.daily_budget || c.lifetime_budget ? "campanha" : "conjunto",
    inicio: c.start_time ?? null,
    fim: c.stop_time ?? null,
    criado_em: c.created_time,
    conjuntos: setsByCampaign.get(c.id) ?? [],
  }));

  return { campanhas, ...runRate(campanhas, account.monthlyCap) };
}

// Orçamento diário comprometido = campanhas que gastam: orçamento da campanha (CBO, se tiver ao menos
// um conjunto gastando) ou soma dos conjuntos que gastam. Conjunto só gasta se tiver ao menos um anúncio
// gastando. Orçamentos vitalícios ficam de fora. Campanha ligada sem nada entregando vai para "sem_entrega".
function runRate(campanhas, cap) {
  let daily = 0;
  let hasLifetime = false;
  const semEntrega = [];
  for (const c of campanhas) {
    if (!SPENDING.has(c.status_efetivo)) continue;
    const live = c.conjuntos.filter(
      (s) => SPENDING.has(s.status_efetivo) && s.anuncios.some((a) => SPENDING.has(a.status_efetivo)),
    );
    if (!live.length) {
      semEntrega.push({ id: c.id, nome: c.nome, motivo: c.conjuntos.length ? "nenhum anúncio ativo" : "nenhum conjunto ativo" });
      continue;
    }
    if (c.orcamento_diario) daily += c.orcamento_diario;
    else if (c.orcamento_total) hasLifetime = true;
    else
      for (const s of live) {
        if (s.orcamento_diario) daily += s.orcamento_diario;
        else if (s.orcamento_total) hasLifetime = true;
      }
  }
  const monthly = daily * DAYS_PER_MONTH;
  return {
    orcamento_diario_ativo: round2(daily),
    projecao_mensal: round2(monthly),
    teto_mensal: cap,
    folga_mensal: cap ? round2(cap - monthly) : null,
    campanhas_sem_entrega: semEntrega,
    aviso_orcamento: hasLifetime ? "Há orçamentos vitalícios ativos; eles não entram na projeção." : undefined,
  };
}

// ---------- insights ----------

const PRESETS = {
  hoje: "today",
  "7d": "last_7d",
  "14d": "last_14d",
  "30d": "last_30d",
  mes_atual: "this_month",
  mes_passado: "last_month",
};
const LEVELS = { conta: "account", campanha: "campaign", conjunto: "adset", anuncio: "ad" };

const INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "inline_link_clicks",
  "ctr",
  "cpm",
  "actions",
].join(",");

const ACTION = {
  conversas_iniciadas: "onsite_conversion.messaging_conversation_started_7d",
  novos_contatos_mensagem: "onsite_conversion.total_messaging_connection",
  leads: "lead",
  visualizacoes_video: "video_view",
};

function normalizeRow(r, level) {
  const acts = Object.fromEntries((r.actions || []).map((a) => [a.action_type, Number(a.value)]));
  const gasto = money(r.spend) ?? 0;
  const out = {};
  if (level !== "account") {
    out.campanha_id = r.campaign_id;
    out.campanha = r.campaign_name;
  }
  if (level === "adset" || level === "ad") {
    out.conjunto_id = r.adset_id;
    out.conjunto = r.adset_name;
  }
  if (level === "ad") {
    out.anuncio_id = r.ad_id;
    out.anuncio = r.ad_name;
  }
  Object.assign(out, {
    gasto: round2(gasto),
    impressoes: Number(r.impressions ?? 0),
    alcance: r.reach !== undefined ? Number(r.reach) : null,
    frequencia: r.frequency !== undefined ? round2(Number(r.frequency)) : null,
    cliques_link: Number(r.inline_link_clicks ?? 0),
    ctr_pct: r.ctr !== undefined ? round2(Number(r.ctr)) : null,
    cpm: r.cpm !== undefined ? round2(Number(r.cpm)) : null,
  });
  for (const [k, type] of Object.entries(ACTION)) out[k] = acts[type] ?? 0;
  out.custo_por_conversa = out.conversas_iniciadas ? round2(gasto / out.conversas_iniciadas) : null;
  out.custo_por_lead = out.leads ? round2(gasto / out.leads) : null;
  return out;
}

// soma só o que é somável (alcance/frequência não são)
function totals(rows) {
  const t = { gasto: 0, impressoes: 0, cliques_link: 0 };
  for (const k of Object.keys(ACTION)) t[k] = 0;
  for (const r of rows) for (const k of Object.keys(t)) t[k] += r[k] ?? 0;
  t.gasto = round2(t.gasto);
  t.ctr_pct = t.impressoes ? round2((t.cliques_link / t.impressoes) * 100) : null;
  t.cpm = t.impressoes ? round2((t.gasto / t.impressoes) * 1000) : null;
  t.custo_por_conversa = t.conversas_iniciadas ? round2(t.gasto / t.conversas_iniciadas) : null;
  t.custo_por_lead = t.leads ? round2(t.gasto / t.leads) : null;
  return t;
}

// período em vigor inclui hoje → cache curto; período fechado → cache longo
function ttlMs({ preset, until }) {
  const includesToday = preset ? ["today", "this_month"].includes(preset) : until >= todaySP();
  return includesToday ? 15 * 60 * 1000 : 3 * 60 * 60 * 1000;
}

// level: account|campaign|adset|ad; preset (date_preset) OU since+until (YYYY-MM-DD)
// force = ignora o cache (usado pela trava do teto, que precisa do gasto real do mês)
async function insights(account, { level, preset, since, until, force = false }) {
  const period = preset ? preset : `${since}..${until}`;
  const key = `${account.adAccountId}|${level}|${period}`;
  const now = new Date();

  if (!force) {
    const hit = await prisma.adInsightCache.findUnique({ where: { cacheKey: key } });
    if (hit && hit.expiresAt > now) return { ...hit.payload, fetched_at: hit.fetchedAt, cache: "HIT" };
  }

  const params = { level, fields: INSIGHT_FIELDS, limit: 500 };
  if (preset) params.date_preset = preset;
  else params.time_range = { since, until };

  const raw = await guard(account, () => adsGetAll(`${account.adAccountId}/insights`, params, account.token));
  const linhas = raw.map((r) => normalizeRow(r, level)).sort((a, b) => b.gasto - a.gasto);
  // sem chaves undefined: o payload vai para uma coluna JSON
  const payload = {
    periodo: preset ? { preset } : { desde: since, ate: until },
    totais: level === "account" && linhas[0] ? { ...linhas[0] } : totals(linhas),
    ...(level === "account" ? {} : { linhas }),
  };

  const expiresAt = new Date(now.getTime() + ttlMs({ preset, until }));
  await prisma.adInsightCache
    .upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, adAccountId: account.adAccountId, payload, fetchedAt: now, expiresAt },
      update: { payload, fetchedAt: now, expiresAt },
    })
    .catch(console.error);
  return { ...payload, fetched_at: now, cache: "MISS" };
}

// Série diária (nível conta) entre since e until (YYYY-MM-DD, inclusivo). Dias sem entrega vêm zerados.
const addDay = (d, n = 1) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

async function daily(account, { since, until }) {
  const key = `${account.adAccountId}|daily|${since}..${until}`;
  const now = new Date();
  const hit = await prisma.adInsightCache.findUnique({ where: { cacheKey: key } });
  if (hit && hit.expiresAt > now) return { ...hit.payload, fetched_at: hit.fetchedAt, cache: "HIT" };

  const raw = await guard(account, () =>
    adsGetAll(
      `${account.adAccountId}/insights`,
      { level: "account", fields: INSIGHT_FIELDS, time_range: { since, until }, time_increment: 1, limit: 500 },
      account.token,
    ),
  );
  const byDay = new Map(raw.map((r) => [r.date_start, normalizeRow(r, "account")]));
  const empty = normalizeRow({}, "account");
  const dias = [];
  for (let d = since; d <= until; d = addDay(d)) dias.push({ data: d, ...(byDay.get(d) ?? empty) });

  const payload = { periodo: { desde: since, ate: until }, totais: totals(dias), dias };
  const expiresAt = new Date(now.getTime() + ttlMs({ until }));
  await prisma.adInsightCache
    .upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, adAccountId: account.adAccountId, payload, fetchedAt: now, expiresAt },
      update: { payload, fetchedAt: now, expiresAt },
    })
    .catch(console.error);
  return { ...payload, fetched_at: now, cache: "MISS" };
}

// limpeza diária do cache vencido há mais de 7 dias
async function pruneInsightCache() {
  const { count } = await prisma.adInsightCache.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  if (count) console.log(`ad_insight_cache: ${count} linha(s) removida(s)`);
}

module.exports = {
  PRESETS,
  LEVELS,
  SPENDING,
  accountSummary,
  structure,
  insights,
  daily,
  guard,
  round2,
  pruneInsightCache,
  todaySP,
};
