import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto'

// AUTH_PASSWORD_HASH = scrypt.<salt>.<hash> (gerado por mcp/src/hash-password.js AUTH_PASSWORD_HASH)
export function checkPassword(pw: string): boolean {
  const [alg, salt, hash] = (process.env.AUTH_PASSWORD_HASH ?? '').split('.')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const a = scryptSync(pw, Buffer.from(salt, 'base64url'), 32)
  const b = Buffer.from(hash, 'base64url')
  return a.length === b.length && timingSafeEqual(a, b)
}

export const SESSION_COOKIE = 'sessao'
export const SESSION_DAYS = 14

const sign = (payload: string) =>
  createHmac('sha256', process.env.AUTH_SECRET ?? '').update(payload).digest('base64url')

/** Token = <expira em s>.<hmac>. Sem AUTH_SECRET configurado, nunca é válido. */
export function makeToken(): string {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400)
  return `${exp}.${sign(exp)}`
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !process.env.AUTH_SECRET) return false
  const [exp, mac] = token.split('.')
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false
  const a = Buffer.from(mac)
  const b = Buffer.from(sign(exp))
  return a.length === b.length && timingSafeEqual(a, b)
}
