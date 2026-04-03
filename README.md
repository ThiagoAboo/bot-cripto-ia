================================================================================
DOCUMENTAÇÃO COMPLETA DO PROJETO – BOT DE CRIPTOMOEDAS COM IA (FRONTEND)
VERSÃO 2.0 - ARQUITETURA DE BOTS POR ESTRATÉGIA
================================================================================

ÍNDICE
===============================================================================
1. VISÃO GERAL
2. ARQUITETURA E PRINCÍPIOS SOLID
3. STACK TÉCNICA
4. MODELOS DE DADOS PRINCIPAIS
5. ESPECIFICAÇÃO DAS TELAS
   5.1 Dashboard
   5.2 Configurações
   5.3 Treinamento da IA
   5.4 Transações
   5.5 Log / Trace Geral
6. API ENDPOINTS
7. DIFERENCIAIS DA ARQUITETURA
8. PRÓXIMOS PASSOS


1. VISÃO GERAL
===============================================================================

O projeto consiste em uma interface web para um sistema de trading automatizado
utilizando inteligência artificial. O frontend será desenvolvido com foco em
apenas frontend, utilizando dados mockados inicialmente, mas preparado para
consumir APIs reais no futuro.

CONCEITO FUNDAMENTAL DOS BOTS:

Diferencial da Arquitetura:
- Cada bot é especializado em um tipo de análise/estratégia
  (ex: Scalper, Momentum, Trend Follower, Arbitrage, Mean Reversion)
- O bot analisa dinamicamente qualquer moeda disponível no mercado
- O bot decide automaticamente qual moeda negociar com base em seus indicadores
- Não existe bot fixo por moeda; todos os bots podem operar qualquer moeda

Exemplo de funcionamento:
- Bot "Scalper" → Analisa BTC, ETH, SOL, DOGE... e decide qual tem o melhor
  setup para scalping no momento
- Bot "Momentum" → Analisa todas as moedas e identifica qual está com maior
  momentum
- Cada bot tem autonomia para trocar de moeda a qualquer momento conforme
  sua análise

TELAS DEFINIDAS:
1. Dashboard – visão geral do portfólio e status das estratégias
2. Configurações – parâmetros dos bots e integrações
3. Treinamento da IA – configuração e monitoramento dos modelos por estratégia
4. Transações – histórico e execução manual de ordens
5. Log / Trace Geral – auditoria completa do sistema


2. ARQUITETURA E PRINCÍPIOS SOLID
===============================================================================

A arquitetura do frontend será baseada nos princípios SOLID, garantindo um
código modular, testável e de fácil manutenção.

2.1 S – Single Responsibility Principle (Responsabilidade Única)

| Camada       | Responsabilidade Útica                                    |
|--------------|-----------------------------------------------------------|
| Components   | Renderizar UI e delegar ações para hooks/stores          |
| Hooks        | Gerenciar lógica de negócio e chamadas à API             |
| Services     | Realizar requisições HTTP e WebSocket                    |
| Stores       | Gerenciar estado de UI (loading, filtros, modais)        |
| Utils        | Funções puras: formatação, validação, conversão          |
| Types        | Definir contratos de dados                               |

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


3. STACK TÉCNICA
===============================================================================

| Camada                       | Tecnologia                               |
|------------------------------|------------------------------------------|
| Framework                    | React + TypeScript                       |
| Build tool                   | Vite                                     |
| Estilização                  | TailwindCSS                              |
| Roteamento                   | React Router v6                          |
| Gerenciamento de estado (UI) | Zustand                                  |
| Requisições HTTP             | Axios + React Query                      |
| Gráficos                     | Recharts + lightweight-charts            |
| Formulários                  | React Hook Form + Zod                    |
| Comunicação real-time        | Socket.io-client                         |
| Mock de API                  | JSON Server ou MSW                       |
| Testes                       | Vitest + React Testing Library           |


4. MODELOS DE DADOS PRINCIPAIS
===============================================================================

4.1 Bot Status (Estratégia)

interface BotStatus {
  id: string
  name: string                    // Nome do bot (ex: "Scalper V2")
  strategy: string                // Tipo de estratégia (ex: "Scalper", "Momentum")
  description?: string            // Descrição da estratégia
  currentPair?: string            // Moeda sendo analisada no momento (dinâmico)
  status: 'online' | 'offline' | 'training' | 'error'
  isPaused: boolean
  lastAnalysis?: string           // Última análise realizada
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number             // Confiança da recomendação (0-100)
}

4.2 Transação

interface Transaction {
  id: string
  date: string
  pair: string                    // Moeda negociada
  origin: 'manual' | 'bot'
  botId?: string                  // Qual bot executou
  botName?: string                // Nome do bot
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total: number
  fee: number
  status: 'executed' | 'pending' | 'cancelled'
  profitBrl?: number
  profitPercent?: number
}

4.3 Saldo Total

interface TotalBalance {
  totalBrl: number
  dailyProfitBrl: number
  dailyProfitPercent: number
  totalPnlBrl: number
  totalPnlPercent: number
  hitRate: number
  usdtBrlRate: number
}

4.4 Saldo por Moeda

interface CurrencyBalance {
  currency: string
  balanceBrl: number
  dailyProfitBrl: number
  dailyProfitPercent: number
  totalPnlBrl: number
  totalPnlPercent: number
  hitRate: number
  usdtBrlRate: number
}


5. ESPECIFICAÇÃO DAS TELAS
===============================================================================

5.1 DASHBOARD
-------------------------------------------------------------------------------

OBJETIVO: Apresentar um resumo completo do portfólio e do status das estratégias.

ORGANIZAÇÃO DA TELA:
1. Card de Saldo Total
2. Cards de Saldo por Moeda (grid dinâmico)
3. Gráfico de Performance
4. Últimas Transações (tabela com identificação do bot)
5. Status das Estratégias (lista de bots por tipo de análise)

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
| 24h                  | Últimas 24 horas                       |
| 7d                   | Últimos 7 dias                         |
| 30d                  | Últimos 30 dias                        |
| Total                | Desde o início da operação             |

ÚLTIMAS TRANSAÇÕES (Tabela):
| Coluna               | Descrição                              |
|----------------------|----------------------------------------|
| Data/Hora            | ISO formatada                          |
| Par                  | Moeda negociada                        |
| Bot                  | Nome do bot que executou               |
| Tipo                 | Compra/Venda                           |
| Quantidade           | Quantidade negociada                   |
| Preço                | Preço da ordem                         |
| Taxa                 | Taxa paga                              |
| Ganho                | Lucro/Prejuízo                         |

STATUS DAS ESTRATÉGIAS (Bots):
| Campo                | Descrição                              |
|----------------------|----------------------------------------|
| Nome do bot          | Identificador da estratégia            |
| Estratégia           | Tipo de análise (Scalper, Momentum)    |
| Analisando           | Moeda atual sendo analisada (dinâmico) |
| Status               | Online/Offline/Treinando/Erro          |
| Recomendação         | Compra/Venda/Aguardar                  |
| Confiança            | Nível de confiança da análise          |
| Ação                 | Pausar/Retomar                         |

REQUISITOS OBRIGATÓRIOS – DASHBOARD:
R1: Bots por estratégia (especializados em tipo de análise, não em moeda fixa)
R2: Moeda dinâmica (cada bot pode mudar a moeda analisada a qualquer momento)
R3: Recomendação por bot (cada bot exibe sua recomendação atual buy/sell/hold)
R4: Conversão automática de USDT para BRL
R5: Atualização em tempo real via WebSocket/polling
R6: Responsividade (desktop, tablet, mobile)


5.2 CONFIGURAÇÕES
-------------------------------------------------------------------------------

OBJETIVO: Permitir ao usuário configurar o comportamento dos bots e integrações.

ORGANIZAÇÃO DA TELA:
1. Chaves de API
2. Parâmetros Globais
3. Configuração por Estratégia (cada bot tem seus parâmetros)
4. Pares Permitidos (moedas que os bots podem analisar)
5. Taxas e Descontos

CHAVES DE API:
| Campo        | Descrição                    | Tipo         | Obrigatório |
|--------------|------------------------------|--------------|-------------|
| Exchange     | Seletor de exchanges         | dropdown     | Sim         |
| API Key      | Chave pública                | texto masc.  | Sim         |
| Secret Key   | Chave privada                | password     | Sim         |

PARÂMETROS GLOBAIS:
| Campo                        | Descrição                    | Tipo   | Padrão |
|------------------------------|------------------------------|--------|--------|
| Stop-loss (%)                | Perda máxima global          | number | 5.0    |
| Take-profit (%)              | Lucro alvo global            | number | 10.0   |
| Alavancagem                  | Multiplicador de capital     | number | 1      |
| Quantidade máxima por trade  | Montante máximo              | number | 1000   |

CONFIGURAÇÃO POR ESTRATÉGIA:

Cada bot/estratégia pode ter parâmetros específicos:

| Estratégia       | Parâmetros específicos                           |
|------------------|--------------------------------------------------|
| Scalper          | Timeframe (1m,5m), Spread máximo, Volume mínimo |
| Momentum         | Período de análise (14,21), Threshold de momentum|
| Trend Follower   | Médias móveis (20,50,200), ADX threshold        |
| Mean Reversion   | Bandas (20,2), RSI threshold (30/70)            |
| Arbitrage        | Spread mínimo, Latência máxima                  |

PARES PERMITIDOS (MOEDAS):
| Campo               | Descrição                            | Tipo                 |
|---------------------|--------------------------------------|----------------------|
| Moedas permitidas   | Lista de moedas que os bots podem    | multi-select com busca|
|                     | analisar                             |                      |

TAXAS E DESCONTOS:
| Campo                    | Descrição                    | Tipo   | Padrão |
|--------------------------|------------------------------|--------|--------|
| Desconto USDT (%)        | Taxa base em USDT            | number | 0.075  |
| Desconto BNB (%)         | Taxa com desconto em BNB     | number | 0.075  |
| Saldo mínimo BNB         | Reserva mínima de BNB        | number | 0.01   |

REQUISITOS OBRIGATÓRIOS – CONFIGURAÇÕES:
R1: Configuração por estratégia (cada bot pode ter parâmetros específicos)
R2: Moedas permitidas (lista de moedas que os bots podem analisar)
R3: Validação com Zod
R4: Persistência das configurações no back-end
R5: Carregamento automático das configurações


5.3 TREINAMENTO DA IA
-------------------------------------------------------------------------------

OBJETIVO: Configurar, executar e monitorar o treinamento dos modelos de IA
por estratégia.

ORGANIZAÇÃO DA TELA:
1. Seleção da Estratégia/Bot
2. Configuração do Dataset (moedas, período, indicadores)
3. Parâmetros de Treinamento
4. Controles de Execução
5. Métricas e Visualizações
6. Log de Treinamento

SELEÇÃO DA ESTRATÉGIA/BOT:
| Campo             | Descrição                        | Tipo     |
|-------------------|----------------------------------|----------|
| Estratégia alvo   | Lista de estratégias disponíveis | dropdown |
| Arquitetura       | LSTM, CNN, Random Forest, etc.   | dropdown |
| Versão do modelo  | Identificador da versão          | texto    |
| Baseado em        | Modelo pré-treinado              | dropdown |

CONFIGURAÇÃO DO DATASET:
| Campo                 | Descrição                        | Tipo            |
|-----------------------|----------------------------------|-----------------|
| Moedas treinamento    | Quais moedas serão usadas        | multi-select    |
| Período treinamento   | Data inicial e final             | date range      |
| Indicadores técnicos  | SMA, EMA, RSI, MACD, etc.        | checkbox group  |
| Resolução temporal    | 1m, 5m, 15m, 1h, 4h, 1d         | dropdown        |

PARÂMETROS DE TREINAMENTO:
| Parâmetro            | Descrição                    | Tipo   | Padrão |
|----------------------|------------------------------|--------|--------|
| Camadas ocultas      | Número de camadas LSTM       | number | 2      |
| Neurônios por camada | Quantidade por camada        | number | 64     |
| Dropout rate         | Taxa de dropout              | number | 0.2    |
| Batch size           | Amostras por lote            | number | 32     |
| Épocas               | Passagens pelo dataset       | number | 100    |
| Learning rate        | Taxa de aprendizado          | number | 0.001  |

MÉTRICAS DE AVALIAÇÃO POR ESTRATÉGIA:

| Estratégia       | Métricas específicas                             |
|------------------|--------------------------------------------------|
| Scalper          | Taxa de acerto por trade, Tempo médio por trade  |
| Momentum         | Acerto em tendências fortes, Sharpe ratio        |
| Trend Follower   | Drawdown máximo, Fator de lucro                  |
| Mean Reversion   | Acerto em reversões, Tempo de reversão médio     |

REQUISITOS OBRIGATÓRIOS – TREINAMENTO:
R1: Treinamento por estratégia (cada bot tem seu próprio modelo)
R2: Dataset multi-moedas (modelo aprende com múltiplas moedas)
R3: Transfer learning baseado em modelos anteriores
R4: Backtesting com dados recentes
R5: Visualização em tempo real via WebSocket
R6: Persistência total no back-end


5.4 TRANSAÇÕES
-------------------------------------------------------------------------------

OBJETIVO: Visualizar histórico e executar ordens manuais.

ORGANIZAÇÃO DA TELA:
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

GRÁFICO DO PAR:
| Elemento             | Descrição                    |
|----------------------|------------------------------|
| Seletor de par       | Dropdown com moedas          |
| Seletor de período   | 15m, 30m, 1h, 4h, 1d, 1w    |
| Gráfico              | Candlestick (velas)          |
| Atualização          | A cada 5 segundos            |

FORMULÁRIO DE ORDEM MANUAL:
| Campo                | Tipo         | Validação                    |
|----------------------|--------------|------------------------------|
| Par (Moeda)          | dropdown     | Disponível na lista          |
| Tipo                 | radio        | Compra/Venda                 |
| Quantidade           | number       | >0 e ≤ saldo                 |
| Tipo de ordem        | dropdown     | Market/Limit                 |

TABELA DE HISTÓRICO DE TRANSAÇÕES:
| Coluna               | Descrição                              |
|----------------------|----------------------------------------|
| Data/Hora            | ISO formatada                          |
| Par                  | Moeda negociada                        |
| Origem               | Manual / Bot (qual estratégia)         |
| Tipo                 | Compra/Venda                           |
| Quantidade           | Quantidade negociada                   |
| Preço                | Convertido para moeda selecionada      |
| Taxa                 | Convertido                             |
| Ganho                | Lucro/Prejuízo                         |

FILTROS ESPECÍFICOS:
| Filtro               | Opções                                       |
|----------------------|----------------------------------------------|
| Origem               | Manual, Scalper, Momentum, Trend Follower    |
| Par (Moeda)          | Lista de moedas                              |
| Status               | Executada, Pendente, Cancelada               |

REQUISITOS OBRIGATÓRIOS – TRANSAÇÕES:
R1: Identificação do bot na tabela (qual estratégia executou)
R2: Filtro por estratégia específica
R3: Múltiplas moedas com conversão via API
R4: Gráfico candlestick atualizado a cada 5 segundos
R5: Histórico unificado (manuais + automáticas)
R6: Validação de saldo antes de enviar ordem


5.5 LOG / TRACE GERAL
-------------------------------------------------------------------------------

OBJETIVO: Auditoria completa com dois níveis: Log (eventos relevantes) e
Trace ("passei por aqui" - rastreamento detalhado).

ORGANIZAÇÃO DA TELA:
1. Seletor de Modo (Log / Trace)
2. Filtros e Busca
3. Terminal de Exibição

SELETOR DE MODO:
| Modo     | Descrição                                    | Uso                |
|----------|----------------------------------------------|--------------------|
| Log      | Eventos relevantes, erros, ações do usuário | Monitoramento      |
| Trace    | Cada passo da execução ("passei por aqui")  | Depuração avançada |

FILTROS COMUNS (Log e Trace):
- Nível (Log: INFO/WARN/ERROR | Trace: DEBUG/TRACE)
- Módulo (Dashboard, Configurações, Treinamento, Bot, Sistema)
- Data inicial e final
- Busca textual

FILTROS ESPECÍFICOS PARA TRACE (BOTS):
| Filtro               | Descrição                                    |
|----------------------|----------------------------------------------|
| Estratégia/Bot ID    | Filtrar traces de um bot específico         |
| Moeda analisada      | Filtrar por moeda que estava sendo analisada|
| Ação recomendada     | Filtrar por buy/sell/hold                   |
| Confiança mínima     | Traces com confiança acima do valor         |

REGRAS DE TRACE PARA BOTS:

Cada passo da análise do bot deve gerar um registro de Trace:

| Passo                    | Exemplo de Trace                                   |
|--------------------------|----------------------------------------------------|
| Início da análise        | [TRACE] Bot Scalper - Iniciando análise de mercado|
| Seleção de moedas        | [DEBUG] Analisando candidatas: BTC, ETH, SOL      |
| Cálculo de indicadores   | [DEBUG] BTC - RSI: 65, MACD: positivo             |
| Decisão                  | [INFO] Decisão: COMPRA BTC com confiança 78%      |
| Envio de ordem           | [INFO] Ordem enviada: COMPRA 0.05 BTC             |

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
| Estratégia  | Nome do bot/estratégia       |
| Moeda       | Moeda sendo analisada        |
| Mensagem    | "Passei por aqui"            |
| Duração (ms)| Tempo decorrido              |

REQUISITOS OBRIGATÓRIOS – LOG / TRACE:
R1: Distinção Log vs Trace com seletor de modo
R2: Trace ID obrigatório para correlação
R3: Registro de cada passo da análise do bot
R4: Filtro por estratégia/bot específico
R5: Filtro por moeda analisada
R6: Filtro por ação recomendada (buy/sell/hold)
R7: Atualização em tempo real via WebSocket
R8: Exportação em CSV/JSON


6. API ENDPOINTS
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
GET    /api/configurations/strategies
PUT    /api/configurations/strategies/{id}
GET    /api/exchange/pairs

TREINAMENTO:
-------------------------------------------------------------------------------
GET    /api/training/sessions?strategyId={id}
POST   /api/training/sessions
GET    /api/training/sessions/{id}
PUT    /api/training/sessions/{id}/pause
PUT    /api/training/sessions/{id}/resume
DELETE /api/training/sessions/{id}/cancel
POST   /api/training/sessions/{id}/test
POST   /api/training/sessions/{id}/save

TRANSAÇÕES:
-------------------------------------------------------------------------------
GET    /api/exchange/rate?from={from}&to={to}
GET    /api/exchange/candles?pair={pair}&period={period}
GET    /api/orders?botId={id}
GET    /api/orders?pair={pair}
POST   /api/orders
DELETE /api/orders/{id}/cancel
GET    /api/balance
GET    /api/orders/export

LOGS:
-------------------------------------------------------------------------------
GET    /api/logs?botId={id}
GET    /api/traces?botId={id}
GET    /api/traces?pair={pair}
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


7. DIFERENCIAIS DA ARQUITETURA
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


8. PRÓXIMOS PASSOS
===============================================================================

1. [OK] Configurar projeto com Vite + React + TypeScript
2. [OK] Criar estrutura de pastas
3. [OK] Implementar componentes shared
4. [OK] Implementar Dashboard com bots por estratégia
5. [ ] Implementar Configurações
6. [ ] Implementar Treinamento da IA
7. [ ] Implementar Transações
8. [ ] Implementar Log / Trace Geral
9. [ ] Adicionar mock de API (JSON Server)
10. [ ] Refinar UI/UX com tooltips e feedback visual
11. [ ] Escrever testes unitários


================================================================================
FIM DA DOCUMENTAÇÃO
================================================================================