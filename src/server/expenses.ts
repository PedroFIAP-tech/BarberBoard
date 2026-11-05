// Despesas e categorias de despesa.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { expenseTotals } from "@/domain/expenses";
import { dayKeyFromDbDate, monthDbRange, toDbDate } from "@/lib/dates";

type Db = PrismaClient | Prisma.TransactionClient;

export class ExpenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseError";
  }
}

const isUniqueViolation = (error: unknown) => (error as { code?: unknown } | null)?.code === "P2002";

export type ExpenseRow = {
  id: string;
  dayKey: string;
  categoryId: string;
  categoryName: string;
  amountCents: number;
  description: string | null;
  barberId: string | null;
  barberName: string | null;
};

export type ExpenseData = {
  dayKey: string;
  categoryId: string;
  amountCents: number;
  description: string | null;
  barberId: string | null;
};

export type CategoryRow = { id: string; name: string; active: boolean };

export async function getMonthExpenses(db: Db, monthKey: string) {
  const { start, end } = monthDbRange(monthKey);
  const [rows, categories, barbers] = await Promise.all([
    db.expense.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        categoryId: true,
        amountCents: true,
        description: true,
        barberId: true,
        category: { select: { name: true } },
        barber: { select: { name: true } },
      },
    }),
    db.expenseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, active: true } }),
    db.barber.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const expenses: ExpenseRow[] = rows.map((r) => ({
    id: r.id,
    dayKey: dayKeyFromDbDate(r.date),
    categoryId: r.categoryId,
    categoryName: r.category.name,
    amountCents: r.amountCents,
    description: r.description,
    barberId: r.barberId,
    barberName: r.barber?.name ?? null,
  }));
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const totals = expenseTotals(expenses, categories.map((c) => c.id));

  return {
    expenses,
    totalCents: totals.totalCents,
    byCategory: totals.byCategory.map((c) => ({ ...c, name: names.get(c.categoryId) ?? "?" })),
    categories: categories as CategoryRow[],
    barbers,
  };
}

async function assertCategory(db: Db, categoryId: string, allowInactive: boolean) {
  const category = await db.expenseCategory.findUnique({ where: { id: categoryId }, select: { active: true } });
  if (!category || (!category.active && !allowInactive)) throw new ExpenseError("Escolha uma categoria ativa.");
}

export async function saveExpense(db: Db, id: string | null, data: ExpenseData): Promise<string> {
  if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) throw new ExpenseError("Informe um valor maior que zero.");
  const current = id ? await db.expense.findUnique({ where: { id }, select: { categoryId: true } }) : null;
  if (id && !current) throw new ExpenseError("Despesa não encontrada.");
  // Editar uma despesa antiga pode manter a categoria dela mesmo que hoje esteja desativada.
  await assertCategory(db, data.categoryId, current?.categoryId === data.categoryId);
  const fields = {
    date: toDbDate(data.dayKey),
    categoryId: data.categoryId,
    amountCents: data.amountCents,
    description: data.description,
    barberId: data.barberId,
  };
  if (id) {
    await db.expense.update({ where: { id }, data: fields });
    return id;
  }
  return (await db.expense.create({ data: fields, select: { id: true } })).id;
}

export async function deleteExpense(db: Db, id: string) {
  await db.expense.deleteMany({ where: { id } });
}

export async function createCategory(db: Db, name: string): Promise<string> {
  try {
    const last = await db.expenseCategory.aggregate({ _max: { sortOrder: true } });
    const created = await db.expenseCategory.create({
      data: { name: name.trim(), sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ExpenseError(`Já existe a categoria "${name.trim()}".`);
    throw error;
  }
}

export async function setCategoryActive(db: Db, id: string, active: boolean) {
  await db.expenseCategory.update({ where: { id }, data: { active } });
}
