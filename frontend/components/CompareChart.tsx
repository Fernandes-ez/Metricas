'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Row {
  label: string
  atual: number | null
  anterior: number | null
}

const nf = new Intl.NumberFormat('pt-BR')
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function Tip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number | null }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="font-medium">{label}</p>
      <p className="num">
        <span className="text-accent-ink">Atual</span> {get('atual') === null ? '—' : nf.format(get('atual')!)}
      </p>
      <p className="num text-muted">Anterior {get('anterior') === null ? '—' : nf.format(get('anterior')!)}</p>
    </div>
  )
}

/** Barras agrupadas (período atual × anterior). Valores null não desenham barra. */
export function CompareChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <figure className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display font-bold tracking-tight">{title}</span>
        <span className="flex items-center gap-3 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-accent" /> Atual
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-prev" /> Anterior
          </span>
        </span>
      </figcaption>

      {/* o gráfico é decorativo; a tabela abaixo carrega os mesmos dados para leitores de tela */}
      <div aria-hidden className="mt-3" style={{ height: rows.length * 58 + 24 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: rows.length * 58 + 24 }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barGap={3}>
            <CartesianGrid horizontal={false} stroke="var(--line)" />
            <XAxis type="number" tickFormatter={(v: number) => compact.format(v)} stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={124} stroke="var(--muted)" tick={{ fontSize: 11.5, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="atual" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
            <Bar dataKey="anterior" fill="var(--prev)" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>{title}: período atual e período anterior</caption>
        <thead>
          <tr>
            <th>Métrica</th>
            <th>Atual</th>
            <th>Anterior</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.atual === null ? 'indisponível' : nf.format(r.atual)}</td>
              <td>{r.anterior === null ? 'indisponível' : nf.format(r.anterior)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
