================================================================================
DOCUMENTAÇÃO COMPLETA DO PROJETO – BOT DE CRIPTOMOEDAS COM IA (FRONTEND)
================================================================================

ÍNDICE
===============================================================================
1. Visão Geral
2. Arquitetura e Princípios SOLID
3. Stack Técnica
4. Estrutura de Pastas
5. Especificação das Telas
   5.1 Dashboard
   5.2 Configurações
   5.3 Treinamento da IA
   5.4 Transações
   5.5 Log / Trace Geral
6. Modelos de Dados Globais
7. API Endpoints
8. Considerações Gerais
9. Próximos Passos


1. VISÃO GERAL
===============================================================================

O projeto consiste em uma interface web para um sistema de trading automatizado
utilizando inteligência artificial. O frontend será desenvolvido com foco em
apenas frontend, utilizando dados mockados inicialmente, mas preparado para
consumir APIs reais no futuro.

TELAS DEFINIDAS:
1. Dashboard – visão geral do robô e portfólio
2. Configurações – parâmetros do bot e integrações
3. Treinamento da IA – configuração e monitoramento dos modelos
4. Transações – histórico e execução manual de ordens
5. Log / Trace Geral – auditoria completa do sistema

PREMISSA FUNDAMENTAL:
Todas as ações do usuário são persistidas automaticamente no back-end.
O frontend atua como interface de visualização e controle, enviando comandos
e recebendo atualizações em tempo real. O estado crítico é mantido
exclusivamente no back-end.


2. ARQUITETURA E PRINCÍPIOS SOLID
===============================================================================

A arquitetura do frontend será baseada nos princípios SOLID, garantindo um
código modular, testável e de fácil manutenção.

2.1 S – Single Responsibility Principle (Responsabilidade Única)

| Camada       | Responsabilidade Única                                      |
|--------------|-------------------------------------------------------------|
| Components   | Renderizar UI e delegar ações para hooks/stores            |
| Hooks        | Gerenciar lógica de negócio e chamadas à API               |
| Services     | Realizar requisições HTTP e WebSocket                      |
| Stores       | Gerenciar estado de UI (loading, filtros, modais)          |
| Utils        | Funções puras: formatação, validação, conversão            |
| Types        | Definir contratos de dados                                 |

2.2 O – Open/Closed Principle (Aberto-Fechado)

- Componentes abertos para extensão (props, children, composition)
- Fechados para modificação
- Utilizar composição ao invés de herança
- Criar componentes base que podem ser estendidos via props

2.3 L – Liskov Substitution Principle (Substituição de Liskov)

- Componentes que herdam devem ser substituíveis sem quebrar a aplicação
- Utilizar interfaces bem definidas e tipagem forte com TypeScript
- Evitar herança profunda; preferir composição

2.4 I – Interface Segregation Principle (Segregação de Interfaces)

- Criar interfaces pequenas e específicas
- Um componente não deve depender de métodos que não utiliza

2.5 D – Dependency Inversion Principle (Inversão de Dependência)

- Módulos de alto nível não dependem de módulos de baixo nível
- Ambos dependem de abstrações (interfaces, hooks)
- Utilizar injeção de dependência via React Context ou hooks customizados

2.6 Arquitetura de Pastas Orientada a Features

src/
├── features/                    # Organização por features (Domain-driven)
│   ├── dashboard/
│   ├── configurations/
│   ├── training/
│   ├── transactions/
│   └── logs/
├── shared/                      # Código compartilhado entre features
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── utils/
│   ├── types/
│   └── constants/
├── app/                         # Configuração da aplicação
│   ├── routes.tsx
│   ├── store/
│   └── providers/
└── main.tsx


3. STACK TÉCNICA
===============================================================================

| Camada                       | Tecnologia                               |
|------------------------------|------------------------------------------|
| Framework                    | React + TypeScript                       |
| Build tool                   | Vite                                     |
| Estilização                  | TailwindCSS                              |
| Roteamento                   | React Router v6                          |
| Gerenciamento de estado (UI) | Zustand                                  |
| Requisições HTTP             | Axios + React Query (TanStack Query)     |
| Gráficos                     | Recharts + lightweight-charts            |
| Formulários                  | React Hook Form + Zod                    |
| Comunicação real-time        | Socket.io-client                         |
| Mock de API                  | JSON Server ou MSW                       |
| Testes                       | Vitest + React Testing Library           |


4. ESTRUTURA DE PASTAS
===============================================================================

src/
├── features/
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── TotalBalanceCard.tsx
│   │   │   ├── CurrencyBalanceCard.tsx
│   │   │   ├── PerformanceChart.tsx
│   │   │   ├── RecentTransactionsTable.tsx
│   │   │   └── BotsStatusList.tsx
│   │   ├── hooks/
│   │   │   ├── useDashboardData.ts
│   │   │   └── usePerformanceData.ts
│   │   ├── services/
│   │   │   └── dashboard.service.ts
│   │   ├── types/
│   │   │   └── dashboard.types.ts
│   │   └── DashboardPage.tsx
│   │
│   ├── configurations/
│   │   ├── components/
│   │   │   ├── ApiKeysCard.tsx
│   │   │   ├── RiskManagementCard.tsx
│   │   │   ├── AllowedPairsCard.tsx
│   │   │   ├── FeesCard.tsx
│   │   │   └── AdvancedOptionsCard.tsx
│   │   ├── hooks/
│   │   │   └── useConfigurations.ts
│   │   ├── services/
│   │   │   └── configurations.service.ts
│   │   ├── types/
│   │   │   └── configurations.types.ts
│   │   └── ConfiguracoesPage.tsx
│   │
│   ├── training/
│   │   ├── components/
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── DatasetConfig.tsx
│   │   │   ├── HyperparametersForm.tsx
│   │   │   ├── TrainingControls.tsx
│   │   │   ├── MetricsChart.tsx
│   │   │   └── TrainingLogTerminal.tsx
│   │   ├── hooks/
│   │   │   ├── useTrainingSession.ts
│   │   │   └── useTrainingMetrics.ts
│   │   ├── services/
│   │   │   └── training.service.ts
│   │   ├── types/
│   │   │   └── training.types.ts
│   │   └── TreinamentoPage.tsx
│   │
│   ├── transactions/
│   │   ├── components/
│   │   │   ├── CurrencySelector.tsx
│   │   │   ├── PairChart.tsx
│   │   │   ├── AvailableBalance.tsx
│   │   │   ├── ManualOrderForm.tsx
│   │   │   ├── TransactionFilters.tsx
│   │   │   └── TransactionsTable.tsx
│   │   ├── hooks/
│   │   │   ├── useExchangeRate.ts
│   │   │   ├── usePairChart.ts
│   │   │   └── useTransactions.ts
│   │   ├── services/
│   │   │   └── transactions.service.ts
│   │   ├── types/
│   │   │   └── transactions.types.ts
│   │   └── TransacoesPage.tsx
│   │
│   ├── logs/
│   │   ├── components/
│   │   │   ├── ModeSelector.tsx
│   │   │   ├── LogFilters.tsx
│   │   │   ├── LogTerminal.tsx
│   │   │   ├── TraceTerminal.tsx
│   │   │   └── TraceGroup.tsx
│   │   ├── hooks/
│   │   │   ├── useLogs.ts
│   │   │   └── useTraces.ts
│   │   ├── services/
│   │   │   └── logs.service.ts
│   │   ├── types/
│   │   │   └── logs.types.ts
│   │   └── LogsPage.tsx
│   │
│   └── index.ts
│
├── shared/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── Skeleton.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   └── charts/
│   │       ├── AreaChart.tsx
│   │       └── CandlestickChart.tsx
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── usePolling.ts
│   │   ├── useLocalStorage.ts
│   │   └── useDebounce.ts
│   │
│   ├── services/
│   │   ├── api.client.ts
│   │   ├── ws.client.ts
│   │   └── queryClient.ts
│   │
│   ├── utils/
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   ├── converters.ts
│   │   └── constants.ts
│   │
│   ├── types/
│   │   ├── global.types.ts
│   │   └── api.types.ts
│   │
│   └── index.ts
│
├── app/
│   ├── routes.tsx
│   ├── store/
│   │   ├── ui.store.ts
│   │   └── filters.store.ts
│   ├── providers/
│   │   ├── ThemeProvider.tsx
│   │   ├── QueryProvider.tsx
│   │   └── WebSocketProvider.tsx
│   └── App.tsx
│
├── main.tsx
└── vite-env.d.ts


5. ESPECIFICAÇÃO DAS TELAS
===============================================================================

5.1 DASHBOARD
-------------------------------------------------------------------------------

OBJETIVO: Apresentar um resumo completo do portfólio e do status dos bots.

ORGANIZAÇÃO:
1. Card de Saldo Total
2. Cards de Saldo por Moeda (grid dinâmico)
3. Gráfico de Performance
4. Últimas Transações (tabela)
5. Status dos Bots (lista)

CARD DE SALDO TOTAL:
| Campo                | Descrição                              | Formato              |
|----------------------|----------------------------------------|----------------------|
| Saldo total          | Valor total em R$                      | R$ 45.230,75         |
| Cotação USDT/BRL     | Taxa de câmbio atual                   | R$ 5,85              |
| Lucro/Prejuízo dia   | Variação do dia                        | +R$ 1.250,30 (+2,84%)|
| % de acerto          | Percentual de operações vencedoras     | 68,5%                |
| PnL Total            | Lucro/Prejuízo acumulado               | +R$ 10.230,75 (+29,2%)|

CARDS DE SALDO POR MOEDA:
| Campo                | Descrição                              |
|----------------------|----------------------------------------|
| Moeda                | BTC, ETH, SOL, etc.                    |
| Saldo em R$          | Valor convertido                       |
| Cotação USDT/BRL     | Taxa de câmbio atual                   |
| Lucro/Prejuízo dia   | Variação do dia                        |
| % de acerto          | Percentual específico da moeda         |
| PnL Total            | Lucro/Prejuízo acumulado               |

GRÁFICO DE PERFORMANCE:
| Período              | Descrição                              |
|----------------------|----------------------------------------|
| 24h                  | Pontos a cada 1 hora                   |
| 7d                   | Pontos a cada 1 dia                    |
| 30d                  | Pontos a cada 1 dia                    |
| Total                | Desde o início da operação             |

ÚLTIMAS TRANSAÇÕES (Tabela):
| Coluna               | Descrição                              |
|----------------------|----------------------------------------|
| Data/Hora            | ISO formatada                          |
| Par                  | BTC/USDT                               |
| Valor Compra (R$)    | Preço de entrada                       |
| Valor Venda (R$)     | Preço de saída                         |
| Taxa (R$)            | Taxa total                             |
| Ganho (R$)           | Lucro/Prejuízo                         |
| Ganho (%)            | Percentual de retorno                  |

STATUS DOS BOTS:
| Campo                | Descrição                              |
|----------------------|----------------------------------------|
| Nome do bot          | Identificador configurável             |
| Par analisado        | Par de trading                         |
| Status               | Online/Offline/Treinando/Erro          |
| Botão de ação        | Pausar / Retomar                        |

REQUISITOS OBRIGATÓRIOS – DASHBOARD:
R1: Conversão automática de USDT para BRL
R2: Atualização em tempo real via WebSocket/polling
R3: Responsividade (desktop, tablet, mobile)
R4: Cache local de até 10 segundos
R5: Tratamento de erros com mensagens amigáveis


5.2 CONFIGURAÇÕES
-------------------------------------------------------------------------------

OBJETIVO: Configurar comportamento dos bots e integrações.

ORGANIZAÇÃO:
1. Chaves de API
2. Parâmetros do Bot
   - Gerenciamento de Risco
   - Pares Permitidos
   - Taxas e Descontos
   - Opções Avançadas
3. Ações (Salvar, Reset)

CHAVES DE API:
| Campo        | Descrição                    | Tipo         | Obrigatório |
|--------------|------------------------------|--------------|-------------|
| Exchange     | Seletor de exchanges         | dropdown     | Sim         |
| API Key      | Chave pública                | texto masc.  | Sim         |
| Secret Key   | Chave privada                | password     | Sim         |

GERENCIAMENTO DE RISCO:
| Campo                        | Descrição                    | Tipo   | Padrão |
|------------------------------|------------------------------|--------|--------|
| Stop-loss (%)                | Perda máxima                 | number | 5.0    |
| Take-profit (%)              | Lucro alvo                   | number | 10.0   |
| Alavancagem                  | Multiplicador de capital     | number | 1      |
| Quantidade máxima por trade  | Montante máximo              | number | 1000   |

PARES PERMITIDOS:
| Campo               | Descrição                            | Tipo                 |
|---------------------|--------------------------------------|----------------------|
| Pares permitidos    | Lista de pares negociáveis           | multi-select com busca|

TAXAS E DESCONTOS:
| Campo                    | Descrição                    | Tipo   | Padrão |
|--------------------------|------------------------------|--------|--------|
| Desconto USDT (%)        | Taxa base em USDT            | number | 0.075  |
| Desconto BNB (%)         | Taxa com desconto em BNB     | number | 0.075  |
| Saldo mínimo BNB         | Reserva mínima de BNB        | number | 0.01   |

OPÇÕES AVANÇADAS:
| Campo                | Descrição                    | Tipo     | Padrão  |
|----------------------|------------------------------|----------|---------|
| Modo de operação     | Spot / Futuros               | radio    | Spot    |
| Tipo de ordem        | Market / Limit               | dropdown | Market  |
| Slippage tolerado (%)| Deslize máximo               | number   | 0.5     |

REQUISITOS OBRIGATÓRIOS – CONFIGURAÇÕES:
R1: Carregamento automático das configurações do back-end
R2: Validação com Zod
R3: Confirmação de reset com modal
R4: Segurança: API Keys nunca em texto claro
R5: Botão para testar conexão com exchange


5.3 TREINAMENTO DA IA
-------------------------------------------------------------------------------

OBJETIVO: Configurar, executar e monitorar o treinamento dos modelos de IA.

PREMISSA: Todo o ciclo de treinamento é gerenciado e persistido no back-end.

ORGANIZAÇÃO:
1. Seleção do Bot/Modelo
2. Configuração do Dataset
3. Parâmetros de Treinamento
4. Controles de Execução
5. Métricas e Visualizações
6. Log de Treinamento

SELEÇÃO DO BOT/MODELO:
| Campo             | Descrição                        | Tipo     |
|-------------------|----------------------------------|----------|
| Bot alvo          | Lista de bots existentes         | dropdown |
| Arquitetura       | LSTM, CNN, Random Forest, etc.   | dropdown |
| Versão do modelo  | Identificador da versão          | texto    |
| Baseado em        | Modelo pré-treinado              | dropdown |

CONFIGURAÇÃO DO DATASET:
| Campo                 | Descrição                        | Tipo            |
|-----------------------|----------------------------------|-----------------|
| Origem dos dados      | Exchange/Sintético/Upload        | radio           |
| Período treinamento   | Data inicial e final             | date range      |
| Pares incluídos       | Pares a considerar               | multi-select    |
| Indicadores técnicos  | SMA, EMA, RSI, etc.              | checkbox group  |
| Resolução temporal    | 1m, 5m, 1h, etc.                 | dropdown        |
| Upload de CSV         | Dataset personalizado            | file upload     |

PARÂMETROS DE TREINAMENTO:
| Parâmetro            | Descrição                    | Tipo   | Padrão |
|----------------------|------------------------------|--------|--------|
| Camadas ocultas      | Número de camadas LSTM       | number | 2      |
| Neurônios por camada | Quantidade por camada        | number | 64     |
| Dropout rate         | Taxa de dropout              | number | 0.2    |
| Batch size           | Amostras por lote            | number | 32     |
| Épocas               | Passagens pelo dataset       | number | 100    |
| Learning rate        | Taxa de aprendizado          | number | 0.001  |
| Otimizador           | Adam, SGD, RMSprop           | dropdown| Adam  |
| Validação cruzada    | Percentual para validação    | number | 20%    |
| Early stopping       | Interrupção automática       | checkbox| 10 ep.|

CONTROLES DE EXECUÇÃO:
| Controle                 | Descrição                    | Persistência      |
|--------------------------|------------------------------|-------------------|
| Iniciar treinamento      | Envia configuração ao back   | ✅ Persistido     |
| Cancelar treinamento     | Interrompe o treinamento     | ✅ Persistido     |
| Pausar/Retomar           | Pausa temporária             | ✅ Persistido     |
| Testar com dados atuais  | Backtesting do modelo        | ✅ Persistido     |
| Salvar modelo completo   | Envia modelo ao back         | ✅ Persistido     |
| Exportar modelo          | Download local               | ❌ Apenas frontend|

MÉTRICAS E VISUALIZAÇÕES:
| Componente               | Tipo de gráfico              |
|--------------------------|------------------------------|
| Loss por época           | Linha (treino e validação)   |
| Accuracy                 | Linha                        |
| Matriz de confusão       | Heatmap                      |
| Curva ROC / AUC          | Curva                        |
| Predição vs Real         | Scatter plot                 |
| Importância das features | Barras horizontal            |

REQUISITOS OBRIGATÓRIOS – TREINAMENTO:
R1: Múltiplos bots com modelos próprios
R2: Transfer learning baseado em modelos anteriores
R3: Backtesting pós-treinamento
R4: Checkpoints automáticos periódicos
R5: Visualização em tempo real via WebSocket
R6: Persistência total no back-end
R7: Recuperação de sessão ao recarregar
R8: Histórico de treinamentos para consulta


5.4 TRANSAÇÕES
-------------------------------------------------------------------------------

OBJETIVO: Visualizar histórico e executar ordens manuais.

ORGANIZAÇÃO:
1. Seletor de Moeda de Exibição
2. Gráfico do Par
3. Saldo Disponível
4. Formulário de Ordem Manual
5. Filtros e Busca
6. Tabela de Histórico de Transações

SELETOR DE MOEDA DE EXIBIÇÃO:
| Campo                | Descrição                    | Opções                      |
|----------------------|------------------------------|-----------------------------|
| Moeda de exibição    | Moeda para conversão         | BRL, USDT, EUR, BTC, ETH    |

Comportamento: Ao mudar, frontend chama API para obter cotação e reconverte.

GRÁFICO DO PAR:
| Elemento             | Descrição                    |
|----------------------|------------------------------|
| Seletor de par       | Dropdown com pares           |
| Seletor de período   | 15m, 30m, 1h, 4h, 1d, 1w    |
| Gráfico              | Candlestick (velas)          |
| Atualização          | A cada 5 segundos (polling)  |

FORMULÁRIO DE ORDEM MANUAL:
| Campo                | Tipo         | Validação                    |
|----------------------|--------------|------------------------------|
| Par                  | dropdown     | Disponível na lista          |
| Tipo                 | radio        | Compra/Venda                 |
| Quantidade           | number       | >0 e ≤ saldo                 |
| Tipo de ordem        | dropdown     | Market/Limit                 |
| Preço (se Limit)     | number       | >0                           |

TABELA DE HISTÓRICO DE TRANSAÇÕES:
| Coluna               | Descrição                    |
|----------------------|------------------------------|
| Data/Hora            | ISO formatada                |
| Par                  | BTC/USDT                     |
| Origem               | Manual / Bot                 |
| Tipo                 | Compra/Venda                 |
| Quantidade           | Quantidade negociada         |
| Preço                | Convertido para moeda        |
| Valor total          | Convertido                   |
| Taxa                 | Convertido                   |
| Status               | Executada/Pendente/Cancelada |

REQUISITOS OBRIGATÓRIOS – TRANSAÇÕES:
R1: Múltiplas moedas com conversão via API
R2: Gráfico candlestick atualizado a cada 5 segundos
R3: Histórico unificado (manuais + automáticas)
R4: Validação de saldo antes de enviar ordem
R5: Modal de confirmação da ordem
R6: Atualização em tempo real via WebSocket
R7: Exportação do histórico em CSV
R8: Persistência de filtros via URL


5.5 LOG / TRACE GERAL
-------------------------------------------------------------------------------

OBJETIVO: Auditoria completa com dois níveis: Log e Trace.

ORGANIZAÇÃO:
1. Seletor de Modo (Log / Trace)
2. Filtros e Busca
3. Terminal de Exibição
4. Ações

SELETOR DE MODO:
| Modo     | Descrição                                    | Uso                |
|----------|----------------------------------------------|--------------------|
| Log      | Eventos relevantes, erros, ações do usuário | Monitoramento      |
| Trace    | Cada passo da execução ("passei por aqui")  | Depuração avançada |

FILTROS COMUNS (Log e Trace):
- Nível (Log: INFO/WARN/ERROR | Trace: DEBUG/TRACE)
- Módulo (Dashboard, Configurações, Treinamento, Transações, Bot, Sistema)
- Data inicial e final
- Busca textual

FILTROS ESPECÍFICOS PARA TRACE:
- Bot ID
- Função/Método
- Trace ID
- Duração mínima (ms)
- Apenas erros

REGRAS DE TRACE (BACK-END):
Regra fundamental: Todo ponto do código que representa um "passei por aqui"
deve gerar um registro de Trace.

| Categoria              | Exemplos                             | Nível  |
|------------------------|--------------------------------------|--------|
| Entrada/Saída funções  | Início/fim de métodos                | TRACE  |
| Chamadas externas      | API, banco de dados                  | DEBUG  |
| Decisões do bot        | Stop-loss atingido                   | DEBUG  |
| Iterações              | Épocas de treinamento                | DEBUG  |
| Erros tratados         | Timeout, retry                       | DEBUG  |

Trace ID: Cada execução relevante recebe um ID único propagado por todas as
chamadas subsequentes.

TERMINAL DE EXIBIÇÃO:

MODO LOG:
| Coluna      | Descrição                    |
|-------------|------------------------------|
| Timestamp   | dd/mm/aaaa hh:mm:ss.ms       |
| Nível       | INFO/WARN/ERROR com ícone    |
| Módulo      | Origem do log                |
| Mensagem    | Descrição do evento          |

MODO TRACE:
| Coluna      | Descrição                    |
|-------------|------------------------------|
| Timestamp   | dd/mm/aaaa hh:mm:ss.ms       |
| Trace ID    | UUID para correlação         |
| Nível       | DEBUG/TRACE                  |
| Módulo      | Origem do trace              |
| Função      | Nome da função/método        |
| Mensagem    | "Passei por aqui"            |
| Duração (ms)| Tempo decorrido              |

Características:
- Agrupamento por Trace ID (expandir/colapsar)
- Visualização hierárquica (indentação)
- Destaque para traces lentos (>1s)
- Virtual scrolling para performance

AÇÕES:
- Exportar (CSV/JSON)
- Limpar filtros
- Auto-scroll (toggle)
- Pausar/Retomar atualização

REQUISITOS OBRIGATÓRIOS – LOG / TRACE:
R1: Distinção Log vs Trace com seletor de modo
R2: Trace ID obrigatório para correlação
R3: Agrupamento por Trace ID
R4: Hierarquia de execução com indentação
R5: Exibição de duração por passo
R6: Filtro por Trace ID
R7: Filtro por duração mínima
R8: Atualização em tempo real via WebSocket
R9: Virtual scrolling para grandes volumes
R10: Exportação em CSV/JSON
R11: Retenção configurável (90 dias logs, 7 dias traces)
R12: Feature flag para desabilitar traces em produção


6. MODELOS DE DADOS GLOBAIS
===============================================================================

// shared/types/global.types.ts

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  lastUpdate: string;
}

export interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Bot {
  id: string;
  name: string;
  pair: string;
  status: 'online' | 'offline' | 'training' | 'error';
  isPaused: boolean;
}

export interface TotalBalance {
  totalBrl: number;
  dailyProfitBrl: number;
  dailyProfitPercent: number;
  totalPnlBrl: number;
  totalPnlPercent: number;
  hitRate: number;
  usdtBrlRate: number;
}

export interface CurrencyBalance {
  currency: string;
  balanceBrl: number;
  dailyProfitBrl: number;
  dailyProfitPercent: number;
  totalPnlBrl: number;
  totalPnlPercent: number;
  hitRate: number;
  usdtBrlRate: number;
}

export interface Transaction {
  id: string;
  date: string;
  pair: string;
  origin: 'manual' | 'bot';
  botId?: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  fee: number;
  status: 'executed' | 'pending' | 'cancelled';
}

export interface BotParameters {
  riskManagement: {
    stopLossPercent: number;
    takeProfitPercent: number;
    leverage: number;
    maxTradeAmount: number;
    maxTradeAmountUnit: 'USDT' | 'percent';
  };
  allowedPairs: string[];
  fees: {
    discountUsdtPercent: number;
    discountBnbPercent: number;
    minBnbBalance: number;
  };
  advanced: {
    mode: 'spot' | 'futures';
    orderType: 'market' | 'limit';
    slippagePercent: number;
  };
}

export interface TrainingSession {
  id: string;
  botId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  config: TrainingConfig;
  metrics: TrainingMetrics[];
  logs: TrainingLog[];
  bestEpoch?: number;
  bestValLoss?: number;
  modelUrl?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  details?: Record<string, any>;
}

export interface TraceEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'TRACE';
  module: string;
  traceId: string;
  parentTraceId?: string;
  functionName: string;
  message: string;
  durationMs: number;
  botId?: string;
  errorFlag?: boolean;
}


7. API ENDPOINTS
===============================================================================

DASHBOARD:
-------------------------------------------------------------------------------
GET    /api/dashboard/total-balance
GET    /api/dashboard/currencies-balance
GET    /api/dashboard/transactions/recent
GET    /api/dashboard/bots-status
GET    /api/dashboard/performance?period={period}
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
GET    /api/exchange/rate?from={from}&to={to}
GET    /api/exchange/candles?pair={pair}&period={period}&limit={limit}
GET    /api/orders
POST   /api/orders
DELETE /api/orders/{id}/cancel
GET    /api/balance
GET    /api/orders/export

LOGS:
-------------------------------------------------------------------------------
GET    /api/logs
GET    /api/traces
GET    /api/traces/group/{traceId}
GET    /api/logs/export
GET    /api/traces/export
GET    /api/traces/bots

WEBSOCKET:
-------------------------------------------------------------------------------
WS     /ws/dashboard
WS     /ws/orders
WS     /ws/logs
WS     /ws/traces
WS     /ws/training/{sessionId}


8. CONSIDERAÇÕES GERAIS
===============================================================================

| #  | Requisito                 | Descrição                                    |
|----|---------------------------|----------------------------------------------|
| G1 | Tema escuro/claro         | Suporte a troca de tema (padrão escuro)      |
| G2 | Responsividade            | Funcionar em desktop, tablet e mobile        |
| G3 | Tratamento de erros       | Mensagens amigáveis para erros de API        |
| G4 | Loading states            | Skeletons ou spinners durante carregamento   |
| G5 | Cache local               | Dados estáticos cacheados                    |
| G6 | Acessibilidade            | Seguir diretrizes WCAG 2.1                   |
| G7 | WebSocket fallback        | Polling se WebSocket indisponível            |
| G8 | SOLID                     | Arquitetura baseada nos princípios SOLID     |
| G9 | Testabilidade             | Código preparado para testes unitários       |


================================================================================
FIM DA DOCUMENTAÇÃO
================================================================================
