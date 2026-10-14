import { Sk } from '@/components/ui'

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando conta">
      <div>
        <Sk className="h-4 w-28" />
        <Sk className="mt-4 h-10 w-64 max-w-full" />
        <Sk className="mt-3 h-4 w-48" />
      </div>
      <Sk className="h-11 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Sk key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}
