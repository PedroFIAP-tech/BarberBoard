// Fechamento do dia (puro, sem Prisma nem React): resumo das visitas e conferência de caixa.

import { PAYMENT_METHODS, type PaymentMethodValue } from "./payments";
import { revenueByGroup, ticketByGroup, type GroupTickets, type GroupTotals, type ReportItem } from "./reports";

/** Uma visita do dia, com os itens no formato dos relatórios. */
export type ClosingVisit = {
  barberId: string;
  paymentMethod: PaymentMethodValue;
  totalCents: number;
  feeCents: number;
  netCents: number;
  classification: "CLASSIFIED" | "PENDING";
  /** Itens da visita (vazio quando PENDING). */
  items: ReportItem[];
};

export type PaymentTotal = {
  method: PaymentMethodValue;
  count: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
};

export type BarberTotal = { barberId: string; count: number; grossCents: number; netCents: number };

export type DaySummary = {
  visitCount: number;
  /** Serviço, Extra, Produto e A classificar; grossCents = soma dos grupos. */
  groups: GroupTotals;
  tickets: GroupTickets;
  feeCents: number;
  netCents: number;
  /** As 4 formas de pagamento, sempre na mesma ordem (zeradas quando não houve). */
  byPayment: PaymentTotal[];
  /** Por barbeiro, quem faturou mais primeiro. */
  byBarber: BarberTotal[];
  /** Quanto entrou em dinheiro (base da conferência de caixa). */
  cashSalesCents: number;
  pendingCount: number;
};

export function summarizeDay(visits: ClosingVisit[]): DaySummary {
  const items = visits.filter((v) => v.classification === "CLASSIFIED").flatMap((v) => v.items);
  const pending = visits.filter((v) => v.classification === "PENDING");
  const groups = revenueByGroup(
    items,
    pending.reduce((sum, v) => sum + v.totalCents, 0),
  );

  const byPayment = new Map<PaymentMethodValue, PaymentTotal>(
    PAYMENT_METHODS.map((method) => [method, { method, count: 0, grossCents: 0, feeCents: 0, netCents: 0 }]),
  );
  const byBarber = new Map<string, BarberTotal>();

  for (const v of visits) {
    const p = byPayment.get(v.paymentMethod)!;
    p.count += 1;
    p.grossCents += v.totalCents;
    p.feeCents += v.feeCents;
    p.netCents += v.netCents;

    const b = byBarber.get(v.barberId) ?? { barberId: v.barberId, count: 0, grossCents: 0, netCents: 0 };
    b.count += 1;
    b.grossCents += v.totalCents;
    b.netCents += v.netCents;
    byBarber.set(v.barberId, b);
  }

  return {
    visitCount: visits.length,
    groups,
    tickets: ticketByGroup(groups, visits.length),
    feeCents: visits.reduce((sum, v) => sum + v.feeCents, 0),
    netCents: visits.reduce((sum, v) => sum + v.netCents, 0),
    byPayment: [...byPayment.values()],
    byBarber: [...byBarber.values()].sort((a, b) => b.grossCents - a.grossCents || b.count - a.count),
    cashSalesCents: byPayment.get("CASH")!.grossCents,
    pendingCount: pending.length,
  };
}

// ─── Conferência de caixa ───────────────────────────────────────────────────

function assertNonNegativeInt(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} deve ser um inteiro >= 0 (recebido: ${value})`);
  }
}

/** Dinheiro que deveria estar na gaveta: fundo de troco + o que entrou em dinheiro. */
export function expectedCash(openingCashCents: number, cashSalesCents: number): number {
  assertNonNegativeInt(openingCashCents, "openingCashCents");
  assertNonNegativeInt(cashSalesCents, "cashSalesCents");
  return openingCashCents + cashSalesCents;
}

/** Conferência: diferença = contado − esperado (negativo = faltou dinheiro). */
export function cashCheck(input: { openingCashCents: number; cashSalesCents: number; countedCashCents: number }) {
  assertNonNegativeInt(input.countedCashCents, "countedCashCents");
  const expectedCashCents = expectedCash(input.openingCashCents, input.cashSalesCents);
  return { expectedCashCents, differenceCents: input.countedCashCents - expectedCashCents };
}

/**
 * O fechamento salvo ficou desatualizado? Acontece quando entram ou mudam visitas em dinheiro
 * depois da conferência (ex.: uma importação nova do App Barber).
 */
export function isClosingStale(
  saved: { openingCashCents: number; expectedCashCents: number },
  currentCashSalesCents: number,
): boolean {
  return saved.expectedCashCents !== expectedCash(saved.openingCashCents, currentCashSalesCents);
}
