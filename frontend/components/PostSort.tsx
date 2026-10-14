'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SORT_OPTIONS, isSortKey } from '@/lib/metrics'
import type { SortKey } from '@/lib/types'

/** A ordem fica na URL (?ordenar=reach&ordem=asc); ausente = mais recentes, maior primeiro. */
export function sortHref(alias: string, dias: number, ordenar: SortKey, ordem: 'asc' | 'desc') {
  const q = new URLSearchParams({ dias: String(dias) })
  if (ordenar !== 'data') q.set('ordenar', ordenar)
  if (ordem === 'asc') q.set('ordem', 'asc')
  return `/contas/${alias}?${q}`
}

export function PostSort({
  alias,
  dias,
  ordenar,
  ordem,
}: {
  alias: string
  dias: number
  ordenar: SortKey
  ordem: 'asc' | 'desc'
}) {
  const router = useRouter()
  const isDate = ordenar === 'data'
  const dirLabel = ordem === 'desc' ? (isDate ? 'Mais novos primeiro' : 'Maior primeiro') : isDate ? 'Mais antigos primeiro' : 'Menor primeiro'

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 sm:max-w-xs">
        <label htmlFor="ordenar" className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
          Ordenar por
        </label>
        <select
          id="ordenar"
          value={ordenar}
          onChange={(e) => {
            const v = e.target.value
            if (isSortKey(v)) router.push(sortHref(alias, dias, v, ordem))
          }}
          className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-base"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Link
        href={sortHref(alias, dias, ordenar, ordem === 'desc' ? 'asc' : 'desc')}
        aria-label={`Inverter a ordem (agora: ${dirLabel.toLowerCase()})`}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
      >
        <span aria-hidden>{ordem === 'desc' ? '↓' : '↑'}</span>
        {dirLabel}
      </Link>
    </div>
  )
}
