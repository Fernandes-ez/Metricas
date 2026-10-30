'use client'

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface DayRow {
  data: string // YYYY-MM-DD
  gasto: number
  conversas: number
  custo: number | null
}

const nf = new Intl.NumberFormat('pt-BR')
const day = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function money(currency: string) {
  const f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency })
  const short = new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 })
  return { full: (v: number) => f.format(v), short: (v: number) => short.format(v) }
}

function Tip({
  active,
  payload,
  fmt,
}: {
  active?: boolean
  payload?: { payload: DayRow }[]
  fmt: ReturnType<typeof money>
}) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="font-medium">{day(r.data)}</p>
      <p className="num">
        <span className="text-accent-ink">Gasto</span> {fmt.full(r.gasto)}
      </p>
      <p className="num">Conversas {nf.format(r.conversas)}</p>
      <p className="num text-muted">Custo/conversa {r.custo === null ? '—' : fmt.full(r.custo)}</p>
    </div>
  )
}

/** Gasto por dia (barras âmbar, eixo esquerdo) e conversas iniciadas (linha, eixo direito). */
export function AdsDailyChart({ rows, currency }: { rows: DayRow[]; currency: string }) {
  const fmt = money(currency)
  return (
    <figure className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display font-bold tracking-tight">Gasto e conversas por dia</span>
        <span className="flex items-center gap-3 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-accent" /> Gasto
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-0.5 w-3 rounded bg-ink" /> Conversas
          </span>
        </span>
      </figcaption>

      <div aria-hidden className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 256 }}>
          <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="data"
              tickFormatter={day}
              stroke="var(--muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              yAxisId="g"
              tickFormatter={(v: number) => fmt.short(v)}
              stroke="var(--muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <YAxis
              yAxisId="c"
              orientation="right"
              allowDecimals={false}
              stroke="var(--muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar yAxisId="g" dataKey="gasto" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Line
              yAxisId="c"
              dataKey="conversas"
              stroke="var(--ink)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'var(--ink)' }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="sr-only">
        <table>
          <caption>Gasto, conversas iniciadas e custo por conversa por dia</caption>
          <thead>
            <tr>
              <th>Dia</th>
              <th>Gasto</th>
              <th>Conversas</th>
              <th>Custo por conversa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.data}>
                <th scope="row">{day(r.data)}</th>
                <td>{fmt.full(r.gasto)}</td>
                <td>{nf.format(r.conversas)}</td>
                <td>{r.custo === null ? 'sem conversas' : fmt.full(r.custo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
