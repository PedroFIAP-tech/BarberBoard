// Converte uma linha crua do App Barber (tudo texto) em dados tipados.
// Nunca inclui o conteúdo da Obs em mensagens de erro: ela pode ter o nome do cliente.

import { parseDateTimeBR } from "@/lib/dates";
import { parseBRLToCents } from "@/lib/money";
import type { ColumnIndex } from "./columns";

export type PaymentMethodValue = "PIX" | "CASH" | "DEBIT" | "CREDIT";
export type ComandaStatus = "CLOSED" | "OPEN" | "CANCELLED";

export type NormalizedRow = {
  rowNumber: number;
  comanda: string;
  status: ComandaStatus;
  /** Coluna "Data": horário do atendimento (fuso de Brasília). Sempre preenchida em Fechada e Aberta. */
  scheduledAt: Date | null;
  valueCents: number;
  /** Só obrigatório em comanda Fechada. */
  paymentMethod: PaymentMethodValue | null;
  /** Códigos de profissional (ex.: ["L.F"]). */
  professionalCodes: string[];
  /** Profissionais a mais sem nome, ex.: "L.F + 1" → 1. */
  extraProfessionals: number;
  /** Obs, sem o texto automático do App Barber. */
  notes: string | null;
};

export type RowError = {
  rowNumber: number;
  comanda: string | null;
  field: "Comanda" | "Status" | "Data" | "Valor" | "Tipo Pagamento" | "Profissional";
  message: string;
};

export type NormalizeResult = { ok: true; row: NormalizedRow } | { ok: false; error: RowError };

const STATUS: Record<string, ComandaStatus> = {
  fechada: "CLOSED",
  aberta: "OPEN",
  cancelada: "CANCELLED",
};

const PAYMENT: Record<string, PaymentMethodValue> = {
  pix: "PIX",
  dinheiro: "CASH",
  "cartão de débito": "DEBIT",
  "cartão de crédito": "CREDIT",
};

/** Texto que o App Barber coloca sozinho na Obs: não é observação de verdade. */
export const AUTO_OBS = "Comanda Aberta por Agendamento";

const key = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

function cleanNotes(raw: string): string | null {
  const text = raw.trim();
  if (text === "" || key(text) === key(AUTO_OBS)) return null;
  return text;
}

/** "L.F + 1" → { codes: ["L.F"], extra: 1 } · "PH" → { codes: ["PH"], extra: 0 } */
export function parseProfessionals(raw: string): { codes: string[]; extra: number } {
  const codes: string[] = [];
  let extra = 0;
  for (const part of raw.split("+").map((p) => p.trim()).filter(Boolean)) {
    if (/^\d+$/.test(part)) extra += Number(part);
    else codes.push(part);
  }
  return { codes, extra };
}

export function normalizeRow(rowNumber: number, cells: string[], index: ColumnIndex): NormalizeResult {
  const get = (col: keyof ColumnIndex) => (cells[index[col]] ?? "").trim();
  const comanda = get("Comanda");
  const fail = (field: RowError["field"], message: string): NormalizeResult => ({
    ok: false,
    error: { rowNumber, comanda: comanda || null, field, message },
  });

  if (!/^\d+$/.test(comanda)) {
    return fail("Comanda", comanda ? `Número de comanda inválido: "${comanda}"` : "Comanda sem número");
  }

  const statusText = get("Status");
  const status = STATUS[key(statusText)];
  if (!status) return fail("Status", `Status desconhecido: "${statusText}"`);

  const base = { rowNumber, comanda, status, notes: cleanNotes(cells[index.Obs] ?? "") };

  // Cancelada é ignorada: não precisa de nenhum outro campo válido.
  if (status === "CANCELLED") {
    return {
      ok: true,
      row: {
        ...base,
        scheduledAt: parseDateTimeBR(get("Data")),
        valueCents: parseBRLToCents(get("Valor")) ?? 0,
        paymentMethod: null,
        professionalCodes: [],
        extraProfessionals: 0,
      },
    };
  }

  const dateText = get("Data");
  const scheduledAt = parseDateTimeBR(dateText);
  if (!scheduledAt) return fail("Data", `Data inválida: "${dateText}" (esperado dd/mm/aaaa hh:mm)`);

  const valueText = get("Valor");
  const valueCents = parseBRLToCents(valueText);
  if (valueCents === null || valueCents < 0) return fail("Valor", `Valor inválido: "${valueText}"`);

  const { codes, extra } = parseProfessionals(get("Profissional"));
  let paymentMethod: PaymentMethodValue | null = null;

  if (status === "CLOSED") {
    const paymentText = get("Tipo Pagamento");
    paymentMethod = PAYMENT[key(paymentText)] ?? null;
    if (!paymentMethod) {
      return fail(
        "Tipo Pagamento",
        paymentText ? `Forma de pagamento desconhecida: "${paymentText}"` : "Comanda fechada sem forma de pagamento",
      );
    }
    if (codes.length === 0) return fail("Profissional", "Comanda fechada sem profissional");
  }

  return {
    ok: true,
    row: { ...base, scheduledAt, valueCents, paymentMethod, professionalCodes: codes, extraProfessionals: extra },
  };
}
