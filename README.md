# Micro Trade AI Simulator

Simulador leve de micro trades em Python com moeda de cotacao configuravel, persistencia em arquivo fisico `SQLite` e painel web para acompanhar:

- saldo na moeda de cotacao escolhida
- PnL total, realizado e nao realizado
- transacoes simuladas
- decisoes da estrategia para cada moeda selecionada

## O que o projeto faz

- usa dados publicos spot da Binance para pares `XXXQUOTE`
- permite configurar o capital inicial
- permite configurar a moeda de cotacao do mercado analisado
- permite configurar a taxa percentual por transacao
- permite escolher quais moedas entram na analise e nas operacoes
- aplica a taxa configurada em cada compra e venda simulada
- grava tudo no arquivo `data/trading_sim.db`
- usa apenas dados gratuitos, sem APIs pagas
- confirma sinais em `1m` e `5m`
- filtra entradas com volume, estrutura do candle, volatilidade e nivel de ruido
- mostra taxa de acerto e profit factor dos trades fechados
- mantem historico de ciclos e aprendizado persistente por moeda
- preserva o aprendizado ao reiniciar, desde que a moeda de cotacao e a taxa nao sejam alteradas

Exemplos comuns de cotacao disponiveis no spot publico da Binance incluem `BRL`, `USDT`, `FDUSD`, `USDC`, `BTC`, `BNB`, `ETH`, `TRY` e outras, de acordo com a listagem atual da exchange.

## Como rodar

```bash
python -m pip install -r requirements.txt
python run.py
```

Depois abra:

```text
http://127.0.0.1:5000
```

## Observacoes

- o bot faz apenas simulacao, sem enviar ordens reais
- a "IA" aqui e um motor leve de decisao explicavel baseado em tendencia curta, momentum, RSI, volume e controles de risco
- salvar a configuracao reinicia trades e PnL
- se voce mantiver a mesma moeda de cotacao e a mesma taxa, o aprendizado persistente e preservado
- se voce mudar a moeda de cotacao ou a taxa, o aprendizado e reiniciado para evitar misturar historicos incompatíveis

## Estrutura

- `run.py`: inicializa o servidor Flask
- `trading_app/database.py`: persistencia SQLite
- `trading_app/market.py`: integracao com endpoints publicos da Binance
- `trading_app/strategy.py`: motor de decisao
- `trading_app/simulator.py`: loop da simulacao e execucao dos paper trades
- `trading_app/web.py`: rotas do painel e API
