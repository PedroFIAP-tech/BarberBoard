import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { NormalizedRow } from "@/importers/app-barber/normalize-row";
import { assertVisitItemsConsistent, buildImportPreview, type PreviewInput } from "./import-preview";
import type { PriceRuleInput } from "./price-rules";

const NOW = new Date("2026-11-04T15:00:00Z"); // 04/11 12:00 em Brasília

const row = (overrides: Partial<NormalizedRow> = {}): NormalizedRow => ({
  rowNumber: 2,
  comanda: "100000001",
  status: "CLOSED",
  scheduledAt: new Date("2026-11-03T19:30:00Z"),
  valueCents: 4000,
  paymentMethod: "PIX",
  professionalCodes: ["L.F"],
  extraProfessionals: 0,
  notes: null,
  ...overrides,
});

const CORTE: PriceRuleInput = {
  id: "rule-corte",
  label: "Corte",
  amountCents: 4000,
  active: true,
  items: [{ serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000 }],
};
const CORTE_SOBRANCELHA: PriceRuleInput = {
  id: "rule-corte-sobrancelha",
  label: "Corte e sobrancelha",
  amountCents: 5000,
  active: true,
  items: [
    { serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000 },
    { serviceId: "sobrancelha", productId: null, quantity: 1, unitPriceCents: 1000 },
  ],
};

const input = (rows: NormalizedRow[], overrides: Partial<PreviewInput> = {}): PreviewInput => ({
  rowCount: rows.length,
  rows,
  parseErrors: [],
  now: NOW,
  existing: new Map(),
  barberIdByCode: new Map([
    ["L.F", "luiz"],
    ["PH", "paulo"],
  ]),
  feeBpsByMethod: { PIX: 0, CASH: 0, DEBIT: 199, CREDIT: 498 },
  rules: [CORTE, CORTE_SOBRANCELHA],
  productCosts: new Map(),
  ...overrides,
});

describe("buildImportPreview", () => {
  test("Fechada com regra única → importa classificada, com os itens da regra", () => {
    const p = buildImportPreview(input([row({ valueCents: 5000, paymentMethod: "CREDIT" })]));
    assert.equal(p.toImport.length, 1);
    const v = p.toImport[0];
    assert.equal(v.classification, "CLASSIFIED");
    assert.equal(v.priceRuleId, "rule-corte-sobrancelha");
    assert.equal(v.barberId, "luiz");
    assert.equal(v.performedAt.toISOString(), "2026-11-03T19:30:00.000Z"); // coluna Data
    assert.deepEqual(v.items.map((i) => [i.serviceId, i.totalCents]), [["corte", 4000], ["sobrancelha", 1000]]);
    // taxa do crédito congelada: 4,98% de R$ 50 = R$ 2,49
    assert.deepEqual([v.feeBps, v.feeCents, v.netCents], [498, 249, 4751]);
  });

  test("Fechada sem regra → importa a classificar, sem itens", () => {
    const p = buildImportPreview(input([row({ valueCents: 6500 })]));
    assert.equal(p.toImport[0].classification, "PENDING");
    assert.equal(p.toImport[0].suggestion, "NONE");
    assert.deepEqual(p.toImport[0].items, []);
    assert.equal(p.counts.unclassifiedCount, 1);
  });

  test("Fechada com valor ambíguo → a classificar", () => {
    const other = { ...CORTE_SOBRANCELHA, id: "rule-barba-sobrancelha" };
    const p = buildImportPreview(input([row({ valueCents: 5000 })], { rules: [CORTE_SOBRANCELHA, other] }));
    assert.equal(p.toImport[0].classification, "PENDING");
    assert.equal(p.toImport[0].suggestion, "AMBIGUOUS");
  });

  test("Fechada com R$ 0,00 → cortesia: visita com total 0", () => {
    const p = buildImportPreview(input([row({ valueCents: 0 })]));
    assert.equal(p.toImport.length, 1);
    assert.deepEqual([p.toImport[0].totalCents, p.toImport[0].feeCents], [0, 0]);
    assert.equal(p.toImport[0].classification, "PENDING"); // não há regra de R$ 0
  });

  test("já importada não duplica; aviso se o valor mudou", () => {
    const existing = new Map([
      ["100000001", { totalCents: 4000 }],
      ["100000002", { totalCents: 4000 }],
    ]);
    const p = buildImportPreview(
      input([row(), row({ rowNumber: 3, comanda: "100000002", valueCents: 4500 })], { existing }),
    );
    assert.equal(p.toImport.length, 0);
    assert.equal(p.counts.duplicateCount, 2);
    assert.deepEqual(p.duplicates.map((d) => d.valueChanged), [false, true]);
    assert.equal(p.warnings.length, 1);
    assert.match(p.warnings[0].message, /valor mudou/);
  });

  test("importada antes e agora Cancelada → aviso, nada é apagado", () => {
    const p = buildImportPreview(
      input([row({ status: "CANCELLED" })], { existing: new Map([["100000001", { totalCents: 4000 }]]) }),
    );
    assert.equal(p.counts.cancelledCount, 0);
    assert.equal(p.counts.duplicateCount, 1);
    assert.match(p.warnings[0].message, /agora está Cancelada/);
  });

  test("Aberta passada → pendente; Aberta futura → agendada; Cancelada → ignorada", () => {
    const p = buildImportPreview(
      input([
        row({ rowNumber: 2, comanda: "1", status: "OPEN", paymentMethod: null }),
        row({ rowNumber: 3, comanda: "2", status: "OPEN", paymentMethod: null, scheduledAt: new Date("2026-11-05T13:00:00Z") }),
        row({ rowNumber: 4, comanda: "3", status: "CANCELLED", paymentMethod: null, professionalCodes: [] }),
      ]),
    );
    assert.deepEqual(p.openPast.map((r) => r.comanda), ["1"]);
    assert.deepEqual(p.openFuture.map((r) => r.comanda), ["2"]);
    assert.deepEqual(p.cancelled.map((r) => r.comanda), ["3"]);
    assert.equal(p.toImport.length, 0);
  });

  test("vários profissionais → revisar, sem chutar o barbeiro", () => {
    const p = buildImportPreview(input([row({ professionalCodes: ["L.F"], extraProfessionals: 1 })]));
    assert.equal(p.toImport.length, 0);
    assert.equal(p.review.length, 1);
    assert.equal(p.review[0].extraProfessionals, 1);
  });

  test("revisão resolvida com um barbeiro escolhido → importa com ele", () => {
    const rows = [row({ professionalCodes: ["L.F", "PH"] })];
    const p = buildImportPreview(input(rows, { reviewChoices: new Map([["100000001", "paulo"]]) }));
    assert.equal(p.review.length, 0);
    assert.equal(p.toImport[0].barberId, "paulo");
  });

  test("revisão com barbeiro inexistente → erro", () => {
    const rows = [row({ extraProfessionals: 1 })];
    const p = buildImportPreview(input(rows, { reviewChoices: new Map([["100000001", "fantasma"]]) }));
    assert.equal(p.errors.length, 1);
    assert.equal(p.toImport.length, 0);
  });

  test("código de profissional desconhecido → erro na prévia", () => {
    const p = buildImportPreview(input([row({ professionalCodes: ["X.Y"] })]));
    assert.equal(p.toImport.length, 0);
    assert.equal(p.errors[0].field, "Profissional");
    assert.match(p.errors[0].message, /"X\.Y"/);
  });

  test("Aberta com profissional desconhecido também é erro (seria importada depois)", () => {
    const p = buildImportPreview(input([row({ status: "OPEN", paymentMethod: null, professionalCodes: ["X.Y"] })]));
    assert.equal(p.errors.length, 1);
    assert.equal(p.openPast.length, 0);
  });

  test("erros do parser entram na prévia, ordenados por linha", () => {
    const p = buildImportPreview(
      input([row({ professionalCodes: ["X.Y"], rowNumber: 5 })], {
        parseErrors: [{ rowNumber: 3, comanda: "9", field: "Valor", message: "Valor inválido" }],
      }),
    );
    assert.deepEqual(p.errors.map((e) => e.rowNumber), [3, 5]);
    assert.equal(p.counts.errorCount, 2);
  });

  test("contagens batem com as listas", () => {
    const p = buildImportPreview(
      input([
        row({ comanda: "1" }),
        row({ comanda: "2", valueCents: 9900 }),
        row({ comanda: "3", status: "OPEN", paymentMethod: null }),
        row({ comanda: "4", status: "CANCELLED" }),
        row({ comanda: "5", extraProfessionals: 1 }),
        row({ comanda: "6", professionalCodes: ["??"] }),
      ]),
    );
    assert.deepEqual(p.counts, {
      rowCount: 6,
      importedCount: 2,
      unclassifiedCount: 1,
      duplicateCount: 0,
      openPastCount: 1,
      openFutureCount: 0,
      cancelledCount: 1,
      reviewCount: 1,
      errorCount: 1,
    });
  });
});

describe("assertVisitItemsConsistent", () => {
  const item = { serviceId: "corte", productId: null, quantity: 1, unitPriceCents: 4000, unitCostCents: null, totalCents: 4000 };

  test("classificada com itens que somam o total: ok", () => {
    assertVisitItemsConsistent({ externalId: "1", classification: "CLASSIFIED", totalCents: 4000, items: [item] });
  });

  test("classificada sem itens ou com soma errada: erro", () => {
    assert.throws(() => assertVisitItemsConsistent({ externalId: "1", classification: "CLASSIFIED", totalCents: 4000, items: [] }));
    assert.throws(() => assertVisitItemsConsistent({ externalId: "1", classification: "CLASSIFIED", totalCents: 5000, items: [item] }));
  });

  test("a classificar com itens: erro", () => {
    assert.throws(() => assertVisitItemsConsistent({ externalId: "1", classification: "PENDING", totalCents: 4000, items: [item] }));
  });
});
