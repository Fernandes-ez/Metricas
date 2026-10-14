'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getMediaInsights, ALIAS_RE } from './api'
import { SESSION_COOKIE, SESSION_DAYS, checkPassword, makeToken } from './password'
import { requireSession } from './session'
import type { MediaInsights, Res } from './types'

// ponytail: contador em memória, zera ao reiniciar; suficiente para um usuário só
const fails = new Map<string, { n: number; exp: number }>()

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  if (!process.env.AUTH_SECRET || !process.env.AUTH_PASSWORD_HASH)
    return { error: 'O servidor está sem senha configurada (AUTH_SECRET / AUTH_PASSWORD_HASH).' }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const f = fails.get(ip)
  if (f && f.exp > Date.now() && f.n >= 5) return { error: 'Muitas tentativas. Aguarde 15 minutos.' }

  const pw = form.get('senha')
  if (typeof pw !== 'string' || !checkPassword(pw)) {
    fails.set(ip, f && f.exp > Date.now() ? { n: f.n + 1, exp: f.exp } : { n: 1, exp: Date.now() + 15 * 60_000 })
    return { error: 'Senha incorreta.' }
  }
  fails.delete(ip)
  ;(await cookies()).set(SESSION_COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: h.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
  redirect('/')
}

export async function logout() {
  ;(await cookies()).delete(SESSION_COOKIE)
  redirect('/login')
}

/** Insights de um post, chamados sob demanda quando o painel do post abre. */
export async function loadPostInsights(account: string, id: string): Promise<Res<MediaInsights>> {
  await requireSession()
  if (!ALIAS_RE.test(account) || !/^\d{1,30}$/.test(id))
    return { ok: false, kind: 'error', message: 'Pedido inválido.' }
  return getMediaInsights(account, id)
}
