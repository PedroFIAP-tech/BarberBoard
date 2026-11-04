/**
 * Seed de desenvolvimento do BarberBoard.
 *
 * ⚠️  APAGA TODOS OS DADOS do banco e recria dados fictícios.
 * Por segurança, só roda com SEED_ALLOW_RESET=true (e nunca deve rodar em produção):
 *
 *   SEED_ALLOW_RESET=true pnpm db:seed
 *
 * Os dados são gerados por um PRNG com semente fixa: para a mesma data de execução,
 * o resultado é sempre o mesmo. As datas são relativas a "hoje" para o dashboard
 * sempre ter dados recentes. Preços são provisórios (a confirmar com o barbeiro).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { addDays, getDay, subDays } from "date-fns";
import { PrismaPg } from "@prisma/adapter-pg";
import { PaymentMethod, PrismaClient, ServiceCategory } from "../src/generated/prisma/client";
import { calcAppointmentTotals, calcItemTotal } from "../src/domain/pricing";
import {
  averageTicket,
  extraCountByService,
  productMargin,
  revenueByGroup,
  ticketByGroup,
  type ReportItem,
} from "../src/domain/reports";
import { TZ, inBR, toDayKeyBR, toDbDate } from "../src/lib/dates";
import { formatBRL } from "../src/lib/money";

// ─── Trava de segurança ─────────────────────────────────────────────────────

if (process.env.SEED_ALLOW_RESET !== "true") {
  console.error(
    [
      "",
      "✋ Seed abortado: nada foi alterado no banco.",
      "",
      "   Este seed APAGA TODOS OS DADOS (atendimentos, despesas, fechamentos...)",
      "   e recria dados fictícios. Nunca rode em produção.",
      "",
      "   Para continuar, rode:  SEED_ALLOW_RESET=true pnpm db:seed",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DIRECT_URL (ou DATABASE_URL) não está definida. Veja o .env.example.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ─── Gerador pseudoaleatório determinístico ─────────────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261104);
const chance = (p: number) => random() < p;
const randInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

function weightedPick<T>(options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = random() * total;
  for (const [value, weight] of options) {
    r -= weight;
    if (r < 0) return value;
  }
  return options[options.length - 1][0];
}

// ─── Dados de cadastro ──────────────────────────────────────────────────────

const BARBERS = [
  { name: "Paulo", appBarberCode: "PH" },
  { name: "Luiz", appBarberCode: "L.F" },
] as const;

const { MAIN, EXTRA } = ServiceCategory;

const SERVICES = [
  { name: "Corte", category: MAIN, defaultPriceCents: 4000, durationMin: 40 },
  { name: "Barba", category: MAIN, defaultPriceCents: 3500, durationMin: 30 },
  { name: "Combo (corte + barba)", category: MAIN, defaultPriceCents: 7000, durationMin: 60 },
  { name: "Pigmentação", category: MAIN, defaultPriceCents: 4000, durationMin: 30 },
  { name: "Sobrancelha", category: EXTRA, defaultPriceCents: 1500, durationMin: 10 },
  { name: "Pezinho", category: EXTRA, defaultPriceCents: 1000, durationMin: 10 },
  { name: "Depilação nariz", category: EXTRA, defaultPriceCents: 1500, durationMin: 10 },
  { name: "Depilação orelha", category: EXTRA, defaultPriceCents: 1500, durationMin: 10 },
  { name: "Hidratação", category: EXTRA, defaultPriceCents: 2500, durationMin: 20 },
  { name: "Selagem", category: EXTRA, defaultPriceCents: 4000, durationMin: 40 },
  { name: "Hidratação de barba", category: EXTRA, defaultPriceCents: 2000, durationMin: 15 },
  { name: "Contorno", category: EXTRA, defaultPriceCents: 1000, durationMin: 10 },
  { name: "Limpeza", category: EXTRA, defaultPriceCents: 3500, durationMin: 20 },
] as const;

// Custo de ~50% do preço. O "Gel fixador" fica sem custo de propósito,
// para exercitar a regra "produto sem custo não entra na margem".
const PRODUCTS = [
  { name: "Pomada modeladora", priceCents: 3500, costCents: 1750 },
  { name: "Óleo para barba", priceCents: 4000, costCents: 2000 },
  { name: "Shampoo", priceCents: 3000, costCents: 1600 },
  { name: "Gel fixador", priceCents: 2500, costCents: null },
] as const;

const PAYMENT_FEES: Record<PaymentMethod, number> = {
  PIX: 0,
  CASH: 0,
  DEBIT: 199, // 1,99%
  CREDIT: 498, // 4,98%
};

// "Comissão" fica cadastrada para lançamento manual; o seed não gera comissão.
const EXPENSE_CATEGORIES = ["Aluguel", "Produtos", "Luz", "Comissão", "Outros"] as const;

// ─── Regras de geração ──────────────────────────────────────────────────────

const DAYS_BACK = 90;
const OPENING_CASH_CENTS = 10_000; // R$ 100 de troco na gaveta
const LUIZ_SHARE = 0.75; // o Luiz faz ~75% das visitas

// Visitas médias por dia da semana, somando os 2 barbeiros (0 = domingo, fechado).
// Segunda é quase parada. Meta: ~7 visitas/dia útil, R$ 7–8 mil por mês.
const VISITS_PER_WEEKDAY = [0, 1, 5, 6, 6, 7, 8];

// Peso de cada horário de início (8h às 19h): picos de manhã e no fim da tarde.
const HOUR_WEIGHTS = [
  [8, 0.5], [9, 1.3], [10, 1.6], [11, 1.5], [12, 0.9], [13, 1.1],
  [14, 0.8], [15, 1.5], [16, 1.5], [17, 1.4], [18, 1.3], [19, 1],
] as const;

const MAIN_SERVICE_WEIGHTS = [
  ["Corte", 62], ["Combo (corte + barba)", 16], ["Barba", 15], ["Pigmentação", 7],
] as const;

// Sobrancelha domina os extras.
const EXTRA_SERVICE_WEIGHTS = [
  ["Sobrancelha", 50], ["Depilação nariz", 12], ["Pezinho", 10], ["Contorno", 6],
  ["Hidratação", 5], ["Hidratação de barba", 5], ["Selagem", 4], ["Limpeza", 4],
  ["Depilação orelha", 4],
] as const;

const EXTRA_ONLY_CHANCE = 0.04; // visita só com um extra (ex.: só sobrancelha)
const EXTRA_CHANCE = 0.35; // serviço principal + 1 extra
const PRODUCT_CHANCE = 0.1; // + 1 produto

const PAYMENT_WEIGHTS = [
  [PaymentMethod.PIX, 35], [PaymentMethod.CASH, 31],
  [PaymentMethod.DEBIT, 22], [PaymentMethod.CREDIT, 12],
] as const;

/** Cria um instante a partir de um horário de parede em Brasília. */
function atBR(day: Date, hour: number, minute: number): Date {
  const d = inBR(day);
  return new Date(new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0, TZ).getTime());
}

/** "yyyy-MM-dd" → um instante no meio daquele dia em Brasília (para usar com atBR). */
function noonBR(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 12, 0, 0, 0, TZ).getTime());
}

// ─── Execução ───────────────────────────────────────────────────────────────

type ItemRow = {
  id: string;
  appointmentId: string;
  serviceId: string | null;
  productId: string | null;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  totalCents: number;
};

type AppointmentRow = {
  id: string;
  performedAt: Date;
  barberId: string;
  paymentMethod: PaymentMethod;
  feeBps: number;
  totalCents: number;
  feeCents: number;
  netCents: number;
  notes: string | null;
};

async function main() {
  const host = new URL(connectionString!).host;
  console.log(`🌱 Seed em ${host} — apagando dados e recriando...`);

  const today = inBR(new Date());

  await prisma.$transaction(
    async (tx) => {
      // 1. Limpa tudo, respeitando as foreign keys.
      await tx.appointmentItem.deleteMany();
      await tx.appointment.deleteMany();
      await tx.importBatch.deleteMany();
      await tx.cashClosing.deleteMany();
      await tx.expense.deleteMany();
      await tx.expenseCategory.deleteMany();
      await tx.paymentFee.deleteMany();
      await tx.product.deleteMany();
      await tx.service.deleteMany();
      await tx.barber.deleteMany();

      // 2. Cadastros.
      const barbers = await tx.barber.createManyAndReturn({ data: [...BARBERS] });
      const services = await tx.service.createManyAndReturn({
        data: SERVICES.map((s, i) => ({ ...s, sortOrder: i })),
      });
      const products = await tx.product.createManyAndReturn({ data: [...PRODUCTS] });
      const categories = await tx.expenseCategory.createManyAndReturn({
        data: EXPENSE_CATEGORIES.map((name, i) => ({ name, sortOrder: i })),
      });
      await tx.paymentFee.createMany({
        data: Object.entries(PAYMENT_FEES).map(([method, feeBps]) => ({
          method: method as PaymentMethod,
          feeBps,
        })),
      });

      const luiz = barbers.find((b) => b.appBarberCode === "L.F")!;
      const paulo = barbers.find((b) => b.appBarberCode === "PH")!;
      const serviceByName = new Map(services.map((s) => [s.name, s]));
      const categoryByName = new Map(categories.map((c) => [c.name, c]));

      // 3. Visitas e itens.
      const appointmentRows: AppointmentRow[] = [];
      const itemRows: ItemRow[] = [];
      const cashByDay = new Map<string, number>(); // para a conferência de caixa

      for (let offset = DAYS_BACK; offset >= 0; offset--) {
        const day = subDays(today, offset);
        const base = VISITS_PER_WEEKDAY[getDay(day)];
        if (base === 0) continue; // domingo: ninguém atende

        const isToday = offset === 0;
        const visits = Math.max(0, base + randInt(-1, 1));

        for (let v = 0; v < visits; v++) {
          const hour = weightedPick(HOUR_WEIGHTS);
          const minute = weightedPick([[0, 1], [15, 1], [30, 1], [45, 1]] as const);
          if (isToday && hour >= today.getHours()) continue; // não cria atendimento no futuro

          const barber = chance(LUIZ_SHARE) ? luiz : paulo;
          const paymentMethod = weightedPick(PAYMENT_WEIGHTS);
          const feeBps = PAYMENT_FEES[paymentMethod];
          const appointmentId = randomUUID();
          const items: ItemRow[] = [];

          const addService = (name: string, discountCents = 0) => {
            const service = serviceByName.get(name)!;
            items.push({
              id: randomUUID(),
              appointmentId,
              serviceId: service.id,
              productId: null,
              quantity: 1,
              unitPriceCents: service.defaultPriceCents - discountCents,
              unitCostCents: null,
              totalCents: 0,
            });
          };

          // Itens: 1 principal (+ às vezes 1 extra) (+ às vezes 1 produto), ou só 1 extra.
          let hasDiscount = false;
          if (chance(EXTRA_ONLY_CHANCE)) {
            addService(weightedPick(EXTRA_SERVICE_WEIGHTS));
          } else {
            hasDiscount = chance(0.05); // R$ 5 de desconto no serviço principal
            addService(weightedPick(MAIN_SERVICE_WEIGHTS), hasDiscount ? 500 : 0);
            if (chance(EXTRA_CHANCE)) addService(weightedPick(EXTRA_SERVICE_WEIGHTS));
          }
          if (chance(PRODUCT_CHANCE)) {
            const product = products[randInt(0, products.length - 1)];
            items.push({
              id: randomUUID(),
              appointmentId,
              serviceId: null,
              productId: product.id,
              quantity: 1,
              unitPriceCents: product.priceCents,
              unitCostCents: product.costCents, // custo congelado na venda
              totalCents: 0,
            });
          }

          for (const item of items) item.totalCents = calcItemTotal(item);
          const totals = calcAppointmentTotals(items, feeBps);

          appointmentRows.push({
            id: appointmentId,
            performedAt: atBR(day, hour, minute),
            barberId: barber.id,
            paymentMethod,
            feeBps,
            ...totals,
            notes: hasDiscount ? "Desconto fidelidade" : chance(0.05) ? "Cliente novo" : null,
          });
          itemRows.push(...items);

          if (paymentMethod === PaymentMethod.CASH) {
            const dayKey = toDayKeyBR(day);
            cashByDay.set(dayKey, (cashByDay.get(dayKey) ?? 0) + totals.totalCents);
          }
        }
      }

      await tx.appointment.createMany({ data: appointmentRows });
      await tx.appointmentItem.createMany({ data: itemRows });

      // 4. Despesas (sem comissão: a regra ainda não está definida).
      const expenseRows: { date: Date; categoryId: string; amountCents: number; description: string }[] = [];
      const firstDay = subDays(today, DAYS_BACK);
      const cat = (name: (typeof EXPENSE_CATEGORIES)[number]) => categoryByName.get(name)!.id;

      for (let day = firstDay; day <= today; day = addDays(day, 1)) {
        const date = day.getDate();
        if (date === 5) {
          expenseRows.push({ date: toDbDate(day), categoryId: cat("Aluguel"), amountCents: 150_000, description: "Aluguel do salão" });
        }
        if (date === 10) {
          expenseRows.push({ date: toDbDate(day), categoryId: cat("Luz"), amountCents: randInt(180, 260) * 100, description: "Conta de luz" });
        }
        if (date === 3 || date === 18) {
          expenseRows.push({ date: toDbDate(day), categoryId: cat("Produtos"), amountCents: randInt(20, 40) * 1000, description: "Reposição de produtos" });
        }
        if (getDay(day) !== 0 && chance(0.06)) {
          expenseRows.push({
            date: toDbDate(day),
            categoryId: cat("Outros"),
            amountCents: randInt(5, 15) * 1000,
            description: weightedPick([["Café e água", 1], ["Material de limpeza", 1], ["Manutenção de máquina", 0.5]] as const),
          });
        }
      }
      await tx.expense.createMany({ data: expenseRows });

      // 5. Fechamentos de caixa dos últimos 5 dias com movimento em dinheiro (não inclui hoje).
      const closedDays = [...cashByDay.keys()]
        .filter((key) => key !== toDayKeyBR(today))
        .sort()
        .slice(-5);
      await tx.cashClosing.createMany({
        data: closedDays.map((key, i) => {
          const expectedCashCents = OPENING_CASH_CENTS + (cashByDay.get(key) ?? 0);
          const differenceCents = i === 2 ? -1_000 : 0; // um dia com R$ 10 faltando
          return {
            date: toDbDate(key),
            openingCashCents: OPENING_CASH_CENTS,
            expectedCashCents,
            countedCashCents: expectedCashCents + differenceCents,
            differenceCents,
            notes: differenceCents < 0 ? "Faltou R$ 10, provável troco errado" : null,
            closedAt: atBR(noonBR(key), 20, 30),
          };
        }),
      });

      // 6. Resumo, calculado com as mesmas funções puras que as telas vão usar.
      const categoryById = new Map(services.map((s) => [s.id, s.category]));
      const toReportItem = (i: ItemRow): ReportItem => ({
        serviceId: i.serviceId,
        productId: i.productId,
        serviceCategory: i.serviceId ? categoryById.get(i.serviceId)! : null,
        quantity: i.quantity,
        totalCents: i.totalCents,
        unitCostCents: i.unitCostCents,
      });
      const reportItems = itemRows.map(toReportItem);
      const groups = revenueByGroup(reportItems);
      const tickets = ticketByGroup(groups, appointmentRows.length);
      const margin = productMargin(reportItems);
      const fees = appointmentRows.reduce((s, a) => s + a.feeCents, 0);
      const expenses = expenseRows.reduce((s, e) => s + e.amountCents, 0);
      const pct = (part: number) => `${((part / groups.grossCents) * 100).toFixed(1)}%`;

      console.log(`\nPeríodo: ${toDayKeyBR(firstDay)} a ${toDayKeyBR(today)}`);
      console.table({
        "Barbeiros": barbers.length,
        "Serviços (principal + extra)": services.length,
        "Produtos": products.length,
        "Visitas": appointmentRows.length,
        "  do Luiz": appointmentRows.filter((a) => a.barberId === luiz.id).length,
        "  do Paulo": appointmentRows.filter((a) => a.barberId === paulo.id).length,
        "Itens": itemRows.length,
        "Despesas": expenseRows.length,
        "Fechamentos de caixa": closedDays.length,
      });
      console.table({
        "Serviço": { valor: formatBRL(groups.serviceCents), "%": pct(groups.serviceCents), ticket: formatBRL(tickets.serviceCents) },
        "Extra": { valor: formatBRL(groups.extraCents), "%": pct(groups.extraCents), ticket: formatBRL(tickets.extraCents) },
        "Produto": { valor: formatBRL(groups.productCents), "%": pct(groups.productCents), ticket: formatBRL(tickets.productCents) },
        "Bruto": { valor: formatBRL(groups.grossCents), "%": "100%", ticket: formatBRL(tickets.generalCents) },
      });

      // Faturamento por mês (para conferir a meta de R$ 7–8 mil nos meses completos).
      const byMonth = new Map<string, { gross: number; visits: number; days: Set<string> }>();
      for (const a of appointmentRows) {
        const key = toDayKeyBR(a.performedAt);
        const m = byMonth.get(key.slice(0, 7)) ?? { gross: 0, visits: 0, days: new Set<string>() };
        m.gross += a.totalCents;
        m.visits += 1;
        m.days.add(key);
        byMonth.set(key.slice(0, 7), m);
      }
      console.table(
        Object.fromEntries(
          [...byMonth].map(([month, m]) => [
            month,
            {
              faturamento: formatBRL(m.gross),
              visitas: m.visits,
              "dias c/ movimento": m.days.size,
              "visitas/dia": (m.visits / m.days.size).toFixed(1),
              ticket: formatBRL(averageTicket(m.gross, m.visits)),
            },
          ]),
        ),
      );

      const nameById = new Map(services.map((s) => [s.id, s.name]));
      const topExtras = [...extraCountByService(reportItems)]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, n]) => `${nameById.get(id)} (${n})`);
      const productItems = itemRows.filter((i) => i.productId);
      const withoutCost = productItems.filter((i) => i.unitCostCents === null).length;

      console.log(
        `Margem de produtos: venda ${formatBRL(margin.revenueCents)} − custo ${formatBRL(margin.costCents)} = ${formatBRL(margin.marginCents)}` +
          ` (${productItems.length} vendas, ${withoutCost} sem custo fora do cálculo)`,
      );
      console.log(`Extras mais vendidos: ${topExtras.join(", ")}`);
      console.log(`Taxas: ${formatBRL(fees)} · Despesas: ${formatBRL(expenses)} · Lucro líquido: ${formatBRL(groups.grossCents - fees - expenses)}`);
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  console.log("✅ Seed concluído.");
}

main()
  .catch((error) => {
    console.error("❌ Seed falhou — a transação foi desfeita, o banco ficou como estava.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
