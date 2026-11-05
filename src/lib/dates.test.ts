import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  dayBoundsBR,
  endOfDayBR,
  formatDateBR,
  formatDateTimeBR,
  instantFromDayAndTime,
  dayKeyFromDbDate,
  formatMonthLongBR,
  isValidMonthKey,
  monthDbRange,
  monthKeyOf,
  shiftMonthKey,
  formatDayKeyBR,
  formatDayLongBR,
  formatTimeBR,
  isValidDayKey,
  parseDateTimeBR,
  shiftDayKey,
  startOfDayBR,
  toDayKeyBR,
  toDbDate,
  weekdayOfDayKey,
} from "./dates";

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

describe("formatação em Brasília", () => {
  const late = new Date("2026-11-04T02:30:00Z"); // 03/11 23:30 em Brasília

  test("formatDateTimeBR", () => {
    assert.equal(formatDateTimeBR(late), "03/11 23:30");
    assert.equal(formatDateTimeBR(late, { withYear: true }), "03/11/2026 23:30");
  });

  test("formatTimeBR", () => {
    assert.equal(formatTimeBR(late), "23:30");
  });

  test("formatDateBR", () => {
    assert.equal(formatDateBR(late), "03/11/2026");
  });
});

describe("dia de calendário", () => {
  test("isValidDayKey", () => {
    assert.equal(isValidDayKey("2026-11-04"), true);
    assert.equal(isValidDayKey("2026-02-29"), false); // 2026 não é bissexto
    assert.equal(isValidDayKey("2028-02-29"), true);
    assert.equal(isValidDayKey("2026-13-01"), false);
    assert.equal(isValidDayKey("04/11/2026"), false);
    assert.equal(isValidDayKey(undefined), false);
    assert.equal(isValidDayKey(["2026-11-04"]), false);
  });

  test("dayBoundsBR: o dia de Brasília em UTC", () => {
    const { start, end } = dayBoundsBR("2026-11-04");
    assert.equal(start.toISOString(), "2026-11-04T03:00:00.000Z");
    assert.equal(end.toISOString(), "2026-11-05T02:59:59.999Z");
  });

  test("shiftDayKey atravessa mês e ano", () => {
    assert.equal(shiftDayKey("2026-11-30", 1), "2026-12-01");
    assert.equal(shiftDayKey("2026-12-31", 1), "2027-01-01");
    assert.equal(shiftDayKey("2026-03-01", -1), "2026-02-28");
  });

  test("weekdayOfDayKey e formatação", () => {
    assert.equal(weekdayOfDayKey("2026-11-04"), 3); // quarta
    assert.equal(weekdayOfDayKey("2026-11-09"), 1); // segunda
    assert.equal(formatDayLongBR("2026-11-04"), "quarta-feira, 4 de novembro");
    assert.equal(formatDayKeyBR("2026-11-04"), "04/11/2026");
  });
});

describe("mês", () => {
  test("isValidMonthKey", () => {
    assert.equal(isValidMonthKey("2026-11"), true);
    assert.equal(isValidMonthKey("2026-13"), false);
    assert.equal(isValidMonthKey("2026-00"), false);
    assert.equal(isValidMonthKey("11/2026"), false);
    assert.equal(isValidMonthKey(undefined), false);
  });

  test("shiftMonthKey e monthKeyOf", () => {
    assert.equal(shiftMonthKey("2026-12", 1), "2027-01");
    assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
    assert.equal(monthKeyOf("2026-11-04"), "2026-11");
  });

  test("monthDbRange: do dia 1 até o dia 1 do mês seguinte (meia-noite UTC)", () => {
    const { start, end } = monthDbRange("2026-02");
    assert.equal(start.toISOString(), "2026-02-01T00:00:00.000Z");
    assert.equal(end.toISOString(), "2026-03-01T00:00:00.000Z");
    assert.equal(dayKeyFromDbDate(start), "2026-02-01");
  });

  test("formatMonthLongBR", () => {
    assert.equal(formatMonthLongBR("2026-11"), "novembro de 2026");
  });
});

test("instantFromDayAndTime", () => {
  assert.equal(instantFromDayAndTime("2026-11-04", "16:30")?.toISOString(), "2026-11-04T19:30:00.000Z");
  assert.equal(instantFromDayAndTime("2026-11-04", "24:00"), null);
  assert.equal(instantFromDayAndTime("2026-02-30", "10:00"), null);
  assert.equal(instantFromDayAndTime("2026-11-04", "9:00"), null);
});
