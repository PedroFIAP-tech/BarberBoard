// Cálculos puros do catálogo (sem Prisma nem React).

/**
 * Margem de um produto: venda − custo, em centavos e em basis points sobre o preço de venda.
 * Sem custo cadastrado → null (a tela mostra "—"). Preço 0 → margem em % indefinida (null).
 */
export function unitMargin(priceCents: number, costCents: number | null): { marginCents: number; marginBps: number | null } | null {
  if (costCents === null) return null;
  const marginCents = priceCents - costCents;
  return { marginCents, marginBps: priceCents > 0 ? Math.round((marginCents * 10_000) / priceCents) : null };
}
