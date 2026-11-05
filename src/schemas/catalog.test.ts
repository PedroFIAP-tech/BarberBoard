import assert from "node:assert/strict";
import { test } from "node:test";
import { feeSchema, productSchema, serviceSchema } from "./catalog";

test("serviceSchema: preço em reais, duração opcional", () => {
  assert.deepEqual(serviceSchema.parse({ name: " Corte ", category: "MAIN", price: "40,00", duration: "" }), {
    name: "Corte",
    category: "MAIN",
    price: 4000,
    duration: null,
  });
  assert.equal(serviceSchema.parse({ name: "Barba", category: "MAIN", price: "40", duration: "30" }).duration, 30);
  for (const bad of [
    { name: "", category: "MAIN", price: "40", duration: "" },
    { name: "X", category: "OUTRO", price: "40", duration: "" },
    { name: "X", category: "EXTRA", price: "", duration: "" },
    { name: "X", category: "EXTRA", price: "abc", duration: "" },
    { name: "X", category: "EXTRA", price: "10", duration: "1,5" },
  ]) assert.equal(serviceSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

test("productSchema: custo opcional (vazio = sem custo)", () => {
  assert.equal(productSchema.parse({ name: "Pomada", price: "35,00", cost: "" }).cost, null);
  assert.equal(productSchema.parse({ name: "Pomada", price: "35,00", cost: "17,50" }).cost, 1750);
  assert.equal(productSchema.safeParse({ name: "Pomada", price: "35,00", cost: "x" }).success, false);
});

test("feeSchema: percentual → bps", () => {
  assert.deepEqual(feeSchema.parse({ method: "CREDIT", percent: "4,98" }), { method: "CREDIT", percent: 498 });
  assert.equal(feeSchema.safeParse({ method: "CREDIT", percent: "150" }).success, false);
  assert.equal(feeSchema.safeParse({ method: "VALE", percent: "1" }).success, false);
});
