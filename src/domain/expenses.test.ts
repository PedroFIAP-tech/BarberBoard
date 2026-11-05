import assert from "node:assert/strict";
import { test } from "node:test";
import { expenseTotals } from "./expenses";

test("expenseTotals: total e por categoria, maior primeiro", () => {
  const t = expenseTotals([
    { categoryId: "luz", amountCents: 22000 },
    { categoryId: "aluguel", amountCents: 150000 },
    { categoryId: "luz", amountCents: 3000 },
  ]);
  assert.equal(t.totalCents, 175000);
  assert.deepEqual(t.byCategory, [
    { categoryId: "aluguel", totalCents: 150000 },
    { categoryId: "luz", totalCents: 25000 },
  ]);
});

test("expenseTotals: vazio e empate pela ordem das categorias", () => {
  assert.deepEqual(expenseTotals([]), { totalCents: 0, byCategory: [] });
  const t = expenseTotals([{ categoryId: "b", amountCents: 100 }, { categoryId: "a", amountCents: 100 }], ["a", "b"]);
  assert.deepEqual(t.byCategory.map((c) => c.categoryId), ["a", "b"]);
});

test("expenseTotals: valor inválido dispara erro", () => {
  assert.throws(() => expenseTotals([{ categoryId: "a", amountCents: -1 }]));
});
