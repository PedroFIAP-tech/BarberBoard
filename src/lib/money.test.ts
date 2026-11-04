import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bpsToPercent, formatBps, formatBRL, parseBRLToCents, percentToBps } from "./money";

describe("parseBRLToCents", () => {
  test("formatos aceitos", () => {
    assert.equal(parseBRLToCents("45,90"), 4590);
    assert.equal(parseBRLToCents("45,9"), 4590);
    assert.equal(parseBRLToCents("45"), 4500);
    assert.equal(parseBRLToCents("0,07"), 7);
    assert.equal(parseBRLToCents("R$ 1.234,5"), 123450);
    assert.equal(parseBRLToCents("1234,56"), 123456);
    assert.equal(parseBRLToCents("100,00"), 10000); // formato da exportação do App Barber
    assert.equal(parseBRLToCents("0,00"), 0);
    assert.equal(parseBRLToCents("-10,00"), -1000);
  });

  test("formatos rejeitados", () => {
    assert.equal(parseBRLToCents("12.34"), null); // ponto decimal (formato americano)
    assert.equal(parseBRLToCents("abc"), null);
    assert.equal(parseBRLToCents("45,999"), null);
    assert.equal(parseBRLToCents(""), null);
  });
});

test("formatBRL", () => {
  assert.equal(formatBRL(4590).replace(/\s/g, " "), "R$ 45,90");
  assert.equal(formatBRL(0).replace(/\s/g, " "), "R$ 0,00");
});

test("basis points", () => {
  assert.equal(percentToBps(1.99), 199);
  assert.equal(percentToBps(4.98), 498);
  assert.equal(bpsToPercent(199), 1.99);
  assert.equal(formatBps(199), "1,99%");
  assert.equal(formatBps(0), "0%");
});
