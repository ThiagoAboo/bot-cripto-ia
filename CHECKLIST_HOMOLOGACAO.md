# Checklist de Homologacao

Este documento padroniza a homologacao operacional dos bots antes de qualquer promocao de `paper` para `semi_auto` ou `full_auto`.

## Objetivo

Validar se um bot:

- executa o ciclo completo sem erro operacional recorrente
- gera decisoes coerentes com o contexto recebido
- mantem desempenho aceitavel em `paper`
- tem rastreabilidade suficiente para auditoria e analise posterior

## Quando usar

Use este checklist sempre que voce quiser:

- validar um bot novo
- revalidar um bot depois de treino ou ajuste de estrategia
- revisar um champion antes de promover para `semi_auto`
- decidir se um bot pode continuar bloqueado em `paper`

## Pre-condicoes

Antes de iniciar a homologacao, confirme:

1. o bot esta ativo e operando em `paper`
2. o champion atual esta sincronizado no dashboard
3. a janela de analise esta definida com data inicial e final explicitas
4. a janela tem amostra suficiente para avaliacao
5. a coleta sera feita para um bot por vez

## Janela recomendada

Use estas janelas como padrao:

1. leitura operacional rapida: `7 dias`
2. homologacao normal: `14 dias`
3. promocao para modos mais sensiveis: `30 dias` ou mais

Nao compare bots com janelas diferentes na mesma rodada de decisao.

## Passo a passo operacional

### 1. Abrir o relatorio de homologacao

Na tela `/bots`:

1. selecione o bot
2. abra o bloco `Homologacao Assistida`
3. informe `data inicial` e `data final`
4. aguarde a consolidacao do relatorio

### 2. Registrar o resumo executivo

Anote os campos abaixo exatamente como aparecem:

1. `verdict.status`
2. `verdict.summary`
3. `verdict.blockers`
4. `paperReadiness.status`
5. `paperReadiness.reasons`
6. `accuracyPercent`
7. `averageStrategyReturnPercent`
8. `averageEdgePercent`
9. `maxObservedDrawdownPercent`
10. `submittedTransactions`
11. `errorTraces`
12. `snapshotCoveragePercent`

### 3. Validar saude operacional

No mesmo relatorio, revise:

1. `operationalSummary`
2. `executionSummary`
3. `pairBreakdown`
4. `recentFindings`
5. `recentSnapshots`

Sinais positivos esperados:

- poucos erros operacionais
- boa cobertura de snapshots
- coerencia entre decisao, execucao e resultado
- distribuicao de pares sem concentracao estranha em um unico erro repetitivo

### 4. Exportar o pacote principal de traces

Na tela `/logs` em modo `traces`:

1. selecione o mesmo bot
2. use a mesma janela de datas do relatorio
3. clique em `Copiar para analise`
4. cole o JSON gerado em um local seguro ou diretamente no chat

Esse pacote deve sempre acompanhar a homologacao.

## Pacotes obrigatorios para analise comigo

Gere os pacotes abaixo sempre na mesma janela de datas.

### Pacote 1. Incidentes

Filtros:

1. `modo = traces`
2. `bot = bot em analise`
3. `onlyErrors = ligado`
4. `stage = vazio`

Acao:

1. clique em `Copiar para analise`
2. cole aqui no chat como `Pacote 1 - incidentes`

### Pacote 2. Resultado de execucao

Filtros:

1. `modo = traces`
2. `bot = bot em analise`
3. `onlyErrors = desligado`
4. `stage = execution_result`

Acao:

1. clique em `Copiar para analise`
2. cole aqui no chat como `Pacote 2 - execution_result`

### Pacote 3. Bloqueios

Gere um pacote separado para cada `stage` abaixo quando houver ocorrencia:

1. `execution_blocked_governance`
2. `execution_blocked_open_order`
3. `execution_blocked_exchange_filters`
4. `execution_invalid_plan`
5. `execution_skipped`

### Pacote 4. Contexto de decisao

Gere um pacote separado para cada `stage` abaixo:

1. `cycle_context_ready`
2. `runtime_plan_received`
3. `decision_persisted`

### Pacote 5. Runtime Python

Quando houver volume suficiente, gere pacotes destes `stages`:

1. `python_cycle_started`
2. `python_analysis_started`
3. `python_analysis_completed`
4. `python_cycle_completed`
5. `python_cycle_circuit_breaker`

## Ordem recomendada de investigacao

Siga esta ordem para nao perder tempo:

1. leia o `verdict` no relatorio
2. exporte `Pacote 1 - incidentes`
3. exporte `Pacote 2 - execution_result`
4. se houver bloqueios recorrentes, exporte `Pacote 3 - bloqueios`
5. se precisar entender a origem da decisao, exporte `Pacote 4 - contexto`
6. se ainda houver duvida de comportamento interno, exporte `Pacote 5 - runtime`

## Regras praticas de decisao

### Aprovado

O bot pode avancar para a proxima etapa quando:

1. `verdict.status = approved`
2. nao existem `blockers`
3. nao ha erro operacional recorrente
4. os snapshots mostram coerencia entre contexto, plano, decisao e execucao
5. o bot se manteve estavel durante a janela observada

### Em atencao

O bot deve continuar em observacao quando:

1. `verdict.status = attention`
2. a amostra ainda e pequena
3. existem erros pontuais, mas sem falha estrutural
4. ha bloqueios legitimos demais para uma conclusao confiavel

### Bloqueado

O bot nao deve ser promovido quando:

1. `verdict.status = blocked`
2. existem `blockers` criticos
3. ha erro operacional repetitivo
4. a execucao diverge com frequencia do plano sugerido
5. os traces mostram inconsistencia relevante de contexto, governanca ou execucao

## Regra de promocao operacional

A promocao recomendada e sempre gradual:

1. `paper`
2. `semi_auto`
3. `full_auto` com limite pequeno
4. ampliacao controlada de exposicao

Nunca promova direto para `full_auto` so porque o bot teve uma janela curta positiva.

## Template para colar no chat

Use este modelo ao me enviar uma rodada de homologacao:

```text
Bot: NOME_DO_BOT
Janela: AAAA-MM-DD ate AAAA-MM-DD

Resumo da homologacao:
- verdict.status:
- verdict.summary:
- verdict.blockers:
- paperReadiness.status:
- paperReadiness.reasons:
- accuracyPercent:
- averageStrategyReturnPercent:
- averageEdgePercent:
- maxObservedDrawdownPercent:
- submittedTransactions:
- errorTraces:
- snapshotCoveragePercent:

Pacote 1 - incidentes:
<cole o JSON>

Pacote 2 - execution_result:
<cole o JSON>

Pacote 3 - bloqueios:
<cole o JSON ou informe "sem ocorrencias">

Pacote 4 - contexto:
<cole o JSON>

Pacote 5 - runtime:
<cole o JSON ou informe "nao coletado">
```

## O que eu vou te devolver depois da analise

Quando voce colar os pacotes aqui, eu consigo te responder com:

1. parecer de homologacao: `aprovado`, `atencao` ou `bloqueado`
2. leitura tecnica dos traces e snapshots
3. causas provaveis dos incidentes
4. correcoes sugeridas no sistema ou nos bots
5. recomendacao de proxima etapa operacional

## Resultado esperado deste processo

Ao seguir este checklist, a homologacao deixa de depender de leitura manual dispersa e passa a usar:

- relatorio consolidado
- traces enriquecidos
- snapshots estruturados
- criterio repetivel de aprovacao
- base concreta para futuras melhorias e correcoes
