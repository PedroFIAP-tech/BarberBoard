"use client";

// Editor de itens (serviços/produtos) usado na correção da visita e nas regras de valor.
// Controlado pelo pai: recebe as linhas e devolve as alterações. O pai envia `toItemsJson(rows)`
// num <input type="hidden" name="items"> e o servidor valida tudo de novo. As funções puras das
// linhas ficam em ./editor-rows (as páginas do servidor também usam).

import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { itemsBalance } from "@/domain/visit-items";
import { formatBRL, formatCentsForInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "@/server/classify";
import { rowCents, type EditorRow } from "./editor-rows";

export { rowCents, rowsFromItems, toItemsJson, type EditorRow } from "./editor-rows";

const KIND_LABEL = { MAIN: "Serviços", EXTRA: "Extras", PRODUCT: "Produtos" } as const;

/** "Itens R$ 40,00 de R$ 50,00 · faltam R$ 10,00" */
export function BalanceLine({ rows, totalCents }: { rows: EditorRow[]; totalCents: number | null }) {
  if (totalCents === null) return null;
  const { sumCents, diffCents } = itemsBalance(
    rows.map((r) => ({ quantity: r.quantity, unitPriceCents: rowCents(r) })),
    totalCents,
  );
  return (
    <p
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        diffCents === 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted",
      )}
      aria-live="polite"
    >
      Itens {formatBRL(sumCents)} de {formatBRL(totalCents)} ·{" "}
      <strong>
        {diffCents === 0 ? "fecha com o total ✓" : diffCents > 0 ? `faltam ${formatBRL(diffCents)}` : `sobram ${formatBRL(-diffCents)}`}
      </strong>
    </p>
  );
}

export function ItemsEditor({
  catalog,
  rows,
  onChange,
}: {
  catalog: CatalogEntry[];
  rows: EditorRow[];
  onChange: (rows: EditorRow[]) => void;
}) {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const update = (index: number, patch: Partial<EditorRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>}
      <ul className="space-y-2">
        {rows.map((row, i) => {
          const entry = byKey.get(row.key);
          return (
            <li key={`${row.key}-${i}`} className="rounded-lg border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{entry?.name ?? "Item"}</span>
                <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Remover ${entry?.name ?? "item"}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  <X aria-hidden />
                </Button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex items-center rounded-lg border">
                  <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Menos um" disabled={row.quantity <= 1} onClick={() => update(i, { quantity: row.quantity - 1 })}>
                    <Minus aria-hidden />
                  </Button>
                  <span className="w-8 text-center text-sm tabular-nums" aria-label="Quantidade">
                    {row.quantity}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Mais um" disabled={row.quantity >= 99} onClick={() => update(i, { quantity: row.quantity + 1 })}>
                    <Plus aria-hidden />
                  </Button>
                </div>
                <label className="flex flex-1 items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">R$</span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.priceText}
                    onChange={(e) => update(i, { priceText: e.target.value })}
                    aria-label={`Preço de ${entry?.name ?? "item"}`}
                    aria-invalid={Number.isNaN(rowCents(row)) || undefined}
                    className="h-10 w-full rounded-lg border bg-background px-2 text-base tabular-nums aria-invalid:border-destructive"
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      <select
        value=""
        onChange={(e) => {
          const entry = byKey.get(e.target.value);
          if (entry) onChange([...rows, { key: entry.key, quantity: 1, priceText: formatCentsForInput(entry.priceCents) }]);
        }}
        className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
        aria-label="Adicionar serviço ou produto"
      >
        <option value="">+ Adicionar serviço ou produto</option>
        {(["MAIN", "EXTRA", "PRODUCT"] as const).map((kind) => {
          const entries = catalog.filter((c) => c.kind === kind);
          return entries.length === 0 ? null : (
            <optgroup key={kind} label={KIND_LABEL[kind]}>
              {entries.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} · {formatBRL(c.priceCents)}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
