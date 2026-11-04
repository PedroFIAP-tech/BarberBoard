# Projeto: BarberBoard

## Contexto
Estou criando o BarberBoard, um web app de fechamento de caixa para uma barbearia.
Hoje o barbeiro agenda os clientes pelo App Barber (app de terceiros, que vai continuar sendo usado)
e faz o controle financeiro numa planilha. O BarberBoard vai substituir essa planilha com
fechamento de caixa e dashboard. As visitas entram principalmente pela importação do histórico de
comandas exportado do App Barber (formato descrito abaixo); o lançamento manual é secundário.

As planilhas de referência ficam em docs/referencia/ e não são versionadas:
- RELATORIO-DIARIO.xlsx e PLANILHA-INDICADORES.xlsx: modelos de outras barbearias, com nomes e valores
  fictícios. Vale só a lógica delas; não usar nomes nem valores no código ou no seed.
- AppBarber-Historico-30dias.xlsx: exportação real do App Barber, com dados de clientes.
  Nunca copiar o conteúdo dela para o código, o seed ou os commits.

## Stack
- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Prisma 7 + PostgreSQL no Supabase. O projeto Supabase atual é o banco de DEV; produção será
  um projeto Supabase separado, criado no deploy.
- Recharts para os gráficos
- date-fns (+ @date-fns/tz, fuso America/Sao_Paulo) e zod
- pnpm
- Deploy futuro na Vercel
- Interface em português (pt-BR), valores em R$, mobile-first (o barbeiro vai usar no celular)

## Regras de negócio
- Barbeiros: 2, Paulo e Luiz. O Luiz atende a maior parte das visitas (~75%).
  Barber.appBarberCode liga o barbeiro à coluna "Profissional" do App Barber
  (Paulo → "PH", Luiz → "L.F").
- Dias: fecha na segunda. Domingo: ainda a confirmar (a exportação de 30 dias não tem nenhuma
  comanda no domingo).
- Comissão: ainda não definida. A categoria de despesa "Comissão" existe para lançamento manual.
- Visita (Appointment) = um cliente atendido. Cada serviço ou produto da visita é um AppointmentItem.
  Uma visita só com produto também conta como cliente.
- Catálogo real (App Barber → Cadastros → Serviços), preços ainda a padronizar com o barbeiro:
  - Principais (MAIN): Corte R$ 40 · Barba R$ 40 · Relaxamento R$ 30
  - Extras (EXTRA): Sobrancelha R$ 10 · Selagem R$ 60
  O App Barber não tem produtos cadastrados; os produtos do seed são fictícios (só para testar margem).
- O faturamento é sempre quebrado em 3 grupos:
  - Serviço: itens com serviço de categoria MAIN
  - Extra: itens com serviço de categoria EXTRA
  - Produto: itens com produto
- Visita importada do App Barber chega só com o total. Enquanto não tem itens, fica "a classificar"
  (classification = PENDING) e entra no bruto à parte, como "A classificar".
- Bruto = Serviço + Extra + Produto + A classificar. Sempre calculado, nunca digitado.
- Ticket médio = bruto / nº de visitas (0 quando não há visitas). No mês ou no ano é o bruto do
  período dividido pelas visitas do período, não a média dos tickets diários.
  Ticket por grupo: Serviço, Extra e Produto, cada um dividido pelo mesmo nº de visitas.
- Taxas da maquininha em basis points por forma de pagamento.
- Preço, custo e taxa ficam congelados no lançamento (AppointmentItem.unitPriceCents/unitCostCents,
  Appointment.feeBps): mudar o catálogo não altera o histórico.
- Produtos têm preço de custo opcional. Margem = venda - custo; produto sem custo fica fora da margem.
- Lucro líquido = receitas - despesas - taxas.
- Regras de valor (PriceRule): comanda de R$ X = estes itens. No App Barber os combos são UM serviço
  ("Corte e sobrancelha"); aqui viram itens para manter a quebra Serviço/Extra. Valor com uma
  regra ativa → itens automáticos; sem regra ou com mais de uma → "a classificar". Regras atuais:
  R$ 40 Corte · R$ 50 Corte e sobrancelha (40 + 10) · R$ 80 Corte e barba (40 + 40) ·
  R$ 90 Corte barba e sobrancelha (40 + 40 + 10) · R$ 60 Selagem · R$ 30 Relaxamento · R$ 10 Sobrancelha.
  R$ 40 sugere Corte mesmo a Barba custando R$ 40 (barba é rara); o barbeiro corrige quando for barba.
  Catálogo e regras precisam ser fáceis de editar: os preços ainda vão mudar.
- Comanda Fechada de R$ 0,00 entra como visita de total 0 (cortesia ou visita de assinante).
- Desativar (active = false) é o único jeito de "excluir" serviço, produto ou barbeiro:
  some do lançamento, mas continua no histórico.

## Funcionalidades do MVP
1. Catálogo: serviços (categoria Principal/Extra, preço, duração) e produtos (preço de venda e de custo)
2. Lançamento manual de atendimentos (ação secundária, para visita que não passou pelo App Barber):
   data/hora, itens (serviços e produtos), forma de pagamento (Pix, dinheiro, débito, crédito),
   barbeiro e observação
3. Lançamento de despesas: categoria (aluguel, produtos, luz, comissão, outros), valor, data
4. Taxas da maquininha configuráveis por forma de pagamento, para calcular o valor líquido
5. Fechamento do dia: bruto por grupo (Serviço/Extra/Produto), líquido, nº de visitas, ticket médio,
   total por forma de pagamento e conferência de caixa (valor contado na gaveta x esperado em dinheiro)
6. Dashboard mensal e anual: faturamento e ticket por grupo, lucro líquido, margem de produtos,
   serviços e extras mais vendidos, dias e horários mais fortes, comparativo com o período anterior
7. Login simples para proteger os dados (pode ficar para depois)
8. Importação do histórico de comandas do App Barber (formato abaixo): principal forma de
   registrar as visitas

## Formato da exportação do App Barber
Caminho no app: Comandas → Histórico de Comandas → filtro "Clientes" → botão Excel.
- Uma aba, uma linha por comanda, 15 colunas: Comanda, Cartão, Status, Data, Valor, Cliente, Obs,
  Tipo Pagamento, Cadastro, Profissional, Finalização, Data Finalização, Inserção, Em caixa, Data Caixa.
- Tudo vem como texto: Valor "100,00"; datas "03/11/2026 16:30" (Data Caixa só "03/11/2026"),
  no fuso de Brasília.
- O styles.xml tem um <fill/> vazio que o openpyxl rejeita: o leitor (src/importers/app-barber/
  xlsx-reader.ts) nunca abre o styles.xml.
- Traz só o total da comanda, não os itens. Ainda não se sabe se dá para exportar os itens.
- "Comanda" é um número único: usar como Appointment.externalId (source = APP_BARBER).
- Regras da importação:
  - Só Fechada vira visita (source APP_BARBER, externalId = Comanda, performedAt = coluna Data).
    Aberta com data passada aparece como "pendente: finalize no App Barber"; Aberta futura só conta;
    Cancelada é ignorada. Reimportar não duplica; Aberta que virou Fechada entra na próxima vez.
  - Vários profissionais ("L.F + 1") → revisão na prévia (o usuário escolhe o barbeiro).
    Código de profissional desconhecido → erro na prévia.
  - Taxa do catálogo congelada na importação. Itens pela regra de valor ou "a classificar".
  - Nunca são lidos: Cliente, Cadastro e Finalização (nomes de pessoas).
- Observações da exportação de 30 dias:
  - Status: Fechada, Aberta ou Cancelada. Só as Fechadas têm Tipo Pagamento e Data Finalização.
  - Nenhuma comanda do PH (Paulo) aparece como Fechada (são todas Abertas ou Canceladas), e há muitas
    Abertas com data passada: o status não basta para saber o que foi atendido.
  - Profissional pode vir combinado (ex.: "L.F + 1"), ou seja, mais de um barbeiro na comanda.
  - Existem comandas Fechadas com valor 0,00.
  - A Obs pode ter o primeiro nome do cliente: vai para Appointment.notes, mas nunca aparece em
    logs nem em testes. O texto automático "Comanda Aberta por Agendamento" vira null.
  - Tipo Pagamento: "PIX", "Dinheiro", "Cartão de Débito", "Cartão de Crédito".
  - "Data" é o horário agendado; "Inserção" é quando a comanda foi criada.

## Fora do escopo por enquanto
- Metas por barbeiro (a planilha tem; não criar model nem lógica de meta)
- Controle de estoque
- Clube de assinatura criado recentemente no App Barber, ainda sem uso. A definir após
  reunião com o barbeiro (Recorrência x Avulso no dashboard e ticket de visita de assinante).
- Taxa de ocupação
- Comissão: 0% em todos os serviços no App Barber hoje

## Roadmap de telas
1. Importação do histórico de comandas do App Barber (/importar)
2. Fechamento do dia
3. Catálogo (/catalogo, abas Serviços e Produtos)
4. Dashboard

O lançamento manual de atendimentos é uma ação secundária, para visita que não passou pelo App Barber.

A importação está dividida em 3 entregas:
- 3.1: schema, leitor do .xlsx, prévia (lógica pura), serviço e testes (feito)
- 3.2: tela /importar com upload, prévia (pendentes por barbeiro, revisão) e confirmação (feito)
- 3.3: /classificar e regras de valor. Requisitos já combinados:
  - classificar as visitas PENDING com um toque (regras do valor, serviços com o mesmo preço);
  - CORRIGIR os itens de qualquer visita importada (ex.: comanda de R$ 40 que foi barba entrou
    como Corte pela regra; o barbeiro troca para Barba). Os itens continuam somando o total;
  - ao criar ou editar uma regra, oferecer "aplicar às visitas pendentes de R$ X".

## Organização do código
- src/domain/: cálculos puros (sem Prisma nem React), recebem dados e devolvem números
  (pricing.ts: valores da visita; reports.ts: grupos, ticket, margem; price-rules.ts: regras de valor;
  import-preview.ts: destino de cada comanda na importação)
- src/importers/app-barber/: leitura do .xlsx do App Barber (leitor mínimo que ignora o styles.xml)
- src/server/: única camada que fala com o Prisma (recebe o client como parâmetro)
- src/lib/: infraestrutura e utilitários (db, money, dates, utils)
- prisma/: schema, migrations e seed
- O seed APAGA todos os dados; só roda com SEED_ALLOW_RESET=true. Com SEED_VISITS=false cria só os
  cadastros (barbeiros, catálogo, regras, taxas), para testar a importação real num dev limpo
- src/app/: rotas e Server Actions finas (validam, chamam src/server, redirecionam)
- Com cacheComponents ativo, leituras do banco ficam em componentes dentro de <Suspense>,
  com `await connection()` antes de usar `new Date()`
- Nunca editar uma migration existente: sempre criar uma nova

## Testes
- `pnpm test`: testes de unidade (*.test.ts, test runner do Node via tsx), sem banco.
- `pnpm test:db`: testes de banco (*.db.test.ts) num Postgres temporário em Docker, descartado no fim.
  Só rodam com host local; nunca apontar TEST_DATABASE_URL para o Supabase.
- Fixtures de importação são sintéticas (src/importers/app-barber/test-fixture.ts). O único teste
  com a exportação real confere só contagens e é pulado se o arquivo não existir.

## Como quero que você trabalhe
- Analise antes de mudar qualquer coisa e explique o plano antes de executar
- Faça mudanças pequenas e direcionadas, uma etapa por vez
- Sempre mostre o código completo dos arquivos alterados, não só trechos
- Use valores monetários em centavos (Int) no banco para evitar erro de arredondamento
- Organize o código de forma limpa: lógica de cálculo separada dos componentes
- Não rode nada no Supabase sem eu pedir: valide num Postgres temporário (Docker)
- Não faça commit sem eu pedir
