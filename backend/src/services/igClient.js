const { AsyncLocalStorage } = require("node:async_hooks");

const IG_BASE_URL = "https://graph.instagram.com/v26.0";
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // chave -> { exp, data }
// por requisição: marca se alguma chamada foi MISS (para o header X-Cache)
const reqStore = new AsyncLocalStorage();

// Middleware: define X-Cache = HIT (tudo veio do cache) ou MISS
function cacheHeader(req, res, next) {
  const store = { miss: false, calls: 0, fetches: 0 };
  const json = res.json.bind(res);
  res.json = (body) => {
    res.set("X-Cache", store.calls > 0 && !store.miss ? "HIT" : "MISS");
    res.set("X-IG-Calls", String(store.fetches)); // chamadas reais à Graph API nesta requisição
    return json(body);
  };
  reqStore.run(store, next);
}

async function igGet(path, params = {}, token) {
  // chave = URL+parâmetros+token (o token identifica a conta; fica só em memória)
  const key = `${token}|${path}?${new URLSearchParams(params)}`;
  const store = reqStore.getStore();
  if (store) store.calls++;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  if (store) {
    store.miss = true;
    store.fetches++;
  }
  const data = await igFetch(path, params, token);
  // ponytail: varredura simples; sem LRU
  if (cache.size > 500)
    for (const [k, v] of cache) if (v.exp <= Date.now()) cache.delete(k);
  cache.set(key, { exp: Date.now() + TTL_MS, data });
  return data;
}

async function igFetch(path, params, token) {
  const url = new URL(`${IG_BASE_URL}/${path}`);
  Object.keys(params).forEach((key) =>
    url.searchParams.append(key, params[key]),
  );
  url.searchParams.append("access_token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || "Instagram API Error");
    error.code = data.error?.code;
    error.subcode = data.error?.error_subcode;
    error.type = data.error?.type;
    error.status = response.status;
    console.error(`IG API Error: [${error.code}] ${error.message}`);
    throw error;
  }

  return data;
}

module.exports = { igGet, cacheHeader };
