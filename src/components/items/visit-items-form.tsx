"use client";

import { useActionState, useMemo, useState } from "react";
import { saveVisitItemsAction, type ItemsActionState } from "@/app/visitas/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { itemsBalance, suggestRuleLabel } from "@/domain/visit-items";
import type { CatalogEntry } from "@/server/classify";
import { BalanceLine, ItemsEditor, rowCents, toItemsJson, type EditorRow } from "./items-editor";

const initialState: ItemsActionState = { error: null };

/** Corrigir/classificar os itens de uma visita: só salva quando os itens fecham com o total. */
export function VisitItemsForm({
  appointmentId,
  totalCents,
  catalog,
  initialRows,
  canSaveAsRule,
}: {
  appointmentId: string;
  totalCents: number;
  catalog: CatalogEntry[];
  initialRows: EditorRow[];
  /** O valor ainda não tem regra ativa: oferece "salvar como regra". */
  canSaveAsRule: boolean;
}) {
  const save = useMemo(() => saveVisitItemsAction.bind(null, appointmentId), [appointmentId]);
  const [state, action, pending] = useActionState(save, initialState);
  const [rows, setRows] = useState(initialRows);
  const [saveAsRule, setSaveAsRule] = useState(false);
  const names = new Map(catalog.map((c) => [c.key, c.name]));
  const [ruleLabel, setRuleLabel] = useState("");
  const suggested = suggestRuleLabel(rows.map((r) => names.get(r.key) ?? ""));

  const { diffCents } = itemsBalance(rows.map((r) => ({ quantity: r.quantity, unitPriceCents: rowCents(r) })), totalCents);
  const balanced = rows.length > 0 && diffCents === 0 && rows.every((r) => !Number.isNaN(rowCents(r)));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="items" value={toItemsJson(rows)} />
      <ItemsEditor catalog={catalog} rows={rows} onChange={setRows} />
      <BalanceLine rows={rows} totalCents={totalCents} />

      {canSaveAsRule && (
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="saveAsRule" checked={saveAsRule} onChange={(e) => setSaveAsRule(e.target.checked)} className="size-5" />
            Salvar como regra: próximas comandas deste valor já entram com estes itens
          </label>
          {saveAsRule && (
            <input
              name="ruleLabel"
              value={ruleLabel || suggested}
              onChange={(e) => setRuleLabel(e.target.value)}
              maxLength={80}
              aria-label="Nome da regra"
              className="h-11 w-full rounded-lg border bg-background px-3 text-base"
            />
          )}
        </div>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending || !balanced} className="h-11 w-full text-base">
        {pending ? "Salvando…" : balanced ? "Salvar itens" : "Os itens precisam fechar com o total"}
      </Button>
    </form>
  );
}
