// Fechamento do dia contra um Postgres de verdade (ver service.db.test.ts sobre TEST_DATABASE_URL).
// ⚠️ APAGA o banco apontado por TEST_DATABASE_URL; só roda com host local (use `pnpm test:db`).

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDayClosingView, saveCashClosing } from "./closing";
import { getVisitDetail } from "./visits";

const DB_URL = process.env.TEST_DATABASE_URL;
const isLocal = (() => {
  try {
    return !!DB_URL && ["localhost", "127.0.0.1"].includes(new URL(DB_URL).hostname);
  } catch {
    return false;
  }
})();

const TABLES = [
  "appointment_items", "appointments", "price_rule_items", "price_rules", "import_batches",
  "cash_closings", "expenses", "expense_categories", "payment_fees", "products", "services", "barbers",
];

describe("fechamento do dia (banco)", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, () => {
  let db: PrismaClient;
  const ids = { luiz: "", paulo: "", corte: "", sobrancelha: "" };

  const visit = async (data: {
    at: string;
    barberId: string;
    method: "PIX" | "CASH" | "DEBIT" | "CREDIT";
    totalCents: number;
    feeCents?: number;
    items?: { serviceId: string; totalCents: number }[];
    notes?: string;
  }) =>
    db.appointment.create({
      data: {
        performedAt: new Date(data.at),
        barberId: data.barberId,
        paymentMethod: data.method,
        feeBps: 0,
        totalCents: data.totalCents,
        feeCents: data.feeCents ?? 0,
        netCents: data.totalCents - (data.feeCents ?? 0),
        notes: data.notes ?? null,
        classification: data.items ? "CLASSIFIED" : "PENDING",
        items: data.items && {
          create: data.items.map((i) => ({ serviceId: i.serviceId, unitPriceCents: i.totalCents, totalCents: i.totalCents })),
        },
      },
    });

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
    ids.luiz = (await db.barber.create({ data: { name: "Luiz", appBarberCode: "L.F" } })).id;
    ids.paulo = (await db.barber.create({ data: { name: "Paulo", appBarberCode: "PH" } })).id;
    ids.corte = (await db.service.create({ data: { name: "Corte", category: "MAIN", defaultPriceCents: 4000 } })).id;
    ids.sobrancelha = (await db.service.create({ data: { name: "Sobrancelha", category: "EXTRA", defaultPriceCents: 1000 } })).id;

    // 03/11 23:30 em Brasília = 04/11 02:30 UTC → é do dia 03/11
    await visit({ at: "2026-11-04T02:30:00Z", barberId: ids.luiz, method: "CASH", totalCents: 4000, items: [{ serviceId: ids.corte, totalCents: 4000 }] });
    // 04/11 00:10 em Brasília
    await visit({
      at: "2026-11-04T03:10:00Z",
      barberId: ids.luiz,
      method: "CASH",
      totalCents: 5000,
      items: [
        { serviceId: ids.corte, totalCents: 4000 },
        { serviceId: ids.sobrancelha, totalCents: 1000 },
      ],
      notes: "Obs sintética",
    });
    // 04/11 16:30, crédito com taxa
    await visit({ at: "2026-11-04T19:30:00Z", barberId: ids.paulo, method: "CREDIT", totalCents: 4000, feeCents: 199, items: [{ serviceId: ids.corte, totalCents: 4000 }] });
    // 04/11 23:59 em Brasília, a classificar
    await visit({ at: "2026-11-05T02:59:00Z", barberId: ids.luiz, method: "DEBIT", totalCents: 6500, feeCents: 129 });
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("limites do dia em Brasília: 23:30 do dia 03 não entra no dia 04", async () => {
    const day3 = await getDayClosingView(db, { dayKey: "2026-11-03" });
    const day4 = await getDayClosingView(db, { dayKey: "2026-11-04" });
    assert.equal(day3.summary.visitCount, 1);
    assert.equal(day4.summary.visitCount, 3);
    assert.deepEqual(day4.visits.map((v) => v.totalCents), [5000, 4000, 6500]); // em ordem de horário
  });

  test("resumo do dia: grupos, a classificar, taxas e dinheiro", async () => {
    const { summary, visits } = await getDayClosingView(db, { dayKey: "2026-11-04" });
    assert.deepEqual(summary.groups, { serviceCents: 8000, extraCents: 1000, productCents: 0, unclassifiedCents: 6500, grossCents: 15500 });
    assert.equal(summary.feeCents, 328);
    assert.equal(summary.cashSalesCents, 5000);
    assert.equal(visits[0].itemsLabel, "Corte + Sobrancelha");
    assert.equal(visits[2].itemsLabel, null);
    assert.equal(JSON.stringify(visits).includes("Obs sintética"), false, "a Obs não vai para a lista do dia");
  });

  test("conferência: grava uma vez por dia (upsert) e recalcula o esperado no servidor", async () => {
    await saveCashClosing(db, { dayKey: "2026-11-04", openingCashCents: 10000, countedCashCents: 14000, notes: null, now: new Date() });
    await saveCashClosing(db, { dayKey: "2026-11-04", openingCashCents: 10000, countedCashCents: 15000, notes: "recontado", now: new Date() });
    assert.equal(await db.cashClosing.count(), 1);
    const view = await getDayClosingView(db, { dayKey: "2026-11-04" });
    assert.deepEqual(
      [view.closing?.expectedCashCents, view.closing?.countedCashCents, view.closing?.differenceCents, view.closing?.notes],
      [15000, 15000, 0, "recontado"],
    );
    assert.equal(view.stale, false);
  });

  test("nova visita em dinheiro depois da conferência → fechamento desatualizado", async () => {
    await visit({ at: "2026-11-04T20:00:00Z", barberId: ids.paulo, method: "CASH", totalCents: 4000, items: [{ serviceId: ids.corte, totalCents: 4000 }] });
    const view = await getDayClosingView(db, { dayKey: "2026-11-04" });
    assert.equal(view.stale, true);
    assert.equal(view.summary.cashSalesCents, 9000);
  });

  test("fundo de troco sugerido vem do último fechamento anterior", async () => {
    const next = await getDayClosingView(db, { dayKey: "2026-11-05" });
    assert.equal(next.closing, null);
    assert.equal(next.suggestedOpeningCashCents, 10000);
    const before = await getDayClosingView(db, { dayKey: "2026-11-01" });
    assert.equal(before.suggestedOpeningCashCents, 0);
  });

  test("detalhe da visita traz itens e a Obs (só para a tela)", async () => {
    const day4 = await getDayClosingView(db, { dayKey: "2026-11-04" });
    const detail = await getVisitDetail(db, day4.visits[0].id);
    assert.deepEqual(detail?.items.map((i) => [i.name, i.kind, i.totalCents]), [["Corte", "MAIN", 4000], ["Sobrancelha", "EXTRA", 1000]]);
    assert.equal(detail?.notes, "Obs sintética");
    assert.equal(await getVisitDetail(db, "naoexiste"), null);
  });
});
