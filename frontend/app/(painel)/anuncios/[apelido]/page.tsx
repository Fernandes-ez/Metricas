import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ALIAS_RE, getAdAccounts, getAdCampaigns, getAdDaily, getAdInsights } from '@/lib/api'
import { adObjective, SPENDING } from '@/lib/ads'
import { adWindows, ago, fmtMoney, fmtNum, todaySP } from '@/lib/format'
import { requireSession } from '@/lib/session'
import type { AdAccountSummary, AdCampaign, AdCampaignsRes, AdMetrics, AdRow, Num } from '@/lib/types'
import { AdsDailyChart } from '@/components/ads/AdsDailyChart'
import { AdKpi, AdStatusPill, BudgetMeter } from '@/components/ads/AdUi'
import { Delta, Notice, Sk } from '@/components/ui'

const PERIODS = [7, 14, 30] as const
type Props = {
  params: Promise<{ apelido: string }>
  searchParams: Promise<{ dias?: string | string[] }>
}
type Conta = AdCampaignsRes['contas'][number]
type Win = ReturnType<typeof adWindows>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Anúncios · ${(await params).apelido.toUpperCase()}` }
}

export default async function AnunciosConta({ params, searchParams }: Props) {
  await requireSession()
  const raw = (await params).apelido
  if (!ALIAS_RE.test(raw)) notFound()
  const apelido = raw.toUpperCase()
  const dias = Number(first((await searchParams).dias))
  const days = PERIODS.find((p) => p === dias) ?? 7
  const win = adWindows(days)

  const [camp, accs] = await Promise.all([getAdCampaigns(apelido), getAdAccounts()])
  if (!camp.ok) {
    if (camp.kind === 'notfound')
      return (
        <Notice title={`${apelido} não tem conta de anúncios cadastrada`}>
          <Link href="/anuncios" className="underline">
            Voltar para Anúncios
          </Link>
        </Notice>
      )
    return (
      <Notice
        tone="bad"
        title={camp.kind === 'reauth' ? 'Token de anúncios inválido' : 'Não foi possível carregar as campanhas'}
        action={
          <Link href={`/anuncios/${apelido}?dias=${days}`} className="inline-block rounded-lg border border-current px-3 py-2 text-sm font-medium">
            Tentar de novo
          </Link>
        }
      >
        {camp.kind === 'reauth' ? 'Gere outro token no usuário do sistema e cadastre com npm run ads -- token EZF_TECH.' : camp.message}
      </Notice>
    )
  }

  const contas = camp.data.contas
  const summaries = new Map((accs.ok ? accs.data : []).map((a) => [a.ad_account_id, a]))
  const title = contas.length === 1 ? contas[0].nome?.trim() || contas[0].ad_account_id : apelido

  return (
    <div className="space-y-8">
      <div>
        <Link href="/anuncios" className="text-sm text-muted hover:text-ink">
          ← Anúncios
        </Link>
        <h1 className="font-display mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-1 text-muted">
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink">{apelido}</span>{' '}
          {contas.length === 1 && <span className="num text-sm">{contas[0].ad_account_id}</span>}
        </p>
      </div>

      <nav aria-label="Período" className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-line bg-surface p-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/anuncios/${apelido}?dias=${p}`}
              aria-current={p === days ? 'page' : undefined}
              className={`num h-9 rounded-md px-4 text-sm leading-9 ${p === days ? 'bg-accent font-semibold text-on-accent' : 'text-muted hover:text-ink'}`}
            >
              {p} dias
            </Link>
          ))}
        </div>
        <p className="text-sm text-muted">
          {win.range} (dias completos), contra os {days} dias anteriores
        </p>
      </nav>

      {contas.map((c) => (
        <AccountSection key={c.ad_account_id} alias={apelido} conta={c} summary={summaries.get(c.ad_account_id)} win={win} multi={contas.length > 1} />
      ))}
    </div>
  )
}

function AccountSection({
  alias,
  conta,
  summary,
  win,
  multi,
}: {
  alias: string
  conta: Conta
  summary?: AdAccountSummary
  win: Win
  multi: boolean
}) {
  if (conta.erro)
    return (
      <Notice tone="warn" title={`${conta.nome ?? conta.ad_account_id}: indisponível agora`}>
        {conta.erro}
      </Notice>
    )
  const cur = conta.moeda
  return (
    <section className="space-y-6" aria-label={conta.nome ?? conta.ad_account_id}>
      {multi && <h2 className="font-display text-2xl font-bold tracking-tight">{conta.nome ?? conta.ad_account_id}</h2>}

      <Budget conta={conta} summary={summary} />

      <Suspense fallback={<KpiSkeleton />}>
        <Kpis alias={alias} id={conta.ad_account_id} currency={cur} win={win} />
      </Suspense>

      <Suspense fallback={<Sk className="h-80 w-full" />}>
        <Daily alias={alias} id={conta.ad_account_id} currency={cur} win={win} />
      </Suspense>

      <Suspense fallback={<TableSkeleton title="Campanhas" />}>
        <Campaigns alias={alias} conta={conta} win={win} />
      </Suspense>

      <Suspense fallback={<TableSkeleton title="Anúncios" />}>
        <Ads alias={alias} conta={conta} win={win} />
      </Suspense>
    </section>
  )
}

// ---------- orçamento x teto ----------

function daysLeftInMonth() {
  const [y, m, d] = todaySP().split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1
}

function Budget({ conta, summary }: { conta: Conta; summary?: AdAccountSummary }) {
  const spent = summary?.gasto_mes ?? 0
  const daily = conta.orcamento_diario_ativo ?? 0
  const left = daysLeftInMonth()
  const projected = summary ? Math.round((spent + daily * left) * 100) / 100 : null
  const semEntrega = conta.campanhas_sem_entrega ?? []
  const ativas = (conta.campanhas ?? []).filter((c) => SPENDING.has(c.status_efetivo) && !semEntrega.some((s) => s.id === c.id)).length

  return (
    <section aria-labelledby="orc" className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="orc" className="font-display text-lg font-bold tracking-tight">
          Orçamento do mês
        </h2>
        <p className="text-sm text-muted">
          Comprometido agora: <span className="num font-medium text-ink">{fmtMoney(daily, conta.moeda)}/dia</span> em {ativas}{' '}
          {ativas === 1 ? 'campanha' : 'campanhas'} · {left} {left === 1 ? 'dia restante' : 'dias restantes'}
        </p>
      </div>
      <div className="mt-4">
        <BudgetMeter spent={spent} projected={projected} cap={conta.teto_mensal ?? summary?.teto_mensal ?? null} currency={conta.moeda} />
      </div>
      {semEntrega.length > 0 && (
        <div className="mt-4 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink" role="status">
          <p className="font-medium">
            {semEntrega.length === 1 ? '1 campanha ligada não está entregando' : `${semEntrega.length} campanhas ligadas não estão entregando`}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {semEntrega.map((s) => (
              <li key={s.id}>
                {s.nome} <span className="opacity-80">({s.motivo})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ---------- indicadores ----------

const KPIS: { key: keyof AdMetrics; label: string; kind: 'money' | 'count' | 'pct' | 'dec'; invert?: boolean; hint?: string }[] = [
  { key: 'gasto', label: 'Gasto', kind: 'money' },
  { key: 'conversas_iniciadas', label: 'Conversas', kind: 'count', hint: 'Conversas iniciadas no WhatsApp/Direct pelo anúncio (janela de 7 dias)' },
  { key: 'custo_por_conversa', label: 'Custo por conversa', kind: 'money', invert: true },
  { key: 'alcance', label: 'Alcance', kind: 'count' },
  { key: 'impressoes', label: 'Impressões', kind: 'count' },
  { key: 'frequencia', label: 'Frequência', kind: 'dec', hint: 'Média de vezes que cada pessoa viu os anúncios. Acima de ~3 costuma indicar criativo cansado.' },
  { key: 'ctr_pct', label: 'CTR', kind: 'pct', hint: 'Cliques no link divididos pelas impressões' },
  { key: 'cpm', label: 'CPM', kind: 'money', invert: true, hint: 'Custo por mil impressões' },
]

const totalsOf = (r: Awaited<ReturnType<typeof getAdInsights>>, id: string) =>
  r.ok ? r.data.contas.find((c) => c.ad_account_id === id)?.totais : undefined
const linesOf = (r: Awaited<ReturnType<typeof getAdInsights>>, id: string) =>
  r.ok ? r.data.contas.find((c) => c.ad_account_id === id)?.linhas : undefined
const num = (m: AdMetrics | undefined, k: keyof AdMetrics): Num => {
  const v = m?.[k]
  return typeof v === 'number' ? v : null
}

async function Kpis({ alias, id, currency, win }: { alias: string; id: string; currency: string | null; win: Win }) {
  const [cur, prev] = await Promise.all([
    getAdInsights(alias, 'conta', win.cur.since, win.cur.until),
    getAdInsights(alias, 'conta', win.prev.since, win.prev.until),
  ])
  const c = totalsOf(cur, id)
  const p = totalsOf(prev, id)
  if (!c) return <Notice tone="warn" title="Indicadores indisponíveis agora">{!cur.ok ? cur.message : 'Sem dados para o período.'}</Notice>
  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {KPIS.map((k) => (
        <AdKpi
          key={k.key}
          label={k.label}
          cur={num(c, k.key)}
          prev={num(p, k.key)}
          kind={k.kind}
          currency={currency}
          invert={k.invert}
          hint={k.hint}
        />
      ))}
    </section>
  )
}

// ---------- série diária ----------

async function Daily({ alias, id, currency, win }: { alias: string; id: string; currency: string | null; win: Win }) {
  const r = await getAdDaily(alias, win.cur.since, win.cur.until)
  const conta = r.ok ? r.data.contas.find((c) => c.ad_account_id === id) : undefined
  if (!conta?.dias)
    return (
      <Notice tone="warn" title="Gráfico diário indisponível agora">
        {!r.ok ? r.message : (conta?.erro ?? 'Sem dados para o período.')}
      </Notice>
    )
  const rows = conta.dias.map((d) => ({ data: d.data, gasto: d.gasto, conversas: d.conversas_iniciadas, custo: d.custo_por_conversa }))
  return (
    <div className="space-y-1">
      <AdsDailyChart rows={rows} currency={currency ?? 'BRL'} />
      {conta.fetched_at && <p className="text-xs text-muted">Dados da Meta atualizados {ago(conta.fetched_at)}.</p>}
    </div>
  )
}

// ---------- tabelas ----------

const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-muted'
const THR = `${TH} text-right`
const TD = 'px-3 py-2.5 align-top'
const TDN = `${TD} num whitespace-nowrap text-right`

function Share({ v, max }: { v: number; max: number }) {
  return (
    <div aria-hidden className="mt-1 ml-auto h-1 w-16 rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-accent" style={{ width: `${max > 0 ? (v / max) * 100 : 0}%` }} />
    </div>
  )
}

function budgetText(c: AdCampaign, currency: string | null) {
  if (c.orcamento_diario) return `${fmtMoney(c.orcamento_diario, currency)}/dia`
  if (c.orcamento_total) return `${fmtMoney(c.orcamento_total, currency)} total`
  const sets = c.conjuntos.filter((s) => SPENDING.has(s.status_efetivo)).reduce((s, x) => s + (x.orcamento_diario ?? 0), 0)
  return sets ? `${fmtMoney(sets, currency)}/dia (conjuntos)` : '—'
}

async function Campaigns({ alias, conta, win }: { alias: string; conta: Conta; win: Win }) {
  const [cur, prev] = await Promise.all([
    getAdInsights(alias, 'campanha', win.cur.since, win.cur.until),
    getAdInsights(alias, 'campanha', win.prev.since, win.prev.until),
  ])
  const lines = new Map((linesOf(cur, conta.ad_account_id) ?? []).map((l) => [l.campanha_id, l]))
  const prevLines = new Map((linesOf(prev, conta.ad_account_id) ?? []).map((l) => [l.campanha_id, l]))
  const all = conta.campanhas ?? []
  const shown = all
    .filter((c) => SPENDING.has(c.status_efetivo) || (lines.get(c.id)?.gasto ?? 0) > 0)
    .sort((a, b) => (lines.get(b.id)?.gasto ?? 0) - (lines.get(a.id)?.gasto ?? 0))
  const hidden = all.filter((c) => !shown.includes(c))
  const max = Math.max(0, ...shown.map((c) => lines.get(c.id)?.gasto ?? 0))
  const m = conta.moeda

  return (
    <section aria-labelledby="camp" className="space-y-3">
      <h2 id="camp" className="font-display text-2xl font-bold tracking-tight">
        Campanhas
      </h2>
      {!cur.ok && (
        <Notice tone="warn" title="Resultados por campanha indisponíveis agora">
          {cur.message}
        </Notice>
      )}
      {shown.length === 0 ? (
        <Notice title="Nenhuma campanha ativa ou com gasto no período" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Campanhas ativas ou com gasto no período, ordenadas por gasto</caption>
            <thead className="border-b border-line">
              <tr>
                <th className={TH}>Campanha</th>
                <th className={TH}>Status</th>
                <th className={THR}>Orçamento</th>
                <th className={THR}>Gasto</th>
                <th className={THR}>Conversas</th>
                <th className={THR}>Custo/conversa</th>
                <th className={THR}>CTR</th>
                <th className={THR}>CPM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => {
                const l: AdRow | undefined = lines.get(c.id)
                const p = prevLines.get(c.id)
                return (
                  <tr key={c.id}>
                    <td className={`${TD} max-w-[18rem]`}>
                      <p className="font-medium">{c.nome}</p>
                      <p className="text-xs text-muted">
                        {adObjective(c.objetivo)} · {c.conjuntos.length} {c.conjuntos.length === 1 ? 'conjunto' : 'conjuntos'}
                      </p>
                    </td>
                    <td className={TD}>
                      <AdStatusPill status={c.status_efetivo} />
                    </td>
                    <td className={`${TDN} text-muted`}>{budgetText(c, m)}</td>
                    <td className={TDN}>
                      {l ? fmtMoney(l.gasto, m) : '—'}
                      {l && <Share v={l.gasto} max={max} />}
                    </td>
                    <td className={TDN}>{l ? fmtNum(l.conversas_iniciadas) : '—'}</td>
                    <td className={TDN}>
                      {l?.custo_por_conversa != null ? fmtMoney(l.custo_por_conversa, m) : '—'}
                      <div>
                        <Delta cur={l?.custo_por_conversa ?? null} prev={p?.custo_por_conversa ?? null} invert />
                      </div>
                    </td>
                    <td className={TDN}>{l?.ctr_pct != null ? `${l.ctr_pct.toLocaleString('pt-BR')}%` : '—'}</td>
                    <td className={TDN}>{l?.cpm != null ? fmtMoney(l.cpm, m) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {hidden.length > 0 && (
        <details className="rounded-xl border border-dashed border-line p-4 text-sm">
          <summary className="cursor-pointer text-muted">
            {hidden.length} {hidden.length === 1 ? 'campanha pausada' : 'campanhas pausadas'} sem gasto no período
          </summary>
          <ul className="mt-3 space-y-1.5">
            {hidden.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{c.nome}</span>
                <AdStatusPill status={c.status_efetivo} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

async function Ads({ alias, conta, win }: { alias: string; conta: Conta; win: Win }) {
  const cur = await getAdInsights(alias, 'anuncio', win.cur.since, win.cur.until)
  const rows = (linesOf(cur, conta.ad_account_id) ?? []).filter((r) => r.gasto > 0 || r.impressoes > 0)
  const status = new Map<string, string>()
  for (const c of conta.campanhas ?? []) for (const s of c.conjuntos) for (const a of s.anuncios) status.set(a.id, a.status_efetivo)
  const max = Math.max(0, ...rows.map((r) => r.gasto))
  const m = conta.moeda

  return (
    <section aria-labelledby="ads" className="space-y-3">
      <h2 id="ads" className="font-display text-2xl font-bold tracking-tight">
        Anúncios com entrega no período
      </h2>
      {!cur.ok ? (
        <Notice tone="warn" title="Resultados por anúncio indisponíveis agora">
          {cur.message}
        </Notice>
      ) : rows.length === 0 ? (
        <Notice title="Nenhum anúncio entregou no período" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Anúncios com entrega no período, ordenados por gasto</caption>
            <thead className="border-b border-line">
              <tr>
                <th className={TH}>Anúncio</th>
                <th className={TH}>Status</th>
                <th className={THR}>Gasto</th>
                <th className={THR}>Conversas</th>
                <th className={THR}>Custo/conversa</th>
                <th className={THR}>CTR</th>
                <th className={THR}>Freq.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.anuncio_id}>
                  <td className={`${TD} max-w-[20rem]`}>
                    <p className="font-medium">{r.anuncio}</p>
                    <p className="text-xs text-muted">
                      {r.campanha} › {r.conjunto}
                    </p>
                  </td>
                  <td className={TD}>{r.anuncio_id && status.get(r.anuncio_id) ? <AdStatusPill status={status.get(r.anuncio_id)!} /> : '—'}</td>
                  <td className={TDN}>
                    {fmtMoney(r.gasto, m)}
                    <Share v={r.gasto} max={max} />
                  </td>
                  <td className={TDN}>{fmtNum(r.conversas_iniciadas)}</td>
                  <td className={TDN}>{r.custo_por_conversa != null ? fmtMoney(r.custo_por_conversa, m) : '—'}</td>
                  <td className={TDN}>{r.ctr_pct != null ? `${r.ctr_pct.toLocaleString('pt-BR')}%` : '—'}</td>
                  <td className={TDN}>{r.frequencia != null ? r.frequencia.toLocaleString('pt-BR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ---------- esqueletos ----------

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores">
      {Array.from({ length: 8 }, (_, i) => (
        <Sk key={i} className="h-28 w-full" />
      ))}
    </div>
  )
}

function TableSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={`Carregando ${title.toLowerCase()}`}>
      <Sk className="h-7 w-40" />
      <Sk className="h-48 w-full" />
    </div>
  )
}
