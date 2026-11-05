import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  createCategoryAction,
  deleteExpenseAction,
  saveExpenseAction,
  toggleCategoryAction,
} from "@/app/despesas/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDayKeyBR, formatMonthLongBR, isValidMonthKey, monthKeyOf, shiftMonthKey, toDayKeyBR } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { formatBRL, formatCentsForInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getMonthExpenses, type CategoryRow, type ExpenseRow } from "@/server/expenses";

export const metadata: Metadata = { title: "Despesas · BarberBoard" };

const inputClass = "h-11 w-full rounded-lg border bg-background px-3 text-base";
const arrow = cn(buttonVariants({ variant: "outline" }), "size-11 shrink-0 p-0");

export default function DespesasPage({ searchParams }: PageProps<"/despesas">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando as despesas…</p>}>
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ExpenseFields({
  expense,
  defaultDay,
  categories,
  barbers,
}: {
  expense?: ExpenseRow;
  defaultDay: string;
  categories: CategoryRow[];
  barbers: { id: string; name: string }[];
}) {
  // Categorias desativadas só aparecem para a despesa que já usa uma delas.
  const options = categories.filter((c) => c.active || c.id === expense?.categoryId);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Data">
          <input type="date" name="date" required defaultValue={expense?.dayKey ?? defaultDay} className={inputClass} />
        </Field>
        <Field label="Valor (R$)">
          <input
            name="amount"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            defaultValue={expense ? formatCentsForInput(expense.amountCents) : ""}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Categoria">
        <select name="categoryId" required defaultValue={expense?.categoryId ?? ""} className={inputClass}>
          <option value="" disabled>
            Escolha…
          </option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Descrição (opcional)">
        <input name="description" maxLength={200} autoComplete="off" defaultValue={expense?.description ?? ""} className={inputClass} />
      </Field>
      <Field label="Barbeiro (opcional, ex.: comissão)">
        <select name="barberId" defaultValue={expense?.barberId ?? ""} className={inputClass}>
          <option value="">—</option>
          {barbers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

async function Expenses({ searchParams }: { searchParams: PageProps<"/despesas">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const today = toDayKeyBR(new Date());
  const currentMonth = monthKeyOf(today);
  const month = isValidMonthKey(sp.mes) ? sp.mes : currentMonth;
  const data = await getMonthExpenses(getDb(), month);
  // Lançar no mês que está na tela: hoje, se for o mês atual; senão o dia 1.
  const defaultDay = month === currentMonth ? today : `${month}-01`;
  const text = (v?: string | string[]) => (typeof v === "string" && v ? v : null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/despesas?mes=${shiftMonthKey(month, -1)}`} aria-label="Mês anterior" className={arrow}>
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold first-letter:uppercase">Despesas · {formatMonthLongBR(month)}</h1>
        {month < currentMonth ? (
          <Link href={`/despesas?mes=${shiftMonthKey(month, 1)}`} aria-label="Próximo mês" className={arrow}>
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span aria-hidden className={cn(arrow, "pointer-events-none opacity-30")}>
            <ChevronRight />
          </span>
        )}
      </div>

      {text(sp.ok) && (
        <Alert>
          <AlertDescription>{text(sp.ok)}</AlertDescription>
        </Alert>
      )}
      {text(sp.erro) && (
        <Alert variant="destructive">
          <AlertDescription>{text(sp.erro)}</AlertDescription>
        </Alert>
      )}

      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total do mês</span>
          <span className="text-xl font-semibold tabular-nums">{formatBRL(data.totalCents)}</span>
        </div>
        {data.byCategory.length > 0 && (
          <ul className="mt-2 divide-y">
            {data.byCategory.map((c) => (
              <li key={c.categoryId} className="flex items-baseline justify-between py-1.5 text-sm">
                <span>{c.name}</span>
                <span className="tabular-nums">{formatBRL(c.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-xl border bg-card" open={data.expenses.length === 0}>
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">+ Lançar despesa</summary>
        <form action={saveExpenseAction} className="space-y-3 border-t px-4 py-3">
          <input type="hidden" name="mes" value={month} />
          <ExpenseFields defaultDay={defaultDay} categories={data.categories} barbers={data.barbers} />
          <Button type="submit" className="h-11 w-full">
            Lançar
          </Button>
        </form>
      </details>

      {data.expenses.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">Nenhuma despesa neste mês.</p>
      ) : (
        <ul className="space-y-2">
          {data.expenses.map((e) => (
            <li key={e.id}>
              <details className="rounded-xl border bg-card">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{e.description ?? e.categoryName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDayKeyBR(e.dayKey)} · {e.categoryName}
                      {e.barberName && ` · ${e.barberName}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatBRL(e.amountCents)}</span>
                </summary>
                <div className="space-y-3 border-t px-4 py-3">
                  <form action={saveExpenseAction} className="space-y-3">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="mes" value={month} />
                    <ExpenseFields expense={e} defaultDay={defaultDay} categories={data.categories} barbers={data.barbers} />
                    <Button type="submit" className="h-11 w-full">
                      Salvar
                    </Button>
                  </form>
                  <details>
                    <summary className="flex h-11 cursor-pointer list-none items-center justify-center text-sm text-destructive [&::-webkit-details-marker]:hidden">
                      Excluir…
                    </summary>
                    <form action={deleteExpenseAction.bind(null, e.id, month)}>
                      <Button type="submit" variant="destructive" className="h-11 w-full">
                        Confirmar exclusão de {formatBRL(e.amountCents)}
                      </Button>
                    </form>
                  </details>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium">Categorias de despesa</summary>
        <div className="space-y-3 border-t px-4 py-3">
          <ul className="divide-y">
            {data.categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className={cn("text-sm", !c.active && "text-muted-foreground")}>
                  {c.name} {!c.active && <Badge variant="outline">desativada</Badge>}
                </span>
                <form action={toggleCategoryAction.bind(null, c.id, !c.active, month)}>
                  <Button type="submit" variant="ghost" className="h-10">
                    {c.active ? "Desativar" : "Reativar"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          <form action={createCategoryAction} className="flex gap-2">
            <input type="hidden" name="mes" value={month} />
            <input name="name" required maxLength={40} placeholder="Nova categoria (ex.: Água)" aria-label="Nova categoria" className={inputClass} />
            <Button type="submit" variant="outline" className="h-11">
              Criar
            </Button>
          </form>
        </div>
      </details>
    </div>
  );
}
