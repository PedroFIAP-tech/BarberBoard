import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { itemsFromRule, suggestForAmount, validatePriceRule, type PriceRuleInput } from "./price-rules";

const rule = (overrides: Partial<PriceRuleInput> = {}): PriceRuleInput => ({
  id: "corte-sobrancelha",
  label: "Corte e sobrancelha",
  amountCents: 5000,
  active: true,
  items: [
    { serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000 },
    { serviceId: "sobrancelha", productId: null, quantity: 1, unitPriceCents: 1000 },
  ],
  ...overrides,
});

describe("validatePriceRule", () => {
  test("regra válida: itens somam o valor", () => {
    assert.deepEqual(validatePriceRule(rule()), []);
  });

  test("soma dos itens diferente do valor", () => {
    const errors = validatePriceRule(rule({ amountCents: 5500 }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /soma dos itens \(5000\).*\(5500\)/);
  });

  test("quantidade entra na soma", () => {
    const r = rule({ amountCents: 3000, items: [{ serviceId: "sobrancelha", productId: null, quantity: 2, unitPriceCents: 1500 }] });
    assert.deepEqual(validatePriceRule(r), []);
  });

  test("item com serviço E produto, ou sem nenhum dos dois", () => {
    const both = rule({ amountCents: 4000, items: [{ serviceId: "corte", productId: "pomada", quantity: 1, unitPriceCents: 4000 }] });
    const none = rule({ amountCents: 4000, items: [{ serviceId: null, productId: null, quantity: 1, unitPriceCents: 4000 }] });
    assert.match(validatePriceRule(both).join(), /serviço OU um produto/);
    assert.match(validatePriceRule(none).join(), /serviço OU um produto/);
  });

  test("sem itens, sem nome, valores inválidos", () => {
    assert.match(validatePriceRule(rule({ items: [] })).join(), /pelo menos um item/);
    assert.match(validatePriceRule(rule({ label: "  " })).join(), /Nome/);
    assert.match(validatePriceRule(rule({ amountCents: -1 })).join(), /Valor/);
    const badQty = rule({ items: [{ serviceId: "corte", productId: null, quantity: 0, unitPriceCents: 5000 }] });
    assert.match(validatePriceRule(badQty).join(), /quantidade/);
  });

  test("regra de cortesia (R$ 0) é válida", () => {
    const r = rule({ amountCents: 0, items: [{ serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 0 }] });
    assert.deepEqual(validatePriceRule(r), []);
  });
});

describe("suggestForAmount", () => {
  const corte = rule({ id: "corte", label: "Corte", amountCents: 4000, items: [{ serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000 }] });

  test("uma regra → RULE", () => {
    const s = suggestForAmount(4000, [corte, rule()]);
    assert.equal(s.kind, "RULE");
    assert.equal(s.kind === "RULE" && s.rule.id, "corte");
  });

  test("nenhuma regra → NONE", () => {
    assert.equal(suggestForAmount(6500, [corte, rule()]).kind, "NONE");
    assert.equal(suggestForAmount(4000, []).kind, "NONE");
  });

  test("duas regras com o mesmo valor → AMBIGUOUS", () => {
    const barbaSobrancelha = rule({
      id: "barba-sobrancelha",
      items: [
        { serviceId: "barba", productId: null, quantity: 1, unitPriceCents: 3500 },
        { serviceId: "sobrancelha", productId: null, quantity: 1, unitPriceCents: 1500 },
      ],
    });
    const s = suggestForAmount(5000, [rule(), barbaSobrancelha]);
    assert.equal(s.kind, "AMBIGUOUS");
    assert.equal(s.kind === "AMBIGUOUS" && s.rules.length, 2);
  });

  test("regra inativa ou inválida não conta", () => {
    assert.equal(suggestForAmount(5000, [rule({ active: false })]).kind, "NONE");
    const broken = rule({ items: [{ serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000 }] }); // soma 4000 ≠ 5000
    assert.equal(suggestForAmount(5000, [broken]).kind, "NONE");
    // uma válida + uma inválida com o mesmo valor → a válida vale sozinha
    assert.equal(suggestForAmount(5000, [rule(), broken]).kind, "RULE");
  });
});

describe("itemsFromRule", () => {
  test("decompõe o combo e calcula o total de cada item", () => {
    assert.deepEqual(itemsFromRule(rule(), new Map()), [
      { serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000, unitCostCents: null, totalCents: 4000 },
      { serviceId: "sobrancelha", productId: null, quantity: 1, unitPriceCents: 1000, unitCostCents: null, totalCents: 1000 },
    ]);
  });

  test("produto leva o custo do catálogo congelado; sem custo fica null", () => {
    const r = rule({
      amountCents: 7500,
      items: [
        { serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000 },
        { serviceId: null, productId: "pomada", quantity: 1, unitPriceCents: 3500 },
      ],
    });
    const items = itemsFromRule(r, new Map([["pomada", 1750]]));
    assert.equal(items[1].unitCostCents, 1750);
    assert.equal(itemsFromRule(r, new Map([["pomada", null]]))[1].unitCostCents, null);
    assert.equal(itemsFromRule(r, new Map())[1].unitCostCents, null);
  });
});
