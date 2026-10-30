import { adStatus, type Tone } from '@/lib/ads'
import { fmtMoney, fmtNum } from '@/lib/format'
import type { Num } from '@/lib/types'
import { Delta } from '@/components/ui'

const TONE: Record<Tone, string> = {
  good: 'bg-surface-2 text-ink',
  neutral: 'bg-surface-2 text-muted',
  warn: 'bg-warn-bg text-warn-ink',
  bad: 'bg-bad-bg text-bad-ink',
}

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {tone === 'good' && <span aria-hidden className="size-1.5 rounded-full bg-up" />}
      {children}
    </span>
  )
}

export function AdStatusPill({ status }: { status: string }) {
  const s = adStatus(status)
  return <Pill tone={s.tone}>{s.label}</Pill>
}

export type KpiFormat = 'money' | 'count' | 'pct' | 'dec'

export function fmtKpi(v: number, kind: KpiFormat, currency: string | null) {
  if (kind === 'money') return fmtMoney(v, currency)
  if (kind === 'pct') return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  if (kind === 'dec') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return fmtNum(v)
}

/** Cartão de indicador de anúncios: valor atual, variação e valor do período anterior. */
export function AdKpi({
  label,
  cur,
  prev,
  kind,
  currency,
  invert,
  hint,
}: {
  label: string
  cur: Num
  prev: Num
  kind: KpiFormat
  currency: string | null
  invert?: boolean
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)]" title={hint}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="num text-2xl font-medium leading-none sm:text-[1.6rem]">{cur === null ? '—' : fmtKpi(cur, kind, currency)}</span>
        <Delta cur={cur} prev={prev} invert={invert} />
      </p>
      <p className="mt-3 text-xs text-muted">
        Antes: <span className="num">{prev === null ? '—' : fmtKpi(prev, kind, currency)}</span>
      </p>
    </div>
  )
}

/** Barra de uso do teto mensal: gasto do mês (âmbar) e projeção até o fim do mês (hachurada). */
export function BudgetMeter({
  spent,
  projected,
  cap,
  currency,
}: {
  spent: number
  projected: number | null
  cap: Num
  currency: string | null
}) {
  if (!cap)
    return (
      <p className="text-sm text-muted">
        Gasto no mês: <span className="num font-medium text-ink">{fmtMoney(spent, currency)}</span>. Sem teto mensal definido
        (ativar ou aumentar orçamento fica bloqueado).
      </p>
    )
  const max = Math.max(cap, projected ?? 0, spent)
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const over = (projected ?? spent) > cap
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>
          <span className="num text-xl font-medium">{fmtMoney(spent, currency)}</span>
          <span className="text-muted"> de {fmtMoney(cap, currency)}</span>
        </span>
        <span className="num text-muted">{Math.round((spent / cap) * 100)}% do teto</span>
      </div>
      <div
        className="relative mt-2 h-3 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`Gasto de ${fmtMoney(spent, currency)} de um teto de ${fmtMoney(cap, currency)}${
          projected !== null ? `; projeção até o fim do mês de ${fmtMoney(projected, currency)}` : ''
        }`}
      >
        {projected !== null && projected > spent && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: pct(projected),
              background: `repeating-linear-gradient(135deg, var(--accent) 0 4px, transparent 4px 8px)`,
              opacity: 0.45,
            }}
          />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: pct(spent) }} />
        <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: pct(cap) }} />
      </div>
      {projected !== null && (
        <p className={`mt-2 text-xs ${over ? 'font-medium text-down' : 'text-muted'}`}>
          Projeção até o fim do mês no ritmo atual: <span className="num">{fmtMoney(projected, currency)}</span>
          {over ? ' (acima do teto)' : ''}
        </p>
      )}
    </div>
  )
}
