'use client'

export function ThemeToggle() {
  function toggle() {
    const el = document.documentElement
    const dark = el.dataset.theme ? el.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    const next = dark ? 'light' : 'dark'
    el.dataset.theme = next
    try {
      localStorage.setItem('tema', next)
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar tema"
      className="grid size-10 place-items-center rounded-lg border border-line text-ink hover:bg-surface-2"
    >
      {/* meio-disco: lê-se como "contraste" nos dois temas, sem precisar de estado */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
      </svg>
    </button>
  )
}
