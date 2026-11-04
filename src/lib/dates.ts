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

const BR_DATE_TIME = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * "03/11/2026 16:30" (horário de Brasília) → instante. Aceita só a data ("03/11/2026" = 00:00)
 * e segundos opcionais. Devolve null se o texto ou a data forem inválidos (ex.: 31/02).
 */
export function parseDateTimeBR(text: string): Date | null {
  const m = BR_DATE_TIME.exec(text.trim());
  if (!m) return null;
  const [day, month, year, hour = 0, minute = 0, second = 0] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(
    (part) => (part === undefined ? undefined : Number(part)),
  ) as number[];
  if (hour > 23 || minute > 59 || second > 59) return null;

  const date = new TZDate(year, month - 1, day, hour, minute, second, 0, TZ);
  // new TZDate(2026, 1, 31) "transborda" para março: rejeita datas que não existem.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return new Date(date.getTime());
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
