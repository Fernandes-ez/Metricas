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

import { fmtDuration, fmtFull, fmtNum, fmtRate } from './format'
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
  { value: 'avg_watch_time', label: 'Maior retenção', short: 'Tempo médio' },
  { value: 'taxa_interacao', label: 'Maior taxa de interação', short: 'Taxa de interação' },
  { value: 'taxa_compartilhamento', label: 'Maior taxa de compartilhamento', short: 'Taxa de compart.' },
  { value: 'taxa_salvamento', label: 'Maior taxa de salvamento', short: 'Taxa de salvamento' },
]
export const isSortKey = (v: unknown): v is SortKey => SORT_OPTIONS.some((o) => o.value === v)

/** Formata o valor de uma métrica: tempo (ms), taxa (fração do alcance) ou contagem. */
export function fmtMetric(key: string, v: number): string {
  if (key === 'avg_watch_time' || key === 'total_watch_time') return fmtDuration(v)
  if (key.startsWith('taxa_')) return fmtRate(v)
  return fmtNum(v)
}
/** Valor para tooltip: contagens com todos os dígitos; tempo e taxa já são completos. */
export const fmtMetricFull = (key: string, v: number) =>
  key === 'avg_watch_time' || key === 'total_watch_time' || key.startsWith('taxa_') ? fmtMetric(key, v) : fmtFull(v)

export const RATE_HELP: { key: 'taxa_interacao' | 'taxa_compartilhamento' | 'taxa_salvamento'; label: string; help: string }[] = [
  { key: 'taxa_interacao', label: 'Taxa de interação', help: 'Interações (curtidas, comentários, compartilhamentos e salvamentos) divididas pelo alcance.' },
  { key: 'taxa_compartilhamento', label: 'Taxa de compartilhamento', help: 'Compartilhamentos divididos pelo alcance. Sinal forte de conteúdo que as pessoas repassam.' },
  { key: 'taxa_salvamento', label: 'Taxa de salvamento', help: 'Salvamentos divididos pelo alcance. Indica conteúdo que as pessoas querem rever.' },
]
