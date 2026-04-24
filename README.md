# Bot Cripto IA

Stack operacional para trading de cripto com:
- `frontend/`: painel React + Vite
- `backend/`: API Express + Prisma + PostgreSQL + Socket.IO
- `bots/`: camada Python independente para análise e decisão

## Arquitetura atual

O fluxo principal agora é:

1. o `backend` consolida contexto operacional, carteira, risco e mercado
2. a camada `bots` consome a fila via `/api/bot-runtime/*`
3. o runtime Python analisa múltiplas moedas por bot e devolve o resultado
4. o `backend` aplica a decisão, executa ordem `paper` ou `full_auto`, persiste FIFO/PnL/logs/traces e atualiza o dashboard

O backend ainda mantém worker interno como fallback, mas o modo recomendado é `bots -> backend`.

## Pré-requisitos

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+

## Subida local

### 1. Backend

```powershell
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

### 3. Bots

```powershell
cd bots\python
python -m pip install -r requirements.txt
set BOT_RUNTIME_BACKEND_BASE_URL=http://localhost:3001
set BOT_RUNTIME_SHARED_SECRET=dev-bot-runtime-secret
python service.py
```

## Variáveis importantes

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

## Docker

```powershell
docker compose up --build
```

Serviços:
- `postgres`
- `backend`
- `bots`
- `frontend`
- `adminer`

## Smoke test mínimo

1. acessar o frontend
2. entrar com `admin@botcrypto.com / admin123`
3. verificar `GET /health/ready`
4. confirmar `GET /api/dashboard/bots/worker-status`
5. deixar bots em `paper`
6. acompanhar descoberta de pares -> decisão -> ordem -> dashboard -> logs/traces

## Estado recomendado de uso

- usar primeiro em `paper`
- validar por alguns dias a qualidade dos sinais
- só depois considerar `full_auto`

## Documentação complementar

- [frontend/README.md](frontend/README.md)
- [backend/docs/00_backend_completo.txt](backend/docs/00_backend_completo.txt)
- [bots/docs/bots_ia_especificacao.txt](bots/docs/bots_ia_especificacao.txt)
