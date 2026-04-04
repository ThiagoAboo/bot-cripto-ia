export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t px-4 py-4 sm:px-6 lg:px-8" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex flex-col gap-2 text-sm md:flex-row md:items-center md:justify-between">
        <div style={{ color: 'var(--text-muted)' }}>
          © {currentYear} Bot Crypto IA - Trading Automatizado com Inteligência Artificial
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a href="#" className="transition-colors hover:text-primary-500" style={{ color: 'var(--text-secondary)' }}>
            Termos de Uso
          </a>
          <a href="#" className="transition-colors hover:text-primary-500" style={{ color: 'var(--text-secondary)' }}>
            Privacidade
          </a>
          <a href="#" className="transition-colors hover:text-primary-500" style={{ color: 'var(--text-secondary)' }}>
            Suporte
          </a>
        </div>
      </div>
    </footer>
  )
}
