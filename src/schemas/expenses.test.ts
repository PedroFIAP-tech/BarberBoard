import assert from "node:assert/strict";
import { test } from "node:test";
import { expenseSchema } from "./expenses";

test("expenseSchema", () => {
  assert.deepEqual(expenseSchema.parse({ date: "2026-11-05", categoryId: "cat1", amount: "1.500,00", description: " Aluguel ", barberId: "" }), {
    date: "2026-11-05",
    categoryId: "cat1",
    amount: 150000,
    description: "Aluguel",
    barberId: null,
  });
  for (const bad of [
    { date: "05/11/2026", categoryId: "cat1", amount: "10", description: "", barberId: "" },
    { date: "2026-11-05", categoryId: "", amount: "10", description: "", barberId: "" },
    { date: "2026-11-05", categoryId: "cat1", amount: "0", description: "", barberId: "" },
    { date: "2026-11-05", categoryId: "cat1", amount: "", description: "", barberId: "" },
  ]) assert.equal(expenseSchema.safeParse(bad).success, false, JSON.stringify(bad));
});
