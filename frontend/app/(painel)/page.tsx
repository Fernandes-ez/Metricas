import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getAccounts, getInsights, getStatus } from '@/lib/api'
import { fmtNum, windows } from '@/lib/format'
import { requireSession } from '@/lib/session'
import type { Account, AccountStatus } from '@/lib/types'
import { Notice, ReauthNotice, Sk, Stat, StatusPill } from '@/components/ui'

const DAYS = 7

export default async function VisaoGeral() {
  await connection()
  await requireSession()

  const [st, ac] = await Promise.all([getStatus(), getAccounts()])
  if (!st.ok)
    return (
      <Notice
        tone="bad"
        title="Não foi possível carregar as contas"
        action={
          <Link href="/" className="inline-block rounded-lg border border-current px-3 py-2 text-sm font-medium">
            Tentar de novo
          </Link>
        }
      >
        {st.message}
      </Notice>
    )
  if (st.data.length === 0)
    return (
      <Notice title="Nenhuma conta cadastrada">
        Importe as contas no servidor (<span className="num">npm run import-accounts</span>) para vê-las aqui.
      </Notice>
    )

  const accounts = new Map((ac.ok ? ac.data : []).map((a) => [a.apelido, a]))
  const win = windows(DAYS)
  const alerts = st.data.filter((s) => s.status === 'needs_reauth' || s.dias_restantes < 10)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Visão geral</h1>
        <p className="mt-1 text-muted">
          Últimos {DAYS} dias ({win.range}) comparados aos {DAYS} dias anteriores.
        </p>
      </div>

      {alerts.length > 0 && (
        <section aria-label="Alertas de conexão" className="space-y-2">
          {alerts.map((s) => (
            <Link
              key={s.alias}
              href={`/contas/${s.alias}`}
              className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                s.status === 'needs_reauth' ? 'bg-bad-bg text-bad-ink' : 'bg-warn-bg text-warn-ink'
              }`}
            >
              <span>
                <span aria-hidden>⚠ </span>
                {s.status === 'needs_reauth'
                  ? `@${s.username} precisa ser reconectada.`
                  : s.dias_restantes <= 0
                    ? `O token de @${s.username} venceu.`
                    : `O token de @${s.username} vence em ${s.dias_restantes} ${s.dias_restantes === 1 ? 'dia' : 'dias'}.`}
              </span>
              <span aria-hidden>→</span>
            </Link>
          ))}
        </section>
      )}

      {!ac.ok && (
        <Notice tone="warn" title="Seguidores indisponíveis agora">
          {ac.message}
        </Notice>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {st.data.map((s) => (
          <li key={s.alias}>
            <Suspense fallback={<CardSkeleton />}>
              <AccountCard s={s} account={accounts.get(s.alias)} win={win} />
            </Suspense>
          </li>
        ))}
      </ul>
    </div>
  )
}

async function AccountCard({
  s,
  account,
  win,
}: {
  s: AccountStatus
  account?: Account
  win: ReturnType<typeof windows>
}) {
  const reauth = s.status === 'needs_reauth'
  const [cur, prev] = reauth
    ? [null, null]
    : await Promise.all([
        getInsights(s.alias, win.cur.since, win.cur.until),
        getInsights(s.alias, win.prev.since, win.prev.until),
      ])
  const c = cur?.ok ? cur.data : null
  const p = prev?.ok ? prev.data : null

  return (
    <article className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display truncate text-xl font-bold tracking-tight">
            <Link href={`/contas/${s.alias}`} className="hover:underline">
              @{s.username}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink">{s.alias}</span>
            {account && (
              <>
                {' '}
                · <span className="num">{fmtNum(account.followers_count)}</span> seguidores
              </>
            )}
          </p>
        </div>
        <StatusPill s={s} />
      </header>

      <div className="mt-5">
        {reauth ? (
          <ReauthNotice />
        ) : cur && !cur.ok ? (
          cur.kind === 'reauth' ? (
            <ReauthNotice />
          ) : (
            <Notice tone="warn" title="Métricas indisponíveis agora">
              {cur.message}
            </Notice>
          )
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
            <Stat id="reach" cur={c?.reach ?? null} prev={p?.reach ?? null} />
            <Stat id="views" cur={c?.views ?? null} prev={p?.views ?? null} />
            <Stat id="total_interactions" cur={c?.total_interactions ?? null} prev={p?.total_interactions ?? null} />
            <Stat id="follows" cur={c?.follows ?? null} prev={p?.follows ?? null} />
          </dl>
        )}
      </div>

      <footer className="mt-5 border-t border-line pt-3 text-sm">
        <Link href={`/contas/${s.alias}`} className="font-medium text-accent-ink hover:underline">
          Ver detalhes →
        </Link>
      </footer>
    </article>
  )
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5" aria-busy="true" aria-label="Carregando conta">
      <Sk className="h-6 w-40" />
      <Sk className="mt-2 h-4 w-28" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Sk className="h-3 w-16" />
            <Sk className="mt-2 h-6 w-20" />
            <Sk className="mt-2 h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}
