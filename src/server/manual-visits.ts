// Lançamento manual de visita (ação secundária: visita que não passou pelo App Barber).
// Total = soma dos itens; taxa da forma de pagamento (catálogo de agora) congelada na visita.
// Só visita MANUAL pode ser editada por inteiro ou excluída: a importada voltaria na próxima importação.

import type { PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethodValue } from "@/domain/payments";
import { calcAppointmentTotals } from "@/domain/pricing";
import { validateItems } from "@/domain/price-rules";
import type { ItemInput } from "@/domain/visit-items";
import { buildItemRows, VisitItemsError } from "./appointments";

export type ManualVisitData = {
  performedAt: Date;
  barberId: string;
  paymentMethod: PaymentMethodValue;
  items: ItemInput[];
  notes: string | null;
};

function totalsOf(items: ItemInput[], feeBps: number) {
  const sum = items.reduce((s, i) => s + (Number.isInteger(i.quantity) && Number.isInteger(i.unitPriceCents) ? i.quantity * i.unitPriceCents : 0), 0);
  const errors = validateItems(items, sum, "o total");
  if (errors.length > 0) throw new VisitItemsError(errors[0]);
  return calcAppointmentTotals(items, feeBps);
}

async function feeFor(tx: Pick<PrismaClient, "paymentFee">, method: PaymentMethodValue) {
  return (await tx.paymentFee.findUnique({ where: { method }, select: { feeBps: true } }))?.feeBps ?? 0;
}

export async function createManualVisit(db: PrismaClient, data: ManualVisitData): Promise<string> {
  return db.$transaction(async (tx) => {
    const barber = await tx.barber.findUnique({ where: { id: data.barberId }, select: { id: true } });
    if (!barber) throw new VisitItemsError("Escolha o barbeiro.");
    const feeBps = await feeFor(tx, data.paymentMethod);
    const totals = totalsOf(data.items, feeBps);
    const visit = await tx.appointment.create({
      data: {
        performedAt: data.performedAt,
        barberId: data.barberId,
        paymentMethod: data.paymentMethod,
        feeBps,
        ...totals,
        notes: data.notes,
        source: "MANUAL",
        classification: "CLASSIFIED",
      },
      select: { id: true },
    });
    await tx.appointmentItem.createMany({ data: await buildItemRows(tx, visit.id, data.items) });
    return visit.id;
  });
}

async function lockManual(tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], id: string) {
  const rows = await tx.$queryRaw<{ source: string }[]>`SELECT source::text AS source FROM appointments WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw new VisitItemsError("Visita não encontrada.");
  if (rows[0].source !== "MANUAL") {
    throw new VisitItemsError("Visita importada do App Barber não pode ser editada nem excluída aqui; corrija só os itens.");
  }
}

export async function updateManualVisit(db: PrismaClient, id: string, data: ManualVisitData): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockManual(tx, id);
    const barber = await tx.barber.findUnique({ where: { id: data.barberId }, select: { id: true } });
    if (!barber) throw new VisitItemsError("Escolha o barbeiro.");
    const feeBps = await feeFor(tx, data.paymentMethod);
    const totals = totalsOf(data.items, feeBps);
    await tx.appointmentItem.deleteMany({ where: { appointmentId: id } });
    await tx.appointmentItem.createMany({ data: await buildItemRows(tx, id, data.items) });
    await tx.appointment.update({
      where: { id },
      data: {
        performedAt: data.performedAt,
        barberId: data.barberId,
        paymentMethod: data.paymentMethod,
        feeBps,
        ...totals,
        notes: data.notes,
        classification: "CLASSIFIED",
        priceRuleId: null,
      },
    });
  });
}

export async function deleteManualVisit(db: PrismaClient, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockManual(tx, id);
    await tx.appointment.delete({ where: { id } }); // itens saem junto (onDelete: Cascade)
  });
}
