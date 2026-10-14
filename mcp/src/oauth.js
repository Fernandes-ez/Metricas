// Servidor de autorização mínimo (um único usuário, login por senha) para o claude.ai.
// Estado em JSON no volume /data: clientes (DCR) e tokens (só o hash sha256).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

const FILE = path.join(process.env.DATA_DIR ?? './data', 'state.json');
const SCOPE = 'mcp:read';
const ACCESS_TTL = 60 * 60; // s
const REFRESH_TTL = 30 * 24 * 60 * 60; // s
const MAX_CLIENTS = 50;
const ALLOWED_REDIRECTS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

const sha = (s) => createHash('sha256').update(s).digest('hex');
const now = () => Math.floor(Date.now() / 1000);
const rand = () => randomBytes(32).toString('base64url');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let state = { clients: {}, tokens: {} };
try {
  state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {}
function save() {
  for (const [h, t] of Object.entries(state.tokens)) if (t.exp < now()) delete state.tokens[h];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(`${FILE}.tmp`, FILE);
}

const pending = new Map(); // rid -> { client, params, exp }  (login em andamento)
const codes = new Map(); // code -> { client, params, exp }
const sweep = (m) => m.forEach((v, k) => v.exp < Date.now() && m.delete(k));

// loopback (Inspector / Claude Code) é aceito em qualquer porta
const loopback = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname);
  } catch {
    return false;
  }
};

function checkPassword(pw) {
  const [alg, salt, hash] = (process.env.MCP_PASSWORD_HASH ?? '').split('.');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = scryptSync(pw, Buffer.from(salt, 'base64url'), 32);
  const b = Buffer.from(hash, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}

const fails = new Map(); // ip -> { n, exp }
// ponytail: contador em memória, zera ao reiniciar; suficiente para um usuário
function blocked(ip) {
  const f = fails.get(ip);
  return f && f.exp > Date.now() && f.n >= 5;
}
function fail(ip) {
  const f = fails.get(ip);
  fails.set(ip, f && f.exp > Date.now() ? { n: f.n + 1, exp: f.exp } : { n: 1, exp: Date.now() + 15 * 60_000 });
}

function issue(clientId, resource) {
  const access = rand();
  const refresh = rand();
  const base = { clientId, scopes: [SCOPE], resource: resource?.toString() };
  state.tokens[sha(access)] = { ...base, type: 'access', exp: now() + ACCESS_TTL };
  state.tokens[sha(refresh)] = { ...base, type: 'refresh', exp: now() + REFRESH_TTL };
  save();
  return { access_token: access, token_type: 'bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: SCOPE };
}

const page = (rid, client, error) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar</title>
<style>body{font:16px system-ui;max-width:360px;margin:12vh auto;padding:0 16px}input,button{width:100%;padding:10px;margin-top:10px;font:inherit;box-sizing:border-box}.e{color:#b00020}</style>
<h1>Métricas Instagram</h1>
<p><b>${esc(client.client_name ?? 'Um aplicativo')}</b> quer ler as métricas (somente leitura).</p>
${error ? `<p class="e">${esc(error)}</p>` : ''}
<form method="post" action="/mcp-login"><input type="hidden" name="rid" value="${esc(rid)}">
<input type="password" name="password" placeholder="Senha" autocomplete="current-password" autofocus required>
<button>Autorizar</button></form></html>`;

function send(res, html, status = 200) {
  res
    .status(status)
    .set({ 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" })
    .type('html')
    .send(html);
}

export const provider = {
  clientsStore: {
    getClient: (id) => state.clients[id],
    registerClient(c) {
      const uris = (c.redirect_uris ?? []).map(String);
      if (!uris.length || !uris.every((u) => ALLOWED_REDIRECTS.includes(u) || loopback(u)))
        throw new InvalidClientMetadataError('redirect_uri não permitido');
      const ids = Object.keys(state.clients);
      if (ids.length >= MAX_CLIENTS) delete state.clients[ids[0]]; // descarta o mais antigo
      const full = { ...c, client_id: rand(), client_id_issued_at: now() };
      delete full.client_secret; // clientes públicos (PKCE)
      delete full.client_secret_expires_at;
      state.clients[full.client_id] = full;
      save();
      return full;
    },
  },

  async authorize(client, params, res) {
    sweep(pending);
    const rid = rand();
    pending.set(rid, { client, params, exp: Date.now() + 10 * 60_000 });
    send(res, page(rid, client));
  },

  async challengeForAuthorizationCode(client, code) {
    const c = codes.get(code);
    if (!c || c.client.client_id !== client.client_id) throw new InvalidGrantError('código inválido');
    return c.params.codeChallenge;
  },

  async exchangeAuthorizationCode(client, code, _v, redirectUri, resource) {
    const c = codes.get(code);
    codes.delete(code); // uso único
    if (!c || c.exp < Date.now() || c.client.client_id !== client.client_id) throw new InvalidGrantError('código inválido');
    if (redirectUri && redirectUri !== c.params.redirectUri) throw new InvalidGrantError('redirect_uri diferente');
    return issue(client.client_id, resource ?? c.params.resource);
  },

  async exchangeRefreshToken(client, refreshToken, _scopes, resource) {
    const h = sha(refreshToken);
    const t = state.tokens[h];
    if (!t || t.type !== 'refresh' || t.exp < now() || t.clientId !== client.client_id)
      throw new InvalidGrantError('refresh token inválido');
    delete state.tokens[h]; // rotação
    return issue(client.client_id, resource ?? t.resource);
  },

  async verifyAccessToken(token) {
    const t = state.tokens[sha(token)];
    if (!t || t.type !== 'access' || t.exp < now()) throw new InvalidTokenError('token inválido ou expirado');
    return { token, clientId: t.clientId, scopes: t.scopes, expiresAt: t.exp, resource: t.resource && new URL(t.resource) };
  },

  async revokeToken(client, { token }) {
    const t = state.tokens[sha(token)];
    if (t?.clientId === client.client_id) {
      delete state.tokens[sha(token)];
      save();
    }
  },
};

// POST /mcp-login
export function login(req, res) {
  const { rid, password } = req.body ?? {};
  const p = pending.get(rid);
  if (!p || p.exp < Date.now()) return send(res, '<p>Sessão expirada. Volte ao claude.ai e tente conectar de novo.</p>', 400);
  if (blocked(req.ip)) return send(res, page(rid, p.client, 'Muitas tentativas. Aguarde 15 minutos.'), 429);
  if (typeof password !== 'string' || !checkPassword(password)) {
    fail(req.ip);
    return send(res, page(rid, p.client, 'Senha incorreta.'), 401);
  }
  pending.delete(rid);
  sweep(codes);
  const code = rand();
  codes.set(code, { client: p.client, params: p.params, exp: Date.now() + 5 * 60_000 });
  const url = new URL(p.params.redirectUri);
  url.searchParams.set('code', code);
  if (p.params.state) url.searchParams.set('state', p.params.state);
  res.set('Cache-Control', 'no-store').redirect(302, url.toString());
}
