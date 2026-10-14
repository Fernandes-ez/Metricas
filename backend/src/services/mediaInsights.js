// Insights por post + cache em Postgres (tabela media_insights).
// Evita uma chamada de insights por post a cada carregamento (limite da API e VM pequena).
const prisma = require("./db");
const { igGet } = require("./igClient");

// A Graph API às vezes devolve contagem negativa (ex.: saves = -1, medido em AQUA 7d).
// Contagem negativa não é dado válido: vira null e entra em unsupported_metrics.
function dropNegatives(obj, names, unsupported) {
  for (const k of names) {
    if (typeof obj[k] === "number" && obj[k] < 0) {
      obj[k] = null;
      unsupported.push(k);
    }
  }
}

const METRICS = [
  "reach",
  "views",
  "likes",
  "comments",
  "shares",
  "saved",
  "total_interactions",
];
// nome da métrica -> campo do modelo Prisma
const FIELD = { total_interactions: "totalInteractions" };
const field = (m) => FIELD[m] ?? m;

// Insights de um post; degrada métricas não suportadas (valores ausentes = null)
async function mediaInsights(mediaId, token) {
  const allMetrics = METRICS;
  let metrics = allMetrics;
  const unsupported = [];

  let data;
  // Erro 100: remove da lista as métricas citadas na mensagem e repete.
  for (;;) {
    try {
      data = await igGet(
        `${mediaId}/insights`,
        { metric: metrics.join(",") },
        token,
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
  dropNegatives(normalized, allMetrics, unsupported);

  return { ...normalized, unsupported_metrics: unsupported };
}

// ---------- cache ----------
const HOUR = 60 * 60 * 1000;
const TTL_RECENT = HOUR; // posts com até 7 dias mudam rápido
const TTL_OLD = 24 * HOUR; // mais antigos quase não mudam
const RECENT_AGE = 7 * 24 * HOUR;
const CONCURRENCY = 3; // e2-micro: poucas chamadas simultâneas
const DEFAULT_BUDGET_MS = 7000; // cabe no timeout de 10 s dos clientes (mcp)

const ttlFor = (postedAt, now) =>
  now - postedAt.getTime() <= RECENT_AGE ? TTL_RECENT : TTL_OLD;

const inflight = new Map(); // "alias:mediaId" -> Promise (evita buscar o mesmo post duas vezes)

function refreshOne(account, post) {
  const key = `${account.alias}:${post.id}`;
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      let ins;
      try {
        ins = await mediaInsights(post.id, account.token);
      } catch (e) {
        // erro 100 sem métrica aproveitável = o post não tem insights: guarda tudo null
        // (respeita o TTL em vez de reconsultar a cada carregamento). Outros erros: propaga.
        if (e.code !== 100) throw e;
        ins = {};
      }
      const data = {
        postedAt: new Date(post.timestamp),
        mediaType: post.media_type,
        mediaProductType: post.media_product_type ?? null,
        fetchedAt: new Date(),
      };
      for (const m of METRICS) data[field(m)] = ins[m] ?? null;
      await prisma.mediaInsight.upsert({
        where: { alias_mediaId: { alias: account.alias, mediaId: post.id } },
        create: { alias: account.alias, mediaId: post.id, ...data },
        update: data,
      });
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

// Busca `posts` (concorrência CONCURRENCY). Espera até `budgetMs`; o que sobrar continua em
// segundo plano e fica no cache para a próxima chamada. Devolve quantos ainda não terminaram.
async function refreshMany(account, posts, budgetMs) {
  const queue = [...posts];
  let finished = 0;
  const worker = async () => {
    while (queue.length) {
      const post = queue.shift();
      try {
        await refreshOne(account, post);
      } catch (e) {
        // falhou: mantém o valor antigo do cache (se houver) e segue
        console.error(`[media-insights] ${account.alias}/${post.id}: ${e.message}`);
      }
      finished++;
    }
  };
  const all = Promise.all(Array.from({ length: Math.min(CONCURRENCY, posts.length) }, worker));
  let timer;
  await Promise.race([
    all,
    new Promise((resolve) => (timer = setTimeout(resolve, budgetMs))),
  ]);
  clearTimeout(timer);
  return posts.length - finished;
}

const isStale = (row, post, now) =>
  !row || now - row.fetchedAt.getTime() > ttlFor(new Date(post.timestamp), now);

// Devolve cada post com as métricas em cache (null = indisponível) e fetched_at.
// refresh=false só lê o cache. `pending` = posts que ainda estão sendo atualizados.
async function withMetrics(account, posts, { refresh = true, budgetMs = DEFAULT_BUDGET_MS } = {}) {
  const read = async () =>
    new Map(
      (
        await prisma.mediaInsight.findMany({
          where: { alias: account.alias, mediaId: { in: posts.map((p) => p.id) } },
        })
      ).map((r) => [r.mediaId, r]),
    );

  let rows = await read();
  let pending = 0;
  if (refresh) {
    const now = Date.now();
    const stale = posts.filter((p) => isStale(rows.get(p.id), p, now));
    if (stale.length) {
      pending = await refreshMany(account, stale, budgetMs);
      rows = await read();
    }
  }
  const out = posts.map((p) => {
    const r = rows.get(p.id);
    const m = {};
    for (const k of METRICS) m[k] = r ? r[field(k)] : null;
    return { ...p, ...m, fetched_at: r ? r.fetchedAt.toISOString() : null };
  });
  return { posts: out, pending };
}

const SORT_KEYS = ["data", ...METRICS];

// null sempre no fim, nas duas direções; empate: mais recente primeiro
function sortPosts(posts, key, dir) {
  const val = (p) => (key === "data" ? Date.parse(p.timestamp) : p[key]);
  const sign = dir === "asc" ? 1 : -1;
  return [...posts].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === null && y === null) return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    if (x === null) return 1;
    if (y === null) return -1;
    return x === y ? Date.parse(b.timestamp) - Date.parse(a.timestamp) : (x - y) * sign;
  });
}

module.exports = { dropNegatives, mediaInsights, withMetrics, sortPosts, SORT_KEYS, METRICS };
