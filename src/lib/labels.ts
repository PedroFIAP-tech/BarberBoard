// Rótulos em pt-BR para valores guardados em inglês no banco.

export const PAYMENT_METHOD_LABELS = {
  PIX: "Pix",
  CASH: "Dinheiro",
  DEBIT: "Débito",
  CREDIT: "Crédito",
} as const satisfies Record<"PIX" | "CASH" | "DEBIT" | "CREDIT", string>;

export const IMPORT_STATUS_LABELS = {
  PENDING: "Prévia não confirmada",
  COMPLETED: "Importada",
  FAILED: "Falhou",
} as const satisfies Record<"PENDING" | "COMPLETED" | "FAILED", string>;

/** "1 visita" / "3 visitas" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
