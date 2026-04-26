# Implementacao da Integracao Externa

Este arquivo resume a implementacao aplicada no backend. Para o contrato funcional completo, use `15_integração_api_externa.txt`.

## O que foi aplicado

Foram substituidos os mocks principais por integracoes reais com APIs externas, preservando a estrutura atual do backend.

## Binance

- `POST /api/configurations/test-connection`
- `POST /api/configurations/test`
- `GET /api/configurations/exchange-pairs`
- `GET /api/exchange/pairs`
- `GET /api/exchange/candles`
- suporte de servico para:
  - ticker price
  - exchange info
  - account balances
  - create order
  - cancel order
  - coleta historica para treinamento

## AwesomeAPI

- `GET /api/exchange/rate`
- suporte a taxa direta, inversa e derivada via BRL

## Outros pontos

- dashboard com conversao BRL por cotacoes reais
- sincronizacao opcional de saldo com Binance quando o usuario possui credenciais salvas
- webhook com retry exponencial e ativacao por variaveis de ambiente

## Arquivos envolvidos

- `src/services/external-http.service.ts`
- `src/services/binance.service.ts`
- `src/services/awesomeapi.service.ts`
- `src/services/market-valuation.service.ts`
- `src/services/webhook.service.ts`
- `src/services/training-data.service.ts`
