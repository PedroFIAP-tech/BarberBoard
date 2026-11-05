import assert from "node:assert/strict";
import { test } from "node:test";
import { unitMargin } from "./catalog";

test("unitMargin: R$ e % sobre o preço de venda", () => {
  assert.deepEqual(unitMargin(3500, 1750), { marginCents: 1750, marginBps: 5000 });
  assert.deepEqual(unitMargin(3000, 1600), { marginCents: 1400, marginBps: 4667 });
});

test("unitMargin: sem custo → null; custo 0 → 100%; abaixo do custo → negativa", () => {
  assert.equal(unitMargin(2500, null), null);
  assert.deepEqual(unitMargin(2500, 0), { marginCents: 2500, marginBps: 10000 });
  assert.deepEqual(unitMargin(1000, 1500), { marginCents: -500, marginBps: -5000 });
});

test("unitMargin: preço 0 → % indefinida", () => {
  assert.deepEqual(unitMargin(0, 0), { marginCents: 0, marginBps: null });
});
