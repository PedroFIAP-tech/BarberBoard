import { TZDate } from "@date-fns/tz";
import { endOfDay, format, startOfDay } from "date-fns";

// A barbearia opera no horário de Brasília. Todo cálculo de "dia" (fechamento,
// dashboard por dia/hora) precisa usar este fuso, e não o do servidor (UTC na Vercel).
export const TZ = "America/Sao_Paulo";

/** O instante informado, visto no fuso da barbearia. */
export function inBR(date: Date | number): TZDate {
  return new TZDate(+date, TZ);
}

/** Primeiro instante (00:00:00.000) do dia em Brasília que contém `date`. */
export function startOfDayBR(date: Date | number): Date {
  return new Date(startOfDay(inBR(date)).getTime());
}

/** Último instante (23:59:59.999) do dia em Brasília que contém `date`. */
export function endOfDayBR(date: Date | number): Date {
  return new Date(endOfDay(inBR(date)).getTime());
}

/** Dia de calendário em Brasília no formato "yyyy-MM-dd". */
export function toDayKeyBR(date: Date | number): string {
  return format(inBR(date), "yyyy-MM-dd");
}

/**
 * Converte um dia de calendário para o valor gravado em colunas `@db.Date`.
 * O Prisma lê/grava @db.Date como meia-noite UTC, então "2026-11-04" → 2026-11-04T00:00:00Z.
 * Aceita "yyyy-MM-dd" ou um instante (usa o dia em Brasília).
 */
export function toDbDate(day: string | Date | number): Date {
  const key = typeof day === "string" ? day : toDayKeyBR(day);
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
