'use client'

import { useActionState } from 'react'
import { login } from '@/lib/actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label htmlFor="senha" className="text-sm font-medium">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={!!state?.error}
          aria-describedby={state?.error ? 'erro' : undefined}
          className="mt-1.5 h-12 w-full rounded-lg border border-line bg-surface px-3 text-base"
        />
      </div>
      {state?.error && (
        <p id="erro" role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-ink">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="h-12 w-full rounded-lg bg-accent font-medium text-on-accent hover:brightness-95 disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
