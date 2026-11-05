// Classificar/corrigir visitas e regras de valor contra um Postgres de verdade.
// ⚠️ APAGA o banco apontado por TEST_DATABASE_URL; só roda com host local (use `pnpm test:db`).

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  applyRuleToPending,
  applyRuleToVisit,
  applyServiceToVisit,
  setAppointmentItems,
  unclassifyVisit,
  VisitItemsError,
} from "./appointments";
import { getClassifyView } from "./classify";
import { createRule, listRules, setRuleActive, updateRule } from "./rules";

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

describe("classificar e corrigir visitas (banco)", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, () => {
  let db: PrismaClient;
  const id = { barber: "", corte: "", barba: "", sobrancelha: "", pomada: "", ruleCorte: "", ruleCS: "" };
  const s = (serviceId: string, unitPriceCents: number, quantity = 1) => ({ serviceId, productId: null, quantity, unitPriceCents });

  const pendingVisit = (totalCents: number) =>
    db.appointment.create({
      data: {
        performedAt: new Date("2026-11-04T15:00:00Z"),
        barberId: id.barber,
        paymentMethod: "PIX",
        feeBps: 0,
        totalCents,
        feeCents: 0,
        netCents: totalCents,
        source: "APP_BARBER",
        classification: "PENDING",
      },
      select: { id: true },
    });

  const itemsOf = (appointmentId: string) =>
    db.appointmentItem.findMany({ where: { appointmentId }, orderBy: { totalCents: "desc" } });

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
    id.barber = (await db.barber.create({ data: { name: "Luiz", appBarberCode: "L.F" } })).id;
    id.corte = (await db.service.create({ data: { name: "Corte", category: "MAIN", defaultPriceCents: 4000 } })).id;
    id.barba = (await db.service.create({ data: { name: "Barba", category: "MAIN", defaultPriceCents: 4000 } })).id;
    id.sobrancelha = (await db.service.create({ data: { name: "Sobrancelha", category: "EXTRA", defaultPriceCents: 1000 } })).id;
    id.pomada = (await db.product.create({ data: { name: "Pomada", priceCents: 3500, costCents: 1750 } })).id;
    id.ruleCorte = await createRule(db, { label: "Corte", amountCents: 4000, items: [s(id.corte, 4000)] });
    id.ruleCS = await createRule(db, { label: "Corte e sobrancelha", amountCents: 5000, items: [s(id.corte, 4000), s(id.sobrancelha, 1000)] });
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("classificar com itens: soma = total, CLASSIFIED, sem regra", async () => {
    const v = await pendingVisit(6500);
    await setAppointmentItems(db, { appointmentId: v.id, items: [s(id.corte, 4000), s(id.sobrancelha, 1000), s(id.sobrancelha, 1500)] });
    const after = await db.appointment.findUniqueOrThrow({ where: { id: v.id } });
    assert.deepEqual([after.classification, after.priceRuleId], ["CLASSIFIED", null]);
    assert.equal((await itemsOf(v.id)).reduce((sum, i) => sum + i.totalCents, 0), 6500);
  });

  test("itens que não fecham com o total → erro amigável, nada muda", async () => {
    const v = await pendingVisit(6500);
    await assert.rejects(setAppointmentItems(db, { appointmentId: v.id, items: [s(id.corte, 4000)] }), (e: Error) => e instanceof VisitItemsError && /total da visita/.test(e.message));
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: v.id } })).classification, "PENDING");
    assert.equal((await itemsOf(v.id)).length, 0);
  });

  test("serviço inexistente → erro amigável (não estoura a foreign key)", async () => {
    const v = await pendingVisit(4000);
    await assert.rejects(setAppointmentItems(db, { appointmentId: v.id, items: [s("naoexiste", 4000)] }), VisitItemsError);
  });

  test("CORRIGIR: R$ 40 que entrou como Corte vira Barba; itens trocados, não somados", async () => {
    const v = await pendingVisit(4000);
    await applyRuleToVisit(db, { appointmentId: v.id, ruleId: id.ruleCorte });
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: v.id } })).priceRuleId, id.ruleCorte);
    await applyServiceToVisit(db, { appointmentId: v.id, serviceId: id.barba });
    const items = await itemsOf(v.id);
    assert.deepEqual(items.map((i) => [i.serviceId, i.totalCents]), [[id.barba, 4000]]);
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: v.id } })).priceRuleId, null);
  });

  test("produto: custo do catálogo congelado no item", async () => {
    const v = await pendingVisit(7500);
    await setAppointmentItems(db, { appointmentId: v.id, items: [s(id.corte, 4000), { serviceId: null, productId: id.pomada, quantity: 1, unitPriceCents: 3500 }] });
    await db.product.update({ where: { id: id.pomada }, data: { costCents: 2500 } });
    const pomada = (await itemsOf(v.id)).find((i) => i.productId);
    assert.equal(pomada?.unitCostCents, 1750);
  });

  test("aplicar regra com valor diferente da visita → erro", async () => {
    const v = await pendingVisit(4500);
    await assert.rejects(applyRuleToVisit(db, { appointmentId: v.id, ruleId: id.ruleCS }), VisitItemsError);
  });

  test("voltar para a classificar: remove itens e regra", async () => {
    const v = await pendingVisit(5000);
    await applyRuleToVisit(db, { appointmentId: v.id, ruleId: id.ruleCS });
    await unclassifyVisit(db, v.id);
    const after = await db.appointment.findUniqueOrThrow({ where: { id: v.id } });
    assert.deepEqual([after.classification, after.priceRuleId, (await itemsOf(v.id)).length], ["PENDING", null, 0]);
  });

  test("aplicar regra às pendentes do valor: só as do mesmo valor; segunda vez não duplica", async () => {
    await db.appointmentItem.deleteMany();
    await db.appointment.deleteMany();
    const a = await pendingVisit(5000);
    const b = await pendingVisit(5000);
    const other = await pendingVisit(6500);
    const [n1, n2] = await Promise.all([applyRuleToPending(db, id.ruleCS), applyRuleToPending(db, id.ruleCS)]);
    assert.equal(n1 + n2, 2, "as duas chamadas juntas classificam 2 visitas, não 4");
    for (const v of [a, b]) assert.equal((await itemsOf(v.id)).length, 2);
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: other.id } })).classification, "PENDING");
  });

  test("salvar como regra: cria a regra com os itens e liga a visita a ela", async () => {
    const v = await pendingVisit(9000);
    const { ruleId } = await setAppointmentItems(db, {
      appointmentId: v.id,
      items: [s(id.corte, 4000), s(id.barba, 4000), s(id.sobrancelha, 1000)],
      saveAsRuleLabel: "Corte barba e sobrancelha",
    });
    assert.ok(ruleId);
    const rule = await db.priceRule.findUniqueOrThrow({ where: { id: ruleId! }, include: { items: true } });
    assert.deepEqual([rule.label, rule.amountCents, rule.items.length], ["Corte barba e sobrancelha", 9000, 3]);
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: v.id } })).priceRuleId, ruleId);
  });

  test("salvar como regra num valor que já tem regra ativa → erro (evita ambiguidade)", async () => {
    const v = await pendingVisit(4000);
    await assert.rejects(
      setAppointmentItems(db, { appointmentId: v.id, items: [s(id.barba, 4000)], saveAsRuleLabel: "Barba" }),
      /Já existe uma regra ativa/,
    );
  });

  test("editar regra não muda visitas já classificadas; desativar tira das opções", async () => {
    const v = await pendingVisit(5000);
    await applyRuleToVisit(db, { appointmentId: v.id, ruleId: id.ruleCS });
    await updateRule(db, id.ruleCS, { label: "Corte e sobrancelha", amountCents: 5500, items: [s(id.corte, 4000), s(id.sobrancelha, 1500)] });
    assert.deepEqual((await itemsOf(v.id)).map((i) => i.totalCents), [4000, 1000]);
    await setRuleActive(db, id.ruleCorte, false);
    const rules = await listRules(db);
    assert.equal(rules.find((r) => r.id === id.ruleCorte)?.active, false);
    await assert.rejects(applyRuleToVisit(db, { appointmentId: (await pendingVisit(4000)).id, ruleId: id.ruleCorte }), /desativada/);
  });

  test("regra inválida (soma ≠ valor) é recusada", async () => {
    await assert.rejects(createRule(db, { label: "Errada", amountCents: 7000, items: [s(id.corte, 4000)] }), VisitItemsError);
  });

  test("tela de classificar: grupos por valor com as opções de um toque", async () => {
    await setRuleActive(db, id.ruleCorte, true);
    const view = await getClassifyView(db);
    const g4000 = view.groups.find((g) => g.amountCents === 4000);
    assert.ok(g4000 && g4000.visits.length >= 1);
    assert.deepEqual(
      g4000.options.map((o) => (o.kind === "RULE" ? `regra:${o.label}` : `serviço:${o.label}`)),
      ["regra:Corte", "serviço:Barba"],
    );
    assert.equal(view.totalPending, view.groups.reduce((sum, g) => sum + g.visits.length, 0));
  });
});
