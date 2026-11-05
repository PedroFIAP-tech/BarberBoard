// Escrita dos itens das visitas: classificar, corrigir e voltar para "a classificar".
// ÚNICO lugar que grava AppointmentItem fora da importação. Garante, em transação:
//   CLASSIFIED ⇒ itens somam o total da visita · PENDING ⇒ nenhum item · custo do produto congelado.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { calcItemTotal } from "@/domain/pricing";
import { validatePriceRule } from "@/domain/price-rules";
import { validateVisitItems, type ItemInput } from "@/domain/visit-items";

type Tx = Prisma.TransactionClient;

/** Erro de regra de negócio, com mensagem pronta para mostrar na tela. */
export class VisitItemsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisitItemsError";
  }
}

/**
 * Confere que todos os serviços/produtos existem e devolve o custo atual de cada produto.
 * Lança VisitItemsError (mensagem amigável) em vez de deixar estourar a foreign key.
 */
export async function catalogCosts(tx: Tx, items: ItemInput[]): Promise<Map<string, number | null>> {
  const serviceIds = [...new Set(items.flatMap((i) => (i.serviceId ? [i.serviceId] : [])))];
  const productIds = [...new Set(items.flatMap((i) => (i.productId ? [i.productId] : [])))];
  const [services, products] = await Promise.all([
    tx.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true } }),
    tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costCents: true } }),
  ]);
  if (services.length !== serviceIds.length || products.length !== productIds.length) {
    throw new VisitItemsError("Serviço ou produto não encontrado no catálogo.");
  }
  return new Map(products.map((p) => [p.id, p.costCents]));
}

/** Linhas de AppointmentItem para uma visita, com o custo atual dos produtos congelado. */
export async function buildItemRows(tx: Tx, appointmentId: string, items: ItemInput[]) {
  const costOf = await catalogCosts(tx, items);
  return items.map((i) => ({
    appointmentId,
    serviceId: i.serviceId,
    productId: i.productId,
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
    unitCostCents: i.productId ? (costOf.get(i.productId) ?? null) : null,
    totalCents: calcItemTotal(i),
  }));
}

/** Cria uma regra de valor (dentro de uma transação já aberta). */
export async function createRuleTx(tx: Tx, data: { label: string; amountCents: number; items: ItemInput[] }) {
  const errors = validatePriceRule({ label: data.label, amountCents: data.amountCents, items: data.items });
  if (errors.length > 0) throw new VisitItemsError(errors[0]);
  await catalogCosts(tx, data.items);
  const last = await tx.priceRule.aggregate({ _max: { sortOrder: true } });
  const rule = await tx.priceRule.create({
    data: {
      label: data.label.trim(),
      amountCents: data.amountCents,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
      items: {
        create: data.items.map((i, n) => ({
          serviceId: i.serviceId,
          productId: i.productId,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          sortOrder: n,
        })),
      },
    },
    select: { id: true },
  });
  return rule.id;
}

/**
 * Troca TODOS os itens de uma visita (classificar ou corrigir) e marca como CLASSIFIED.
 * Com `saveAsRuleLabel`, cria também uma regra de valor com esses itens (só se o valor ainda
 * não tiver regra ativa, para não deixar a importação ambígua).
 */
export async function setAppointmentItems(
  db: PrismaClient,
  input: { appointmentId: string; items: ItemInput[]; priceRuleId?: string | null; saveAsRuleLabel?: string | null },
): Promise<{ ruleId: string | null }> {
  return db.$transaction(async (tx) => {
    // Trava a visita: duas correções simultâneas não misturam itens.
    const rows = await tx.$queryRaw<{ total_cents: number }[]>`
      SELECT total_cents FROM appointments WHERE id = ${input.appointmentId} FOR UPDATE`;
    if (rows.length === 0) throw new VisitItemsError("Visita não encontrada.");
    const totalCents = Number(rows[0].total_cents);

    const errors = validateVisitItems(input.items, totalCents);
    if (errors.length > 0) throw new VisitItemsError(errors[0]);

    let ruleId = input.priceRuleId ?? null;
    if (input.saveAsRuleLabel) {
      const existing = await tx.priceRule.count({ where: { active: true, amountCents: totalCents } });
      if (existing > 0) throw new VisitItemsError("Já existe uma regra ativa para esse valor. Edite-a em Regras.");
      ruleId = await createRuleTx(tx, { label: input.saveAsRuleLabel, amountCents: totalCents, items: input.items });
    }

    await tx.appointmentItem.deleteMany({ where: { appointmentId: input.appointmentId } });
    await tx.appointmentItem.createMany({ data: await buildItemRows(tx, input.appointmentId, input.items) });
    await tx.appointment.update({
      where: { id: input.appointmentId },
      data: { classification: "CLASSIFIED", priceRuleId: ruleId },
    });
    return { ruleId };
  });
}

/** Itens de uma regra ativa e válida (lança erro amigável se não der para usar). */
export async function ruleItems(db: PrismaClient | Tx, ruleId: string): Promise<{ amountCents: number; items: ItemInput[] }> {
  const rule = await db.priceRule.findUnique({
    where: { id: ruleId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!rule || !rule.active) throw new VisitItemsError("Regra não encontrada ou desativada.");
  const items = rule.items.map((i) => ({
    serviceId: i.serviceId,
    productId: i.productId,
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
  }));
  if (validatePriceRule({ label: rule.label, amountCents: rule.amountCents, items }).length > 0) {
    throw new VisitItemsError("Esta regra está inválida (os itens não somam o valor). Corrija em Regras.");
  }
  return { amountCents: rule.amountCents, items };
}

/** Classifica uma visita usando uma regra de valor. */
export async function applyRuleToVisit(db: PrismaClient, input: { appointmentId: string; ruleId: string }) {
  const { items } = await ruleItems(db, input.ruleId);
  return setAppointmentItems(db, { appointmentId: input.appointmentId, items, priceRuleId: input.ruleId });
}

/** Classifica uma visita como um único serviço pelo valor total (ex.: R$ 40 → Barba). */
export async function applyServiceToVisit(db: PrismaClient, input: { appointmentId: string; serviceId: string }) {
  const visit = await db.appointment.findUnique({ where: { id: input.appointmentId }, select: { totalCents: true } });
  if (!visit) throw new VisitItemsError("Visita não encontrada.");
  return setAppointmentItems(db, {
    appointmentId: input.appointmentId,
    items: [{ serviceId: input.serviceId, productId: null, quantity: 1, unitPriceCents: visit.totalCents }],
    priceRuleId: null,
  });
}

/**
 * Classifica de uma vez TODAS as visitas a classificar de um valor com os mesmos itens.
 * Seguro contra corrida: só as visitas que ainda estão PENDING no momento do update recebem itens.
 */
export async function classifyPendingByAmount(
  db: PrismaClient,
  input: { amountCents: number; items: ItemInput[]; priceRuleId: string | null },
): Promise<number> {
  const errors = validateVisitItems(input.items, input.amountCents);
  if (errors.length > 0) throw new VisitItemsError(errors[0]);

  return db.$transaction(
    async (tx) => {
      const updated = await tx.appointment.updateManyAndReturn({
        where: { classification: "PENDING", totalCents: input.amountCents },
        data: { classification: "CLASSIFIED", priceRuleId: input.priceRuleId },
        select: { id: true },
      });
      // Visita PENDING não tem itens (invariante), então só cria.
      const template = await buildItemRows(tx, "", input.items);
      const rows = updated.flatMap((v) => template.map((row) => ({ ...row, appointmentId: v.id })));
      if (rows.length > 0) await tx.appointmentItem.createMany({ data: rows });
      return updated.length;
    },
    { timeout: 60_000 },
  );
}

/** Aplica uma regra a todas as visitas a classificar do valor dela. */
export async function applyRuleToPending(db: PrismaClient, ruleId: string): Promise<number> {
  const { amountCents, items } = await ruleItems(db, ruleId);
  return classifyPendingByAmount(db, { amountCents, items, priceRuleId: ruleId });
}

/** Volta a visita para "a classificar" (remove os itens). */
export async function unclassifyVisit(db: PrismaClient, appointmentId: string) {
  await db.$transaction(async (tx) => {
    await tx.appointmentItem.deleteMany({ where: { appointmentId } });
    await tx.appointment.update({ where: { id: appointmentId }, data: { classification: "PENDING", priceRuleId: null } });
  });
}
