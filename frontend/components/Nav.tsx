'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: 'Instagram', match: (p: string) => p === '/' || p.startsWith('/contas') },
  { href: '/anuncios', label: 'Anúncios', match: (p: string) => p.startsWith('/anuncios') },
]

export function Nav() {
  const path = usePathname() ?? '/'
  return (
    <nav aria-label="Seções" className="flex items-center gap-1">
      {ITEMS.map((i) => {
        const on = i.match(path)
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? 'page' : undefined}
            className={`h-9 rounded-md px-3 text-sm leading-9 ${on ? 'bg-surface-2 font-semibold text-ink' : 'text-muted hover:text-ink'}`}
          >
            {i.label}
          </Link>
        )
      })}
    </nav>
  )
}
