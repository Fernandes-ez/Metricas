import Link from 'next/link'
import { logout } from '@/lib/actions'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-lg font-bold tracking-tight">Métricas</span>
          <span className="hidden text-xs uppercase tracking-[0.14em] text-muted sm:inline">GERENCIADORADS</span>
        </Link>
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
