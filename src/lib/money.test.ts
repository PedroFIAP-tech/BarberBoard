import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bpsToPercent,
  formatBps,
  formatBpsForInput,
  formatBRL,
  formatCentsForInput,
  parseBRLToCents,
  parsePercentToBps,
  percentToBps,
} from "./money";

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

test("formatCentsForInput vai e volta com parseBRLToCents", () => {
  assert.equal(formatCentsForInput(10000), "100,00");
  assert.equal(formatCentsForInput(7), "0,07");
  assert.equal(formatCentsForInput(123456), "1234,56");
  assert.equal(formatCentsForInput(-1000), "-10,00");
  for (const cents of [0, 7, 4590, 123456, -1000]) assert.equal(parseBRLToCents(formatCentsForInput(cents)), cents);
});

test("parsePercentToBps", () => {
  assert.equal(parsePercentToBps("1,99"), 199);
  assert.equal(parsePercentToBps("4,98%"), 498);
  assert.equal(parsePercentToBps("5"), 500);
  assert.equal(parsePercentToBps("0"), 0);
  assert.equal(parsePercentToBps("100"), 10000);
  assert.equal(parsePercentToBps("100,01"), null);
  assert.equal(parsePercentToBps("-1"), null);
  assert.equal(parsePercentToBps("1,999"), null);
  assert.equal(parsePercentToBps("abc"), null);
  assert.equal(formatBpsForInput(199), "1,99");
});
