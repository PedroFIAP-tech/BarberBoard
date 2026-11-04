import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { endOfDayBR, parseDateTimeBR, startOfDayBR, toDayKeyBR, toDbDate } from "./dates";

describe("dia em Brasília", () => {
  // 2026-11-04 02:30Z = 03/11 23:30 em Brasília (UTC-3)
  const late = new Date("2026-11-04T02:30:00Z");

  test("toDayKeyBR usa o fuso de Brasília, não UTC", () => {
    assert.equal(toDayKeyBR(late), "2026-11-03");
  });

  test("início e fim do dia", () => {
    assert.equal(startOfDayBR(late).toISOString(), "2026-11-03T03:00:00.000Z");
    assert.equal(endOfDayBR(late).toISOString(), "2026-11-04T02:59:59.999Z");
  });

  test("toDbDate grava meia-noite UTC do dia de Brasília", () => {
    assert.equal(toDbDate(late).toISOString(), "2026-11-03T00:00:00.000Z");
    assert.equal(toDbDate("2026-11-04").toISOString(), "2026-11-04T00:00:00.000Z");
  });
});

describe("parseDateTimeBR", () => {
  test("data e hora do App Barber, em Brasília", () => {
    assert.equal(parseDateTimeBR("03/11/2026 16:30")?.toISOString(), "2026-11-03T19:30:00.000Z");
    assert.equal(parseDateTimeBR(" 03/11/2026 16:30 ")?.toISOString(), "2026-11-03T19:30:00.000Z");
  });

  test("segundos opcionais e só a data", () => {
    assert.equal(parseDateTimeBR("03/11/2026 16:30:15")?.toISOString(), "2026-11-03T19:30:15.000Z");
    assert.equal(parseDateTimeBR("03/11/2026")?.toISOString(), "2026-11-03T03:00:00.000Z");
  });

  test("rejeita datas que não existem e formatos errados", () => {
    assert.equal(parseDateTimeBR("31/02/2026 10:00"), null);
    assert.equal(parseDateTimeBR("03/11/2026 24:00"), null);
    assert.equal(parseDateTimeBR("2026-11-03 16:30"), null);
    assert.equal(parseDateTimeBR("3/11/2026 16:30"), null);
    assert.equal(parseDateTimeBR(""), null);
  });
});
