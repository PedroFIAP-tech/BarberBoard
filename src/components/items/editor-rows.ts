// Linhas do editor de itens e conversões. Módulo comum (sem "use client"): usado tanto pelas
// páginas (servidor, para montar as linhas iniciais) quanto pelo editor (cliente).

import { formatCentsForInput, parseBRLToCents } from "@/lib/money";

export type EditorRow = { key: string; quantity: number; priceText: string };

/** Preço da linha em centavos (NaN se o texto não for um valor válido). */
export const rowCents = (row: EditorRow) => parseBRLToCents(row.priceText) ?? Number.NaN;

/** Linhas do editor → JSON enviado ao servidor no campo "items". */
export function toItemsJson(rows: EditorRow[]): string {
  return JSON.stringify(rows.map((r) => ({ key: r.key, quantity: r.quantity, unitPriceCents: rowCents(r) })));
}

/** Itens gravados (visita ou regra) → linhas iniciais do editor. */
export function rowsFromItems(
  items: { serviceId: string | null; productId: string | null; quantity: number; unitPriceCents: number }[],
): EditorRow[] {
  return items.map((i) => ({
    key: i.serviceId ? `s:${i.serviceId}` : `p:${i.productId}`,
    quantity: i.quantity,
    priceText: formatCentsForInput(i.unitPriceCents),
  }));
}
