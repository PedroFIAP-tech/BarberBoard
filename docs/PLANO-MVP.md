> Plano aprovado em 05/11/2026. O andamento de cada etapa (feito/pendente) fica no roadmap do CLAUDE.md.

# BarberBoard: plano completo para terminar o MVP

Leia o CLAUDE.md antes de tudo: ele é a fonte da verdade para regras de negócio, stack, formato do
App Barber e forma de trabalhar. Este documento diz O QUE construir e em que ordem. Se algo aqui
contradisser o CLAUDE.md, pare e pergunte.

## A. Estado atual (já pronto, não refazer)
- Next.js 16 (App Router, cacheComponents ativo) + Prisma 7 + Supabase (projeto atual = DEV) + pnpm.
- Schema com 3 migrations: barbeiros (appBarberCode), serviços (MAIN/EXTRA), produtos (custo),
  taxas por forma de pagamento, visitas (Appointment) com itens (AppointmentItem, CHECK serviço XOR
  produto), classificação CLASSIFIED/PENDING, regras de valor (PriceRule/PriceRuleItem), despesas,
  fechamento de caixa (CashClosing), lotes de importação (ImportBatch).
- Lógica pura em src/domain: pricing.ts (taxa, totais), reports.ts (faturamento por grupo com
  "A classificar", ticket médio e por grupo, margem de produtos, contagem de extras),
  price-rules.ts (validar regra, sugerir por valor, itens da regra), import-preview.ts.
- Importação do App Barber completa: /importar (upload, prévia, revisão, confirmar, descartar).
- Testes: `pnpm test` (unidade) e `pnpm test:db` (Postgres em Docker). Seed com SEED_ALLOW_RESET e
  SEED_VISITS=false.

## B. Regras técnicas que valem para todas as etapas
1. Uma etapa por vez. Em cada etapa: plano curto → espere aprovação → código → testes → mostre o
   resultado e PARE. Commit e push só quando eu pedir.
2. Camadas: src/domain (puro, testado, sem Prisma/React) → src/server (único que usa Prisma, recebe
   o client como parâmetro) → src/app (rotas e Server Actions finas: validam com zod, chamam
   src/server, redirecionam/atualizam) → src/components.
3. Next 16 é diferente do que você conhece: leia node_modules/next/dist/docs antes de usar uma API.
   Com cacheComponents: leituras do banco dentro de <Suspense>, `await connection()` antes de
   `new Date()`, `params`/`searchParams` são Promise. Middleware agora se chama proxy (proxy.ts).
4. Dinheiro sempre em centavos (Int); entrada do usuário via parseBRLToCents; exibição via formatBRL.
   Datas e "dia" sempre no fuso America/Sao_Paulo (src/lib/dates.ts). @db.Date via toDbDate.
5. Preço, custo e taxa congelados no item/visita. Visita CLASSIFIED: itens somam o total. PENDING:
   sem itens. Toda escrita de itens passa por uma função de src/server que garante isso em transação.
6. Privacidade: a Obs (Appointment.notes) pode ter nome de cliente: nunca em logs nem em testes.
   Erros inesperados nas actions são logados só por nome/código. Cliente/Cadastro/Finalização do
   App Barber nunca são lidos.
7. Mobile-first (iPad e celular): coluna única até ~640px, alvos de toque de no mínimo 44px, <select> e
   <details> nativos quando servirem, botão principal fixo no rodapé com safe-area.
8. Nunca rodar nada no Supabase sem eu pedir. Validar em Postgres temporário: `pnpm test:db` e,
   para telas, build + start apontando para um Postgres em Docker com o seed, enviando os
   formulários por HTTP (o React gera os campos de action, funciona sem JavaScript).
9. Toda tabela nova: migration nova (nunca editar migration existente) + RLS habilitado (ver Etapa 0).
10. Cada etapa termina com: tsc, lint, pnpm test, pnpm test:db e build passando; CLAUDE.md atualizado
    (roadmap e regras novas).

## C. Etapas

### Etapa 0: Arrumação (pequena)
- Commitar as correções pendentes: allowedOrigins do Codespace no next.config.ts e
  --font-sans no globals.css.
- Segurança do Supabase: a Data API do Supabase expõe as tabelas do schema public para quem tiver
  a URL e a chave publishable. Criar uma migration que habilita RLS em TODAS as tabelas, sem policies
  (o Prisma conecta como dono e não é afetado). Teste de banco garantindo que toda tabela do public
  tem RLS. Registrar no CLAUDE.md a regra "tabela nova = RLS habilitado".
- Navegação: barra inferior fixa no celular com Fechamento · Classificar · Importar · Mais
  (Mais = Catálogo, Despesas, Dashboard). Itens das telas ainda não feitas ficam ocultos.
- CLAUDE.md: roadmap com a ordem desta lista.

### Etapa 1: Fechamento do dia (/fechamento): substitui a planilha
- Rota /fechamento?dia=aaaa-mm-dd (padrão: hoje em Brasília), setas dia anterior/seguinte,
  seletor de data. `/` redireciona para /fechamento.
- src/domain/closing.ts (puro e testado):
  - resumo do dia a partir das visitas e itens: bruto por grupo (Serviço, Extra, Produto,
    A classificar) via reports.ts, taxas, líquido, nº de visitas, ticket médio e por grupo;
  - totais por forma de pagamento (bruto, taxa, líquido, quantidade) e por barbeiro;
  - conferência: esperado em dinheiro = fundo de troco + visitas em dinheiro; diferença =
    contado − esperado.
- Conferência de caixa: formulário com fundo de troco e valor contado (R$), gravando em CashClosing
  (um por dia, upsert). Se as visitas do dia mudarem depois de fechado (ex.: nova importação), mostrar
  "fechamento desatualizado" comparando o esperado salvo com o atual, e permitir refazer.
- Lista das visitas do dia (hora, barbeiro, itens ou "a classificar", pagamento, valor). Tocar abre a
  visita (detalhe somente leitura por enquanto; edição vem na Etapa 2).
- Dia sem visitas: estado vazio ("Sem movimento", "fecha na segunda").
- Testes: domínio (dia vazio, só pendentes, cortesia R$ 0, só produto, várias formas de pagamento,
  arredondamento) e banco (limites do dia em Brasília: visita 23:30 entra no dia certo; upsert do caixa).

### Etapa 2: Classificar e corrigir visitas (/classificar, /visitas/[id], /regras)
- src/server/appointments.ts: `setAppointmentItems(db, id, items | ruleId)`. Em transação, troca
  todos os itens, valida soma = total, congela custo dos produtos, define priceRuleId (ou null) e
  marca CLASSIFIED. `unclassify` volta para PENDING sem itens. Ambos testados no banco.
- /classificar: visitas PENDING agrupadas por valor (maior grupo primeiro), cada uma com botões grandes:
  regras daquele valor + serviços do catálogo com o mesmo preço + "outro" (editor de itens).
  "Aplicar a todas de R$ X" por grupo. Checkbox "salvar como regra" quando o valor não tem regra.
- /visitas/[id]: detalhe e CORREÇÃO de itens de qualquer visita (ex.: R$ 40 que foi Barba e entrou
  como Corte). Editor de itens: adicionar serviço/produto, preço editável, quantidade; mostra
  "faltam R$ X / sobram R$ X" e só salva quando fecha com o total. Obs aparece aqui (só na tela).
- /regras: listar, criar, editar e desativar regras de valor (validatePriceRule). Ao salvar uma regra de
  R$ X, oferecer "aplicar às N visitas pendentes de R$ X".
- Indicador de pendentes na navegação (badge com a contagem).

### Etapa 3: Catálogo e taxas (/catalogo)
- Abas Serviços, Produtos e Taxas.
- Serviços: nome, Principal/Extra, preço, duração (opcional), ativo, ordem.
- Produtos: preço de venda, custo (opcional), margem em R$ e % por produto (função pura nova em
  domain, testada; sem custo = "—").
- Taxas: % por forma de pagamento (entrada em %, gravada em bps).
- Adicionar, editar, desativar. Mudar preço nunca altera o histórico. Desativar serviço usado por regra
  ativa: avisar e listar as regras afetadas. Nomes únicos com mensagem amigável.
- Validação com zod compartilhada entre formulário e action (src/schemas).

### Etapa 4: Despesas (/despesas)
- Lista do mês (?mes=aaaa-mm), total por categoria, lançar, editar e excluir despesa (data, categoria,
  valor, descrição, barbeiro opcional para comissão).
- Gerenciar categorias (adicionar e desativar; Aluguel, Produtos, Luz, Comissão e Outros já existem).
- Testes de domínio para o total por categoria e de banco para o @db.Date no dia certo.

### Etapa 5: Lançamento manual de visita (/visitas/nova)
- Ação secundária (botão no Fechamento): data/hora (padrão agora), barbeiro, itens do catálogo
  (preço editável), forma de pagamento, observação. source MANUAL, CLASSIFIED, taxa congelada,
  calcAppointmentTotals.
- Editar e excluir visita manual. Visita importada não se exclui (só corrige itens), porque voltaria
  na próxima importação.

### Etapa 6: Dashboard (/dashboard)
- Antes: ler docs/referencia/PLANILHA-INDICADORES.xlsx (se existir) só pela lógica e apontar
  indicadores que faltem. Ignorar Recorrência x Avulso e Taxa de ocupação.
- src/domain/periods.ts (puro e testado):
  - summarizePeriod(visitas, itens, despesas) → bruto e ticket por grupo, nº de visitas, taxas,
    despesas, lucro líquido (receitas − despesas − taxas), margem de produtos;
  - compareValue(atual, anterior) → delta em centavos e % (null se anterior = 0);
  - comparativo mês corrente × MESMOS DIAS do mês anterior (1–5/nov × 1–5/out);
  - média dos últimos N meses fechados (mês corrente fora; ticket = soma do bruto / soma de visitas;
    informa quantos meses existiam);
  - ranking de serviços e extras (quantidade e valor) e ranking por regra (priceRuleId, nomes como
    no App Barber);
  - mapa dia da semana × hora (contagem e valor) em Brasília.
- Telas: mensal (?mes=) e anual (?ano=). Cartões de KPI com seta e % vs período anterior, gráfico de
  barras por dia/mês (Recharts, Client Component), pizza ou barras Serviço/Extra/Produto, tabela de
  rankings, mapa de calor de dias e horários. "A classificar" sempre visível quando > 0.
- Até ~3 mil visitas por ano: carregar o período e calcular no domínio; não otimizar antes de medir.

### Etapa 7: Login (obrigatório antes de produção)
- Supabase Auth com e-mail e senha (@supabase/ssr), uma conta da barbearia criada pelo painel do
  Supabase, sem tela de cadastro.
- proxy.ts protege todas as rotas (exceto /login e assets). Toda Server Action verifica a sessão
  (trocar os TODO(login)). Logout no menu Mais.
- Sessão longa (o barbeiro não pode ficar redigitando senha no celular).
- Testes: action sem sessão é recusada; rota protegida redireciona para /login.

### Etapa 8: Produção
- Script prisma/bootstrap.ts IDEMPOTENTE (upsert, nunca apaga): barbeiros com appBarberCode,
  catálogo, regras de valor, taxas e categorias de despesa, sem produtos fictícios. O seed atual
  continua só para dev.
- Checklist para eu executar (você prepara e me guia, não executa sem eu pedir):
  1. Criar o projeto Supabase de produção (região São Paulo), pegar as URLs pooler e direta.
  2. `prisma migrate deploy` + bootstrap em produção.
  3. Vercel: importar o repo, região gru1, variáveis DATABASE_URL, DIRECT_URL e as do Supabase
     Auth; build com prisma generate (postinstall já existe).
  4. Criar o usuário da barbearia no Supabase Auth.
  5. Primeira importação real e conferência com o App Barber.
- PWA: app/manifest.ts com nome, cores e ícones, para "Adicionar à tela de início" no celular.
- Backup: documentar no CLAUDE.md como exportar os dados (plano gratuito do Supabase não tem
  restauração para um ponto no tempo).

## D. Decisões em aberto (use o padrão até eu mudar)
| Assunto | Padrão |
|---|---|
| Preços finais (reunião com o barbeiro) | Catálogo e regras atuais; editáveis na Etapa 3 |
| Paulo não finaliza comandas no App Barber | Mantém "só Fechada entra"; pendentes aparecem por barbeiro |
| Domingo | Trata como dia normal; mostra se houver visitas |
| Clube de assinatura / visita R$ 0 | Conta como visita com total 0; no dashboard, mostrar à parte "visitas R$ 0" |
| Comissão | Fora (0%); despesa manual na categoria Comissão |
| Planilha de indicadores | Se não estiver em docs/referencia na Etapa 6, perguntar antes |

## E. Para cada etapa, me entregue
1. Resumo do que foi feito e de qualquer desvio do plano.
2. Resultado dos testes (unidade, banco, build) e da verificação das telas em Docker.
3. Código completo dos arquivos alterados.
4. Como testar no preview do Codespace (o `pnpm dev` usa o Supabase de DEV).
5. Pare e espere minha aprovação antes da próxima etapa.
