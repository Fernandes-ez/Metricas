import type { Num } from './types'

const TZ = 'America/Sao_Paulo'
const full = new Intl.NumberFormat('pt-BR')
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** 1.234 → "1.234"; a partir de 10 mil → "12 mil" / "1,2 mi". */
export const fmtNum = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : full.format(n))
export const fmtFull = (n: number) => full.format(n)

/** Variação % entre períodos. Sem cálculo se algum lado for null ou zero. */
export function variation(cur: Num, prev: Num): number | null {
  if (cur === null || prev === null || cur === 0 || prev === 0) return null
  return ((cur - prev) / prev) * 100
}

export const fmtPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${pct.format(Math.abs(v))}%`

const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' })

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso))
export const fmtDay = (d: Date) => dayFmt.format(d)
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso))

/** Janela terminando na hora cheia atual (estável para o cache) e a janela anterior de mesmo tamanho. */
export function windows(days: number) {
  const until = Math.floor(Date.now() / 3_600_000) * 3_600_000
  const since = until - days * 86_400_000
  const prevSince = since - days * 86_400_000
  const iso = (ms: number) => new Date(ms).toISOString()
  return {
    cur: { since: iso(since), until: iso(until) },
    prev: { since: iso(prevSince), until: iso(since) },
    range: `${fmtDay(new Date(since))} a ${fmtDay(new Date(until))}`,
  }
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
/** "há 20 minutos", "há 3 horas"… a partir de um instante ISO. */
export function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return rtf.format(-min, 'minute')
  if (min < 1440) return rtf.format(-Math.round(min / 60), 'hour')
  return rtf.format(-Math.round(min / 1440), 'day')
}

const dec1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** Milissegundos para "8,4 s", "1 min 12 s" ou "2 h 05 min". */
export function fmtDuration(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${dec1.format(s)} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(Math.round(s % 60)).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

const pctFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** Fração do alcance (0,114) para "11,4%". */
export const fmtRate = (frac: number) => pctFmt.format(frac)
