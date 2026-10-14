import type { ReactNode } from 'react'
import { fmtFull, fmtNum, fmtPct, variation } from '@/lib/format'
import { LABEL, UNAVAILABLE, WHY, WHY_DEFAULT } from '@/lib/metrics'
import type { AccountStatus, Num } from '@/lib/types'

/** Variação % entre períodos; "—" quando não dá para calcular (null ou zero). */
export function Delta({ cur, prev, invert = false }: { cur: Num; prev: Num; invert?: boolean }) {
  const v = variation(cur, prev)
  if (v === null)
    return (
      <span className="num text-sm text-muted" title="Sem base de comparação (valor ausente ou zero)">
        —
      </span>
    )
  const good = invert ? v < 0 : v > 0
  const tone = v === 0 ? 'text-muted' : good ? 'text-up' : 'text-down'
  return (
    <span
      className={`num inline-flex items-center gap-1 text-sm font-medium ${tone}`}
      aria-label={`${v > 0 ? 'Aumento' : v < 0 ? 'Queda' : 'Estável'} de ${fmtPct(Math.abs(v)).replace('+', '')} em relação ao período anterior`}
    >
      <span aria-hidden className="text-[0.7em]">
        {v > 0 ? '▲' : v < 0 ? '▼' : '■'}
      </span>
      {fmtPct(v)}
    </span>
  )
}

/** Valor ou "—" com tooltip e texto de apoio. */
function Value({ value, className = '' }: { value: Num; className?: string }) {
  if (value === null)
    return (
      <span className={`num text-muted ${className}`} title={UNAVAILABLE}>
        —
      </span>
    )
  return (
    <span className={`num ${className}`} title={fmtFull(value)}>
      {fmtNum(value)}
    </span>
  )
}

/**
 * Assinatura visual: as duas barras finas sob o número mostram atual (âmbar) contra
 * anterior (cinza), na mesma escala. Âmbar sempre significa "período atual".
 */
function Pair({ cur, prev }: { cur: number; prev: number }) {
  const max = Math.max(cur, prev, 1)
  return (
    <div aria-hidden className="mt-3 space-y-1">
      <div className="h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(cur / max) * 100}%` }} />
      </div>
      <div className="h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-prev" style={{ width: `${(prev / max) * 100}%` }} />
      </div>
    </div>
  )
}

export function Kpi({
  id,
  cur,
  prev,
  invert,
}: {
  id: string
  cur: Num
  prev: Num
  invert?: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{LABEL[id] ?? id}</p>
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <Value value={cur} className="text-2xl font-medium leading-none sm:text-[1.75rem]" />
        <Delta cur={cur} prev={prev} invert={invert} />
      </p>
      {cur === null ? (
        <p className="mt-3 text-xs text-muted">Indisponível</p>
      ) : prev === null ? (
        <p className="mt-3 text-xs text-muted">Sem dado do período anterior</p>
      ) : (
        <>
          <Pair cur={cur} prev={prev} />
          <p className="mt-2 text-xs text-muted">
            Antes: <span className="num">{fmtNum(prev)}</span>
          </p>
        </>
      )}
    </div>
  )
}

/** Versão compacta para os cartões da visão geral. */
export function Stat({ id, cur, prev, invert }: { id: string; cur: Num; prev: Num; invert?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{LABEL[id] ?? id}</p>
      <p className="mt-1">
        <Value value={cur} className="text-xl font-medium" />
      </p>
      <p className="mt-0.5">
        <Delta cur={cur} prev={prev} invert={invert} />
      </p>
    </div>
  )
}

export function StatusPill({ s }: { s: AccountStatus }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium'
  if (s.status === 'needs_reauth')
    return <span className={`${base} bg-bad-bg text-bad-ink`}>Reconectar</span>
  if (s.dias_restantes < 10)
    return (
      <span className={`${base} bg-warn-bg text-warn-ink`}>
        {s.dias_restantes <= 0 ? 'Token vencido' : `Token vence em ${s.dias_restantes} ${s.dias_restantes === 1 ? 'dia' : 'dias'}`}
      </span>
    )
  return (
    <span className={`${base} bg-surface-2 text-muted`}>
      <span aria-hidden className="size-1.5 rounded-full bg-up" />
      Conectada
    </span>
  )
}

export function Notice({
  tone = 'neutral',
  title,
  children,
  action,
}: {
  tone?: 'neutral' | 'warn' | 'bad'
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  const t = { neutral: 'bg-surface border-line', warn: 'bg-warn-bg text-warn-ink border-transparent', bad: 'bg-bad-bg text-bad-ink border-transparent' }[tone]
  return (
    <div role={tone === 'neutral' ? 'status' : 'alert'} className={`rounded-xl border p-4 ${t}`}>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ReauthNotice({ username }: { username?: string }) {
  return (
    <Notice tone="bad" title={`${username ? `@${username} precisa` : 'Esta conta precisa'} ser reconectada`}>
      O acesso ao Instagram expirou ou foi revogado. Reconecte a conta e importe o novo token para voltar a ver as métricas.
    </Notice>
  )
}

/** Explica, uma vez por tela, por que alguns números estão indisponíveis. */
export function UnavailableNote({ ids }: { ids: string[] }) {
  if (!ids.length) return null
  const reasons = [...new Set(ids.map((i) => WHY[i] ?? WHY_DEFAULT))]
  return (
    <aside className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
      <p className="font-medium text-ink">Por que alguns números estão indisponíveis?</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </aside>
  )
}

export function Sk({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}
