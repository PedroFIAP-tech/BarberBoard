// Catálogo: serviços, produtos e taxas da maquininha.
// Mudar preço/custo/taxa NUNCA altera visitas já lançadas (preço, custo e taxa ficam congelados nelas).

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { unitMargin } from "@/domain/catalog";
import { PAYMENT_METHODS, type PaymentMethodValue } from "@/domain/payments";

type Db = PrismaClient | Prisma.TransactionClient;

/** Erro de regra de negócio do catálogo, com mensagem pronta para a tela. */
export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

const isUniqueViolation = (error: unknown) => (error as { code?: unknown } | null)?.code === "P2002";

export type ServiceRow = {
  id: string;
  name: string;
  category: "MAIN" | "EXTRA";
  defaultPriceCents: number;
  durationMin: number | null;
  active: boolean;
  sortOrder: number;
};

export type ServiceData = { name: string; category: "MAIN" | "EXTRA"; defaultPriceCents: number; durationMin: number | null };

export async function listServices(db: Db): Promise<ServiceRow[]> {
  return db.service.findMany({
    orderBy: [{ category: "asc" }, { active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true, defaultPriceCents: true, durationMin: true, active: true, sortOrder: true },
  });
}

export async function saveService(db: Db, id: string | null, data: ServiceData): Promise<string> {
  try {
    if (id) {
      await db.service.update({ where: { id }, data: { ...data, name: data.name.trim() } });
      return id;
    }
    const last = await db.service.aggregate({ _max: { sortOrder: true } });
    const created = await db.service.create({
      data: { ...data, name: data.name.trim(), sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new CatalogError(`Já existe um serviço chamado "${data.name.trim()}".`);
    throw error;
  }
}

/** Regras ATIVAS que usam um serviço/produto (para avisar ao desativá-lo). */
async function activeRulesUsing(db: Db, where: { serviceId?: string; productId?: string }): Promise<string[]> {
  const rules = await db.priceRule.findMany({
    where: { active: true, items: { some: where } },
    orderBy: { amountCents: "asc" },
    select: { label: true },
  });
  return rules.map((r) => r.label);
}

/** Ativa/desativa. Ao desativar, devolve as regras ativas que ainda usam o serviço. */
export async function setServiceActive(db: Db, id: string, active: boolean): Promise<{ affectedRules: string[] }> {
  await db.service.update({ where: { id }, data: { active } });
  return { affectedRules: active ? [] : await activeRulesUsing(db, { serviceId: id }) };
}

export type ProductRow = {
  id: string;
  name: string;
  priceCents: number;
  costCents: number | null;
  active: boolean;
  margin: { marginCents: number; marginBps: number | null } | null;
};

export type ProductData = { name: string; priceCents: number; costCents: number | null };

export async function listProducts(db: Db): Promise<ProductRow[]> {
  const products = await db.product.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, priceCents: true, costCents: true, active: true },
  });
  return products.map((p) => ({ ...p, margin: unitMargin(p.priceCents, p.costCents) }));
}

export async function saveProduct(db: Db, id: string | null, data: ProductData): Promise<string> {
  try {
    const clean = { ...data, name: data.name.trim() };
    if (id) {
      await db.product.update({ where: { id }, data: clean });
      return id;
    }
    return (await db.product.create({ data: clean, select: { id: true } })).id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new CatalogError(`Já existe um produto chamado "${data.name.trim()}".`);
    throw error;
  }
}

export async function setProductActive(db: Db, id: string, active: boolean): Promise<{ affectedRules: string[] }> {
  await db.product.update({ where: { id }, data: { active } });
  return { affectedRules: active ? [] : await activeRulesUsing(db, { productId: id }) };
}

/** As 4 formas de pagamento, sempre na mesma ordem (0% se ainda não cadastrada). */
export async function listFees(db: Db): Promise<{ method: PaymentMethodValue; feeBps: number }[]> {
  const fees = await db.paymentFee.findMany({ select: { method: true, feeBps: true } });
  return PAYMENT_METHODS.map((method) => ({ method, feeBps: fees.find((f) => f.method === method)?.feeBps ?? 0 }));
}

/** Taxa nova vale para as PRÓXIMAS visitas; as já lançadas guardam a taxa congelada. */
export async function saveFee(db: Db, method: PaymentMethodValue, feeBps: number) {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new CatalogError("Taxa inválida.");
  await db.paymentFee.upsert({ where: { method }, create: { method, feeBps }, update: { feeBps } });
}
