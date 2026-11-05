// Texto do botão de confirmar a importação. Módulo comum (sem "use client"), testável.

import { plural } from "@/lib/labels";

export type ConfirmWork = {
  /** Visitas novas (inclui as revisões já resolvidas). */
  visits: number;
  /** Comandas novas "a confirmar". */
  toConfirm: number;
  /** Comandas a confirmar que mudaram (horário/valor) ou vieram Canceladas no App Barber. */
  confirmChanges: number;
};

/** Há algo a gravar? Visitas, pendências novas ou mudanças em pendências. */
export const hasWork = (w: ConfirmWork) => w.visits + w.toConfirm + w.confirmChanges > 0;

export function confirmLabel(w: ConfirmWork): string {
  if (w.visits > 0 && w.toConfirm > 0) return `Importar ${plural(w.visits, "visita")} e ${w.toConfirm} a confirmar`;
  if (w.visits > 0) return `Importar ${plural(w.visits, "visita")}`;
  if (w.toConfirm > 0) return `Importar ${plural(w.toConfirm, "comanda a confirmar", "comandas a confirmar")}`;
  if (w.confirmChanges > 0) return `Atualizar ${plural(w.confirmChanges, "comanda a confirmar", "comandas a confirmar")}`;
  return "Nada novo para importar";
}
