# Backlog Priorizado

Este backlog resume o que ainda falta no projeto depois das correcoes ja aplicadas em bootstrap local, lint do frontend, documentacao principal e testes dedicados para `bots/python`.

## Alta prioridade

1. Manter `full_auto` bloqueado ate concluir homologacao longa em `paper`
   - A liberacao operacional continua condicionada a uma janela maior de validacao em conta simulada, mesmo com as travas de backend ja implementadas.
   - Impacto: risco operacional alto se houver promocao prematura para ordens reais.

## Itens concluidos nesta rodada

1. `init.ps1` alinhado com o `docker-compose.yml` atual e com o fluxo de `seed` do backend.
2. `npm run lint` restaurado no frontend com configuracao ESLint valida.
3. Documentacao principal atualizada para refletir `/bots`, Socket.IO, `pair discovery` e as regras de `full_auto`.
4. Preferencias de notificacoes push removidas do codigo e da documentacao.
5. Suite dedicada criada para `bots/python`, cobrindo `engine.py`, `runtime.py` e `service.py`.
6. Bundle de graficos dividido por biblioteca e componentes carregados sob demanda, eliminando o warning de chunk grande no build do frontend.
7. Vulnerabilidades de dependencias tratadas em `backend` e `frontend`, com `npm audit` zerado nos dois projetos.
8. Artefatos legados de documentacao removidos ou consolidados em `backend/docs`, com comandos e notas auxiliares alinhados ao estado atual do projeto.
