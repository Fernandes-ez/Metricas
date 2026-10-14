// Único ponto de acesso ao backend. Só roda no servidor do Next (BACKEND_URL nunca vai ao navegador).
import { cacheLife } from 'next/cache'
import type { Account, AccountInsights, AccountStatus, Media, MediaInsights, Res } from './types'

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3001'
const TIMEOUT_MS = 12_000

class Transient extends Error {}

type Fetched = { status: number; body: unknown }

// Cache de 5 a 10 min (poupa o limite da API do Instagram). Falhas transitórias lançam
// e, por isso, não são guardadas; 404/409 são respostas válidas e entram no cache.
async function cachedGet(path: string): Promise<Fetched> {
  'use cache'
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 })
  let r: Response
  try {
    r = await fetch(BACKEND + path, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new Transient('O backend não respondeu a tempo.')
  }
  const body: unknown = await r.json().catch(() => null)
  if (r.status === 404 || r.status === 409) return { status: r.status, body }
  if (!r.ok) {
    const msg = (body as { error?: string } | null)?.error
    throw new Transient(msg ?? `O backend respondeu ${r.status}.`)
  }
  return { status: r.status, body }
}

async function get<T>(path: string): Promise<Res<T>> {
  try {
    const { status, body } = await cachedGet(path)
    if (status === 409) return { ok: false, kind: 'reauth', message: 'Conta precisa ser reconectada.' }
    if (status === 404) return { ok: false, kind: 'notfound', message: 'Conta não encontrada.' }
    return { ok: true, data: body as T }
  } catch (e) {
    return { ok: false, kind: 'error', message: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

const enc = encodeURIComponent

export const ALIAS_RE = /^[A-Za-z0-9_-]{1,32}$/

export const getStatus = () => get<AccountStatus[]>('/api/accounts/status')
export const getAccounts = () => get<Account[]>('/api/accounts')

/** `since`/`until` em ISO, já arredondados à hora (chave de cache estável). */
export const getInsights = (alias: string, since: string, until: string) =>
  get<AccountInsights>(`/api/accounts/${enc(alias)}/insights?since=${enc(since)}&until=${enc(until)}`)

export const getMedia = (alias: string, limit = 24) =>
  get<Media[]>(`/api/accounts/${enc(alias)}/media?limit=${limit}`)

export const getMediaInsights = (account: string, id: string) =>
  get<MediaInsights>(`/api/media/${enc(id)}/insights?account=${enc(account)}`)
