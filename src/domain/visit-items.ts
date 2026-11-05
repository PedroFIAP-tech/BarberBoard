// Classificar e corrigir os itens de uma visita (puro, sem Prisma nem React).

import { calcItemTotal } from "./pricing";
import { validateItems, validatePriceRule, type PriceRuleInput, type PriceRuleItemInput } from "./price-rules";

export type ItemInput = PriceRuleItemInput;

/** Os itens de uma visita precisam fechar exatamente com o total da comanda. */
export function validateVisitItems(items: ItemInput[], totalCents: number): string[] {
  return validateItems(items, totalCents, "o total da visita");
}

/**
 * Saldo do editor de itens: soma dos itens válidos e quanto falta (diff > 0) ou sobra (diff < 0)
 * para fechar com o total.
 */
export function itemsBalance(items: Pick<ItemInput, "quantity" | "unitPriceCents">[], totalCents: number) {
  const sumCents = items.reduce((sum, item) => {
    const valid = Number.isInteger(item.quantity) && item.quantity >= 1 && Number.isInteger(item.unitPriceCents) && item.unitPriceCents >= 0;
    return valid ? sum + calcItemTotal(item) : sum;
  }, 0);
  return { sumCents, diffCents: totalCents - sumCents };
}

export type CatalogService = { id: string; name: string; defaultPriceCents: number; active: boolean };

export type ClassifyOption =
  | { kind: "RULE"; ruleId: string; label: string; detail: string }
  | { kind: "SERVICE"; serviceId: string; label: string };

/**
 * Opções de um toque para classificar visitas de um valor: as regras ativas daquele valor
 * e os serviços ativos com exatamente aquele preço (como item único). Regras primeiro.
 */
export function classifyOptions(
  amountCents: number,
  rules: PriceRuleInput[],
  services: CatalogService[],
  nameOf: (item: ItemInput) => string,
): ClassifyOption[] {
  const ruleOptions: ClassifyOption[] = rules
    .filter((r) => r.active && r.amountCents === amountCents && validatePriceRule(r).length === 0)
    .map((r) => ({
      kind: "RULE",
      ruleId: r.id,
      label: r.label,
      detail: r.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${nameOf(i)}` : nameOf(i))).join(" + "),
    }));

  // Serviço com o mesmo preço só entra se nenhuma regra já for exatamente ele (evita botão repetido).
  const coveredBySingleItemRule = new Set(
    rules
      .filter((r) => r.active && r.amountCents === amountCents && r.items.length === 1 && r.items[0].quantity === 1)
      .map((r) => r.items[0].serviceId),
  );
  const serviceOptions: ClassifyOption[] = services
    .filter((s) => s.active && s.defaultPriceCents === amountCents && !coveredBySingleItemRule.has(s.id))
    .map((s) => ({ kind: "SERVICE", serviceId: s.id, label: s.name }));

  return [...ruleOptions, ...serviceOptions];
}

/** Agrupa visitas por valor: grupos maiores primeiro; empate, menor valor primeiro. */
export function groupByAmount<T extends { totalCents: number }>(visits: T[]): { amountCents: number; visits: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const v of visits) groups.set(v.totalCents, [...(groups.get(v.totalCents) ?? []), v]);
  return [...groups]
    .map(([amountCents, list]) => ({ amountCents, visits: list }))
    .sort((a, b) => b.visits.length - a.visits.length || a.amountCents - b.amountCents);
}

/** Nome sugerido para "salvar como regra": "Corte e sobrancelha". */
export function suggestRuleLabel(names: string[]): string {
  if (names.length === 0) return "";
  const [first, ...rest] = names;
  const lower = rest.map((n) => n.toLowerCase());
  return lower.length === 0 ? first : `${first}${lower.length > 1 ? `, ${lower.slice(0, -1).join(", ")}` : ""} e ${lower.at(-1)}`;
}
