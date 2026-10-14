import { Sk } from '@/components/ui'

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando visão geral">
      <div>
        <Sk className="h-9 w-56" />
        <Sk className="mt-3 h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <Sk className="h-6 w-40" />
            <Sk className="mt-2 h-4 w-28" />
            <Sk className="mt-6 h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
