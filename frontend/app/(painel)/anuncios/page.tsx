import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getAdAccounts, getAdInsights } from '@/lib/api'
import { ACCOUNT_STATUS_TONE } from '@/lib/ads'
import { adWindows, fmtMoney, fmtNum } from '@/lib/format'
import { requireSession } from '@/lib/session'
import type { AdAccountSummary } from '@/lib/types'
import { BudgetMeter, Pill } from '@/components/ads/AdUi'
import { Delta, Notice, Sk } from '@/components/ui'

export const metadata: Metadata = { title: 'Anúncios' }

const DAYS = 7

export default async function Anuncios() {
  await connection()
  await requireSession()

  const r = await getAdAccounts()
  if (!r.ok)
    return (
      <Notice
        tone="bad"
        title="Não foi possível carregar as contas de anúncios"
        action={
          <Link href="/anuncios" className="inline-block rounded-lg border border-current px-3 py-2 text-sm font-medium">
            Tentar de novo
          </Link>
        }
      >
        {r.message}
      </Notice>
    )
  if (r.data.length === 0)
    return (
      <Notice title="Nenhuma conta de anúncios cadastrada">
        Cadastre no servidor com <span className="num">npm run ads -- conta &lt;APELIDO&gt; &lt;act_ID&gt; EZF_TECH</span>.
      </Notice>
    )

  const win = adWindows(DAYS)
  const total = r.data.reduce((s, a) => s + (a.gasto_mes ?? 0), 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Anúncios</h1>
        <p className="mt-1 text-muted">
          Gasto do mês por conta e resultados dos últimos {DAYS} dias ({win.range}) contra os {DAYS} anteriores.
        </p>
        <p className="mt-3 text-sm">
          Total gasto no mês: <span className="num font-medium">{fmtMoney(total, r.data[0]?.moeda ?? 'BRL')}</span>
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {r.data.map((a) => (
          <li key={a.ad_account_id}>
            <AccountCard a={a} win={win} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function AccountCard({ a, win }: { a: AdAccountSummary; win: ReturnType<typeof adWindows> }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display truncate text-xl font-bold tracking-tight">
            <Link href={`/anuncios/${a.apelido}`} className="hover:underline">
              {a.nome?.trim() || a.ad_account_id}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink">{a.apelido}</span>{' '}
            <span className="num">{a.ad_account_id}</span>
          </p>
        </div>
        {a.erro ? (
          <Pill tone="bad">Erro</Pill>
        ) : (
          <Pill tone={ACCOUNT_STATUS_TONE(a.status_conta)}>{(a.status_conta ?? '').toLowerCase().replace(/_/g, ' ') || '—'}</Pill>
        )}
      </header>

      <div className="mt-5">
        {a.erro ? (
          <Notice tone="warn" title="Conta indisponível agora">
            {a.erro}
          </Notice>
        ) : (
          <>
            <BudgetMeter spent={a.gasto_mes ?? 0} projected={null} cap={a.teto_mensal} currency={a.moeda} />
            <Suspense fallback={<StatsSkeleton />}>
              <Week a={a} win={win} />
            </Suspense>
          </>
        )}
      </div>

      <footer className="mt-5 border-t border-line pt-3 text-sm">
        <Link href={`/anuncios/${a.apelido}`} className="font-medium text-accent-ink hover:underline">
          Ver campanhas →
        </Link>
      </footer>
    </article>
  )
}

async function Week({ a, win }: { a: AdAccountSummary; win: ReturnType<typeof adWindows> }) {
  const [cur, prev] = await Promise.all([
    getAdInsights(a.apelido, 'conta', win.cur.since, win.cur.until),
    getAdInsights(a.apelido, 'conta', win.prev.since, win.prev.until),
  ])
  const pick = (r: typeof cur) => (r.ok ? r.data.contas.find((c) => c.ad_account_id === a.ad_account_id)?.totais : undefined)
  const c = pick(cur)
  const p = pick(prev)
  if (!c) return <p className="mt-5 text-sm text-muted">Resultados da semana indisponíveis agora.</p>
  if (c.gasto === 0 && (p?.gasto ?? 0) === 0)
    return <p className="mt-5 text-sm text-muted">Sem veiculação nos últimos 14 dias.</p>

  const stats: { label: string; cur: number | null; prev: number | null; fmt: (v: number) => string; invert?: boolean }[] = [
    { label: 'Gasto (7 dias)', cur: c.gasto, prev: p?.gasto ?? null, fmt: (v) => fmtMoney(v, a.moeda) },
    { label: 'Conversas', cur: c.conversas_iniciadas, prev: p?.conversas_iniciadas ?? null, fmt: fmtNum },
    { label: 'Custo/conversa', cur: c.custo_por_conversa, prev: p?.custo_por_conversa ?? null, fmt: (v) => fmtMoney(v, a.moeda), invert: true },
  ]
  return (
    <dl className="mt-5 grid grid-cols-3 gap-x-4">
      {stats.map((s) => (
        <div key={s.label} className="min-w-0">
          <dt className="truncate text-xs text-muted">{s.label}</dt>
          <dd className="num mt-1 truncate text-lg font-medium">{s.cur === null ? '—' : s.fmt(s.cur)}</dd>
          <dd className="mt-0.5">
            <Delta cur={s.cur} prev={s.prev} invert={s.invert} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function StatsSkeleton() {
  return (
    <div className="mt-5 grid grid-cols-3 gap-4" aria-busy="true" aria-label="Carregando resultados">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <Sk className="h-3 w-16" />
          <Sk className="mt-2 h-6 w-20" />
          <Sk className="mt-2 h-3 w-12" />
        </div>
      ))}
    </div>
  )
}
