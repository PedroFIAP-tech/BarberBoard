// Cálculos puros dos relatórios (fechamento do dia, dashboard). Sem Prisma, sem React:
// recebem visitas/itens já carregados e devolvem números em centavos.
//
// O faturamento é sempre quebrado em 3 grupos:
//   Serviço = itens com serviço MAIN · Extra = itens com serviço EXTRA · Produto = itens com produto
// Visitas importadas ainda "a classificar" (sem itens) entram à parte, em unclassifiedCents,
// para o bruto não ficar menor que o dinheiro que entrou.

export type ServiceCategoryValue = "MAIN" | "EXTRA";
export type RevenueGroup = "SERVICE" | "EXTRA" | "PRODUCT";

/** Um item de visita, no formato mínimo que os relatórios precisam. */
export type ReportItem = {
  serviceId: string | null;
  productId: string | null;
  /** Categoria do serviço (null quando o item é produto). */
  serviceCategory: ServiceCategoryValue | null;
  quantity: number;
  totalCents: number;
  /** Custo unitário congelado na venda (só produtos; null = sem custo cadastrado). */
  unitCostCents: number | null;
};

export type GroupTotals = {
  serviceCents: number;
  extraCents: number;
  productCents: number;
  /** Total das visitas "a classificar" (ainda sem itens). */
  unclassifiedCents: number;
  grossCents: number;
};

export type GroupTickets = {
  generalCents: number;
  serviceCents: number;
  extraCents: number;
  productCents: number;
  unclassifiedCents: number;
};

export type ProductMargin = {
  revenueCents: number;
  costCents: number;
  marginCents: number;
};

function assertNonNegativeInt(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} deve ser um inteiro >= 0 (recebido: ${value})`);
  }
}

/** Em qual dos 3 grupos o item entra. Rejeita item inconsistente em vez de chutar. */
export function itemGroup(item: Pick<ReportItem, "serviceId" | "productId" | "serviceCategory">): RevenueGroup {
  const hasService = item.serviceId !== null;
  const hasProduct = item.productId !== null;
  if (hasService === hasProduct) {
    throw new Error("Item deve ter exatamente um entre serviceId e productId");
  }
  if (hasProduct) return "PRODUCT";
  if (item.serviceCategory === "MAIN") return "SERVICE";
  if (item.serviceCategory === "EXTRA") return "EXTRA";
  throw new Error(`Item de serviço ${item.serviceId} sem categoria`);
}

/**
 * Faturamento por grupo. grossCents é sempre a soma dos grupos (nunca digitado).
 * `unclassifiedCents` = soma de totalCents das visitas PENDING do período (elas não têm itens).
 */
export function revenueByGroup(items: ReportItem[], unclassifiedCents = 0): GroupTotals {
  assertNonNegativeInt(unclassifiedCents, "unclassifiedCents");
  const totals = { serviceCents: 0, extraCents: 0, productCents: 0 };
  for (const item of items) {
    assertNonNegativeInt(item.totalCents, "totalCents");
    const group = itemGroup(item);
    if (group === "SERVICE") totals.serviceCents += item.totalCents;
    else if (group === "EXTRA") totals.extraCents += item.totalCents;
    else totals.productCents += item.totalCents;
  }
  return {
    ...totals,
    unclassifiedCents,
    grossCents: totals.serviceCents + totals.extraCents + totals.productCents + unclassifiedCents,
  };
}

/**
 * Ticket médio = valor / nº de visitas, arredondado para o centavo. 0 quando não há visitas.
 * No mês/ano, passe o total do período e as visitas do período (não faça média dos tickets diários).
 */
export function averageTicket(amountCents: number, visitCount: number): number {
  assertNonNegativeInt(amountCents, "amountCents");
  assertNonNegativeInt(visitCount, "visitCount");
  if (visitCount === 0) return 0;
  return Math.round(amountCents / visitCount);
}

/**
 * Ticket médio geral e por grupo, todos divididos pelo nº de visitas:
 * TM Geral = bruto / visitas · TM Serviços = serviço / visitas · TM Extra = extra / visitas ·
 * TM Produto = produto / visitas. Cada um é arredondado separadamente, então a soma dos
 * três por grupo pode diferir do geral em 1 ou 2 centavos.
 */
export function ticketByGroup(groups: GroupTotals, visitCount: number): GroupTickets {
  return {
    generalCents: averageTicket(groups.grossCents, visitCount),
    serviceCents: averageTicket(groups.serviceCents, visitCount),
    extraCents: averageTicket(groups.extraCents, visitCount),
    productCents: averageTicket(groups.productCents, visitCount),
    unclassifiedCents: averageTicket(groups.unclassifiedCents, visitCount),
  };
}

/**
 * Margem dos produtos vendidos: venda - custo.
 * Itens de produto sem custo (unitCostCents null) ficam FORA: nem a venda nem o custo entram,
 * para não inflar a margem. Itens de serviço são ignorados.
 */
export function productMargin(items: ReportItem[]): ProductMargin {
  let revenueCents = 0;
  let costCents = 0;
  for (const item of items) {
    if (itemGroup(item) !== "PRODUCT" || item.unitCostCents === null) continue;
    assertNonNegativeInt(item.totalCents, "totalCents");
    assertNonNegativeInt(item.quantity, "quantity");
    assertNonNegativeInt(item.unitCostCents, "unitCostCents");
    revenueCents += item.totalCents;
    costCents += item.quantity * item.unitCostCents;
  }
  return { revenueCents, costCents, marginCents: revenueCents - costCents };
}

/** Quantidade vendida de cada extra (soma de quantity), por serviceId. */
export function extraCountByService(items: ReportItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (itemGroup(item) !== "EXTRA") continue;
    assertNonNegativeInt(item.quantity, "quantity");
    counts.set(item.serviceId!, (counts.get(item.serviceId!) ?? 0) + item.quantity);
  }
  return counts;
}
