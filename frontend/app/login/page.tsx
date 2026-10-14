import type { Metadata } from 'next'
import { LoginForm } from './form'

export const metadata: Metadata = { title: 'Entrar' }

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-sm content-center px-4 py-10">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">GERENCIADORADS</p>
      <h1 className="font-display mt-1 text-4xl font-bold tracking-tight">Métricas</h1>
      <p className="mt-2 text-muted">Painel das contas de Instagram. Entre com a senha de acesso.</p>
      <LoginForm />
    </main>
  )
}
