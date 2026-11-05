# Projeto: BarberBoard

Este arquivo tem o contexto, as regras de negócio e a forma de trabalhar.
A arquitetura (stack, pastas, camadas, modelo de dados, fluxos, testes, ambientes) está em
[docs/ARQUITETURA.md](docs/ARQUITETURA.md); o plano das etapas, em [docs/PLANO-MVP.md](docs/PLANO-MVP.md).
Leia os dois antes de começar qualquer etapa.

## Contexto
O BarberBoard é um web app de fechamento de caixa e dashboard para uma barbearia. Os clientes são
agendados pelo App Barber (app de terceiros, que continua sendo usado), e o controle financeiro era
feito numa planilha, que o BarberBoard substitui.

As visitas têm duas fontes:
- **Luiz (código "L.F")** fecha todas as comandas dele no App Barber. Elas entram pela importação do
  Histórico de Comandas (/importar).
- **Paulo (código "PH")** nunca fecha comanda no App Barber e não vai passar a fechar. Nas palavras
  dele: "eu não fecho a comanda no App Barber, quem fecha é meu irmão. Eu somo meu dia depois e mando
  no WhatsApp pra não me perder no fechamento do caixa." As comandas dele existem no App Barber
  (Abertas, com horário, valor e profissional) e entram como "a confirmar"; ele confirma cada uma
  (forma de pagamento, clube ou "não veio") e lança à mão quem veio sem agendamento.

Interface em português (pt-BR), valores em R$, mobile-first (o barbeiro usa no celular).

As planilhas de referência ficam em docs/referencia/ e não são versionadas:
- RELATORIO-DIARIO.xlsx e PLANILHA-INDICADORES.xlsx: modelos de outras barbearias, com nomes e valores
  fictícios. Vale só a lógica delas; não usar nomes nem valores no código ou no seed.
- AppBarber-Historico-30dias.xlsx: exportação real do App Barber, com dados de clientes.
  Nunca copiar o conteúdo dela para o código, o seed ou os commits.

## Regras de negócio

### Barbeiros e agenda
- 2 barbeiros: Paulo e Luiz. O Luiz atende a maior parte das visitas (~75%).
- Dias: fecha na segunda. Domingo: ainda a confirmar (a exportação de 30 dias não tem nenhuma
  comanda no domingo).
- Comissão: ainda não definida (0% em todos os serviços no App Barber). A categoria de despesa
  "Comissão" existe para lançamento manual.

### Visitas, catálogo e grupos
- Visita = um cliente atendido. Cada serviço ou produto da visita é um item. Visita só com produto
  também conta como cliente.
- Catálogo real (App Barber → Cadastros → Serviços), preços ainda a padronizar com o barbeiro:
  - Principais: Corte R$ 40 · Barba R$ 40 · Relaxamento R$ 30
  - Extras: Sobrancelha R$ 10 · Selagem R$ 60
  O App Barber não tem produtos cadastrados; os produtos do seed são fictícios (só para testar margem).
- O faturamento é sempre quebrado em 3 grupos: Serviço (serviços principais), Extra (serviços
  extras) e Produto. Visita importada sem itens fica "a classificar" e entra no bruto à parte.
- Bruto = Serviço + Extra + Produto + A classificar. Sempre calculado, nunca digitado.
- Ticket médio = bruto / nº de visitas pagas (0 sem visitas; visita de clube não entra). No mês ou no ano é o bruto do período dividido
  pelas visitas do período, não a média dos tickets diários. Ticket por grupo usa o mesmo nº de visitas.
- Os itens de uma visita sempre somam o total dela. Corrigir itens nunca muda o total de uma visita
  importada.
- Preço, custo e taxa ficam congelados na visita: mudar o catálogo não altera o histórico.
- Desativar é o único jeito de "excluir" serviço, produto, barbeiro ou categoria: some do lançamento,
  continua no histórico. Desativar algo usado por regra ativa é permitido, com aviso.

### Regras de valor (combos)
- No App Barber os combos são UM serviço ("Corte e sobrancelha"); aqui viram itens para manter a
  quebra Serviço/Extra. Comanda de R$ X com uma regra ativa → itens automáticos; sem regra ou com mais
  de uma → "a classificar".
- Regras atuais: R$ 40 Corte · R$ 50 Corte e sobrancelha (40 + 10) · R$ 80 Corte e barba (40 + 40) ·
  R$ 90 Corte barba e sobrancelha (40 + 40 + 10) · R$ 60 Selagem · R$ 30 Relaxamento · R$ 10 Sobrancelha.
- R$ 40 sugere Corte mesmo a Barba custando R$ 40 (barba é rara); o barbeiro corrige quando for barba.
- Editar ou desativar uma regra não muda visitas já classificadas. "Salvar como regra" é recusado se
  o valor já tem regra ativa.
- Catálogo e regras precisam ser fáceis de editar: os preços ainda vão mudar.

### Dinheiro, taxas e resultado
- Valores em centavos; taxas da maquininha em basis points por forma de pagamento (Pix, dinheiro,
  débito, crédito), editadas no catálogo em % ("1,99"). Taxa nova vale para as próximas visitas.
- Produtos têm custo opcional. Margem = venda − custo; produto sem custo fica fora da margem.
- Lucro líquido = receitas − despesas − taxas.
- Despesas: data, categoria ativa, valor > 0, barbeiro opcional (ex.: comissão). Excluir pede confirmação.

### Fechamento do dia
- O "dia" é sempre o dia de calendário em Brasília.
- Conferência de caixa: esperado = fundo de troco + visitas em dinheiro do dia. Se o dinheiro do dia
  mudar depois (nova importação, correção), o fechamento aparece como desatualizado.

### Importação do App Barber
Caminho no app: Comandas → Histórico de Comandas → filtro "Clientes" → botão Excel.
- Uma linha por comanda, 15 colunas: Comanda, Cartão, Status, Data, Valor, Cliente, Obs,
  Tipo Pagamento, Cadastro, Profissional, Finalização, Data Finalização, Inserção, Em caixa, Data Caixa.
  Tudo vem como texto ("100,00", "03/11/2026 16:30"), no fuso de Brasília. Traz só o total da
  comanda, não os itens.
- Só comanda Fechada vira visita; "Comanda" (número único) identifica a visita e impede duplicar.
  "Data" é o horário do atendimento.
- Aberta de DIAS ANTERIORES: "pendente, finalize no App Barber" (laranja). Aberta de HOJE com horário
  já passado: "em andamento hoje" (neutro; o Luiz fecha no fim do dia). Aberta futura: só conta.
  Cancelada: ignorada. Aberta que virou Fechada entra na próxima importação.
- Comandas do Paulo (barbeiro que não fecha comanda): Abertas de qualquer data (passada, de hoje ou
  futura) e Fechadas viram "A CONFIRMAR", não visita. Não contam no faturamento, no fechamento nem
  no dashboard até serem confirmadas. A Fechada traz a forma de pagamento como sugestão. Canceladas
  são descartadas.
- Reimportar uma comanda a confirmar: enquanto ela estiver pendente, acompanha o App Barber (horário e
  valor atualizados; se veio Cancelada, sai da lista). Depois de confirmada, de clube, de "não veio" ou
  cancelada, nunca volta nem muda.
- Vários profissionais: o Paulo sai da conta. "L.F + 1" e "L.F + PH" entram para o Luiz, com o aviso
  "comanda com outro profissional (+1): confira se o Paulo também lançou este cliente" (na prévia e no
  resultado), para não contar a mesma visita duas vezes. Se houver mais de um barbeiro que importa, o
  "+1" é ambíguo e a comanda vai para revisão (o usuário escolhe). Código desconhecido → erro.
- Comanda Fechada de R$ 0,00 entra como visita de total 0 (cortesia ou visita de assinante).
- Comanda Fechada do Luiz com "club" na Obs e valor > 0 entra normalmente, com o aviso "comanda de
  clube fechada com valor: confira se o cliente pagou ou é assinante".
- O botão de importar fica ativo sempre que houver algo a gravar: visitas novas, comandas a confirmar
  novas, ou mudanças em comandas a confirmar (ex.: "Importar 4 visitas e 9 a confirmar").
- Taxa do catálogo congelada na importação. Itens pela regra de valor ou "a classificar".
- Privacidade: Cliente, Cadastro e Finalização (nomes de pessoas) nunca são lidos. A Obs pode ter o
  primeiro nome do cliente: é guardada na visita, mas nunca aparece em logs nem em testes.
  O texto automático "Comanda Aberta por Agendamento" vira vazio.
- Tipo Pagamento vem como "PIX", "Dinheiro", "Cartão de Débito" ou "Cartão de Crédito".

### Comandas a confirmar (Paulo)
- Situações: a confirmar, confirmada (vira visita paga, com a comanda como identificação, itens pela
  regra de valor ou "a classificar" e taxa congelada), clube (vira visita de assinante), não veio,
  cancelada. Confirmar e "não veio" podem ser desfeitos.
- O Fechamento do dia mostra "X comandas do Paulo a confirmar (R$ Y)" fora do bruto e do caixa.
- A confirmação acontece na tela Lançar (Parte B): primeiro as comandas a confirmar do dia, com os 4
  botões de pagamento, "Clube" e "Não veio"; em dias passados, confirmação em lote.

### Clube de assinatura
- O assinante já pagou a mensalidade: a comanda dele vem com valor cheio (ex.: R$ 40/80), mas a visita
  entra com total R$ 0, marcada como visita de clube, com os itens da regra a preço 0 (o ranking de
  serviços continua certo).
- Se a Obs contém "club" (sem diferenciar maiúscula), a opção Clube aparece destacada como sugestão.
- Visita de clube conta em clientes e no ranking de serviços, mas fica FORA do ticket médio
  (ticket = bruto / visitas pagas). Relatórios mostram "X visitas de clube" à parte.
- A mensalidade (recorrência) ainda não é modelada: valor e forma de pagamento a confirmar com o barbeiro.

### Lançamento manual
- Para visita que não passou pelo App Barber (ex.: cliente do Paulo sem agendamento). Total = soma dos itens.
- Horário: hoje = hora do lançamento. Dia passado = hora opcional; sem hora escolhida, a visita fica
  com horário aproximado: conta em TODOS os totais, mas fica FORA do mapa de dias/horários do dashboard.
- Só visita lançada manualmente pode ser editada por inteiro ou excluída; a importada só tem os itens
  corrigidos (excluí-la não adiantaria, ela voltaria na próxima importação).

## Fora do escopo por enquanto
- Metas por barbeiro (a planilha tem; não criar model nem lógica de meta)
- Controle de estoque
- Mensalidade do clube de assinatura (recorrência): ainda levantando valor e forma de pagamento.
  A visita de assinante já é tratada (ver "Clube de assinatura").
- Taxa de ocupação
- Comissão automática

## Roadmap
Detalhes de cada etapa em docs/PLANO-MVP.md. Andamento:
- [x] Base, schema, cálculos e importação do App Barber (/importar)
- [x] Etapa 0: arrumação (RLS, navegação)
- [x] Etapa 1: Fechamento do dia (/fechamento, tela inicial)
- [x] Etapa 2: Classificar e corrigir visitas (/classificar, /visitas/[id], /regras)
- [x] Etapa 3: Catálogo e taxas (/catalogo)
- [x] Etapa 4: Despesas (/despesas)
- [x] Etapa 5: Lançamento manual de visita (/visitas/nova)
- [ ] Etapa 6: Dashboard (/dashboard)
- [ ] Etapa 7: Login (obrigatório antes de produção)
- [ ] Etapa 8: Produção (Supabase de produção, Vercel, PWA, backup)

## Como quero que você trabalhe
- Leia este arquivo e o docs/ARQUITETURA.md antes de começar
- Analise antes de mudar qualquer coisa e explique o plano antes de executar
- Faça mudanças pequenas e direcionadas, uma etapa por vez
- Sempre mostre o código completo dos arquivos alterados, não só trechos
- Use valores monetários em centavos (Int) no banco para evitar erro de arredondamento
- Organize o código de forma limpa: lógica de cálculo separada dos componentes
- Toda etapa que mudar a arquitetura (camadas, pastas, models, fluxos, decisões técnicas, testes,
  ambientes) atualiza o docs/ARQUITETURA.md no mesmo commit
- Nunca editar uma migration existente: sempre criar uma nova (com RLS na tabela nova)
- Não rode nada no Supabase sem eu pedir: valide num Postgres temporário (Docker)
- Não faça commit sem eu pedir
