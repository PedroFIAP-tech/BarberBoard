"use client";

import { useActionState, useMemo, useState } from "react";
import { confirmImportAction, type ActionState } from "@/app/importar/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { OpenRowView } from "@/server/import/queries";
import { REVIEW_FIELD_PREFIX } from "@/server/import/form";
import { Section } from "@/components/parts";
import { confirmLabel, hasWork } from "./confirm-label";

const initialState: ActionState = { error: null };

/**
 * Revisão (comandas com vários profissionais) + botão de confirmar.
 * A contagem do botão soma as visitas novas e as revisões já resolvidas.
 */
export function ConfirmForm({
  batchId,
  baseCount,
  toConfirmCount,
  confirmChanges,
  review,
  barbers,
}: {
  batchId: string;
  baseCount: number;
  /** Comandas novas "a confirmar" e mudanças em pendências existentes (também precisam ser gravadas). */
  toConfirmCount: number;
  confirmChanges: number;
  review: OpenRowView[];
  barbers: { id: string; name: string }[];
}) {
  const confirm = useMemo(() => confirmImportAction.bind(null, batchId), [batchId]);
  const [state, action, pending] = useActionState(confirm, initialState);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const resolved = Object.values(choices).filter(Boolean).length;
  const work = { visits: baseCount + resolved, toConfirm: toConfirmCount, confirmChanges };

  return (
    <form action={action} className="space-y-4">
      {review.length > 0 && (
        <Section title="Revisar: mais de um profissional" count={review.length} defaultOpen tone="warning">
          <p className="mb-3 text-xs text-muted-foreground">
            O App Barber registrou mais de um profissional nestas comandas. Escolha quem atendeu; sem escolha, a
            comanda fica para a próxima importação.
          </p>
          <ul className="space-y-3">
            {review.map((row) => (
              <li key={row.comanda} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    {formatDateTimeBR(row.scheduledAt)} · {row.professionals}
                  </span>
                  <span className="font-medium tabular-nums">{formatBRL(row.valueCents)}</span>
                </div>
                <select
                  name={`${REVIEW_FIELD_PREFIX}${row.comanda}`}
                  value={choices[row.comanda] ?? ""}
                  onChange={(e) => setChoices((c) => ({ ...c, [row.comanda]: e.target.value }))}
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  aria-label={`Barbeiro da comanda de ${formatDateTimeBR(row.scheduledAt)}`}
                >
                  <option value="">Não importar agora</option>
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Fica logo acima da barra de navegação inferior no celular (--bottom-nav-h). */}
      <div className="sticky bottom-[var(--bottom-nav-h)] -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="submit" disabled={pending || !hasWork(work)} className="h-12 w-full text-base">
          {pending ? "Importando…" : confirmLabel(work)}
        </Button>
      </div>
    </form>
  );
}
