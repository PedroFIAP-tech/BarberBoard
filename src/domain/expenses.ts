// Despesas (puro, sem Prisma nem React).

export type ExpenseLine = { categoryId: string; amountCents: number };

/** Total do mês e total por categoria (maior primeiro; empate pela ordem das categorias). */
export function expenseTotals(expenses: ExpenseLine[], categoryOrder: string[] = []) {
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    if (!Number.isInteger(e.amountCents) || e.amountCents < 0) throw new Error(`Despesa com valor inválido: ${e.amountCents}`);
    byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amountCents);
  }
  const rank = (id: string) => {
    const i = categoryOrder.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return {
    totalCents: [...byCategory.values()].reduce((sum, v) => sum + v, 0),
    byCategory: [...byCategory]
      .map(([categoryId, totalCents]) => ({ categoryId, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents || rank(a.categoryId) - rank(b.categoryId)),
  };
}
