// Nomes em português e explicações de indisponibilidade.
export const LABEL: Record<string, string> = {
  reach: 'Alcance',
  views: 'Visualizações',
  accounts_engaged: 'Contas engajadas',
  total_interactions: 'Interações',
  likes: 'Curtidas',
  comments: 'Comentários',
  shares: 'Compartilhamentos',
  saves: 'Salvamentos',
  saved: 'Salvamentos',
  profile_views: 'Visitas ao perfil',
  follows: 'Novos seguidores',
  unfollows: 'Deixaram de seguir',
}

export const WHY: Record<string, string> = {
  follows: 'O Instagram só informa seguidores ganhos e perdidos para contas com 100 ou mais seguidores.',
  unfollows: 'O Instagram só informa seguidores ganhos e perdidos para contas com 100 ou mais seguidores.',
}
export const WHY_DEFAULT = 'O Instagram não retornou este dado para esta conta ou período.'

export const UNAVAILABLE = 'Indisponível para esta conta/período'

export function mediaKind(m: { media_type: string; media_product_type?: string }): string {
  if (m.media_product_type === 'REELS') return 'Reels'
  if (m.media_product_type === 'STORY') return 'Story'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'Carrossel'
  if (m.media_type === 'VIDEO') return 'Vídeo'
  return 'Foto'
}

import type { SortKey } from './types'

export const SORT_OPTIONS: { value: SortKey; label: string; short: string }[] = [
  { value: 'data', label: 'Mais recentes', short: 'Data' },
  { value: 'reach', label: 'Maior alcance', short: 'Alcance' },
  { value: 'views', label: 'Mais views', short: 'Visualizações' },
  { value: 'total_interactions', label: 'Mais interações', short: 'Interações' },
  { value: 'likes', label: 'Mais curtidas', short: 'Curtidas' },
  { value: 'comments', label: 'Mais comentários', short: 'Comentários' },
  { value: 'shares', label: 'Mais compartilhamentos', short: 'Compartilhamentos' },
  { value: 'saved', label: 'Mais salvamentos', short: 'Salvamentos' },
]
export const isSortKey = (v: unknown): v is SortKey => SORT_OPTIONS.some((o) => o.value === v)
