# Implementação da integração externa

## O que foi aplicado

Foram implementadas as mudanças mínimas para substituir os mocks principais por integrações reais com APIs externas, mantendo a estrutura atual do backend.

### Binance
- `POST /api/configurations/test-connection`
- `POST /api/configurations/test`
- `GET /api/configurations/exchange-pairs`
- `GET /api/exchange/pairs`
- `GET /api/exchange/candles`
- suporte em serviço para:
  - ticker price
  - exchange info
  - account/balances
  - create order
  - cancel order
  - coleta histórica para treinamento

### AwesomeAPI
- `GET /api/exchange/rate`
- suporte a taxa direta, inversa e derivada via BRL

### Dashboard
- conversão BRL com cotações reais

### Balance
- sincronização opcional com Binance quando o usuário tiver API key e secret salvas na configuração

### Webhook
- serviço criado com retry exponencial e ativação por variáveis de ambiente

## Arquivos adicionados
- `src/services/external-http.service.ts`
- `src/services/binance.service.ts`
- `src/services/awesomeapi.service.ts`
- `src/services/market-valuation.service.ts`
- `src/services/webhook.service.ts`
- `src/services/training-data.service.ts`

## Arquivos alterados
- `src/app.ts`
- `src/controllers/configurations.controller.ts`
- `src/controllers/transactions.controller.ts`
- `src/controllers/dashboard.controller.ts`
- `.env.example`
