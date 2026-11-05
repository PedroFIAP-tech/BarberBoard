import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cashCheck, expectedCash, isClosingStale, summarizeDay, type ClosingVisit } from "./closing";
import type { ReportItem } from "./reports";

const corte: ReportItem = { serviceId: "corte", productId: null, serviceCategory: "MAIN", quantity: 1, totalCents: 4000, unitCostCents: null };
const sobrancelha: ReportItem = { serviceId: "sobrancelha", productId: null, serviceCategory: "EXTRA", quantity: 1, totalCents: 1000, unitCostCents: null };
const pomada: ReportItem = { serviceId: null, productId: "pomada", serviceCategory: null, quantity: 1, totalCents: 3500, unitCostCents: 1750 };

const visit = (overrides: Partial<ClosingVisit> = {}): ClosingVisit => ({
  barberId: "luiz",
  paymentMethod: "PIX",
  totalCents: 4000,
  feeCents: 0,
  netCents: 4000,
  classification: "CLASSIFIED",
  items: [corte],
  ...overrides,
});

describe("summarizeDay", () => {
  test("dia vazio: tudo zero, 4 formas de pagamento zeradas", () => {
    const s = summarizeDay([]);
    assert.equal(s.visitCount, 0);
    assert.equal(s.groups.grossCents, 0);
    assert.equal(s.tickets.generalCents, 0);
    assert.deepEqual(s.byPayment.map((p) => [p.method, p.count]), [["PIX", 0], ["CASH", 0], ["DEBIT", 0], ["CREDIT", 0]]);
    assert.deepEqual(s.byBarber, []);
    assert.equal(s.cashSalesCents, 0);
  });

  test("grupos, taxas, líquido e ticket", () => {
    const s = summarizeDay([
      visit({ totalCents: 5000, netCents: 5000, items: [corte, sobrancelha] }),
      visit({ paymentMethod: "CREDIT", totalCents: 7500, feeCents: 374, netCents: 7126, items: [corte, pomada] }),
    ]);
    assert.deepEqual(s.groups, { serviceCents: 8000, extraCents: 1000, productCents: 3500, unclassifiedCents: 0, grossCents: 12500 });
    assert.equal(s.feeCents, 374);
    assert.equal(s.netCents, 12126);
    assert.equal(s.tickets.generalCents, 6250);
  });

  test("só visitas a classificar: entram no bruto como A classificar", () => {
    const s = summarizeDay([
      visit({ classification: "PENDING", items: [], totalCents: 6500, netCents: 6500 }),
      visit({ classification: "PENDING", items: [], totalCents: 4500, netCents: 4500 }),
    ]);
    assert.equal(s.groups.unclassifiedCents, 11000);
    assert.equal(s.groups.grossCents, 11000);
    assert.equal(s.groups.serviceCents, 0);
    assert.equal(s.pendingCount, 2);
  });

  test("cortesia R$ 0 conta como visita e puxa o ticket para baixo", () => {
    const s = summarizeDay([visit(), visit({ totalCents: 0, netCents: 0, classification: "PENDING", items: [] })]);
    assert.equal(s.visitCount, 2);
    assert.equal(s.groups.grossCents, 4000);
    assert.equal(s.tickets.generalCents, 2000);
  });

  test("visita só com produto", () => {
    const s = summarizeDay([visit({ totalCents: 3500, netCents: 3500, items: [pomada] })]);
    assert.deepEqual([s.groups.productCents, s.groups.serviceCents, s.visitCount], [3500, 0, 1]);
  });

  test("várias formas de pagamento e base do caixa em dinheiro", () => {
    const s = summarizeDay([
      visit({ paymentMethod: "CASH" }),
      visit({ paymentMethod: "CASH", totalCents: 5000, netCents: 5000, items: [corte, sobrancelha] }),
      visit({ paymentMethod: "DEBIT", feeCents: 80, netCents: 3920 }),
    ]);
    const cash = s.byPayment.find((p) => p.method === "CASH")!;
    const debit = s.byPayment.find((p) => p.method === "DEBIT")!;
    assert.deepEqual([cash.count, cash.grossCents], [2, 9000]);
    assert.deepEqual([debit.count, debit.feeCents, debit.netCents], [1, 80, 3920]);
    assert.equal(s.cashSalesCents, 9000);
    assert.equal(s.byPayment.reduce((sum, p) => sum + p.grossCents, 0), s.groups.grossCents);
  });

  test("por barbeiro, quem faturou mais primeiro", () => {
    const s = summarizeDay([visit({ barberId: "paulo" }), visit({ barberId: "luiz", totalCents: 9000, netCents: 9000, items: [corte, corte, sobrancelha] })]);
    assert.deepEqual(s.byBarber.map((b) => [b.barberId, b.grossCents]), [["luiz", 9000], ["paulo", 4000]]);
  });

  test("ticket arredonda para o centavo", () => {
    const s = summarizeDay([visit(), visit(), visit({ totalCents: 5000, netCents: 5000, items: [corte, sobrancelha] })]);
    assert.equal(s.tickets.generalCents, 4333); // 13000 / 3
  });
});

describe("conferência de caixa", () => {
  test("esperado = fundo de troco + dinheiro do dia", () => {
    assert.equal(expectedCash(10000, 9000), 19000);
  });

  test("diferença = contado − esperado", () => {
    assert.deepEqual(cashCheck({ openingCashCents: 10000, cashSalesCents: 9000, countedCashCents: 18000 }), {
      expectedCashCents: 19000,
      differenceCents: -1000,
    });
    assert.equal(cashCheck({ openingCashCents: 0, cashSalesCents: 0, countedCashCents: 500 }).differenceCents, 500);
  });

  test("valores inválidos disparam erro", () => {
    assert.throws(() => cashCheck({ openingCashCents: -1, cashSalesCents: 0, countedCashCents: 0 }));
    assert.throws(() => cashCheck({ openingCashCents: 0, cashSalesCents: 0, countedCashCents: 10.5 }));
  });

  test("fechamento desatualizado quando o dinheiro do dia muda", () => {
    const saved = { openingCashCents: 10000, expectedCashCents: 19000 };
    assert.equal(isClosingStale(saved, 9000), false);
    assert.equal(isClosingStale(saved, 13000), true);
  });
});
