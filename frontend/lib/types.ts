// Formatos conferidos em backend/src/routes/instagramRoutes.js.
// Valor ausente vem como null: nunca tratar como 0.

export type Num = number | null

/** GET /api/accounts */
export interface Account {
  apelido: string
  user_id: string
  username: string
  followers_count: number
  media_count: number
}

/** GET /api/accounts/status */
export interface AccountStatus {
  alias: string
  username: string
  status: 'active' | 'needs_reauth' | string
  token_expires_at: string
  dias_restantes: number
  last_error: string | null
}

/** GET /api/accounts/:apelido/insights */
export interface AccountInsights {
  reach: Num
  views: Num
  accounts_engaged: Num
  total_interactions: Num
  likes: Num
  comments: Num
  shares: Num
  saves: Num
  profile_views: Num
  follows: Num
  unfollows: Num
  unsupported_metrics: string[]
}

/** GET /api/accounts/:apelido/media */
export interface Media {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string
  media_product_type?: 'FEED' | 'REELS' | 'STORY' | 'AD' | string
  timestamp: string
  permalink: string
  like_count?: number
  comments_count?: number
  media_url?: string
  thumbnail_url?: string
}

/** GET /api/media/:id/insights?account= */
export interface MediaInsights extends Extras {
  reach: Num
  views: Num
  likes: Num
  comments: Num
  shares: Num
  saved: Num
  total_interactions: Num
  unsupported_metrics: string[]
}

/** Chaves de ordenação aceitas por GET /api/accounts/:apelido/media?ordenar= */
export type SortKey =
  | 'data'
  | 'reach'
  | 'views'
  | 'total_interactions'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saved'
  | 'avg_watch_time'
  | 'taxa_interacao'
  | 'taxa_compartilhamento'
  | 'taxa_salvamento'

/** Extras: tempo de visualização (só reels, em milissegundos) e taxas como fração do alcance (0,114). */
export interface Extras {
  avg_watch_time: Num
  total_watch_time: Num
  taxa_interacao: Num
  taxa_compartilhamento: Num
  taxa_salvamento: Num
}

/** Post com insights em cache (modo ?ordenar=). null = indisponível. */
export type SortedMedia = Media & Extras & {
  reach: Num
  views: Num
  likes: Num
  comments: Num
  shares: Num
  saved: Num
  total_interactions: Num
  /** quando as métricas foram buscadas no Instagram; null = ainda sem cache */
  fetched_at: string | null
}

// ---------- Anúncios (backend/src/routes/adsRoutes.js) ----------

/** GET /api/ads/accounts */
export interface AdAccountSummary {
  apelido: string
  ad_account_id: string
  nome: string | null
  moeda: string | null
  teto_mensal: Num
  token: string
  token_status: string
  fuso?: string
  status_conta?: string
  gasto_mes?: Num
  uso_teto?: Num
  erro?: string
}

/** Métricas normalizadas de uma linha de insights (dinheiro na moeda da conta). */
export interface AdMetrics {
  gasto: number
  impressoes: number
  alcance?: Num
  frequencia?: Num
  cliques_link: number
  ctr_pct: Num
  cpm: Num
  conversas_iniciadas: number
  novos_contatos_mensagem: number
  leads: number
  visualizacoes_video: number
  custo_por_conversa: Num
  custo_por_lead: Num
}

export interface AdRow extends AdMetrics {
  campanha_id?: string
  campanha?: string
  conjunto_id?: string
  conjunto?: string
  anuncio_id?: string
  anuncio?: string
}

interface AdAccountBase {
  ad_account_id: string
  nome: string | null
  moeda: string | null
  erro?: string
}

/** GET /api/ads/:apelido/insights */
export interface AdInsightsRes {
  apelido: string
  nivel: string
  contas: (AdAccountBase & { totais?: AdMetrics; linhas?: AdRow[]; fetched_at?: string })[]
}

/** GET /api/ads/:apelido/daily */
export interface AdDailyRes {
  apelido: string
  contas: (AdAccountBase & { totais?: AdMetrics; dias?: (AdMetrics & { data: string })[]; fetched_at?: string })[]
}

export interface AdAd {
  id: string
  nome: string
  status: string
  status_efetivo: string
}
export interface AdSet {
  id: string
  nome: string
  status: string
  status_efetivo: string
  orcamento_diario: Num
  orcamento_total: Num
  otimizacao: string | null
  destino: string | null
  anuncios: AdAd[]
}
export interface AdCampaign {
  id: string
  nome: string
  objetivo: string
  status: string
  status_efetivo: string
  orcamento_diario: Num
  orcamento_total: Num
  orcamento_no: 'campanha' | 'conjunto'
  conjuntos: AdSet[]
}

/** GET /api/ads/:apelido/campaigns */
export interface AdCampaignsRes {
  apelido: string
  status: string
  contas: (AdAccountBase & {
    campanhas?: AdCampaign[]
    orcamento_diario_ativo?: number
    projecao_mensal?: number
    teto_mensal?: Num
    folga_mensal?: Num
    campanhas_sem_entrega?: { id: string; nome: string; motivo: string }[]
  })[]
}

/** Resultado de uma chamada ao backend, sem lançar para os casos esperados. */
export type Res<T> =
  | { ok: true; data: T; /** posts ainda sendo atualizados em segundo plano (X-Insights-Pending) */ pending?: number }
  | { ok: false; kind: 'reauth' | 'notfound' | 'error'; message: string }
