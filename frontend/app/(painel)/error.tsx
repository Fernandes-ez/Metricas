'use client'

export default function ErroPainel({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-bad-bg p-5 text-bad-ink">
      <p className="font-medium">Algo deu errado ao montar esta tela.</p>
      <p className="mt-1 text-sm">O painel não conseguiu concluir o carregamento. Tente de novo; se persistir, verifique o backend.</p>
      <button onClick={() => retry()} className="mt-4 h-10 rounded-lg border border-current px-4 text-sm font-medium">
        Tentar de novo
      </button>
    </div>
  )
}
