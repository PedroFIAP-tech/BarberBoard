"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createManualVisitAction,
  updateManualVisitAction,
  type ManualVisitActionState,
} from "@/app/visitas/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHODS, type PaymentMethodValue } from "@/domain/payments";
import { calcFee } from "@/domain/pricing";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import type { CatalogEntry } from "@/server/classify";
import { rowCents, toItemsJson, type EditorRow } from "./editor-rows";
import { ItemsEditor } from "./items-editor";

const initialState: ManualVisitActionState = { error: null };
const inputClass = "h-11 w-full rounded-lg border bg-background px-3 text-base";

export type ManualVisitInitial = {
  date: string;
  time: string;
  barberId: string;
  paymentMethod: PaymentMethodValue;
  rows: EditorRow[];
  notes: string;
};

/** Lançar (visitId = null) ou editar uma visita manual. O total é a soma dos itens. */
export function ManualVisitForm({
  visitId,
  catalog,
  barbers,
  feeBpsByMethod,
  initial,
}: {
  visitId: string | null;
  catalog: CatalogEntry[];
  barbers: { id: string; name: string }[];
  feeBpsByMethod: Record<PaymentMethodValue, number>;
  initial: ManualVisitInitial;
}) {
  const action0 = useMemo(() => (visitId ? updateManualVisitAction.bind(null, visitId) : createManualVisitAction), [visitId]);
  const [state, action, pending] = useActionState(action0, initialState);
  const [rows, setRows] = useState(initial.rows);
  const [method, setMethod] = useState<PaymentMethodValue>(initial.paymentMethod);

  const valid = rows.length > 0 && rows.every((r) => Number.isInteger(rowCents(r)) && rowCents(r) >= 0);
  const totalCents = valid ? rows.reduce((s, r) => s + r.quantity * rowCents(r), 0) : null;
  const fee = totalCents === null ? null : calcFee(totalCents, feeBpsByMethod[method]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="items" value={toItemsJson(rows)} />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Dia</span>
          <input type="date" name="date" required defaultValue={initial.date} className={inputClass} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Hora</span>
          <input type="time" name="time" required defaultValue={initial.time} className={inputClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Barbeiro</span>
          <select name="barberId" required defaultValue={initial.barberId} className={inputClass}>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Pagamento</span>
          <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodValue)} className={inputClass}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">O que foi feito</span>
        <ItemsEditor catalog={catalog} rows={rows} onChange={setRows} />
      </div>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
        {totalCents === null || fee === null ? (
          "Adicione os itens para ver o total."
        ) : (
          <>
            Total <strong>{formatBRL(totalCents)}</strong>
            {fee.feeCents > 0 && ` · taxa ${formatBRL(fee.feeCents)} · líquido ${formatBRL(fee.netCents)}`}
          </>
        )}
      </p>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Observação (opcional)</span>
        <input name="notes" maxLength={500} autoComplete="off" defaultValue={initial.notes} className={inputClass} />
      </label>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending || !valid} className="h-11 w-full text-base">
        {pending ? "Salvando…" : visitId ? "Salvar alterações" : "Lançar visita"}
      </Button>
    </form>
  );
}
