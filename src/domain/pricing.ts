// Cálculos puros de valores de um atendimento. Sem Prisma, sem React:
// recebem números (centavos / basis points) e devolvem números.

export type PricedItem = {
  quantity: number;
  unitPriceCents: number;
};

export type AppointmentTotals = {
  totalCents: number;
  feeCents: number;
  netCents: number;
};

function assertNonNegativeInt(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} deve ser um inteiro >= 0 (recebido: ${value})`);
  }
}

/** Total de um item: quantidade × preço unitário. */
export function calcItemTotal({ quantity, unitPriceCents }: PricedItem): number {
  assertNonNegativeInt(quantity, "quantity");
  assertNonNegativeInt(unitPriceCents, "unitPriceCents");
  return quantity * unitPriceCents;
}

/**
 * Taxa da maquininha sobre um valor. Arredonda para o centavo mais próximo.
 * calcFee(4590, 199) → { feeCents: 91, netCents: 4499 }
 */
export function calcFee(amountCents: number, feeBps: number) {
  assertNonNegativeInt(amountCents, "amountCents");
  assertNonNegativeInt(feeBps, "feeBps");
  const feeCents = Math.round((amountCents * feeBps) / 10_000);
  return { feeCents, netCents: amountCents - feeCents };
}

/**
 * Totais de uma visita: soma dos itens e taxa aplicada sobre o total
 * (a maquininha cobra sobre a transação inteira, não por item).
 */
export function calcAppointmentTotals(items: PricedItem[], feeBps: number): AppointmentTotals {
  const totalCents = items.reduce((sum, item) => sum + calcItemTotal(item), 0);
  const { feeCents, netCents } = calcFee(totalCents, feeBps);
  return { totalCents, feeCents, netCents };
}
