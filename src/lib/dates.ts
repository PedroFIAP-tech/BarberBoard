import { TZDate } from "@date-fns/tz";
import { endOfDay, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

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

/** "03/11 16:30" (dia/mês hora:minuto, em Brasília). Com `withYear`: "03/11/2026 16:30". */
export function formatDateTimeBR(date: Date | number, { withYear = false } = {}): string {
  return format(inBR(date), withYear ? "dd/MM/yyyy HH:mm" : "dd/MM HH:mm");
}

/** "16:30" (hora:minuto em Brasília). */
export function formatTimeBR(date: Date | number): string {
  return format(inBR(date), "HH:mm");
}

/** "03/11/2026" (em Brasília). */
export function formatDateBR(date: Date | number): string {
  return format(inBR(date), "dd/MM/yyyy");
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

// ─── Dia de calendário ("aaaa-mm-dd") ────────────────────────────────────────

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-04" válido e existente (rejeita "2026-02-31", "04/11/2026"...). */
export function isValidDayKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  const m = DAY_KEY.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Primeiro e último instante do dia em Brasília. Ex.: "2026-11-04" → 04/11 00:00 até 23:59:59.999 (BR). */
export function dayBoundsBR(key: string): { start: Date; end: Date } {
  const [y, m, d] = key.split("-").map(Number);
  return {
    start: new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, TZ).getTime()),
    end: new Date(new TZDate(y, m - 1, d, 23, 59, 59, 999, TZ).getTime()),
  };
}

/** Soma (ou subtrai) dias: shiftDayKey("2026-11-30", 1) → "2026-12-01". */
export function shiftDayKey(key: string, days: number): string {
  const date = toDbDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Dia da semana do dia de calendário: 0 = domingo … 6 = sábado. */
export function weekdayOfDayKey(key: string): number {
  return toDbDate(key).getUTCDay();
}

/** "2026-11-04" → "quarta-feira, 4 de novembro". */
export function formatDayLongBR(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return format(new TZDate(y, m - 1, d, 12, 0, 0, 0, TZ), "EEEE, d 'de' MMMM", { locale: ptBR });
}

/** "2026-11-04" → "04/11/2026". */
export function formatDayKeyBR(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Mês ("aaaa-mm") ─────────────────────────────────────────────────────────

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/** "2026-11" válido (mês 01 a 12). */
export function isValidMonthKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  const m = MONTH_KEY.exec(key);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** Mês de um dia: "2026-11-04" → "2026-11". */
export const monthKeyOf = (dayKey: string) => dayKey.slice(0, 7);

/** Soma (ou subtrai) meses: shiftMonthKey("2026-12", 1) → "2027-01". */
export function shiftMonthKey(key: string, months: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Intervalo do mês para colunas @db.Date (meia-noite UTC): [primeiro dia, primeiro dia do mês seguinte).
 * Use com { gte: start, lt: end }.
 */
export function monthDbRange(key: string): { start: Date; end: Date } {
  return { start: toDbDate(`${key}-01`), end: toDbDate(`${shiftMonthKey(key, 1)}-01`) };
}

/** Dia gravado numa coluna @db.Date → "aaaa-mm-dd". */
export const dayKeyFromDbDate = (date: Date) => date.toISOString().slice(0, 10);

/** "2026-11" → "novembro de 2026". */
export function formatMonthLongBR(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return format(new TZDate(y, m - 1, 15, 12, 0, 0, 0, TZ), "MMMM 'de' yyyy", { locale: ptBR });
}
