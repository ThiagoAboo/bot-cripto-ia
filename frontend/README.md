# Frontend - Bot Cripto IA

## Visao geral

O frontend atual e um painel React + TypeScript consumindo o backend real via HTTP e Socket.IO.
Ele nao opera mais como mock principal. O fluxo esperado hoje e:

1. autenticar no backend
2. carregar dados com React Query
3. escutar eventos realtime via Socket.IO
4. invalidar e sincronizar a interface conforme logs, ordens, treinamento e dashboard mudam

## Stack

- React 18
- TypeScript
- Vite
- React Router v6
- React Query
- TailwindCSS + CSS variables
- Socket.IO client
- Vitest + Testing Library

## Rotas da aplicacao

- `/login`: autenticacao
- `/dashboard`: saldo, performance e visao geral da frota
- `/bots`: cockpit operacional dos bots, modelos, historico e governanca
- `/transacoes`: ordens, grafico, filtros e conciliacao
- `/treinamento`: sessoes de treino, upload e salvamento de modelos
- `/configuracoes`: chaves de exchange, risco, taxas, pair discovery e estrategias
- `/logs`: logs e traces
- `/perfil`: dados pessoais, senha e tema

## Estrutura principal

```text
src/
  app/
    providers/
      QueryProvider
      ThemeProvider
      WebSocketProvider
    routes.tsx
  features/
    auth/
    bots/
    configurations/
    dashboard/
    logs/
    profile/
    training/
    transactions/
  shared/
    components/
    services/
    utils/
```

## Realtime

O frontend usa `WebSocketProvider` com Socket.IO autenticado por token.

Conexao:

```ts
io(WS_URL, {
  transports: ['websocket'],
  auth: { token: localStorage.getItem('auth_token') }
})
```

Eventos emitidos na conexao:
- `subscribe:dashboard`
- `subscribe:orders`
- `subscribe:logs`
- `subscribe:traces`

Inscricao de treinamento:
- `subscribe:training` com `sessionId` como payload

Eventos recebidos:
- `connected`
- `dashboard:update`
- `order:created`
- `order:updated`
- `log:new`
- `trace:new`
- `training:status`
- `training:metrics`
- `training:log`

Observacao importante:
- `dashboard:update` e um sinal de sincronizacao com `scope`, `reason`, `updatedAt` e `botId`
- o frontend usa esse evento para refrescar os dados das telas; nao depende de um snapshot completo vindo no payload

## Tela de bots

A rota `/bots` hoje e uma das partes centrais do sistema. Ela cobre:

- lista de bots e status operacional
- criacao de bot a partir de template
- configuracao por instancia
- `executionMode`: `paper`, `semi_auto` e `full_auto`
- visao de `paperReadiness`
- historico operacional do bot
- governanca de modelos (`champion`, `challenger`, `archived`)
- execucao manual de ciclo

## Regras operacionais refletidas no frontend

- o runtime atual e `spot-only`
- a exchange operacional atual e `binance`
- `leverage` deve permanecer em `1`
- `full_auto` depende de champion valido e aprovacao em `paper`
- preferencias de notificacoes push foram removidas; o perfil hoje mantem apenas tema e dados do usuario

## Ambiente local

Arquivo `frontend/.env` recomendado:

```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```

## Comandos

```powershell
cd frontend
npm install
npm run dev
npm run lint
npm run test:run
npm run build
```

## Estado atual de qualidade

- `npm run lint`: ok
- `npm run test:run`: ok
- `npm run build`: ok

Pendencia conhecida:
- o chunk `chart-vendor` ainda esta acima do limite de aviso do Vite e segue no backlog de media prioridade
