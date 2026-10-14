'use client'

import { useEffect, useRef, useState } from 'react'
import { loadPostInsights } from '@/lib/actions'
import { fmtDate, fmtDateTime, fmtFull, fmtNum } from '@/lib/format'
import { LABEL, UNAVAILABLE, WHY_DEFAULT, mediaKind } from '@/lib/metrics'
import type { Media, MediaInsights, Res } from '@/lib/types'

const PANEL_METRICS = ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions'] as const

function Thumb({ m, className = '' }: { m: Media; className?: string }) {
  const [broken, setBroken] = useState(false)
  const src = m.thumbnail_url ?? m.media_url
  if (!src || broken)
    return (
      <div className={`grid place-items-center bg-surface-2 text-xs text-muted ${className}`}>Sem miniatura</div>
    )
  // <img> simples de propósito: as URLs do Instagram expiram, então next/image não serve aqui
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`bg-surface-2 object-cover ${className}`}
    />
  )
}

export function PostGrid({ posts, conta }: { posts: Media[]; conta: string }) {
  const [open, setOpen] = useState<Media | null>(null)
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {posts.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setOpen(m)}
              aria-label={`Abrir métricas do post de ${fmtDate(m.timestamp)}`}
              className="group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left shadow-[var(--shadow)] transition-colors hover:border-prev"
            >
              <div className="relative">
                <Thumb m={m} className="aspect-square w-full" />
                <span className="absolute left-2 top-2 rounded-md bg-bg/90 px-2 py-0.5 text-xs font-medium">{mediaKind(m)}</span>
              </div>
              <div className="p-3">
                <p className="num text-xs text-muted">{fmtDate(m.timestamp)}</p>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm">{m.caption?.trim() || <span className="text-muted">Sem legenda</span>}</p>
                <p className="num mt-2 text-xs text-muted">
                  <span title="Curtidas">♥ {m.like_count == null ? '—' : fmtNum(m.like_count)}</span>
                  {'  '}
                  <span title="Comentários">💬 {m.comments_count == null ? '—' : fmtNum(m.comments_count)}</span>
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {open && <PostPanel key={open.id} post={open} conta={conta} onClose={() => setOpen(null)} />}
    </>
  )
}

function PostPanel({ post, conta, onClose }: { post: Media; conta: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [res, setRes] = useState<{ id: string; r: Res<MediaInsights> } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])

  // insights só quando o painel abre (um post por vez)
  useEffect(() => {
    let alive = true
    loadPostInsights(conta, post.id)
      .then((r) => alive && setRes({ id: post.id, r }))
      .catch(() => alive && setRes({ id: post.id, r: { ok: false, kind: 'error', message: 'Falha ao consultar o servidor.' } }))
    return () => {
      alive = false
    }
  }, [conta, post.id])

  const r = res?.id === post.id ? res.r : null
  const data = r?.ok ? r.data : null
  const missing = data ? PANEL_METRICS.filter((k) => data[k] === null) : []

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="post-titulo"
      className="sheet"
    >
      <div className="flex max-h-[92dvh] flex-col md:max-h-dvh">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id="post-titulo" className="font-display text-lg font-bold tracking-tight">
              {mediaKind(post)}
            </h2>
            <p className="num truncate text-xs text-muted">{fmtDateTime(post.timestamp)}</p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fechar"
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-line hover:bg-surface-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4">
          <Thumb m={post} className="mx-auto max-h-64 w-full rounded-lg object-contain" />
          {post.caption && <p className="max-h-28 overflow-y-auto whitespace-pre-line text-sm">{post.caption}</p>}

          {!r && (
            <div aria-busy="true" aria-label="Carregando métricas do post" className="grid grid-cols-2 gap-3">
              {PANEL_METRICS.map((k) => (
                <div key={k} className="rounded-xl border border-line p-3">
                  <div className="skeleton h-3 w-16" />
                  <div className="skeleton mt-3 h-6 w-14" />
                </div>
              ))}
            </div>
          )}

          {r && !r.ok && (
            <div role="alert" className={`rounded-xl p-4 text-sm ${r.kind === 'reauth' ? 'bg-bad-bg text-bad-ink' : 'bg-warn-bg text-warn-ink'}`}>
              <p className="font-medium">
                {r.kind === 'reauth' ? 'Esta conta precisa ser reconectada' : 'Não foi possível carregar as métricas deste post'}
              </p>
              <p className="mt-1">{r.kind === 'reauth' ? 'O acesso ao Instagram expirou. Reconecte a conta e tente de novo.' : r.message}</p>
            </div>
          )}

          {data && (
            <>
              <dl className="grid grid-cols-2 gap-3">
                {PANEL_METRICS.map((k) => {
                  const v = data[k]
                  return (
                    <div key={k} className="rounded-xl border border-line p-3">
                      <dt className="text-xs uppercase tracking-[0.08em] text-muted">{LABEL[k]}</dt>
                      <dd className="mt-1">
                        {v === null ? (
                          <>
                            <span className="num text-2xl text-muted" title={UNAVAILABLE}>
                              —
                            </span>
                            <span className="block text-xs text-muted">Indisponível</span>
                          </>
                        ) : (
                          <span className="num text-2xl font-medium" title={fmtFull(v)}>
                            {fmtNum(v)}
                          </span>
                        )}
                      </dd>
                    </div>
                  )
                })}
              </dl>
              {missing.length > 0 && <p className="text-xs text-muted">{WHY_DEFAULT} Isso é normal em alguns tipos de post.</p>}
            </>
          )}

          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
          >
            Abrir no Instagram ↗
          </a>
        </div>
      </div>
    </dialog>
  )
}
