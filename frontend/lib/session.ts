import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifyToken } from './password'

/** Defesa em profundidade: além do proxy, toda página e ação confere a sessão. */
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!verifyToken(token)) redirect('/login')
}
