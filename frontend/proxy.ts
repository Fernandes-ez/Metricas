import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifyToken } from '@/lib/password'

// Tudo exige sessão, exceto /login e os arquivos estáticos do Next.
export function proxy(req: NextRequest) {
  if (verifyToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
