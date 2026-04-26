# Bot Cripto IA

Stack operacional para trading de cripto com:
- `frontend/`: painel React + Vite
- `backend/`: API Express + Prisma + PostgreSQL + Socket.IO
- `bots/`: runtime Python externo para analise e decisao

## Arquitetura atual

Fluxo principal:

1. o `backend` consolida contexto operacional, carteira, risco, governanca e mercado
2. a camada `bots` consome a fila via `/api/bot-runtime/*`
3. o runtime Python avalia multiplos pares por bot e devolve o ciclo sugerido
4. o `backend` aplica a decisao, executa ordem em `paper`, `semi_auto` ou `full_auto`, persiste FIFO/PnL/logs/traces e atualiza o painel

O worker interno do backend ainda existe como fallback, mas o modo recomendado hoje e `bots -> backend`.

## Modos operacionais

- `paper`: executa na carteira local do sistema
- `semi_auto`: calcula a oportunidade, mas nao envia ordem
- `full_auto`: envia ordem real para a Binance e so deve ser usado quando o champion atual ja estiver aprovado no placar de validacao em `paper`

O backend ja bloqueia `full_auto` quando o bot nao tem champion sincronizado, quando o modelo nao esta pronto operacionalmente ou quando o `paperReadiness` ainda nao atingiu os criterios minimos.

## Pre-requisitos

- Node.js 20+
- Python 3.11+
- Docker Desktop ou PostgreSQL 15+ local

## Subida local

### Opcao 0. Carga completa do zero

```powershell
.\bootstrap_operacional.ps1
```

O script:
- limpa banco, volumes e artefatos persistidos de treino/checkpoints
- executa o `init.ps1`
- reinicializa a carteira `paper` com capital limpo
- garante os bots em `paper` e `online`
- roda treino inicial, backtest e salva o melhor candidato por bot
- grava um resumo em `bootstrap-operacional-report.json`

### Opcao 1. Script unico

```powershell
.\init.ps1
```

O script:
- detecta `docker compose` ou `docker-compose`
- builda `backend`, `bots` e `frontend`
- sobe `postgres`
- aplica `prisma migrate deploy`
- executa `npm run seed`
- sobe `backend`, `bots`, `frontend` e `adminer`

### Opcao 2. Manual

#### Backend

```powershell
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev
```

#### Frontend

```powershell
cd frontend
npm install
npm run dev
```

#### Bots

```powershell
cd bots\python
python -m pip install -r requirements.txt
set BOT_RUNTIME_BACKEND_BASE_URL=http://localhost:3001
set BOT_RUNTIME_SHARED_SECRET=dev-bot-runtime-secret
python service.py
```

## Variaveis importantes

No `backend/.env`:

```env
BOT_WORKER_AUTOSTART=false
BOT_RUNTIME_EXPECT_EXTERNAL_SERVICE=true
BOT_RUNTIME_SHARED_SECRET=dev-bot-runtime-secret
BOT_RUNTIME_BACKEND_BASE_URL=http://localhost:3001
PYTHON_ML_EXECUTABLE=python
PYTHON_BOT_RUNTIME_EXECUTABLE=python
```

No runtime `bots`:

```env
BOT_RUNTIME_BACKEND_BASE_URL=http://localhost:3001
BOT_RUNTIME_SHARED_SECRET=dev-bot-runtime-secret
BOT_RUNTIME_LOOP_INTERVAL_MS=15000
```

No `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```

## Docker

```powershell
docker compose up --build
```

Servicos:
- `postgres`
- `backend`
- `bots`
- `frontend`
- `adminer`

## Testes

```powershell
cd backend
npm run test:run

cd ..\frontend
npm run test:run

cd ..\bots\python
python -m unittest discover tests -v
```

## Smoke test minimo

1. acessar o frontend
2. entrar com `admin@botcrypto.com / admin123`
3. verificar `GET /health/ready`
4. confirmar `GET /api/dashboard/bots/worker-status`
5. abrir a tela `/bots`
6. deixar os bots em `paper`
7. acompanhar descoberta de pares -> decisao -> ordem -> dashboard -> logs/traces

## Frontend atual

Rotas principais:
- `/dashboard`
- `/bots`
- `/transacoes`
- `/treinamento`
- `/configuracoes`
- `/logs`
- `/perfil`

Realtime:
- Socket.IO autenticado por token
- eventos `subscribe:*` para dashboard, orders, logs, traces e training
- o frontend usa os eventos como gatilho de sincronizacao e refetch

## Documentacao complementar

- [CHECKLIST_HOMOLOGACAO.md](CHECKLIST_HOMOLOGACAO.md)
- [frontend/README.md](frontend/README.md)
- [backend/docs/00_backend_completo.txt](backend/docs/00_backend_completo.txt)
- [backend/docs/02_dashboard.txt](backend/docs/02_dashboard.txt)
- [backend/docs/03_configuracoes.txt](backend/docs/03_configuracoes.txt)
- [backend/docs/08_websocket.txt](backend/docs/08_websocket.txt)
- [backend/docs/01_autenticacao.txt](backend/docs/01_autenticacao.txt)
- [backend/docs/07_perfil.txt](backend/docs/07_perfil.txt)
- [bots/docs/bots_ia_especificacao.txt](bots/docs/bots_ia_especificacao.txt)
- [BACKLOG_PRIORIZADO.md](BACKLOG_PRIORIZADO.md)
