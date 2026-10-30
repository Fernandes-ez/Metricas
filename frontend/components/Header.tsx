import Link from 'next/link'
import { logout } from '@/lib/actions'
import { Nav } from './Nav'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          {/* no celular o nome sai para caber a navegação; "Instagram" leva para o início */}
          <Link href="/" className="hidden items-baseline gap-2 sm:flex">
            <span className="font-display text-lg font-bold tracking-tight">Métricas</span>
            <span className="hidden text-xs uppercase tracking-[0.14em] text-muted lg:inline">GERENCIADORADS</span>
          </Link>
          <Nav />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logout}>
            <button className="h-10 rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Sair</button>
          </form>
        </div>
      </div>
    </header>
  )
}
