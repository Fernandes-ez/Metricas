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
export interface MediaInsights {
  reach: Num
  views: Num
  likes: Num
  comments: Num
  shares: Num
  saved: Num
  total_interactions: Num
  unsupported_metrics: string[]
}

/** Resultado de uma chamada ao backend, sem lançar para os casos esperados. */
export type Res<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'reauth' | 'notfound' | 'error'; message: string }
