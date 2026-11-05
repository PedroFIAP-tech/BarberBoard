import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CashCheckForm } from "@/components/closing/cash-check-form";
import { DayNav } from "@/components/closing/day-nav";
import { DaySummaryView } from "@/components/closing/day-summary";
import { DayVisits } from "@/components/closing/day-visits";
import { buttonVariants } from "@/components/ui/button";
import { isValidDayKey, toDayKeyBR, weekdayOfDayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getDayClosingView } from "@/server/closing";

export const metadata: Metadata = { title: "Fechamento · BarberBoard" };

export default function FechamentoPage({ searchParams }: PageProps<"/fechamento">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando o dia…</p>}>
      <DayClosing searchParams={searchParams} />
    </Suspense>
  );
}

async function DayClosing({ searchParams }: { searchParams: PageProps<"/fechamento">["searchParams"] }) {
  const { dia } = await searchParams;
  await connection(); // "hoje" depende do relógio da requisição
  const today = toDayKeyBR(new Date());
  const dayKey = isValidDayKey(dia) ? dia : today;
  const view = await getDayClosingView(getDb(), { dayKey });
  const empty = view.summary.visitCount === 0;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Fechamento do dia</h1>
      <DayNav dayKey={dayKey} today={today} />

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
