// Leitura do detalhe de uma visita (a escrita dos itens fica em src/server/appointments.ts).

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethodValue } from "@/domain/payments";

type Db = PrismaClient | Prisma.TransactionClient;

export type VisitDetailView = {
  id: string;
  performedAt: Date;
  barberName: string;
  paymentMethod: PaymentMethodValue;
  totalCents: number;
  feeBps: number;
  feeCents: number;
  netCents: number;
  classification: "CLASSIFIED" | "PENDING";
  source: "MANUAL" | "APP_BARBER";
  externalId: string | null;
  ruleLabel: string | null;
  /** Obs: pode ter o nome do cliente. Só para exibir na tela; nunca em logs. */
  notes: string | null;
  items: {
    id: string;
    serviceId: string | null;
    productId: string | null;
    name: string;
    kind: "MAIN" | "EXTRA" | "PRODUCT";
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }[];
};

export async function getVisitDetail(db: Db, id: string): Promise<VisitDetailView | null> {
  const v = await db.appointment.findUnique({
    where: { id },
    select: {
      id: true,
      performedAt: true,
      paymentMethod: true,
      totalCents: true,
      feeBps: true,
      feeCents: true,
      netCents: true,
      classification: true,
      source: true,
      externalId: true,
      notes: true,
      barber: { select: { name: true } },
      priceRule: { select: { label: true } },
      items: {
        orderBy: { totalCents: "desc" },
        select: {
          id: true,
          serviceId: true,
          productId: true,
          quantity: true,
          unitPriceCents: true,
          totalCents: true,
          service: { select: { name: true, category: true } },
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!v) return null;

  return {
    id: v.id,
    performedAt: v.performedAt,
    barberName: v.barber.name,
    paymentMethod: v.paymentMethod,
    totalCents: v.totalCents,
    feeBps: v.feeBps,
    feeCents: v.feeCents,
    netCents: v.netCents,
    classification: v.classification,
    source: v.source,
    externalId: v.externalId,
    ruleLabel: v.priceRule?.label ?? null,
    notes: v.notes,
    items: v.items.map((i) => ({
      id: i.id,
      serviceId: i.serviceId,
      productId: i.productId,
      name: i.service?.name ?? i.product?.name ?? "?",
      kind: i.service ? i.service.category : "PRODUCT",
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      totalCents: i.totalCents,
    })),
  };
}
