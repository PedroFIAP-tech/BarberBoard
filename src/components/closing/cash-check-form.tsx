"use client";

import { useActionState, useMemo, useState } from "react";
import { saveCashClosingAction, type CashActionState } from "@/app/fechamento/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { expectedCash } from "@/domain/closing";
import { formatDateTimeBR } from "@/lib/dates";
import { formatBRL, formatCentsForInput, parseBRLToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SavedClosingView } from "@/server/closing";

const initialState: CashActionState = { error: null };

function Difference({ cents }: { cents: number }) {
  if (cents === 0) return <span className="font-semibold text-emerald-700 dark:text-emerald-400">Confere ✓</span>;
  return (
    <span className={cn("font-semibold", cents < 0 ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
      {cents < 0 ? "Faltando" : "Sobrando"} {formatBRL(Math.abs(cents))}
    </span>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

const inputClass = "h-11 w-full rounded-lg border bg-background px-3 text-base tabular-nums";

/**
 * Conferência de caixa: fundo de troco + dinheiro do dia = esperado na gaveta; compara com o contado.
 * O cálculo aqui é só para mostrar ao vivo; o servidor recalcula o esperado ao salvar.
 */
export function CashCheckForm({
  dayKey,
  cashSalesCents,
  suggestedOpeningCashCents,
  closing,
  stale,
}: {
  dayKey: string;
  cashSalesCents: number;
  suggestedOpeningCashCents: number;
  closing: SavedClosingView | null;
  stale: boolean;
}) {
  const save = useMemo(() => saveCashClosingAction.bind(null, dayKey), [dayKey]);
  const [state, action, pending] = useActionState(save, initialState);
  const [editing, setEditing] = useState(!closing || stale);
  const [opening, setOpening] = useState(formatCentsForInput(closing?.openingCashCents ?? suggestedOpeningCashCents));
  const [counted, setCounted] = useState(closing ? formatCentsForInput(closing.countedCashCents) : "");

  const openingCents = opening.trim() === "" ? 0 : parseBRLToCents(opening);
  const countedCents = counted.trim() === "" ? null : parseBRLToCents(counted);
  const expected = openingCents !== null && openingCents >= 0 ? expectedCash(openingCents, cashSalesCents) : null;
  const currentExpectedOfSaved = closing ? expectedCash(closing.openingCashCents, cashSalesCents) : null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Conferência de caixa</h2>

      {closing && stale && (
        <Alert>
          <AlertTitle>Fechamento desatualizado</AlertTitle>
          <AlertDescription>
            O dinheiro do dia mudou depois da conferência (entraram ou mudaram visitas). Esperado agora:{" "}
            {formatBRL(currentExpectedOfSaved!)} (era {formatBRL(closing.expectedCashCents)}). Confira de novo.
          </AlertDescription>
        </Alert>
      )}

      {closing && !editing && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Conferido em {formatDateTimeBR(closing.closedAt, { withYear: true })}</p>
          <Line label="Fundo de troco">{formatBRL(closing.openingCashCents)}</Line>
          <Line label="Dinheiro do dia">{formatBRL(closing.expectedCashCents - closing.openingCashCents)}</Line>
          <Line label="Esperado na gaveta">{formatBRL(closing.expectedCashCents)}</Line>
          <Line label="Contado">{formatBRL(closing.countedCashCents)}</Line>
          <Line label="Diferença">
            <Difference cents={closing.differenceCents} />
          </Line>
          {closing.notes && <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">{closing.notes}</p>}
          <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => setEditing(true)}>
            Refazer conferência
          </Button>
        </div>
      )}

      {editing && (
        <form action={action} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Fundo de troco (R$)</span>
              <input
                name="opening"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Contado na gaveta (R$)</span>
              <input
                name="counted"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                required
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div>
            <Line label="Dinheiro do dia">{formatBRL(cashSalesCents)}</Line>
            <Line label="Esperado na gaveta">{expected === null ? "—" : formatBRL(expected)}</Line>
            <Line label="Diferença">
              {expected === null || countedCents === null || countedCents < 0 ? "—" : <Difference cents={countedCents - expected} />}
            </Line>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Observação (opcional)</span>
            <input name="notes" maxLength={500} autoComplete="off" defaultValue={closing?.notes ?? ""} className={inputClass} />
          </label>

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pending} className="h-11 w-full text-base">
            {pending ? "Salvando…" : closing ? "Salvar nova conferência" : "Salvar conferência"}
          </Button>
          {closing && !stale && (
            <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
