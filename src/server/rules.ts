// Regras de valor: listar, criar, editar, ativar/desativar.
// Editar uma regra NÃO muda as visitas já classificadas por ela (os itens ficam congelados).

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { validatePriceRule } from "@/domain/price-rules";
import type { ItemInput } from "@/domain/visit-items";
import { catalogCosts, createRuleTx, VisitItemsError } from "./appointments";

type Db = PrismaClient | Prisma.TransactionClient;

export type RuleData = { label: string; amountCents: number; items: ItemInput[] };

export type RuleListItem = {
  id: string;
  label: string;
  amountCents: number;
  active: boolean;
  itemsText: string;
  /** Visitas a classificar com o mesmo valor (candidatas a "aplicar às pendentes"). */
  pendingCount: number;
  /** Outras regras ativas com o mesmo valor (deixam a importação ambígua). */
  sameAmountActiveCount: number;
};

const itemName = (i: { quantity: number; service: { name: string } | null; product: { name: string } | null }) => {
  const name = i.service?.name ?? i.product?.name ?? "?";
  return i.quantity > 1 ? `${i.quantity}× ${name}` : name;
};

/** Visitas a classificar por valor. */
export async function pendingCountByAmount(db: Db): Promise<Map<number, number>> {
  const groups = await db.appointment.groupBy({
    by: ["totalCents"],
    where: { classification: "PENDING" },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.totalCents, g._count._all]));
}

export async function listRules(db: Db): Promise<RuleListItem[]> {
  const [rules, pending] = await Promise.all([
    db.priceRule.findMany({
      orderBy: [{ active: "desc" }, { amountCents: "asc" }, { sortOrder: "asc" }],
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          select: { quantity: true, service: { select: { name: true } }, product: { select: { name: true } } },
        },
      },
    }),
    pendingCountByAmount(db),
  ]);
  return rules.map((r) => ({
    id: r.id,
    label: r.label,
    amountCents: r.amountCents,
    active: r.active,
    itemsText: r.items.map(itemName).join(" + "),
    pendingCount: pending.get(r.amountCents) ?? 0,
    sameAmountActiveCount: rules.filter((o) => o.id !== r.id && o.active && o.amountCents === r.amountCents).length,
  }));
}

export async function getRule(db: Db, id: string) {
  const rule = await db.priceRule.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!rule) return null;
  return {
    id: rule.id,
    label: rule.label,
    amountCents: rule.amountCents,
    active: rule.active,
    items: rule.items.map((i) => ({
      serviceId: i.serviceId,
      productId: i.productId,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
    })),
  };
}

export async function createRule(db: PrismaClient, data: RuleData): Promise<string> {
  return db.$transaction((tx) => createRuleTx(tx, data));
}

export async function updateRule(db: PrismaClient, id: string, data: RuleData): Promise<string> {
  const errors = validatePriceRule(data);
  if (errors.length > 0) throw new VisitItemsError(errors[0]);
  return db.$transaction(async (tx) => {
    const exists = await tx.priceRule.count({ where: { id } });
    if (exists === 0) throw new VisitItemsError("Regra não encontrada.");
    await catalogCosts(tx, data.items);
    await tx.priceRuleItem.deleteMany({ where: { ruleId: id } });
    await tx.priceRule.update({
      where: { id },
      data: {
        label: data.label.trim(),
        amountCents: data.amountCents,
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
    });
    return id;
  });
}

export async function setRuleActive(db: Db, id: string, active: boolean) {
  await db.priceRule.update({ where: { id }, data: { active } });
}
