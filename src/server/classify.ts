// Leituras para classificar e corrigir visitas.

import { cache } from "react";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethodValue } from "@/domain/payments";
import type { PriceRuleInput } from "@/domain/price-rules";
import { classifyOptions, groupByAmount, type ClassifyOption } from "@/domain/visit-items";

type Db = PrismaClient | Prisma.TransactionClient;

/** Máximo de visitas a classificar mostradas de uma vez (as mais recentes). */
export const CLASSIFY_PAGE_SIZE = 300;

export type PendingVisitView = {
  id: string;
  performedAt: Date;
  totalCents: number;
  barberName: string;
  paymentMethod: PaymentMethodValue;
};

export type ClassifyGroup = { amountCents: number; visits: PendingVisitView[]; options: ClassifyOption[] };

export type ClassifyView = { totalPending: number; shown: number; groups: ClassifyGroup[] };

export async function countPending(db: Db): Promise<number> {
  return db.appointment.count({ where: { classification: "PENDING" } });
}

/** Contagem para o selo da navegação, uma vez por requisição. Sem banco, sem selo. */
export const pendingBadgeCount = cache(async (db: Db): Promise<number | undefined> => {
  try {
    return await countPending(db);
  } catch {
    return undefined;
  }
});

async function activeRules(db: Db): Promise<{ rules: PriceRuleInput[]; nameOf: (i: { serviceId: string | null; productId: string | null }) => string }> {
  const [rules, services, products] = await Promise.all([
    db.priceRule.findMany({ where: { active: true }, include: { items: { orderBy: { sortOrder: "asc" } } } }),
    db.service.findMany({ select: { id: true, name: true } }),
    db.product.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map([...services, ...products].map((x) => [x.id, x.name]));
  return {
    rules: rules.map((r) => ({
      id: r.id,
      label: r.label,
      amountCents: r.amountCents,
      active: r.active,
      items: r.items.map((i) => ({ serviceId: i.serviceId, productId: i.productId, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
    })),
    nameOf: (i) => names.get(i.serviceId ?? i.productId ?? "") ?? "?",
  };
}

export async function getClassifyView(db: Db): Promise<ClassifyView> {
  const [totalPending, pending, { rules, nameOf }, services] = await Promise.all([
    countPending(db),
    db.appointment.findMany({
      where: { classification: "PENDING" },
      orderBy: { performedAt: "desc" },
      take: CLASSIFY_PAGE_SIZE,
      select: { id: true, performedAt: true, totalCents: true, paymentMethod: true, barber: { select: { name: true } } },
    }),
    activeRules(db),
    db.service.findMany({ select: { id: true, name: true, defaultPriceCents: true, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const groups = groupByAmount(
    pending.map((p) => ({
      id: p.id,
      performedAt: p.performedAt,
      totalCents: p.totalCents,
      barberName: p.barber.name,
      paymentMethod: p.paymentMethod,
    })),
  ).map((g) => ({ ...g, options: classifyOptions(g.amountCents, rules, services, nameOf) }));

  return { totalPending, shown: pending.length, groups };
}

export type CatalogEntry = { key: string; name: string; kind: "MAIN" | "EXTRA" | "PRODUCT"; priceCents: number };

/** "s:<id>" para serviço, "p:<id>" para produto (chave usada pelo editor de itens). */
export const catalogKey = (item: { serviceId: string | null; productId: string | null }) =>
  item.serviceId ? `s:${item.serviceId}` : `p:${item.productId}`;

/** Catálogo do editor de itens: tudo que está ativo + o que já está na visita/regra (mesmo inativo). */
export async function getEditorCatalog(db: Db, keep: { serviceIds?: string[]; productIds?: string[] } = {}): Promise<CatalogEntry[]> {
  const [services, products] = await Promise.all([
    db.service.findMany({
      where: { OR: [{ active: true }, { id: { in: keep.serviceIds ?? [] } }] },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, defaultPriceCents: true },
    }),
    db.product.findMany({
      where: { OR: [{ active: true }, { id: { in: keep.productIds ?? [] } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, priceCents: true },
    }),
  ]);
  return [
    ...services.map((s) => ({ key: `s:${s.id}`, name: s.name, kind: s.category, priceCents: s.defaultPriceCents })),
    ...products.map((p) => ({ key: `p:${p.id}`, name: p.name, kind: "PRODUCT" as const, priceCents: p.priceCents })),
  ];
}

/** Existe regra ativa para este valor? (decide se "salvar como regra" aparece) */
export async function hasActiveRuleFor(db: Db, amountCents: number): Promise<boolean> {
  return (await db.priceRule.count({ where: { active: true, amountCents } })) > 0;
}

/** Opções de um toque para um valor (regras ativas + serviços com o mesmo preço). */
export async function getOptionsForAmount(db: Db, amountCents: number): Promise<ClassifyOption[]> {
  const [{ rules, nameOf }, services] = await Promise.all([
    activeRules(db),
    db.service.findMany({ select: { id: true, name: true, defaultPriceCents: true, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return classifyOptions(amountCents, rules, services, nameOf);
}
