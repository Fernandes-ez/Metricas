import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3001';
// O schema PUBLICADO (entrada) aceita maiúsculas, minúsculas e espaços nas pontas; o servidor
// normaliza (trim + maiúsculas) e só então aplica a validação estrita (.pipe).
const alias = z
  .string()
  .regex(/^\s*[A-Za-z0-9_-]{1,32}\s*$/)
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9_-]{1,32}$/))
  .describe('Apelido da conta (ex.: AQUA); não diferencia maiúsculas de minúsculas. Use listar_contas para ver os disponíveis.');

const reply = (data, isError = false) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
  isError,
});

// Defesa extra: nunca devolver tokens nem o id interno das contas
const BAD = new Set(['id', 'token', 'access_token', 'refresh_token', 'token_encrypted']);
const clean = (v) =>
  Array.isArray(v)
    ? v.map(clean)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).filter(([k]) => !BAD.has(k)).map(([k, x]) => [k, clean(x)]))
      : v;

async function get(path, { stripIds = false, map } = {}) {
  let r;
  try {
    r = await fetch(BACKEND + path, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return reply('Backend indisponível ou demorou mais de 10 s.', true);
  }
  const body = await r.json().catch(() => null);
  if (r.status === 409) return reply('Conta precisa ser reconectada (needs_reauth). Reconecte a conta no Instagram.', true);
  if (!r.ok) return reply(`Backend respondeu ${r.status}: ${body?.error ?? 'erro desconhecido'}`, true);
  const out = stripIds ? clean(body) : body;
  return reply(map ? map(out) : out); // unsupported_metrics, quando existir, segue no corpo
}

const CAPTION_MAX = 150;
// só o que ajuda a escolher um post: sem URLs de mídia (expiram e pesam), legenda curta (≤150, contando a reticência)
const slim = (posts) =>
  !Array.isArray(posts) ? posts :
  posts.map(({ media_url, thumbnail_url, caption, ...m }) => {
    void media_url, thumbnail_url;
    const c = caption && [...caption];
    return c ? { ...m, caption: c.length > CAPTION_MAX ? c.slice(0, CAPTION_MAX - 1).join('') + '…' : caption } : m;
  });

const ro = { readOnlyHint: true, openWorldHint: true };

export function buildServer() {
  const s = new McpServer({ name: 'metricas-instagram', version: '1.0.0' });

  s.registerTool(
    'listar_contas',
    {
      description:
        'Lista as contas ativas do Instagram com username, seguidores e quantidade de posts. Contas que precisam de reconexão não aparecem aqui (veja status_contas).',
      annotations: ro,
    },
    () => get('/api/accounts', { stripIds: true }),
  );

  s.registerTool(
    'status_contas',
    {
      description:
        'Mostra o estado da conexão de cada conta: status, validade do token (dias restantes) e último erro. Não expõe tokens.',
      annotations: ro,
    },
    () => get('/api/accounts/status', { stripIds: true }),
  );

  s.registerTool(
    'insights_conta',
    {
      description:
        'Métricas agregadas da conta no período (alcance, views, contas engajadas, interações, curtidas, comentários, compartilhamentos, salvamentos, visitas ao perfil, follows/unfollows). Valor null = indisponível, não é zero. O apelido não diferencia maiúsculas de minúsculas. Padrão: últimos 7 dias.',
      inputSchema: { apelido: alias, periodo: z.enum(['7d', '14d', '30d']).default('7d').describe('Janela terminando agora') },
      annotations: ro,
    },
    ({ apelido, periodo }) => {
      const until = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000); // hora cheia → melhor uso do cache
      const since = new Date(until.getTime() - parseInt(periodo, 10) * 86_400_000);
      return get(`/api/accounts/${encodeURIComponent(apelido)}/insights?since=${since.toISOString()}&until=${until.toISOString()}`);
    },
  );

  s.registerTool(
    'midias_conta',
    {
      description: 'Últimos posts da conta (id, legenda de até 150 caracteres, tipo, data, link permanente, curtidas, comentários), sem URLs de imagem/vídeo. O apelido não diferencia maiúsculas de minúsculas. Use o id em insights_midia.',
      inputSchema: { apelido: alias, limite: z.number().int().min(1).max(50).default(10).describe('Quantidade de posts (padrão 10, máximo 50)') },
      annotations: ro,
    },
    ({ apelido, limite }) => get(`/api/accounts/${encodeURIComponent(apelido)}/media?limit=${limite}`, { map: slim }),
  );

  s.registerTool(
    'insights_midia',
    {
      description:
        'Métricas de um post (alcance, views, curtidas, comentários, compartilhamentos, salvamentos, interações). null = indisponível. O apelido da conta não diferencia maiúsculas de minúsculas.',
      inputSchema: { id: z.string().regex(/^\d{1,30}$/).describe('Id do post, obtido em midias_conta'), conta: alias },
      annotations: ro,
    },
    ({ id, conta }) => get(`/api/media/${id}/insights?account=${encodeURIComponent(conta)}`),
  );

  return s;
}
