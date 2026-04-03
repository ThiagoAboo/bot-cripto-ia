export function Footer() {
    const currentYear = new Date().getFullYear()
  
    return (
      <footer className="border-t border-dark-300 py-4 px-6 mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-2 text-sm text-gray-500">
          <div>
            © {currentYear} Bot Crypto IA - Trading Automatizado com Inteligência Artificial
          </div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary-400 transition-colors">
              Termos de Uso
            </a>
            <a href="#" className="hover:text-primary-400 transition-colors">
              Privacidade
            </a>
            <a href="#" className="hover:text-primary-400 transition-colors">
              Suporte
            </a>
          </div>
        </div>
      </footer>
    )
  }