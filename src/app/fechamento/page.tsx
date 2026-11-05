import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CashCheckForm } from "@/components/closing/cash-check-form";
import { DayNav } from "@/components/closing/day-nav";
import { DaySummaryView } from "@/components/closing/day-summary";
import { DayVisits } from "@/components/closing/day-visits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { isValidDayKey, toDayKeyBR, weekdayOfDayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { PRIMARY_NAV } from "@/components/nav/nav-items";
import { plural } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getDayClosingView } from "@/server/closing";

// O link para confirmar só aparece quando a tela /lancar existir (Parte B).
const lancarReady = PRIMARY_NAV.some((i) => i.href === "/lancar" && i.ready);

export const metadata: Metadata = { title: "Fechamento · BarberBoard" };

export default function FechamentoPage({ searchParams }: PageProps<"/fechamento">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando o dia…</p>}>
      <DayClosing searchParams={searchParams} />
    </Suspense>
  );
}

async function DayClosing({ searchParams }: { searchParams: PageProps<"/fechamento">["searchParams"] }) {
  const { dia, lancada, excluida } = await searchParams;
  await connection(); // "hoje" depende do relógio da requisição
  const today = toDayKeyBR(new Date());
  const dayKey = isValidDayKey(dia) ? dia : today;
  const view = await getDayClosingView(getDb(), { dayKey });
  const empty = view.summary.visitCount === 0;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Fechamento do dia</h1>
      <DayNav dayKey={dayKey} today={today} />

      {(lancada === "1" || excluida === "1") && (
        <Alert>
          <AlertDescription>{lancada === "1" ? "Visita lançada." : "Visita excluída."}</AlertDescription>
        </Alert>
      )}

      {view.toConfirm.map((t) => (
        <section key={t.barberName} className="rounded-xl border border-amber-300 bg-card px-4 py-3 text-sm">
          <p className="font-medium">
            {plural(t.count, `comanda do ${t.barberName}`, `comandas do ${t.barberName}`)} a confirmar ({formatBRL(t.totalCents)})
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fora do bruto e do caixa até serem confirmadas.{" "}
            {lancarReady ? (
              <Link href={`/lancar?dia=${dayKey}`} className="underline underline-offset-4">
                Confirmar no Lançar
              </Link>
            ) : (
              "A confirmação chega com a tela Lançar."
            )}
          </p>
        </section>
      ))}

      {empty ? (
        <div className="space-y-3 rounded-xl border bg-card p-5 text-center">
          <p className="font-medium">Sem movimento neste dia.</p>
          <p className="text-sm text-muted-foreground">
            {weekdayOfDayKey(dayKey) === 1
              ? "A barbearia fecha às segundas."
              : "Se teve atendimento, importe as comandas do App Barber."}
          </p>
          {weekdayOfDayKey(dayKey) !== 1 && (
            <Link href="/importar" className={buttonVariants({ variant: "outline", className: "h-11" })}>
              Importar comandas
            </Link>
          )}
        </div>
      ) : (
        <>
          <DaySummaryView summary={view.summary} barberNames={view.barberNames} />
          <DayVisits visits={view.visits} />
        </>
      )}

      <Link href={`/visitas/nova?dia=${dayKey}`} className={buttonVariants({ variant: "outline", className: "h-11 w-full" })}>
        + Lançar visita (fora do App Barber)
      </Link>

      {(!empty || view.closing) && (
        <CashCheckForm
          key={`${dayKey}-${view.closing?.closedAt.toISOString() ?? "novo"}`}
          dayKey={dayKey}
          cashSalesCents={view.summary.cashSalesCents}
          suggestedOpeningCashCents={view.suggestedOpeningCashCents}
          closing={view.closing}
          stale={view.stale}
        />
      )}
    </div>
  );
}
