// Fechamento do dia: leitura das visitas do dia (fuso de Brasília) e conferência de caixa.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { cashCheck, isClosingStale, summarizeDay, type DaySummary } from "@/domain/closing";
import type { PaymentMethodValue } from "@/domain/payments";
import type { ReportItem } from "@/domain/reports";
import { dayBoundsBR, toDbDate } from "@/lib/dates";

type Db = PrismaClient | Prisma.TransactionClient;

export type DayVisitView = {
  id: string;
  performedAt: Date;
  barberName: string;
  paymentMethod: PaymentMethodValue;
  totalCents: number;
  classification: "CLASSIFIED" | "PENDING";
  /** "Corte + Sobrancelha"; null quando a visita está a classificar. */
  itemsLabel: string | null;
  source: "MANUAL" | "APP_BARBER";
};

export type SavedClosingView = {
  openingCashCents: number;
  expectedCashCents: number;
  countedCashCents: number;
  differenceCents: number;
  notes: string | null;
  closedAt: Date;
};

export type DayClosingView = {
  dayKey: string;
  summary: DaySummary;
  visits: DayVisitView[];
  barberNames: Record<string, string>;
  closing: SavedClosingView | null;
  /** O fechamento salvo não bate mais com o dinheiro do dia (entraram ou mudaram visitas). */
  stale: boolean;
  /** Fundo de troco sugerido: o do fechamento salvo, senão o do último fechamento anterior, senão 0. */
  suggestedOpeningCashCents: number;
  /** Comandas "a confirmar" do dia, por barbeiro. NÃO entram em nenhuma soma do dia. */
  toConfirm: { barberName: string; count: number; totalCents: number }[];
};

/** "2× Corte + Sobrancelha" */
export function itemsLabel(items: { quantity: number; name: string }[]): string | null {
  if (items.length === 0) return null;
  return items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(" + ");
}

const dayWhere = (dayKey: string) => {
  const { start, end } = dayBoundsBR(dayKey);
  return { performedAt: { gte: start, lte: end } };
};

async function cashSalesOfDay(db: Db, dayKey: string): Promise<number> {
  const { _sum } = await db.appointment.aggregate({
    where: { ...dayWhere(dayKey), paymentMethod: "CASH" },
    _sum: { totalCents: true },
  });
  return _sum.totalCents ?? 0;
}

export async function getDayClosingView(db: Db, input: { dayKey: string }): Promise<DayClosingView> {
  const { start, end } = dayBoundsBR(input.dayKey);
  const [rows, barbers, closing, previous, pending] = await Promise.all([
    db.appointment.findMany({
      where: dayWhere(input.dayKey),
      orderBy: { performedAt: "asc" },
      select: {
        id: true,
        performedAt: true,
        barberId: true,
        paymentMethod: true,
        totalCents: true,
        feeCents: true,
        netCents: true,
        classification: true,
        source: true,
        items: {
          orderBy: { totalCents: "desc" },
          select: {
            serviceId: true,
            productId: true,
            quantity: true,
            totalCents: true,
            unitCostCents: true,
            service: { select: { name: true, category: true } },
            product: { select: { name: true } },
          },
        },
      },
    }),
    db.barber.findMany({ select: { id: true, name: true } }),
    db.cashClosing.findUnique({ where: { date: toDbDate(input.dayKey) } }),
    db.cashClosing.findFirst({
      where: { date: { lt: toDbDate(input.dayKey) } },
      orderBy: { date: "desc" },
      select: { openingCashCents: true },
    }),
    db.pendingConfirmation.groupBy({
      by: ["barberId"],
      where: { status: "PENDING", scheduledAt: { gte: start, lte: end } },
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
  ]);

  const barberNames = Object.fromEntries(barbers.map((b) => [b.id, b.name]));
  const summary = summarizeDay(
    rows.map((r) => ({
      barberId: r.barberId,
      paymentMethod: r.paymentMethod,
      totalCents: r.totalCents,
      feeCents: r.feeCents,
      netCents: r.netCents,
      classification: r.classification,
      items: r.items.map(
        (i): ReportItem => ({
          serviceId: i.serviceId,
          productId: i.productId,
          serviceCategory: i.service?.category ?? null,
          quantity: i.quantity,
          totalCents: i.totalCents,
          unitCostCents: i.unitCostCents,
        }),
      ),
    })),
  );

  return {
    dayKey: input.dayKey,
    summary,
    visits: rows.map((r) => ({
      id: r.id,
      performedAt: r.performedAt,
      barberName: barberNames[r.barberId] ?? "—",
      paymentMethod: r.paymentMethod,
      totalCents: r.totalCents,
      classification: r.classification,
      itemsLabel: itemsLabel(r.items.map((i) => ({ quantity: i.quantity, name: i.service?.name ?? i.product?.name ?? "?" }))),
      source: r.source,
    })),
    barberNames,
    closing: closing && {
      openingCashCents: closing.openingCashCents,
      expectedCashCents: closing.expectedCashCents,
      countedCashCents: closing.countedCashCents,
      differenceCents: closing.differenceCents,
      notes: closing.notes,
      closedAt: closing.closedAt,
    },
    stale: closing ? isClosingStale(closing, summary.cashSalesCents) : false,
    suggestedOpeningCashCents: closing?.openingCashCents ?? previous?.openingCashCents ?? 0,
    toConfirm: pending.map((p) => ({
      barberName: barberNames[p.barberId] ?? "—",
      count: p._count._all,
      totalCents: p._sum.valueCents ?? 0,
    })),
  };
}

/**
 * Grava (ou refaz) a conferência de caixa do dia. O esperado é recalculado aqui a partir das
 * visitas em dinheiro do dia; o formulário só informa o fundo de troco e o valor contado.
 */
export async function saveCashClosing(
  db: Db,
  input: { dayKey: string; openingCashCents: number; countedCashCents: number; notes: string | null; now: Date },
) {
  const cashSalesCents = await cashSalesOfDay(db, input.dayKey);
  const { expectedCashCents, differenceCents } = cashCheck({
    openingCashCents: input.openingCashCents,
    cashSalesCents,
    countedCashCents: input.countedCashCents,
  });
  const data = {
    openingCashCents: input.openingCashCents,
    expectedCashCents,
    countedCashCents: input.countedCashCents,
    differenceCents,
    notes: input.notes,
    closedAt: input.now,
  };
  return db.cashClosing.upsert({
    where: { date: toDbDate(input.dayKey) },
    create: { date: toDbDate(input.dayKey), ...data },
    update: data,
  });
}

