import assert from "node:assert/strict";
import { test } from "node:test";
import { itemsJsonSchema } from "./items";

test("itemsJsonSchema converte as chaves do editor em serviço/produto", () => {
  const r = itemsJsonSchema.safeParse(JSON.stringify([{ key: "s:corte1", quantity: 1, unitPriceCents: 4000 }, { key: "p:pomada", quantity: 2, unitPriceCents: 3500 }]));
  assert.equal(r.success, true);
  assert.deepEqual(r.data, [
    { serviceId: "corte1", productId: null, quantity: 1, unitPriceCents: 4000 },
    { serviceId: null, productId: "pomada", quantity: 2, unitPriceCents: 3500 },
  ]);
});

test("itemsJsonSchema rejeita JSON quebrado, lista vazia, chave estranha e preço fracionado", () => {
  for (const bad of ["{", "[]", JSON.stringify([{ key: "x:1", quantity: 1, unitPriceCents: 1 }]), JSON.stringify([{ key: "s:1", quantity: 1, unitPriceCents: 10.5 }]), JSON.stringify([{ key: "s:1", quantity: 0, unitPriceCents: 1 }])]) {
    assert.equal(itemsJsonSchema.safeParse(bad).success, false, bad);
  }
});
