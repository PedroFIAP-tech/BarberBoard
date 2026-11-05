import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PriceRuleInput } from "./price-rules";
import { classifyOptions, groupByAmount, itemsBalance, suggestRuleLabel, validateVisitItems } from "./visit-items";

const corte = { serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000 };
const barba = { serviceId: "barba", productId: null, quantity: 1, unitPriceCents: 4000 };
const sobrancelha = { serviceId: "sobrancelha", productId: null, quantity: 1, unitPriceCents: 1000 };

const rule = (id: string, label: string, items: PriceRuleInput["items"], active = true): PriceRuleInput => ({
  id,
  label,
  active,
  items,
  amountCents: items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0),
});

const services = [
  { id: "corte", name: "Corte", defaultPriceCents: 4000, active: true },
  { id: "barba", name: "Barba", defaultPriceCents: 4000, active: true },
  { id: "velho", name: "Pigmentação", defaultPriceCents: 4000, active: false },
  { id: "sobrancelha", name: "Sobrancelha", defaultPriceCents: 1000, active: true },
];
const names: Record<string, string> = { corte: "Corte", barba: "Barba", sobrancelha: "Sobrancelha" };
const nameOf = (i: { serviceId: string | null }) => names[i.serviceId!] ?? "?";

describe("validateVisitItems", () => {
  test("itens que fecham com o total", () => {
    assert.deepEqual(validateVisitItems([corte, sobrancelha], 5000), []);
  });

  test("soma diferente do total", () => {
    assert.match(validateVisitItems([corte], 5000).join(), /total da visita/);
  });

  test("sem itens, ou item com serviço e produto", () => {
    assert.match(validateVisitItems([], 0).join(), /pelo menos um item/);
    assert.match(validateVisitItems([{ ...corte, productId: "pomada" }], 4000).join(), /serviço OU um produto/);
  });

  test("cortesia: total 0 com item de preço 0", () => {
    assert.deepEqual(validateVisitItems([{ ...corte, unitPriceCents: 0 }], 0), []);
  });
});

describe("itemsBalance", () => {
  test("faltam, sobram e fecha", () => {
    assert.deepEqual(itemsBalance([corte], 5000), { sumCents: 4000, diffCents: 1000 });
    assert.deepEqual(itemsBalance([corte, barba], 5000), { sumCents: 8000, diffCents: -3000 });
    assert.deepEqual(itemsBalance([corte, sobrancelha], 5000), { sumCents: 5000, diffCents: 0 });
  });

  test("quantidade entra na soma; itens inválidos são ignorados", () => {
    assert.equal(itemsBalance([{ quantity: 2, unitPriceCents: 1000 }], 2000).diffCents, 0);
    assert.equal(itemsBalance([{ quantity: 0, unitPriceCents: 1000 }, { quantity: 1, unitPriceCents: NaN }], 0).sumCents, 0);
  });
});

describe("classifyOptions", () => {
  test("R$ 40: regra Corte primeiro, depois Barba (mesmo preço); Corte não repete; inativo fica fora", () => {
    const opts = classifyOptions(4000, [rule("r-corte", "Corte", [corte])], services, nameOf);
    assert.deepEqual(
      opts.map((o) => (o.kind === "RULE" ? `regra:${o.label}` : `serviço:${o.label}`)),
      ["regra:Corte", "serviço:Barba"],
    );
  });

  test("R$ 50: regra de combo com o detalhe dos itens", () => {
    const opts = classifyOptions(5000, [rule("r-cs", "Corte e sobrancelha", [corte, sobrancelha])], services, nameOf);
    assert.deepEqual(opts, [{ kind: "RULE", ruleId: "r-cs", label: "Corte e sobrancelha", detail: "Corte + Sobrancelha" }]);
  });

  test("valor sem regra nem serviço com o mesmo preço → nenhuma opção", () => {
    assert.deepEqual(classifyOptions(6500, [rule("r-corte", "Corte", [corte])], services, nameOf), []);
  });

  test("regra inativa não aparece", () => {
    const opts = classifyOptions(5000, [rule("r-cs", "Corte e sobrancelha", [corte, sobrancelha], false)], services, nameOf);
    assert.deepEqual(opts, []);
  });
});

test("groupByAmount: grupos maiores primeiro, empate pelo menor valor", () => {
  const groups = groupByAmount([{ totalCents: 6500 }, { totalCents: 4500 }, { totalCents: 6500 }, { totalCents: 3000 }]);
  assert.deepEqual(groups.map((g) => [g.amountCents, g.visits.length]), [[6500, 2], [3000, 1], [4500, 1]]);
});

test("suggestRuleLabel", () => {
  assert.equal(suggestRuleLabel(["Corte"]), "Corte");
  assert.equal(suggestRuleLabel(["Corte", "Sobrancelha"]), "Corte e sobrancelha");
  assert.equal(suggestRuleLabel(["Corte", "Barba", "Sobrancelha"]), "Corte, barba e sobrancelha");
  assert.equal(suggestRuleLabel([]), "");
});
