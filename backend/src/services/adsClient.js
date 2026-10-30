// Cliente da Marketing API (graph.facebook.com). Separado do igClient: outro host, outro token
// (usuário do sistema do portfólio), paginação e erros próprios.
const crypto = require("crypto");

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 10;
const cache = new Map(); // chave -> { exp, data } (só estrutura: campanhas/conjuntos/anúncios/info da conta)

// códigos de limite de taxa da Graph/Marketing API
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80014]);

// appsecret_proof só é enviado se META_APP_SECRET existir (obrigatório se o app exigir "App Secret Proof")
function appSecretProof(token) {
  const secret = process.env.META_APP_SECRET;
  return secret ? crypto.createHmac("sha256", secret).update(token).digest("hex") : null;
}

function toError(data, status) {
  const e = data?.error || {};
  const error = new Error(e.error_user_msg || e.message || `Marketing API HTTP ${status}`);
  error.code = e.code;
  error.subcode = e.error_subcode;
  error.type = e.type;
  error.status = status;
  error.isAuth = e.code === 190 || e.code === 102;
  error.isRateLimit = RATE_LIMIT_CODES.has(e.code);
  error.isPermission = e.code === 10 || e.code === 200 || (e.code >= 200 && e.code < 300);
  return error;
}

async function adsFetch(pathOrUrl, params, token) {
  const url = pathOrUrl.startsWith("https://")
    ? new URL(pathOrUrl)
    : new URL(`${BASE_URL}/${pathOrUrl}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  url.searchParams.delete("access_token"); // o token vai só no header
  const proof = appSecretProof(token);
  if (proof) url.searchParams.set("appsecret_proof", proof);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = toError(data, response.status);
    console.error(`Ads API Error: [${error.code}/${error.subcode ?? "-"}] ${error.message}`);
    throw error;
  }
  return data;
}

// GET simples (um objeto ou uma página)
async function adsGet(path, params, token) {
  return adsFetch(path, params, token);
}

// POST (escrita). Corpo form-urlencoded; o token vai só no header.
async function adsPost(path, params, token) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const proof = appSecretProof(token);
  if (proof) body.set("appsecret_proof", proof);

  const response = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = toError(data, response.status);
    console.error(`Ads API Error (POST ${path}): [${error.code}/${error.subcode ?? "-"}] ${error.message}`);
    throw error;
  }
  return data;
}

// GET de uma aresta com paginação (até MAX_PAGES páginas)
async function adsGetAll(path, params, token) {
  const out = [];
  let page = await adsFetch(path, params, token);
  for (let i = 0; ; i++) {
    out.push(...(page.data || []));
    const next = page.paging?.next;
    if (!next || i + 1 >= MAX_PAGES) break;
    page = await adsFetch(next, {}, token);
  }
  return out;
}

// cache em memória para leituras de estrutura (o token identifica a conta; fica só em memória)
async function cached(key, fn, ttlMs = DEFAULT_TTL_MS) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = await fn();
  if (cache.size > 300)
    for (const [k, v] of cache) if (v.exp <= Date.now()) cache.delete(k);
  cache.set(key, { exp: Date.now() + ttlMs, data });
  return data;
}

// apaga do cache em memória tudo que for da conta (usado depois de uma escrita)
function invalidate(adAccountId) {
  for (const k of cache.keys()) if (k.includes(`|${adAccountId}|`) || k.endsWith(`|${adAccountId}`)) cache.delete(k);
}

module.exports = { adsGet, adsGetAll, adsPost, cached, invalidate, GRAPH_VERSION };
