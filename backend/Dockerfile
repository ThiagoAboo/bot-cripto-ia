FROM node:20-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/backend

COPY backend/package*.json ./
COPY backend/prisma ./prisma

RUN npm ci

COPY backend ./

RUN npx prisma generate
RUN npm run build


FROM node:20-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/botenv/bin:${PATH}"

WORKDIR /workspace/backend

COPY backend/package*.json ./
COPY backend/prisma ./prisma
COPY backend/storage ./storage
COPY bots ../bots
COPY --from=builder /workspace/backend/node_modules ./node_modules
COPY --from=builder /workspace/backend/dist ./dist

RUN python3 -m venv /opt/botenv \
  && /opt/botenv/bin/pip install --no-cache-dir -r ../bots/python/requirements.runtime.txt \
  && /opt/botenv/bin/pip install --no-cache-dir torch==2.10.0 --index-url https://download.pytorch.org/whl/cpu \
  && ln -sf /opt/botenv/bin/python /usr/local/bin/python
RUN npx prisma generate

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
