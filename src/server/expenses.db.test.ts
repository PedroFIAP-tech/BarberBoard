// Despesas contra um Postgres de verdade. ⚠️ APAGA o banco de TEST_DATABASE_URL (só host local).

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createCategory, deleteExpense, ExpenseError, getMonthExpenses, saveExpense, setCategoryActive } from "./expenses";

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

describe("despesas (banco)", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, () => {
  let db: PrismaClient;
  const id = { aluguel: "", luz: "", comissao: "", luiz: "" };

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
    id.aluguel = await createCategory(db, "Aluguel");
    id.luz = await createCategory(db, "Luz");
    id.comissao = await createCategory(db, "Comissão");
    id.luiz = (await db.barber.create({ data: { name: "Luiz" } })).id;
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("limites do mês: dia 30/11 entra em novembro, 01/12 não", async () => {
    await saveExpense(db, null, { dayKey: "2026-11-01", categoryId: id.aluguel, amountCents: 150000, description: "Aluguel", barberId: null });
    await saveExpense(db, null, { dayKey: "2026-11-30", categoryId: id.luz, amountCents: 22000, description: null, barberId: null });
    await saveExpense(db, null, { dayKey: "2026-12-01", categoryId: id.luz, amountCents: 99900, description: null, barberId: null });
    await saveExpense(db, null, { dayKey: "2026-11-15", categoryId: id.comissao, amountCents: 30000, description: "Comissão", barberId: id.luiz });
    const nov = await getMonthExpenses(db, "2026-11");
    assert.equal(nov.expenses.length, 3);
    assert.equal(nov.totalCents, 202000);
    assert.deepEqual(nov.byCategory.map((c) => [c.name, c.totalCents]), [["Aluguel", 150000], ["Comissão", 30000], ["Luz", 22000]]);
    assert.deepEqual(nov.expenses.map((e) => e.dayKey), ["2026-11-30", "2026-11-15", "2026-11-01"]);
    assert.equal(nov.expenses.find((e) => e.barberName)?.barberName, "Luiz");
    assert.equal((await getMonthExpenses(db, "2026-12")).totalCents, 99900);
  });

  test("editar move a despesa de mês; excluir remove", async () => {
    const nov = await getMonthExpenses(db, "2026-11");
    const luz = nov.expenses.find((e) => e.categoryId === id.luz)!;
    await saveExpense(db, luz.id, { dayKey: "2026-10-31", categoryId: id.luz, amountCents: 21000, description: "Luz de outubro", barberId: null });
    assert.equal((await getMonthExpenses(db, "2026-10")).totalCents, 21000);
    await deleteExpense(db, luz.id);
    assert.equal((await getMonthExpenses(db, "2026-10")).totalCents, 0);
  });

  test("categoria desativada: não aceita despesa nova, mas a antiga pode ser editada", async () => {
    const nov = await getMonthExpenses(db, "2026-11");
    const old = nov.expenses.find((e) => e.categoryId === id.comissao)!;
    await setCategoryActive(db, id.comissao, false);
    await assert.rejects(
      saveExpense(db, null, { dayKey: "2026-11-20", categoryId: id.comissao, amountCents: 100, description: null, barberId: null }),
      ExpenseError,
    );
    await saveExpense(db, old.id, { dayKey: old.dayKey, categoryId: id.comissao, amountCents: 31000, description: "Comissão", barberId: id.luiz });
    assert.equal((await getMonthExpenses(db, "2026-11")).byCategory.find((c) => c.categoryId === id.comissao)?.totalCents, 31000);
  });

  test("valor zero e categoria repetida são recusados com mensagem", async () => {
    await assert.rejects(saveExpense(db, null, { dayKey: "2026-11-20", categoryId: id.luz, amountCents: 0, description: null, barberId: null }), /maior que zero/);
    await assert.rejects(createCategory(db, "Luz"), /Já existe a categoria "Luz"/);
  });
});
