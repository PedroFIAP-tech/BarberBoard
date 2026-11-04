import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/dates";
import { plural } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import type { CompletedImportView } from "@/server/import/queries";
import { PeriodText } from "./pending-preview";
import { Row, RowList, Section } from "./parts";

export function ImportResult({ view }: { view: CompletedImportView }) {
  const { counts, created } = view;

  return (
    <div className="space-y-4">
      <header>
        <Link href="/importar" className="text-sm text-muted-foreground">
          ‹ Importações
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Importação concluída</h1>
        <p className="truncate text-sm text-muted-foreground">
          {view.batch.fileName} · <PeriodText period={view.period} /> · em{" "}
          {formatDateTimeBR(view.batch.updatedAt, { withYear: true })}
        </p>
      </header>

      <Alert>
        <AlertTitle>
          {plural(created.count, "visita importada", "visitas importadas")} · {formatBRL(created.totalCents)}
        </AlertTitle>
        <AlertDescription>
          {created.unclassifiedCount > 0
            ? `${plural(created.unclassifiedCount, "visita ficou", "visitas ficaram")} a classificar.`
            : "Todas entraram com itens pela regra de valor."}
        </AlertDescription>
      </Alert>

      <Section title="Resumo do arquivo" defaultOpen>
        <RowList>
          <Row title="Linhas no arquivo" value={counts.rowCount} />
          <Row title="Importadas" value={counts.importedCount} />
          <Row title="Já importadas antes" value={counts.duplicateCount} />
          <Row title="Pendentes no App Barber" value={counts.openPastCount} />
          <Row title="Agendadas" value={counts.openFutureCount} />
          <Row title="Canceladas" value={counts.cancelledCount} />
          <Row title="Ficaram para revisão" value={counts.reviewCount} />
          <Row title="Com erro" value={counts.errorCount} />
        </RowList>
      </Section>

      {view.errors.length > 0 && (
        <Section title="Com erro (não entraram)" count={view.errors.length} tone="danger">
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

      <div className="grid gap-2">
        <span
          aria-disabled
          className={buttonVariants({ variant: "secondary", className: "h-11 w-full cursor-not-allowed opacity-60" })}
        >
          Classificar visitas (em breve)
        </span>
        <Link href="/importar" className={buttonVariants({ variant: "outline", className: "h-11 w-full" })}>
          Importar outro arquivo
        </Link>
      </div>
    </div>
  );
}
