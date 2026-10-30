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

async function get(path, { stripIds = false, map, timeoutMs = 10_000, on409 } = {}) {
  let r;
  try {
    r = await fetch(BACKEND + path, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return reply(`Backend indisponível ou demorou mais de ${timeoutMs / 1000} s.`, true);
  }
  const body = await r.json().catch(() => null);
  if (r.status === 409) return reply(on409 ? body?.error ?? on409 : 'Conta precisa ser reconectada (needs_reauth). Reconecte a conta no Instagram.', true);
  if (!r.ok) return reply(`Backend respondeu ${r.status}: ${body?.error ?? 'erro desconhecido'}`, true);
  const out = stripIds ? clean(body) : body;
  return reply(map ? map(out, r.headers) : out); // unsupported_metrics, quando existir, segue no corpo
}

// escrita (anúncios): POST JSON; erros 4xx do backend voltam com a explicação (ex.: trava do teto)
async function post(path, payload, timeoutMs = 45_000) {
  let r;
  try {
    r = await fetch(BACKEND + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, origem: 'mcp' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return reply(`Backend indisponível ou demorou mais de ${timeoutMs / 1000} s. A alteração pode ou não ter sido aplicada: confira com historico_alteracoes e campanhas_anuncio antes de repetir.`, true);
  }
  const body = await r.json().catch(() => null);
  if (!r.ok) return reply({ status: r.status, erro: body?.error ?? 'erro desconhecido', ...(body?.detalhe ? { detalhe: body.detalhe } : {}) }, true);
  return reply(body);
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

// com ordenar o backend pode estar atualizando métricas em segundo plano (X-Insights-Pending > 0)
const withNotice = (posts, headers) => {
  const out = slim(posts);
  const n = Number(headers.get('x-insights-pending') || 0);
  return n > 0
    ? { aviso: n + ' post(s) ainda sem métricas atualizadas (o backend está buscando); repita a consulta em alguns segundos.', posts: out }
    : out;
};

const SORT = [
  'data', 'reach', 'views', 'total_interactions', 'likes', 'comments', 'shares', 'saved',
  'avg_watch_time', 'taxa_interacao', 'taxa_compartilhamento', 'taxa_salvamento',
];

const ro = { readOnlyHint: true, openWorldHint: true };

// anúncios: a Marketing API é mais lenta e pode paginar; ids de campanha/conjunto/anúncio são necessários (sem stripIds)
const ADS = { timeoutMs: 30_000, on409: 'Token de anúncios inválido; gere outro no usuário do sistema.' };
const NIVEIS = ['conta', 'campanha', 'conjunto', 'anuncio'];
const PERIODOS = ['hoje', '7d', '14d', '30d', 'mes_atual', 'mes_passado'];
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const objId = z.string().regex(/^\d{5,30}$/).describe('Id do objeto (campanha, conjunto ou anúncio), obtido em campanhas_anuncio');
const actId = z.string().regex(/^act_\d{5,25}$/).optional().describe('Só se o perfil tiver mais de uma conta de anúncios');
const simular = z.boolean().default(false).describe('true = só mostra o efeito (orçamento antes/depois, trava do teto) sem alterar nada');
// escrita: mexe em dinheiro real; idempotente (repetir o mesmo valor não muda nada)
const rw = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

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
      description:
        'Posts da conta (id, legenda de até 150 caracteres, tipo, data, link permanente, curtidas, comentários), sem URLs de imagem/vídeo. O apelido não diferencia maiúsculas de minúsculas. Use o id em insights_midia. Com "ordenar" (reach, views, total_interactions, likes, comments, shares, saved, avg_watch_time, taxa_interacao, taxa_compartilhamento, taxa_salvamento ou data), ordena entre os "limite" posts mais recentes e inclui as métricas de cada post: reach, views, likes, comments, shares, saved, total_interactions; avg_watch_time e total_watch_time (SÓ reels, em MILISSEGUNDOS: 6671 = 6,7 s; null nos outros tipos); e as taxas taxa_interacao (interações/alcance), taxa_compartilhamento (compartilhamentos/alcance) e taxa_salvamento (salvamentos/alcance), que são FRAÇÕES do alcance (0,114 = 11,4%; null se o alcance for 0 ou ausente). null = indisponível e vai sempre para o fim, em qualquer ordem. fetched_at = quando as métricas foram buscadas (em cache: 1 h para posts de até 7 dias, 24 h para os mais antigos). A API não informa a duração do vídeo, então não há percentual assistido. Para achar os melhores posts, use ordenar com limite maior (até 50). Se aparecer "aviso", alguns posts ainda estão sendo atualizados: repita a consulta.',
      inputSchema: {
        apelido: alias,
        limite: z.number().int().min(1).max(50).default(10).describe('Quantidade de posts (padrão 10, máximo 50). Com ordenar, é a janela dos posts mais recentes considerada.'),
        ordenar: z.enum(SORT).optional().describe('Campo de ordenação; sem ele, vem do mais recente ao mais antigo, sem métricas'),
        ordem: z.enum(['desc', 'asc']).default('desc').describe('desc (maior primeiro, padrão) ou asc; só vale com ordenar'),
      },
      annotations: ro,
    },
    ({ apelido, limite, ordenar, ordem }) =>
      get(
        `/api/accounts/${encodeURIComponent(apelido)}/media?limit=${limite}` + (ordenar ? `&ordenar=${ordenar}&ordem=${ordem}` : ''),
        { map: withNotice },
      ),
  );

  s.registerTool(
    'insights_midia',
    {
      description:
        'Métricas de um post: reach, views, likes, comments, shares, saved, total_interactions; para REELS também avg_watch_time (tempo médio assistido) e total_watch_time (tempo total assistido), ambos em MILISSEGUNDOS (6671 = 6,7 s), null nos outros tipos; e as taxas taxa_interacao, taxa_compartilhamento e taxa_salvamento, FRAÇÕES do alcance (0,114 = 11,4%; null se o alcance for 0 ou ausente). null = indisponível. A API não informa a duração do vídeo (sem percentual assistido). O apelido da conta não diferencia maiúsculas de minúsculas.',
      inputSchema: { id: z.string().regex(/^\d{1,30}$/).describe('Id do post, obtido em midias_conta'), conta: alias },
      annotations: ro,
    },
    ({ id, conta }) => get(`/api/media/${id}/insights?account=${encodeURIComponent(conta)}`),
  );

  // ---------- Anúncios (Meta Ads, somente leitura) ----------

  s.registerTool(
    'listar_contas_anuncio',
    {
      description:
        'Lista as contas de anúncios Meta Ads cadastradas por perfil (apelido): ad_account_id (act_...), nome, moeda, status da conta, teto_mensal (null = sem teto, só leitura), gasto_mes (gasto no mês corrente, na moeda da conta) e uso_teto (fração do teto já gasta: 0,42 = 42%). Se aparecer "erro", aquela conta não pôde ser lida (token, permissão ou limite de chamadas).',
      annotations: ro,
    },
    () => get('/api/ads/accounts', ADS),
  );

  s.registerTool(
    'campanhas_anuncio',
    {
      description:
        'Estrutura das campanhas Meta Ads do perfil: campanhas > conjuntos > anúncios, com id, nome, objetivo, status (configurado) e status_efetivo (o que de fato está acontecendo: ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, IN_PROCESS, WITH_ISSUES, PENDING_REVIEW, DISAPPROVED...), orçamentos JÁ EM REAIS (moeda da conta, não centavos), otimização e destino. Inclui o orçamento comprometido: orcamento_diario_ativo (soma do que está de fato entregando: campanha e conjunto ativos com ao menos um anúncio ativo), projecao_mensal (× 30,44), teto_mensal e folga_mensal; campanhas_sem_entrega lista campanhas ligadas que não entregam (sem conjunto ou anúncio ativo) — sinal de anúncio reprovado/pausado ou campanha esquecida. Use para saber o que está rodando e quanto está comprometido; para resultados (gasto, conversas, custo), use insights_anuncios.',
      inputSchema: {
        apelido: alias,
        status: z.enum(['todas', 'ativas']).default('todas').describe('todas = inclui pausadas (sem excluídas/arquivadas); ativas = só o que está gastando ou em análise'),
      },
      annotations: ro,
    },
    ({ apelido, status }) => get(`/api/ads/${encodeURIComponent(apelido)}/campaigns?status=${status}`, ADS),
  );

  s.registerTool(
    'insights_anuncios',
    {
      description:
        'Resultados Meta Ads do perfil no período, por nível (conta, campanha, conjunto ou anúncio), ordenados por gasto: gasto (na moeda da conta), impressões, alcance, frequência, cliques_link, ctr_pct (em %, 1,8 = 1,8%), cpm, conversas_iniciadas (conversas no WhatsApp/Direct/Messenger iniciadas pelo anúncio, janela de 7 dias), novos_contatos_mensagem, leads (formulário), visualizacoes_video, custo_por_conversa e custo_por_lead (null quando o denominador é 0). "totais" soma o período (alcance e frequência não são somáveis e ficam de fora; peça nivel=conta para tê-los). Períodos 7d/14d/30d NÃO incluem hoje (padrão do Gerenciador); hoje e mes_atual incluem. Alternativa: desde e ate (YYYY-MM-DD, fuso da conta). Linha só aparece se teve entrega no período. cache=HIT indica dado em cache (15 min para períodos que incluem hoje, 3 h para fechados).',
      inputSchema: {
        apelido: alias,
        nivel: z.enum(NIVEIS).default('campanha').describe('conta, campanha (padrão), conjunto ou anuncio'),
        periodo: z.enum(PERIODOS).default('30d').describe('Ignorado se desde/ate forem informados'),
        desde: dia.optional().describe('Início (YYYY-MM-DD); exige ate'),
        ate: dia.optional().describe('Fim inclusivo (YYYY-MM-DD); exige desde'),
      },
      annotations: ro,
    },
    ({ apelido, nivel, periodo, desde, ate }) => {
      const q = desde || ate ? `desde=${desde ?? ''}&ate=${ate ?? ''}` : `periodo=${periodo}`;
      return get(`/api/ads/${encodeURIComponent(apelido)}/insights?nivel=${nivel}&${q}`, ADS);
    },
  );

  // ---------- Anúncios: escrita (Fase 2) ----------

  const TRAVA =
    ' Trava do teto (no servidor, não dá para contornar): pausar e diminuir são sempre permitidos; ATIVAR ou AUMENTAR orçamento exige teto mensal na conta e é recusado se gasto do mês + novo orçamento diário comprometido × dias restantes, ou o novo ritmo × 30,44, passar do teto. Recusa volta como erro com a conta feita: não tente contornar, explique ao usuário. Toda tentativa fica em historico_alteracoes. MEXE EM DINHEIRO REAL: confirme com o usuário o objeto (nome e id) e o valor antes de chamar sem simular; na dúvida, chame primeiro com simular=true.';

  s.registerTool(
    'alterar_status',
    {
      description:
        'Pausa (PAUSED) ou ativa (ACTIVE) uma campanha, conjunto ou anúncio Meta Ads do perfil. Retorna antes/depois e o orçamento diário comprometido antes/depois. Não exclui nem arquiva nada.' + TRAVA,
      inputSchema: {
        apelido: alias,
        tipo: z.enum(['campanha', 'conjunto', 'anuncio']),
        id: objId,
        status: z.enum(['ACTIVE', 'PAUSED']),
        simular,
        ad_account_id: actId,
      },
      annotations: rw,
    },
    ({ apelido, ...body }) => post(`/api/ads/${encodeURIComponent(apelido)}/status`, body),
  );

  s.registerTool(
    'alterar_orcamento',
    {
      description:
        'Altera o orçamento DIÁRIO (em reais, moeda da conta; ex.: 10 ou 12.5) de uma campanha (quando o orçamento está na campanha/CBO) ou de um conjunto (quando está nos conjuntos) — veja orcamento_no em campanhas_anuncio. Orçamento vitalício não é alterado por aqui. Boa prática: aumentos de no máximo ~20% por vez para não reiniciar o aprendizado.' + TRAVA,
      inputSchema: {
        apelido: alias,
        tipo: z.enum(['campanha', 'conjunto']),
        id: objId,
        orcamento_diario: z.number().positive().max(100000).describe('Novo orçamento diário em reais'),
        simular,
        ad_account_id: actId,
      },
      annotations: rw,
    },
    ({ apelido, ...body }) => post(`/api/ads/${encodeURIComponent(apelido)}/budget`, body),
  );

  s.registerTool(
    'criar_anuncio_de_post',
    {
      description:
        'Cria um anúncio NOVO, sempre PAUSADO, dentro de um conjunto que já existe (destino WhatsApp), a partir de um post do Instagram do próprio perfil (post_id vem de midias_conta; conjunto_id de campanhas_anuncio). Usa o botão "Enviar mensagem" no WhatsApp e a mesma página dos anúncios do conjunto. metodo="post_existente" (padrão) usa o próprio post e herda curtidas/comentários. Se a Meta recusar, NADA é criado e volta o erro exato da Meta: mostre esse erro ao usuário e PERGUNTE se ele quer tentar metodo="upload" (sobe o vídeo do post como anúncio novo, SEM herdar engajamento; só para vídeo/Reel). NUNCA troque para upload sem o usuário autorizar. Use simular=true para conferir conjunto, post e página antes. Para veicular depois, ative o anúncio com alterar_status (passa pela trava do teto). Confirme com o usuário o conjunto e o post antes de criar.',
      inputSchema: {
        apelido: alias,
        conjunto_id: objId,
        post_id: z.string().regex(/^\d{5,30}$/).describe('Id do post do Instagram (midias_conta)'),
        nome: z.string().min(1).max(200).optional().describe('Nome do anúncio (ex.: "Anúncio 2 — Hidroginástica Prof. Natália")'),
        metodo: z.enum(['post_existente', 'upload']).default('post_existente').describe('upload só com autorização explícita do usuário'),
        pagina_id: z.string().regex(/^\d{5,30}$/).optional().describe('Só se o servidor pedir (não achou a página sozinho)'),
        video_id: z.string().regex(/^\d{5,30}$/).optional().describe('Só no upload, para reaproveitar um vídeo já enviado que ainda estava processando'),
        simular,
        ad_account_id: actId,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ apelido, ...body }) => post(`/api/ads/${encodeURIComponent(apelido)}/ads`, body, 150_000),
  );

  s.registerTool(
    'historico_alteracoes',
    {
      description:
        'Histórico das alterações feitas pelo Metricas nas contas de anúncios do perfil (mais recentes primeiro): quando, origem (mcp/painel), objeto, campo, antes/depois, orçamento comprometido antes/depois e resultado (ok, bloqueado pela trava, erro). Alterações feitas direto no Gerenciador de Anúncios NÃO aparecem aqui.',
      inputSchema: { apelido: alias, limite: z.number().int().min(1).max(100).default(20) },
      annotations: ro,
    },
    ({ apelido, limite }) => get(`/api/ads/${encodeURIComponent(apelido)}/changes?limite=${limite}`, ADS),
  );

  return s;
}
