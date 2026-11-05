// Visita lançada manualmente, contra um Postgres de verdade. ⚠️ APAGA o banco de TEST_DATABASE_URL (só host local).

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { VisitItemsError } from "./appointments";
import { createManualVisit, deleteManualVisit, updateManualVisit } from "./manual-visits";

const DB_URL = process.env.TEST_DATABASE_URL;
const isLocal = (() => {
  try {
    return !!DB_URL && ["localhost", "127.0.0.1"].includes(new URL(DB_URL).hostname);
  } catch {
    return false;
  }
})();

const TABLES = [
  "pending_confirmations", "appointment_items", "appointments", "price_rule_items", "price_rules", "import_batches",
  "cash_closings", "expenses", "expense_categories", "payment_fees", "products", "services", "barbers",
];

describe("visita manual (banco)", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, () => {
  let db: PrismaClient;
  const id = { barber: "", corte: "", pomada: "" };
  const at = new Date("2026-11-04T19:30:00Z");

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
    id.barber = (await db.barber.create({ data: { name: "Paulo" } })).id;
    id.corte = (await db.service.create({ data: { name: "Corte", category: "MAIN", defaultPriceCents: 4000 } })).id;
    id.pomada = (await db.product.create({ data: { name: "Pomada", priceCents: 3500, costCents: 1750 } })).id;
    await db.paymentFee.createMany({ data: [{ method: "PIX", feeBps: 0 }, { method: "CREDIT", feeBps: 498 }] });
  });

  after(async () => {
    await db?.$disconnect();
  });

  let visitId = "";

  test("lançar: total = soma dos itens, taxa do catálogo congelada, MANUAL e CLASSIFIED, custo congelado", async () => {
    visitId = await createManualVisit(db, {
      performedAt: at,
      barberId: id.barber,
      paymentMethod: "CREDIT",
      items: [
        { serviceId: id.corte, productId: null, quantity: 1, unitPriceCents: 4000 },
        { serviceId: null, productId: id.pomada, quantity: 2, unitPriceCents: 3500 },
      ],
      notes: "Obs sintética",
    });
    const v = await db.appointment.findUniqueOrThrow({ where: { id: visitId }, include: { items: true } });
    assert.deepEqual([v.source, v.classification, v.totalCents, v.feeBps, v.feeCents, v.netCents], ["MANUAL", "CLASSIFIED", 11000, 498, 548, 10452]);
    assert.equal(v.items.find((i) => i.productId)?.unitCostCents, 1750);
  });

  test("editar: muda itens, total e taxa (forma de pagamento nova)", async () => {
    await updateManualVisit(db, visitId, {
      performedAt: at,
      barberId: id.barber,
      paymentMethod: "PIX",
      items: [{ serviceId: id.corte, productId: null, quantity: 1, unitPriceCents: 4500 }],
      notes: null,
    });
    const v = await db.appointment.findUniqueOrThrow({ where: { id: visitId }, include: { items: true } });
    assert.deepEqual([v.totalCents, v.feeBps, v.feeCents, v.items.length, v.notes], [4500, 0, 0, 1, null]);
  });

  test("itens inválidos e barbeiro inexistente são recusados", async () => {
    await assert.rejects(createManualVisit(db, { performedAt: at, barberId: id.barber, paymentMethod: "PIX", items: [], notes: null }), VisitItemsError);
    await assert.rejects(
      createManualVisit(db, { performedAt: at, barberId: "naoexiste", paymentMethod: "PIX", items: [{ serviceId: id.corte, productId: null, quantity: 1, unitPriceCents: 4000 }], notes: null }),
      /barbeiro/,
    );
  });

  test("visita importada não pode ser editada nem excluída", async () => {
    const imported = await db.appointment.create({
      data: { performedAt: at, barberId: id.barber, paymentMethod: "PIX", feeBps: 0, totalCents: 4000, feeCents: 0, netCents: 4000, source: "APP_BARBER", externalId: "1", classification: "PENDING" },
    });
    await assert.rejects(deleteManualVisit(db, imported.id), /importada do App Barber/);
    await assert.rejects(
      updateManualVisit(db, imported.id, { performedAt: at, barberId: id.barber, paymentMethod: "PIX", items: [{ serviceId: id.corte, productId: null, quantity: 1, unitPriceCents: 4000 }], notes: null }),
      /importada do App Barber/,
    );
  });

  test("excluir visita manual remove a visita e os itens", async () => {
    await deleteManualVisit(db, visitId);
    assert.equal(await db.appointment.count({ where: { id: visitId } }), 0);
    assert.equal(await db.appointmentItem.count({ where: { appointmentId: visitId } }), 0);
  });
});
