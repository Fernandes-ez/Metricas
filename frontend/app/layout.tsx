import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--f-display', display: 'swap' })
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--f-body', display: 'swap' })
const data = JetBrains_Mono({ subsets: ['latin'], variable: '--f-data', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Métricas', template: '%s · Métricas' },
  description: 'Painel de métricas das contas de Instagram.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eceeea' },
    { media: '(prefers-color-scheme: dark)', color: '#0b120f' },
  ],
}

// aplica o tema salvo antes da primeira pintura (evita piscar)
const themeInit = `try{var t=localStorage.getItem('tema');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${display.variable} ${body.variable} ${data.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
