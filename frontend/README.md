================================================================================
DOCUMENTAÇÃO COMPLETA DO PROJETO – BOT DE CRIPTOMOEDAS COM IA (FRONTEND)
VERSÃO FINAL
================================================================================

ÍNDICE
===============================================================================
1. VISÃO GERAL
2. ARQUITETURA E PRINCÍPIOS SOLID
3. STACK TÉCNICA
4. ESTRUTURA DE PASTAS
5. MODELOS DE DADOS PRINCIPAIS
6. ESPECIFICAÇÃO DAS TELAS
   6.1 Dashboard
   6.2 Configurações
   6.3 Treinamento da IA
   6.4 Transações
   6.5 Log / Trace Geral
   6.6 Login
   6.7 Perfil
7. API ENDPOINTS
8. DIFERENCIAIS DA ARQUITETURA
9. CONSIDERAÇÕES GERAIS
10. PRÓXIMOS PASSOS


1. VISÃO GERAL
===============================================================================

O projeto consiste em uma interface web para um sistema de trading automatizado
utilizando inteligência artificial. O frontend foi desenvolvido com React +
TypeScript, utilizando dados mockados inicialmente, mas preparado para consumir
APIs reais no futuro.

CONCEITO FUNDAMENTAL DOS BOTS:

- Cada bot é especializado em um tipo de análise/estratégia
  (Scalper, Momentum, Trend Follower, Arbitrage, Mean Reversion)
- O bot analisa dinamicamente qualquer moeda disponível no mercado
- O bot decide automaticamente qual moeda negociar com base em seus indicadores
- Não existe bot fixo por moeda; todos os bots podem operar qualquer moeda

TELAS DO SISTEMA:

1. Login – Autenticação de usuário
2. Dashboard – Visão geral do portfólio e status das estratégias
3. Configurações – Parâmetros dos bots e integrações com exchanges
4. Treinamento da IA – Configuração e monitoramento dos modelos por estratégia
5. Transações – Histórico e execução manual de ordens
6. Log / Trace Geral – Auditoria completa com rastreamento de execução
7. Perfil – Gerenciamento de informações do usuário


2. ARQUITETURA E PRINCÍPIOS SOLID
===============================================================================

A arquitetura do frontend é baseada nos princípios SOLID:

S – Single Responsibility Principle
- Components: Renderizam UI e delegam ações
- Hooks: Gerenciam lógica de negócio
- Services: Realizam requisições HTTP/WebSocket
- Stores: Gerenciam estado de UI
- Utils: Funções puras (formatação, validação)

O – Open/Closed Principle
- Componentes abertos para extensão via props
- Fechados para modificação direta
- Composição sobre herança

L – Liskov Substitution Principle
- Interfaces bem definidas com TypeScript
- Tipagem forte para substituição segura

I – Interface Segregation Principle
- Interfaces pequenas e específicas
- Componentes não dependem de métodos que não usam

D – Dependency Inversion Principle
- Módulos dependem de abstrações
- Injeção de dependência via React Context e hooks


3. STACK TÉCNICA
===============================================================================

| Camada                       | Tecnologia                               |
|------------------------------|------------------------------------------|
| Framework                    | React 18 + TypeScript                    |
| Build tool                   | Vite                                     |
| Estilização                  | TailwindCSS + CSS Variables              |
| Roteamento                   | React Router v6                          |
| Gerenciamento de estado (UI) | Zustand                                  |
| Requisições HTTP             | Axios + React Query                      |
| Gráficos                     | Recharts + lightweight-charts            |
| Formulários                  | React Hook Form + Zod                    |
| Comunicação real-time        | Socket.io-client                         |
| Mock de API                  | JSON Server                              |
| Testes                       | Vitest + React Testing Library           |
| Ícones                       | Lucide React                             |


4. ESTRUTURA DE PASTAS
===============================================================================

src/
├── features/                    # Organização por features (Domain-driven)
│   ├── auth/                    # Autenticação
│   │   └── LoginPage.tsx
│   ├── dashboard/               # Dashboard
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── DashboardPage.tsx
│   ├── configurations/          # Configurações
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── ConfiguracoesPage.tsx
│   ├── training/                # Treinamento da IA
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── TreinamentoPage.tsx
│   ├── transactions/            # Transações
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── TransacoesPage.tsx
│   ├── logs/                    # Log / Trace
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── LogsPage.tsx
│   └── profile/                 # Perfil do usuário
│       └── ProfilePage.tsx
├── shared/                      # Código compartilhado
│   ├── components/              # UI components
│   │   ├── ui/                  # Button, Card, Input, Table, Modal, etc.
│   │   ├── layout/              # Header, Sidebar, Footer
│   │   └── charts/              # AreaChart, CandlestickChart
│   ├── hooks/                   # Hooks genéricos
│   ├── services/                # API e WebSocket clients
│   ├── utils/                   # Funções puras
│   └── types/                   # Tipos globais
└── app/                         # Configuração da aplicação
    ├── providers/               # ThemeProvider, QueryProvider, WebSocketProvider
    ├── store/                   # Zustand stores
    └── routes.tsx               # Rotas da aplicação


5. MODELOS DE DADOS PRINCIPAIS
===============================================================================

5.1 Bot Status (Estratégia)

interface BotStatus {
  id: string
  name: string                    // Nome do bot (ex: "Scalper V2")
  strategy: string                // Tipo de estratégia
  description?: string            // Descrição da estratégia
  currentPair?: string            // Moeda sendo analisada (dinâmico)
  status: 'online' | 'offline' | 'training' | 'error'
  isPaused: boolean
  lastAnalysis?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number             // 0-100%
}

5.2 Transação

interface Transaction {
  id: string
  date: string
  pair: string
  origin: 'manual' | 'bot'
  botId?: string
  botName?: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total: number
  fee: number
  status: 'executed' | 'pending' | 'cancelled'
  profitBrl?: number
  profitPercent?: number
}

5.3 Configurações do Bot

interface BotParameters {
  riskManagement: {
    stopLossPercent: number
    takeProfitPercent: number
    leverage: number
    maxTradeAmount: number
    maxTradeAmountUnit: 'USDT' | 'percent'
  }
  allowedPairs: string[]
  fees: {
    discountUsdtPercent: number
    discountBnbPercent: number
    minBnbBalance: number
  }
  advanced: {
    mode: 'spot'
    orderType: 'market' | 'limit'
    slippagePercent: number
  }
  strategies: StrategyConfig[]
}

5.4 Log e Trace

interface LogEntry {
  id: string
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  module: string
  message: string
  details?: Record<string, any>
}

interface TraceEntry {
  id: string
  timestamp: string
  level: 'DEBUG' | 'TRACE'
  module: string
  traceId: string
  parentTraceId?: string
  functionName: string
  message: string
  durationMs: number
  botId?: string
  botName?: string
  currentPair?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
  errorFlag?: boolean
}


6. ESPECIFICAÇÃO DAS TELAS
===============================================================================

6.1 LOGIN
-------------------------------------------------------------------------------

OBJETIVO: Autenticar usuários no sistema.

CREDENCIAIS DE TESTE:
- Email: admin@botcrypto.com
- Senha: admin123

COMPONENTES:
- Formulário com campos de email e senha
- Botão de mostrar/ocultar senha
- Loading durante autenticação

COMPORTAMENTO:
- Ao logar, armazena token no localStorage
- Redireciona para o Dashboard
- Rotas protegidas redirecionam para login se não autenticado


6.2 DASHBOARD
-------------------------------------------------------------------------------

OBJETIVO: Visão geral do portfólio e status das estratégias.

COMPONENTES:
1. Card de Saldo Total
   - Saldo total em R$
   - Cotação USDT/BRL
   - Lucro/Prejuízo do dia
   - % de acerto
   - PnL Total

2. Cards de Saldo por Moeda
   - Saldo por moeda (BTC, ETH, SOL, etc.)
   - Lucro/Prejuízo do dia
   - % de acerto específico
   - PnL Total

3. Gráfico de Performance
   - Períodos: 24h, 7d, 30d, Total
   - Gráfico de área interativo

4. Últimas Transações
   - Tabela com as 5 operações mais recentes
   - Colunas: Data/Hora, Par, Tipo, Valor Compra, Valor Venda, Taxa, Ganho

5. Status das Estratégias
   - Lista de bots com status, recomendação e confiança
   - Botões de Pausar/Retomar


6.3 CONFIGURAÇÕES
-------------------------------------------------------------------------------

OBJETIVO: Configurar bots, APIs e parâmetros.

SEÇÕES:
1. Chaves de API
   - Exchange (Binance)
   - API Key e Secret Key
   - Teste de conexão

2. Gerenciamento de Risco
   - Stop-loss (%)
   - Take-profit (%)
   - Alavancagem fixa em 1x
   - Quantidade máxima por trade

3. Moedas Permitidas
   - Multi-select com busca
   - Lista de moedas disponíveis da Binance

4. Taxas e Descontos
   - Desconto USDT (%)
   - Desconto BNB (%)
   - Saldo mínimo BNB

5. Opções Avançadas
   - Modo (Spot)
   - Tipo de ordem (Market/Limit)
   - Slippage tolerado (%)

OBSERVAÇÃO OPERACIONAL:
- O frontend e o backend atuais operam somente em `spot`
- A integração operacional atual está homologada apenas para `binance`
- `leverage` deve permanecer em `1` até existir execução real fora de spot
- `futures` não deve ser exposto como opção ativa até existir execução real,
  reconciliação e regras de risco dedicadas para esse mercado

6. Configuração por Estratégia
   - Parâmetros específicos para cada tipo de estratégia


6.4 TREINAMENTO DA IA
-------------------------------------------------------------------------------

OBJETIVO: Treinar modelos de IA por estratégia.

COMPONENTES:
1. Seleção do Modelo
   - Bot alvo
   - Estratégia
   - Arquitetura (LSTM, CNN, Random Forest, etc.)
   - Versão do modelo

2. Configuração do Dataset
   - Origem dos dados (Exchange/Sintético/Upload)
   - Período de treinamento
   - Pares incluídos
   - Indicadores técnicos
   - Resolução temporal

3. Parâmetros de Treinamento
   - Arquitetura da rede (camadas, neurônios, dropout)
   - Hiperparâmetros (batch size, épocas, learning rate)
   - Validação e Early Stopping

4. Controles de Execução
   - Iniciar, Pausar, Retomar, Cancelar
   - Testar com dados atuais
   - Salvar e Exportar modelo

5. Métricas e Visualizações
   - Gráfico de Loss por época
   - Gráfico de Acurácia (quando aplicável)

6. Log de Treinamento
   - Terminal com mensagens em tempo real


6.5 TRANSAÇÕES
-------------------------------------------------------------------------------

OBJETIVO: Histórico e execução de ordens.

COMPONENTES:
1. Seletor de Moeda de Exibição
   - Opções: BRL, USDT, EUR, BTC, ETH
   - Conversão automática via API

2. Gráfico do Par
   - Candlestick com lightweight-charts
   - Períodos: 15m, 30m, 1h, 4h, 1d, 1w
   - Auto-refresh a cada 5 segundos

3. Saldo Disponível
   - Saldo por moeda
   - Valores disponíveis, reservados e total em carteira

4. Formulário de Ordem Manual
   - Par, Tipo (Compra/Venda)
   - Quantidade
   - Tipo de ordem (Market/Limit)
   - Preço (para Limit)

5. Filtros
   - Par, Tipo, Origem, Status
   - Data inicial/final
   - Busca textual

6. Tabela de Histórico
   - Todas as transações (manuais e automáticas)
   - Paginação
   - Exportação para CSV
   - Ações para reconciliar ordens externas em aberto
   - Ações para cancelar ordens pendentes/parcialmente executadas
   - Exibição de status bruto da exchange, ordem externa e última sincronização


6.6 LOG / TRACE GERAL
-------------------------------------------------------------------------------

OBJETIVO: Auditoria completa do sistema.

MODOS:
1. Logs
   - Eventos relevantes (INFO, WARN, ERROR)
   - Filtros por nível, módulo, data
   - Exportação CSV

2. Traces
   - Rastreamento detalhado ("passei por aqui")
   - Níveis: DEBUG, TRACE
   - Agrupamento por Trace ID
   - Visualização hierárquica
   - Filtros por bot, função, duração, erros

REGRAS DE TRACE:
- Cada passo da análise do bot gera um registro
- Trace ID único para correlação
- Registro de entrada/saída de funções
- Chamadas externas (API, banco)
- Decisões do bot com confiança


6.7 PERFIL
-------------------------------------------------------------------------------

OBJETIVO: Gerenciar informações do usuário.

SEÇÕES:
1. Informações Pessoais
   - Nome, Sobrenome, Email

2. Segurança
   - Alteração de senha

3. Preferências
   - Notificações push
   - Tema (claro/escuro)


7. API ENDPOINTS
===============================================================================

AUTH:
-------------------------------------------------------------------------------
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

DASHBOARD:
-------------------------------------------------------------------------------
GET    /api/dashboard/total-balance
GET    /api/dashboard/currencies-balance
GET    /api/dashboard/transactions/recent
GET    /api/dashboard/bots-status
GET    /api/dashboard/performance
PUT    /api/dashboard/bots/{id}/pause
PUT    /api/dashboard/bots/{id}/resume

CONFIGURAÇÕES:
-------------------------------------------------------------------------------
GET    /api/configurations
PUT    /api/configurations
POST   /api/configurations/test-connection
GET    /api/exchange/pairs

TREINAMENTO:
-------------------------------------------------------------------------------
GET    /api/training/strategies
GET    /api/training/sessions
POST   /api/training/sessions
GET    /api/training/sessions/{id}
PUT    /api/training/sessions/{id}/pause
PUT    /api/training/sessions/{id}/resume
DELETE /api/training/sessions/{id}/cancel
POST   /api/training/sessions/{id}/test
POST   /api/training/sessions/{id}/save
GET    /api/training/sessions/{id}/download

TRANSAÇÕES:
-------------------------------------------------------------------------------
GET    /api/orders
POST   /api/orders
DELETE /api/orders/{id}/cancel
GET    /api/balance
GET    /api/exchange/rate
GET    /api/exchange/candles

LOGS:
-------------------------------------------------------------------------------
GET    /api/logs
GET    /api/traces
GET    /api/traces/group/{traceId}
GET    /api/logs/export
GET    /api/traces/export

WEBSOCKET:
-------------------------------------------------------------------------------
WS     /ws/dashboard
WS     /ws/orders
WS     /ws/logs
WS     /ws/traces
WS     /ws/training/{sessionId}


8. DIFERENCIAIS DA ARQUITETURA
===============================================================================

| Característica          | Descrição                                          |
|-------------------------|----------------------------------------------------|
| Bots por Estratégia     | Cada bot é especialista em um tipo de análise     |
| Análise Multi-Moeda     | Bots analisam dinamicamente qualquer moeda        |
| Decisão Autônoma        | Bot decide qual moeda negociar no momento         |
| Recomendação com Confiança | Cada ação tem nível de confiança (0-100%)       |
| Treinamento por Estratégia | Modelos de IA específicos por tipo de análise   |
| Traces com Contexto     | Registro completo das decisões do bot             |
| Moeda Dinâmica          | Bot pode trocar de moeda a qualquer momento       |
| Tema Claro/Escuro       | Suporte completo a ambos os temas                 |
| Responsividade          | Interface adaptável a todos os dispositivos       |


9. CONSIDERAÇÕES GERAIS
===============================================================================

| #  | Requisito                 | Descrição                                    |
|----|---------------------------|----------------------------------------------|
| G1 | Tema escuro/claro         | Suporte a troca de tema via CSS Variables    |
| G2 | Responsividade            | Funciona em desktop, tablet e mobile         |
| G3 | Tratamento de erros       | Mensagens amigáveis via react-hot-toast      |
| G4 | Loading states            | Skeletons durante carregamento               |
| G5 | Cache local               | Dados estáticos cacheados com React Query    |
| G6 | Rotas protegidas          | Login necessário para acessar o sistema      |
| G7 | WebSocket fallback        | Polling quando WebSocket indisponível        |
| G8 | SOLID                     | Arquitetura baseada nos princípios SOLID     |
| G9 | TypeScript                | Tipagem forte em todo o código               |


10. PRÓXIMOS PASSOS
===============================================================================

1. [OK] Configurar projeto com Vite + React + TypeScript
2. [OK] Criar estrutura de pastas
3. [OK] Implementar componentes shared
4. [OK] Implementar Dashboard
5. [OK] Implementar Configurações
6. [OK] Implementar Treinamento da IA
7. [OK] Implementar Transações
8. [OK] Implementar Log / Trace Geral
9. [OK] Implementar Login e Perfil
10. [ ] Integrar com backend real
11. [ ] Implementar testes unitários
12. [ ] Otimizar chunks para produção


================================================================================
CREDENCIAIS DE ACESSO (MODO MOCK)
===============================================================================

Email: admin@botcrypto.com
Senha: admin123


================================================================================
COMANDOS PARA EXECUTAR O PROJETO
===============================================================================

# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build

# Rodar mock da API (em outro terminal)
npm run mock-api


================================================================================
FIM DA DOCUMENTAÇÃO
================================================================================
