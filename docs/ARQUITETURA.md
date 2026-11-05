# Arquitetura do BarberBoard

Documento vivo: toda etapa que mudar a arquitetura atualiza este arquivo no mesmo commit.
Regras de negócio e forma de trabalhar ficam no [CLAUDE.md](../CLAUDE.md); o plano das etapas, em
[PLANO-MVP.md](PLANO-MVP.md).

## 1. Visão geral

O BarberBoard substitui a planilha de fechamento de caixa da barbearia. Ele guarda as **visitas**
(cada cliente atendido, com seus itens), as **despesas** e a **conferência de caixa** de cada dia, e
calcula faturamento, taxas, líquido, ticket médio e margem.

As visitas têm duas fontes:

- **Importação do App Barber** (Luiz, que fecha todas as comandas dele): exporta o Histórico de
  Comandas em .xlsx e envia em `/importar`. Cada comanda Fechada vira uma visita (source APP_BARBER).
  Como o arquivo só traz o total, a visita entra com itens pela regra de valor ou fica "a classificar".
- **Comandas a confirmar** (Paulo, que nunca fecha comanda no App Barber): as comandas dele vêm na
  mesma importação, mas viram `PendingConfirmation`, não visita. Ele confirma cada uma (pagamento,
  clube ou "não veio") na tela Lançar (Parte B); só então nasce o `Appointment`.
- **Lançamento manual** (cliente sem agendamento, ou qualquer visita que não passou pelo App Barber):
  `/visitas/nova`, já com os itens (source MANUAL).

Fechamento e dashboard leem só `Appointment`, sem distinguir a fonte. `PendingConfirmation` nunca
entra em nenhuma soma (por isso é uma tabela à parte, e não um status de `Appointment`: um filtro
esquecido inflaria o faturamento).

```
  App Barber (.xlsx)                          Barbeiro no celular
        │                                            │
        ▼                                            ▼
  /importar ── leitor .xlsx ── prévia ──┬──────────────► PendingConfirmation (Paulo, "a confirmar")
  (importers/)   (domain/)    confirmar │                     │ confirmar / clube (Lançar, Parte B)
                                        │            ┌────────┘
                                        │            │     /visitas/nova (lançamento manual)
                                        ▼            ▼            │
                                        ┌─────────────────────────┘
                         ┌──────────────────────────────────┐
                         │  Appointment + AppointmentItem   │
                         │  (Postgres / Supabase)           │
                         └──────────────────────────────────┘
                              │              ▲
           PENDING (sem itens)│              │ itens (regra, um toque ou editor)
                              ▼              │
                         /classificar ───────┘
                              │
                              ▼
        /fechamento (dia) · /despesas (mês) · /dashboard (mês/ano, Etapa 6)
```

## 2. Stack e versões

| Item | Versão | Observação |
|---|---|---|
| Node.js | 24 | |
| pnpm | 12.16.1 | `packageManager` no package.json; scripts de build liberados em `pnpm-workspace.yaml` |
| Next.js | 16.4.4 | App Router, `cacheComponents` e `partialPrefetching` ligados |
| React | 19.3.0 | |
| Prisma (CLI e client) | 7.10.1 (fixado) | client gerado em `src/generated/prisma` (gitignored); adapter `@prisma/adapter-pg` 7.10.1 |
| PostgreSQL | Supabase (dev); 17 nos testes | |
| TypeScript | 5 | |
| Tailwind CSS | 4 | shadcn/ui (estilo base-nova, `@base-ui/react`) |
| zod | 4 | validação das Server Actions |
| date-fns / @date-fns/tz | 4 / 1 | fuso `America/Sao_Paulo` |
| fflate / fast-xml-parser | 0.8.3 / 5.11.2 (fixados) | leitor .xlsx próprio |
| Recharts | 3 | gráficos do dashboard (Etapa 6) |
| tsx | 4 | seed e test runner |

Versões com número exato (sem `^`) foram fixadas de propósito: Prisma porque a tag `latest` do npm
apontou para uma versão de teste (8.0 RC), e o leitor .xlsx para não mudar de comportamento sem aviso.

## 3. Estrutura de pastas

```
prisma/              schema.prisma, migrations/, seed.ts
prisma.config.ts     CLI do Prisma usa DIRECT_URL; seed configurado aqui
next.config.ts       redirect "/" → /fechamento, limite de upload, origens do Codespace
scripts/test-db.sh   Postgres temporário em Docker para pnpm test:db
docs/                ARQUITETURA.md, PLANO-MVP.md (versionados); referencia/ (NÃO versionado)
src/
  app/               rotas (páginas, error.tsx) e Server Actions (actions.ts por rota)
  components/        componentes de tela, por área: closing/, classify/, import/, items/, nav/;
                     ui/ = shadcn; parts.tsx e route-error.tsx = peças comuns
  domain/            cálculos e regras puras (sem Prisma, sem React, sem I/O)
  schemas/           schemas zod dos formulários (texto do form → dados tipados)
  server/            acesso ao banco (Prisma): leituras para as telas e escritas com regras
  importers/         leitura de arquivos externos (hoje: app-barber/)
  lib/               utilitários sem regra de negócio: db, money, dates, labels, log, utils
  generated/prisma/  client do Prisma (gerado; não editar, não versionado)
```

| Pasta | Responsabilidade |
|---|---|
| `app/` | Montar a tela e receber o formulário. Páginas leem o banco dentro de `<Suspense>`. Actions são finas: validam com zod, chamam `server/`, chamam `revalidatePath("/", "layout")` quando muda algo que a navegação mostra, e redirecionam ou devolvem `{ error }`. |
| `components/` | Exibição e interação. Client Components só quando precisam de estado (editor de itens, formulários com `useActionState`, navegação com `usePathname`). |
| `domain/` | Regras e contas: preço/taxa (`pricing`), regras de valor (`price-rules`), itens da visita (`visit-items`), prévia da importação (`import-preview`), relatórios (`reports`), fechamento (`closing`), catálogo, despesas. Tudo testável sem banco. |
| `schemas/` | Conversão e validação da entrada (ex.: "45,90" → 4590; JSON do editor de itens → `ItemInput[]`). |
| `server/` | Única camada que usa o Prisma. Recebe o client como parâmetro (`db`), o que permite testar contra um Postgres temporário. Lança erros de negócio com mensagem pronta para a tela (`VisitItemsError`, `CatalogError`, `ExpenseError`, `ImportFileError`, `ImportStateError`). |
| `importers/` | Ler o .xlsx do App Barber e normalizar as linhas. Não sabe nada de banco. |
| `lib/` | `getDb()` (client criado no primeiro uso), dinheiro, datas no fuso de Brasília, rótulos pt-BR, log de erro sem dados. |
| `prisma/` | Schema, migrations (nunca editar uma existente) e seed (só dev). |

## 4. Camadas e regras de dependência

```
componente (components/, app/ page)
   │  form action
   ▼
Server Action (app/**/actions.ts)
   │  valida com
   ▼
schema zod (schemas/)
   │  dados tipados
   ▼
server/ (Prisma, transações, erros de negócio)
   │  usa
   ▼
domain/ (puro)            importers/ (puro, lê arquivos)          lib/ (utilitários)
```

| Camada | Pode importar | Não pode importar |
|---|---|---|
| `domain/` | outros `domain/`, `lib/money`, `lib/dates` quando preciso; **tipos** de `importers/` (hoje só `import-preview.ts`) | Prisma, React, `server/`, `app/`, `components/`, qualquer I/O |
| `importers/` | `lib/`, `domain/payments` | Prisma, React, `server/` |
| `schemas/` | zod, `lib/`, `domain/` (constantes e tipos) | Prisma, `server/` |
| `server/` | Prisma (tipos gerados), `domain/`, `importers/`, `lib/` | React, `app/`, `components/` |
| `app/` (actions) | `server/`, `schemas/`, `lib/` | Prisma direto |
| `app/` (páginas) e `components/` | `server/` (leituras, em Server Components), `domain/`, `lib/` | Prisma direto |
| Client Components (`"use client"`) | `domain/`, `lib/`, actions; **apenas tipos** de `server/` (`import type`) | código de `server/` em tempo de execução, `getDb()` |

Outras regras:

- Função chamada por Server Component não pode morar em módulo `"use client"` (o Next proíbe). Ex.:
  as linhas do editor de itens estão em `components/items/editor-rows.ts`, sem `"use client"`.
- Erros inesperados vão para o log só com nome e código (`lib/log.ts`): mensagens do Prisma podem
  conter dados da consulta, inclusive a Obs (que pode ter nome de cliente).
- Server Actions: `TODO(login)` marca onde a sessão será verificada (Etapa 7).

## 5. Modelo de dados

Convenções de todas as tabelas:

- Dinheiro em **centavos** (`Int`). Taxas em **basis points** (`Int`, 199 = 1,99%).
- Instantes em `timestamptz`; dias de calendário em `@db.Date` (gravados como meia-noite UTC; ver
  `toDbDate`).
- Nomes em snake_case no banco (`@@map`), camelCase no código. IDs `cuid()`.
- **RLS habilitado em todas as tabelas, sem policies** (migration `enable_rls`). Tabela nova precisa
  do mesmo; `server/db-security.db.test.ts` falha se alguma ficar sem.

| Model | Papel | Invariantes |
|---|---|---|
| `Barber` | Barbeiro. `appBarberCode` liga à coluna Profissional do App Barber ("PH", "L.F"). `importsFromAppBarber = false` (Paulo) = as comandas dele viram `PendingConfirmation` na importação. | código único; desativar em vez de apagar |
| `Service` | Serviço do catálogo: `category` MAIN (Serviço) ou EXTRA (Extra), preço padrão. | nome único |
| `Product` | Produto vendido; `costCents` opcional. | nome único; sem custo = fora da margem |
| `PaymentFee` | Taxa da maquininha por forma de pagamento (PIX, CASH, DEBIT, CREDIT). | uma linha por forma |
| `Appointment` | Visita (um cliente atendido). `source` MANUAL ou APP_BARBER; `externalId` = nº da comanda. `performedAtApproximate = true` quando o horário não foi informado (lançamento de dia passado sem hora): conta em todos os totais, mas o dashboard o exclui do mapa de dias/horários. `subscriptionVisit = true` = visita de clube: total 0, itens da regra a preço 0; conta em clientes e no ranking, fica fora do ticket médio (Parte B). | `totalCents` nunca muda depois de criada (exceto edição de visita MANUAL); `feeBps/feeCents/netCents` congelados; `@@unique([source, externalId])` impede importar duas vezes; **CLASSIFIED ⇒ itens somam o total; PENDING ⇒ nenhum item** |
| `AppointmentItem` | Serviço ou produto da visita. | **CHECK escrita à mão**: exatamente um entre `service_id` e `product_id`; `unitPriceCents` e `unitCostCents` congelados |
| `PriceRule` / `PriceRuleItem` | Regra de valor: "comanda de R$ X = estes itens". Uma regra ativa para o valor → itens automáticos. | soma dos itens = `amountCents` (validado em `domain/price-rules.ts`); **CHECK escrita à mão** em `price_rule_items` (serviço XOR produto); editar regra não muda visitas já classificadas |
| `ExpenseCategory` | Categoria de despesa (Aluguel, Produtos, Luz, Comissão, Outros...). | nome único; desativar em vez de apagar |
| `Expense` | Despesa: dia (`@db.Date`), categoria, valor, barbeiro opcional (comissão). | valor > 0 |
| `CashClosing` | Conferência de caixa do dia: fundo de troco, esperado, contado, diferença. | um por dia (`date` único); o esperado é recalculado no servidor ao salvar |
| `PendingConfirmation` | Comanda "a confirmar" de barbeiro com `importsFromAppBarber = false`: comanda (`externalId`, único), horário, valor, Obs, pagamento sugerido (se veio Fechada), `status` (PENDING, CONFIRMED, CLUB, NO_SHOW, CANCELLED) e `appointmentId` quando vira visita. | **nunca entra em soma**; só PENDING muda na reimportação (horário/valor ou CANCELLED); os demais status nunca voltam |
| `ImportBatch` | Uma importação do App Barber: contagens (inclusive `toConfirmCount`) e, enquanto PENDING, as linhas normalizadas em `meta`. | ao concluir, as linhas saem do `meta` (ficam contagens, erros e avisos); nunca guarda Cliente/Cadastro/Finalização |

As CHECKs escritas à mão estão no fim das migrations `init` e `app_barber_import`. O Prisma não as
conhece; por isso o teste de "drift" (`prisma migrate diff`) não as acusa, e elas são cobertas por
testes de banco.

## 6. Fluxos principais

### Importação (`/importar` → `/importar/[id]`)
1. **Upload** (Server Action, até 4 MB): `importers/app-barber/xlsx-reader.ts` lê só o workbook, os
   relacionamentos, o sharedStrings e a primeira aba (o `styles.xml` nunca é aberto).
2. **Normalização** (`normalize-row.ts`): colunas por nome, status, data no fuso de Brasília, valor em
   centavos, pagamento, profissionais; erros por linha (sem conteúdo da Obs).
3. **Prévia** (`domain/import-preview.ts`, puro): cada comanda vai para importar (com itens pela regra
   ou "a classificar"), já importada, cancelada, "a confirmar" (Aberta de qualquer data ou Fechada só
   de barbeiro com `importsFromAppBarber = false`; pendência existente PENDING é atualizada ou
   cancelada, resolvida nunca volta), pendente (Aberta de dia anterior), em andamento (Aberta de
   hoje com horário passado; só exibida, não gravada no lote), agendada, revisar (vários
   profissionais) ou erro. Comanda Fechada com "club" na Obs e valor > 0 gera aviso. Em vários profissionais, os barbeiros manuais saem da conta: se sobra um
   único que importa, a comanda entra com ele e gera um aviso ("confira se o Paulo também lançou").
   O "+N" sem nome só é resolvido assim quando não há outro barbeiro que importa. Grava um
   `ImportBatch` PENDING.
4. **Confirmação** (`server/import/service.ts`): numa transação que trava o lote, refaz a prévia com o
   banco atual, cria visitas e itens, congela a taxa do catálogo, cria/atualiza/cancela as
   `PendingConfirmation` e marca o lote COMPLETED.
   Reimportar não duplica; comanda que era Aberta e virou Fechada entra na próxima vez.

### Classificação e correção (`/classificar`, `/visitas/[id]`, `/regras`)
- Toda escrita de itens fora da importação passa por `server/appointments.ts`, em transação, com a
  visita travada (`FOR UPDATE`): os itens precisam fechar com o total, o custo do produto é congelado
  e a visita vira CLASSIFIED.
- Um toque: regra do valor ou serviço com o mesmo preço. "Aplicar a todas de R$ X" usa
  `updateManyAndReturn` filtrando PENDING, então cliques simultâneos não duplicam itens.
- "Salvar como regra" é recusado se o valor já tem regra ativa (evita ambiguidade na importação).

### Lançamento manual (`/visitas/nova`)
- `server/manual-visits.ts`: total = soma dos itens; taxa do catálogo congelada; source MANUAL e
  CLASSIFIED. Só visita MANUAL pode ser editada por inteiro ou excluída (a importada voltaria na
  próxima importação).

### Fechamento do dia (`/fechamento`, tela inicial)
- `server/closing.ts` busca as visitas do dia de calendário em Brasília (`dayBoundsBR`).
- `domain/closing.ts` calcula bruto por grupo (com "A classificar"), taxas, líquido, ticket, totais
  por forma de pagamento e por barbeiro.
- Conferência de caixa: esperado = fundo de troco + dinheiro do dia, recalculado no servidor; se o
  dinheiro do dia mudar depois, a tela avisa "fechamento desatualizado".
- Comandas a confirmar do dia aparecem num cartão à parte ("X comandas do Paulo a confirmar (R$ Y)"),
  fora de todas as somas; o link para confirmar aparece quando a tela /lancar existir.

### Dashboard (`/dashboard`, Etapa 6, ainda não implementado)
- Planejado em `domain/periods.ts`: resumo do período, comparativo com os mesmos dias do mês anterior,
  média dos últimos N meses, rankings e mapa de dias × horários. Ver PLANO-MVP.md.
- O mapa de dias × horários exclui visitas com `performedAtApproximate = true`; os totais as incluem.

## 7. Decisões técnicas e porquês

| Decisão | Por quê |
|---|---|
| Leitor .xlsx próprio (fflate + fast-xml-parser) | O `styles.xml` da exportação do App Barber tem um `<fill/>` vazio que bibliotecas como o openpyxl rejeitam; read-excel-file e exceljs leem esse arquivo. O leitor próprio nunca o abre e tem limites contra arquivo zip malicioso. |
| Centavos e basis points inteiros | Sem erro de arredondamento de ponto flutuante; arredondamento explícito só na taxa e no ticket. |
| Preço, custo e taxa congelados na visita | Mudar o catálogo não pode reescrever o histórico. |
| Visita PENDING sem itens + grupo "A classificar" | O App Barber exporta só o total; o bruto nunca fica menor que o dinheiro que entrou. |
| Cache Components (`cacheComponents: true`) | Padrão do Next 16. Consequências: leituras do banco dentro de `<Suspense>`, `await connection()` antes de `new Date()`, e a navegação (que usa `usePathname`) também fica em `<Suspense>`. |
| Fuso de Brasília em tudo que é "dia" | O servidor roda em UTC (Vercel); uma visita às 23:30 tem que cair no dia certo. Funções em `lib/dates.ts`. |
| `/` redirecionado no `next.config.ts` | Uma página que só chama `redirect()` gera aviso de validação no Next 16. |
| `getDb()` criado no primeiro uso | O `next build` funciona sem `DATABASE_URL`. |
| RLS em todas as tabelas, sem policies | O Supabase expõe o schema `public` pela Data API para a chave publishable; o Prisma conecta como dono e não é afetado. |
| Formulários por Server Action, retorno pela URL ou `useActionState` | Funcionam sem JavaScript e permitem testar as telas por HTTP, sem navegador. |
| `allowedOrigins` só dentro do Codespace | O proxy do Codespace reescreve o Origin para `localhost:3000`; fora do Codespace a proteção CSRF padrão continua. |

## 8. Testes

| Comando | O que roda | Banco |
|---|---|---|
| `pnpm test` | `src/**/*.test.ts` com o test runner do Node (via tsx): domain, schemas, lib, importers (fixture .xlsx sintética e, se existir, contagens da exportação real), helpers de server e navegação | nenhum; os `*.db.test.ts` são pulados |
| `pnpm test:db` | `scripts/test-db.sh`: sobe Postgres 17 em Docker, aplica as migrations, roda `src/**/*.db.test.ts` **um arquivo por vez** e descarta o container | temporário, local |

- Testes de banco só rodam se `TEST_DATABASE_URL` for `localhost`/`127.0.0.1` (proteção contra apontar
  para o Supabase).
- A Obs nunca é impressa nem comparada com dados reais nos testes.
### Testes de tela (ponta a ponta, sem navegador)
- `pnpm build` + `pnpm start` com `DATABASE_URL` apontando para um Postgres em Docker com o seed.
- Formulários enviados por HTTP: o React gera os campos ocultos da Server Action, então o envio
  funciona sem JavaScript.
- Extraia os campos ocultos do HTML **cru** (não troque `&quot;` por aspas antes: os valores são JSON).
- Com Partial Prerender, partes da página chegam depois: `<template id="P:x">` no lugar e o conteúdo
  num `<div hidden id="S:x">` mais adiante no HTML (x em base 36: "7", "c", "1a"...).
- Confira os números da tela contra um cálculo direto em SQL.

## 9. Ambientes

| Ambiente | Banco | Observações |
|---|---|---|
| Testes | Postgres em Docker | criado e descartado a cada execução |
| Dev | Supabase (projeto atual) | `pnpm dev` no Codespace; `DATABASE_URL` (pooler 6543) na app, `DIRECT_URL` (5432) no CLI |
| Produção (futura) | Supabase separado (São Paulo) + Vercel (gru1) | criada na Etapa 8, com login (Etapa 7) obrigatório antes |

Nunca rodar em produção:

- `prisma/seed.ts` (apaga todos os dados; exige `SEED_ALLOW_RESET=true`). Produção usará um bootstrap
  idempotente (Etapa 8).
- `prisma migrate dev` (pode propor resetar o banco). Em produção, só `pnpm db:deploy`.
- `pnpm test:db` ou qualquer `TEST_DATABASE_URL` apontando para o Supabase.
