// Catálogo contra um Postgres de verdade. ⚠️ APAGA o banco de TEST_DATABASE_URL (só host local).

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { setAppointmentItems } from "./appointments";
import { CatalogError, listFees, listProducts, listServices, saveFee, saveProduct, saveService, setProductActive, setServiceActive } from "./catalog";
import { createRule } from "./rules";

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

describe("catálogo (banco)", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, () => {
  let db: PrismaClient;
  const id = { corte: "", sobrancelha: "", pomada: "" };

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("serviços: criar, ordem automática, editar, nome repetido com mensagem amigável", async () => {
    id.corte = await saveService(db, null, { name: " Corte ", category: "MAIN", defaultPriceCents: 4000, durationMin: 40 });
    id.sobrancelha = await saveService(db, null, { name: "Sobrancelha", category: "EXTRA", defaultPriceCents: 1000, durationMin: null });
    const services = await listServices(db);
    assert.deepEqual(services.map((s) => [s.name, s.sortOrder]), [["Corte", 0], ["Sobrancelha", 1]]);
    await assert.rejects(
      saveService(db, null, { name: "Corte", category: "MAIN", defaultPriceCents: 3000, durationMin: null }),
      (e: Error) => e instanceof CatalogError && /Já existe um serviço chamado "Corte"/.test(e.message),
    );
  });

  test("mudar o preço do serviço não altera visitas já lançadas", async () => {
    const barber = await db.barber.create({ data: { name: "Luiz" } });
    const visit = await db.appointment.create({
      data: { performedAt: new Date(), barberId: barber.id, paymentMethod: "PIX", feeBps: 0, totalCents: 4000, feeCents: 0, netCents: 4000, classification: "PENDING" },
    });
    await setAppointmentItems(db, { appointmentId: visit.id, items: [{ serviceId: id.corte, productId: null, quantity: 1, unitPriceCents: 4000 }] });
    await saveService(db, id.corte, { name: "Corte", category: "MAIN", defaultPriceCents: 4500, durationMin: 40 });
    const item = await db.appointmentItem.findFirstOrThrow({ where: { appointmentId: visit.id } });
    assert.equal(item.unitPriceCents, 4000);
  });

  test("desativar serviço usado por regra ativa devolve as regras afetadas", async () => {
    await createRule(db, { label: "Corte e sobrancelha", amountCents: 5000, items: [{ serviceId: id.corte, productId: null, quantity: 1, unitPriceCents: 4000 }, { serviceId: id.sobrancelha, productId: null, quantity: 1, unitPriceCents: 1000 }] });
    assert.deepEqual(await setServiceActive(db, id.sobrancelha, false), { affectedRules: ["Corte e sobrancelha"] });
    assert.deepEqual(await setServiceActive(db, id.sobrancelha, true), { affectedRules: [] });
  });

  test("produtos: margem calculada; sem custo = sem margem; desativar", async () => {
    id.pomada = await saveProduct(db, null, { name: "Pomada", priceCents: 3500, costCents: 1750 });
    await saveProduct(db, null, { name: "Gel", priceCents: 2500, costCents: null });
    const products = await listProducts(db);
    assert.deepEqual(products.find((p) => p.name === "Pomada")?.margin, { marginCents: 1750, marginBps: 5000 });
    assert.equal(products.find((p) => p.name === "Gel")?.margin, null);
    await assert.rejects(saveProduct(db, null, { name: "Gel", priceCents: 100, costCents: null }), CatalogError);
    assert.deepEqual(await setProductActive(db, id.pomada, false), { affectedRules: [] });
  });

  test("taxas: as 4 formas sempre listadas (0% se não cadastrada); salvar faz upsert", async () => {
    assert.deepEqual((await listFees(db)).map((f) => [f.method, f.feeBps]), [["PIX", 0], ["CASH", 0], ["DEBIT", 0], ["CREDIT", 0]]);
    await saveFee(db, "CREDIT", 498);
    await saveFee(db, "CREDIT", 450);
    assert.equal((await listFees(db)).find((f) => f.method === "CREDIT")?.feeBps, 450);
    assert.equal(await db.paymentFee.count(), 1);
    await assert.rejects(saveFee(db, "DEBIT", 10_001), CatalogError);
  });
});
