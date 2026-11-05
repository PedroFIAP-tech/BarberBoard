"use client";

import { useActionState, useMemo, useState } from "react";
import { saveRuleAction, type RuleActionState } from "@/app/regras/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { itemsBalance, suggestRuleLabel } from "@/domain/visit-items";
import { parseBRLToCents } from "@/lib/money";
import type { CatalogEntry } from "@/server/classify";
import { BalanceLine, ItemsEditor, rowCents, toItemsJson, type EditorRow } from "./items-editor";

const initialState: RuleActionState = { error: null };
const inputClass = "h-11 w-full rounded-lg border bg-background px-3 text-base";

/** Criar ou editar uma regra de valor: "comanda de R$ X = estes itens". */
export function RuleForm({
  ruleId,
  catalog,
  initial,
}: {
  ruleId: string | null;
  catalog: CatalogEntry[];
  initial: { label: string; amountText: string; rows: EditorRow[] };
}) {
  const save = useMemo(() => saveRuleAction.bind(null, ruleId), [ruleId]);
  const [state, action, pending] = useActionState(save, initialState);
  const [label, setLabel] = useState(initial.label);
  const [amountText, setAmountText] = useState(initial.amountText);
  const [rows, setRows] = useState(initial.rows);
  const names = new Map(catalog.map((c) => [c.key, c.name]));

  const amountCents = parseBRLToCents(amountText);
  const validAmount = amountCents !== null && amountCents >= 0 ? amountCents : null;
  const { diffCents } = itemsBalance(rows.map((r) => ({ quantity: r.quantity, unitPriceCents: rowCents(r) })), validAmount ?? 0);
  const ready = validAmount !== null && rows.length > 0 && diffCents === 0 && label.trim() !== "";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="items" value={toItemsJson(rows)} />
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Valor da comanda no App Barber (R$)</span>
        <input name="amount" inputMode="decimal" autoComplete="off" placeholder="50,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} className={inputClass} />
      </label>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Itens que esse valor representa</span>
        <ItemsEditor catalog={catalog} rows={rows} onChange={setRows} />
      </div>
      <BalanceLine rows={rows} totalCents={validAmount} />

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Nome (como no App Barber)</span>
        <input
          name="label"
          maxLength={80}
          autoComplete="off"
          placeholder={suggestRuleLabel(rows.map((r) => names.get(r.key) ?? "")) || "Corte e sobrancelha"}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onFocus={() => !label && setLabel(suggestRuleLabel(rows.map((r) => names.get(r.key) ?? "")))}
          className={inputClass}
        />
      </label>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending || !ready} className="h-11 w-full text-base">
        {pending ? "Salvando…" : "Salvar regra"}
      </Button>
    </form>
  );
}
