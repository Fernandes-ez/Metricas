import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ALIAS_RE, getAccounts, getInsights, getMedia, getStatus } from '@/lib/api'
import { fmtNum, windows } from '@/lib/format'
import { LABEL } from '@/lib/metrics'
import { requireSession } from '@/lib/session'
import type { AccountInsights } from '@/lib/types'
import { CompareChart, type Row } from '@/components/CompareChart'
import { PostGrid } from '@/components/PostGrid'
import { Kpi, Notice, ReauthNotice, Sk, StatusPill, UnavailableNote } from '@/components/ui'

const PERIODS = [7, 14, 30] as const
type Props = { params: Promise<{ apelido: string }>; searchParams: Promise<{ dias?: string | string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).apelido }
}

const KPIS: { id: keyof AccountInsights; invert?: boolean }[] = [
  { id: 'reach' },
  { id: 'views' },
  { id: 'accounts_engaged' },
  { id: 'total_interactions' },
  { id: 'likes' },
  { id: 'comments' },
  { id: 'shares' },
  { id: 'saves' },
  { id: 'profile_views' },
  { id: 'follows' },
  { id: 'unfollows', invert: true },
]

const GROUPS: { title: string; ids: (keyof AccountInsights)[] }[] = [
  { title: 'Alcance e atenção', ids: ['reach', 'views', 'accounts_engaged', 'profile_views'] },
  { title: 'Interações', ids: ['likes', 'comments', 'shares', 'saves'] },
  { title: 'Seguidores', ids: ['follows', 'unfollows'] },
]

export default async function Conta({ params, searchParams }: Props) {
  await requireSession()
  const { apelido } = await params
  if (!ALIAS_RE.test(apelido)) notFound()
  const dias = Number((await searchParams).dias)
  const days = PERIODS.find((p) => p === dias) ?? 7

  const [st, ac] = await Promise.all([getStatus(), getAccounts()])
  if (!st.ok)
    return (
      <Notice
        tone="bad"
        title="Não foi possível carregar a conta"
        action={
          <Link href={`/contas/${apelido}?dias=${days}`} className="inline-block rounded-lg border border-current px-3 py-2 text-sm font-medium">
            Tentar de novo
          </Link>
        }
      >
        {st.message}
      </Notice>
    )
  const s = st.data.find((x) => x.alias === apelido)
  if (!s) notFound()
  const account = ac.ok ? ac.data.find((a) => a.apelido === apelido) : undefined
  const win = windows(days)

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Visão geral
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display break-all text-3xl font-bold tracking-tight sm:text-4xl">@{s.username}</h1>
            <p className="mt-1 text-muted">
              {account ? (
                <>
                  <span className="num">{fmtNum(account.followers_count)}</span> seguidores ·{' '}
                  <span className="num">{fmtNum(account.media_count)}</span> posts
                </>
              ) : (
                s.alias
              )}
            </p>
          </div>
          <StatusPill s={s} />
        </div>
      </div>

      {s.status === 'needs_reauth' ? (
        <ReauthNotice username={s.username} />
      ) : (
        <>
          <nav aria-label="Período" className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-line bg-surface p-1">
              {PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/contas/${apelido}?dias=${p}`}
                  aria-current={p === days ? 'page' : undefined}
                  className={`num h-9 rounded-md px-4 text-sm leading-9 ${
                    p === days ? 'bg-accent font-semibold text-on-accent' : 'text-muted hover:text-ink'
                  }`}
                >
                  {p} dias
                </Link>
              ))}
            </div>
            <p className="hidden text-sm text-muted sm:block">{win.range}, contra os {days} dias anteriores</p>
          </nav>

          <Suspense fallback={<InsightsSkeleton />}>
            <Insights alias={apelido} days={days} win={win} />
          </Suspense>

          <section aria-labelledby="posts" className="space-y-4">
            <h2 id="posts" className="font-display text-2xl font-bold tracking-tight">
              Posts recentes
            </h2>
            <Suspense fallback={<MediaSkeleton />}>
              <Posts alias={apelido} />
            </Suspense>
          </section>
        </>
      )}
    </div>
  )
}

async function Insights({ alias, days, win }: { alias: string; days: number; win: ReturnType<typeof windows> }) {
  const [cur, prev] = await Promise.all([
    getInsights(alias, win.cur.since, win.cur.until),
    getInsights(alias, win.prev.since, win.prev.until),
  ])
  if (!cur.ok)
    return cur.kind === 'reauth' ? (
      <ReauthNotice />
    ) : (
      <Notice
        tone="warn"
        title="Métricas indisponíveis agora"
        action={
          <Link href={`/contas/${alias}?dias=${days}`} className="inline-block rounded-lg border border-current px-3 py-2 text-sm font-medium">
            Tentar de novo
          </Link>
        }
      >
        {cur.message}
      </Notice>
    )

  const c = cur.data
  const p = prev.ok ? prev.data : null
  const val = (d: AccountInsights | null, k: keyof AccountInsights) => {
    const v = d?.[k]
    return typeof v === 'number' ? v : null
  }
  const unavailable = KPIS.map((k) => k.id as string).filter((id) => val(c, id as keyof AccountInsights) === null)
  const rows = (ids: (keyof AccountInsights)[]): Row[] =>
    ids.map((id) => ({ label: LABEL[id], atual: val(c, id), anterior: val(p, id) }))

  return (
    <div className="space-y-6">
      {!prev.ok && (
        <Notice tone="warn" title="Sem o período anterior">
          Não foi possível carregar os {days} dias anteriores; as variações aparecem como “—”.
        </Notice>
      )}
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {KPIS.map((k) => (
          <Kpi key={k.id} id={k.id} cur={val(c, k.id)} prev={val(p, k.id)} invert={k.invert} />
        ))}
      </section>

      <section aria-label="Gráficos" className="grid gap-4 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const r = rows(g.ids)
          return r.every((x) => x.atual === null && x.anterior === null) ? (
            <div key={g.title} className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              <p className="font-display font-bold tracking-tight text-ink">{g.title}</p>
              <p className="mt-1">Sem dados disponíveis para este período.</p>
            </div>
          ) : (
            <CompareChart key={g.title} title={g.title} rows={r} />
          )
        })}
      </section>

      <UnavailableNote ids={unavailable} />
    </div>
  )
}

async function Posts({ alias }: { alias: string }) {
  const m = await getMedia(alias, 24)
  if (!m.ok)
    return m.kind === 'reauth' ? (
      <ReauthNotice />
    ) : (
      <Notice tone="warn" title="Não foi possível carregar os posts">
        {m.message}
      </Notice>
    )
  if (m.data.length === 0)
    return (
      <Notice title="Nenhum post publicado ainda">Quando esta conta publicar, os posts aparecem aqui com as métricas de cada um.</Notice>
    )
  return (
    <>
      <p className="-mt-2 text-sm text-muted">Toque em um post para ver as métricas dele.</p>
      <PostGrid posts={m.data} conta={alias} />
    </>
  )
}

function InsightsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando indicadores" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <Sk className="h-3 w-20" />
            <Sk className="mt-3 h-8 w-24" />
            <Sk className="mt-4 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Sk key={i} className="h-56 w-full" />
        ))}
      </div>
    </div>
  )
}

function MediaSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando posts" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
          <Sk className="aspect-square w-full rounded-none" />
          <div className="p-3">
            <Sk className="h-3 w-16" />
            <Sk className="mt-2 h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
