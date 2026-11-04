import assert from "node:assert/strict";
import { test } from "node:test";
import { calcAppointmentTotals, calcFee, calcItemTotal } from "./pricing";

test("calcFee arredonda para o centavo", () => {
  assert.deepEqual(calcFee(4590, 199), { feeCents: 91, netCents: 4499 });
  assert.deepEqual(calcFee(7000, 0), { feeCents: 0, netCents: 7000 });
  assert.deepEqual(calcFee(0, 498), { feeCents: 0, netCents: 0 });
});

test("calcItemTotal = quantidade × preço", () => {
  assert.equal(calcItemTotal({ quantity: 2, unitPriceCents: 3500 }), 7000);
});

test("calcAppointmentTotals soma os itens e aplica a taxa no total", () => {
  assert.deepEqual(
    calcAppointmentTotals(
      [
        { quantity: 1, unitPriceCents: 4500 },
        { quantity: 2, unitPriceCents: 3500 },
      ],
      498,
    ),
    { totalCents: 11500, feeCents: 573, netCents: 10927 },
  );
});

test("entradas inválidas disparam erro", () => {
  assert.throws(() => calcFee(10.5, 199));
  assert.throws(() => calcFee(100, -1));
  assert.throws(() => calcItemTotal({ quantity: 1, unitPriceCents: -1 }));
});
