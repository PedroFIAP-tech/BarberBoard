import Link from "next/link";
import { discardImportAction } from "@/app/importar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS, plural } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import type { PendingImportView, Period } from "@/server/import/queries";
import { ConfirmForm } from "./confirm-form";
import { Row, RowList, Section, Stat } from "@/components/parts";

export function PeriodText({ period }: { period: Period }) {
  if (!period.from || !period.to) return null;
  const from = formatDateBR(period.from);
  const to = formatDateBR(period.to);
  return <>{from === to ? from : `${from} a ${to}`}</>;
}

export function PendingPreview({ view }: { view: PendingImportView }) {
  const { summary } = view;

  return (
    <div className="space-y-4">
      <header>
        <Link href="/importar" className="text-sm text-muted-foreground">
          ‹ Importações
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Prévia da importação</h1>
        <p className="truncate text-sm text-muted-foreground">
          {view.batch.fileName} · <PeriodText period={view.period} />
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Visitas novas" value={summary.total.count} hint={formatBRL(summary.total.totalCents)} />
        <Stat
          label="A classificar"
          value={summary.unclassified.count}
          hint={summary.unclassified.count > 0 ? formatBRL(summary.unclassified.totalCents) : "nenhuma"}
        />
      </div>

      {summary.total.count > 0 && (
        <Section title="Vão entrar" count={summary.total.count}>
          <p className="mb-2 text-xs text-muted-foreground">
            {plural(summary.classified.count, "visita")} com itens pela regra de valor (
            {formatBRL(summary.classified.totalCents)}) · {summary.unclassified.count} a classificar depois (
            {formatBRL(summary.unclassified.totalCents)})
          </p>
          <RowList>
            {view.toImport.map((v) => (
              <Row
                key={v.comanda}
                title={`${formatDateTimeBR(v.performedAt)} · ${v.barberName}`}
                value={formatBRL(v.valueCents)}
                detail={
                  <>
                    {PAYMENT_METHOD_LABELS[v.paymentMethod]} ·{" "}
                    {v.ruleLabel ?? (
                      <Badge variant="outline" className="h-4 px-1.5 text-[0.65rem]">
                        a classificar
                      </Badge>
                    )}
                  </>
                }
              />
            ))}
          </RowList>
        </Section>
      )}

      {view.openPast.length > 0 && (
        <Section title="Pendentes no App Barber" count={view.openPast.length} defaultOpen tone="warning">
          <p className="text-sm font-medium">
            {view.openPastByBarber.map((b) => `${b.name}: ${b.count}`).join(" · ")}
          </p>
          <p className="mt-1 mb-2 text-xs text-muted-foreground">
            Comandas abertas com data que já passou. Finalize estas comandas no App Barber e importe de novo.
          </p>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Ver comandas</summary>
            <RowList>
              {view.openPast.map((r) => (
                <Row
                  key={r.comanda}
                  title={`${formatDateTimeBR(r.scheduledAt)} · ${r.professionals}`}
                  value={formatBRL(r.valueCents)}
                />
              ))}
            </RowList>
          </details>
        </Section>
      )}

      {view.errors.length > 0 && (
        <Section title="Com erro (não entram)" count={view.errors.length} defaultOpen tone="danger">
          <RowList>
            {view.errors.map((e) => (
              <Row
                key={`${e.rowNumber}-${e.field}`}
                title={`Linha ${e.rowNumber}${e.comanda ? ` · comanda ${e.comanda}` : ""}`}
                detail={`${e.field}: ${e.message}`}
              />
            ))}
          </RowList>
        </Section>
      )}

      {view.warnings.length > 0 && (
        <Section title="Avisos" count={view.warnings.length} tone="warning">
          <RowList>
            {view.warnings.map((w) => (
              <Row key={w.comanda} title={`Comanda ${w.comanda}`} detail={w.message} />
            ))}
          </RowList>
        </Section>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        Fora da importação: {plural(view.duplicateCount, "já importada", "já importadas")} ·{" "}
        {plural(view.openFutureCount, "agendada", "agendadas")} · {plural(view.cancelledCount, "cancelada", "canceladas")}
      </p>

      <ConfirmForm
        batchId={view.batch.id}
        baseCount={summary.total.count}
        review={view.review}
        barbers={view.barbers}
      />

      <form action={discardImportAction.bind(null, view.batch.id)} className="pb-2 text-center">
        <Button type="submit" variant="ghost" className="text-muted-foreground">
          Descartar prévia
        </Button>
      </form>
    </div>
  );
}
