// Regras de sugestão por valor (puro, sem Prisma). O App Barber exporta só o total da comanda;
// uma regra diz quais itens aquele valor representa, ex.:
//   R$ 50 → "Corte e sobrancelha" = Corte (R$ 40, MAIN) + Sobrancelha (R$ 10, EXTRA)
// Valor com exatamente UMA regra ativa → itens sugeridos automaticamente.
// Sem regra ou com mais de uma → a visita fica "a classificar".

import { calcItemTotal } from "./pricing";

export type PriceRuleItemInput = {
  serviceId: string | null;
  productId: string | null;
  quantity: number;
  unitPriceCents: number;
};

export type PriceRuleInput = {
  id: string;
  label: string;
  amountCents: number;
  active: boolean;
  items: PriceRuleItemInput[];
};

/** Item pronto para virar AppointmentItem (preço e custo congelados). */
export type ItemDraft = {
  serviceId: string | null;
  productId: string | null;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  totalCents: number;
};

export type RuleSuggestion =
  | { kind: "RULE"; rule: PriceRuleInput }
  | { kind: "NONE" }
  | { kind: "AMBIGUOUS"; rules: PriceRuleInput[] };

const isNonNegativeInt = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * Problemas de uma lista de itens que precisa fechar com um valor (vazia = válida).
 * Usada pelas regras de valor e pela classificação/correção de visitas.
 */
export function validateItems(items: PriceRuleItemInput[], amountCents: number, amountName = "o valor"): string[] {
  const errors: string[] = [];
  if (!isNonNegativeInt(amountCents)) errors.push("Valor deve ser um inteiro >= 0");
  if (items.length === 0) errors.push("Adicione pelo menos um item");

  items.forEach((item, i) => {
    const n = i + 1;
    if ((item.serviceId === null) === (item.productId === null)) {
      errors.push(`Item ${n}: escolha um serviço OU um produto`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      errors.push(`Item ${n}: quantidade deve ser um inteiro >= 1`);
    }
    if (!isNonNegativeInt(item.unitPriceCents)) {
      errors.push(`Item ${n}: preço deve ser um inteiro >= 0`);
    }
  });

  if (errors.length === 0) {
    const sum = items.reduce((s, item) => s + calcItemTotal(item), 0);
    if (sum !== amountCents) {
      errors.push(`A soma dos itens (${sum}) tem que ser igual a ${amountName} (${amountCents})`);
    }
  }
  return errors;
}

/** Lista de problemas da regra (vazia = válida). Usada ao salvar e antes de aplicar. */
export function validatePriceRule(rule: Omit<PriceRuleInput, "id" | "active">): string[] {
  const errors: string[] = [];
  if (rule.label.trim() === "") errors.push("Nome da regra é obrigatório");
  return [...errors, ...validateItems(rule.items, rule.amountCents, "o valor da regra")];
}

/** Qual regra (se alguma) se aplica a um valor. Só regras ativas e válidas contam. */
export function suggestForAmount(amountCents: number, rules: PriceRuleInput[]): RuleSuggestion {
  const matches = rules.filter(
    (r) => r.active && r.amountCents === amountCents && validatePriceRule(r).length === 0,
  );
  if (matches.length === 0) return { kind: "NONE" };
  if (matches.length === 1) return { kind: "RULE", rule: matches[0] };
  return { kind: "AMBIGUOUS", rules: matches };
}

/**
 * Converte a regra em itens de visita. O custo dos produtos vem do catálogo de agora
 * (productCosts) e fica congelado no item.
 */
export function itemsFromRule(
  rule: PriceRuleInput,
  productCosts: ReadonlyMap<string, number | null>,
): ItemDraft[] {
  return rule.items.map((item) => ({
    serviceId: item.serviceId,
    productId: item.productId,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    unitCostCents: item.productId ? (productCosts.get(item.productId) ?? null) : null,
    totalCents: calcItemTotal(item),
  }));
}
