import type { DaySummary } from "@/domain/closing";
import { PAYMENT_METHOD_LABELS, plural } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { Row, RowList, Section, Stat } from "@/components/parts";

/** Números do dia: totais, quebra Serviço/Extra/Produto, formas de pagamento e barbeiros. */
export function DaySummaryView({ summary, barberNames }: { summary: DaySummary; barberNames: Record<string, string> }) {
  const { groups, tickets } = summary;
  const groupRows = [
    { label: "Serviço", cents: groups.serviceCents, ticket: tickets.serviceCents },
    { label: "Extra", cents: groups.extraCents, ticket: tickets.extraCents },
    { label: "Produto", cents: groups.productCents, ticket: tickets.productCents },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Bruto" value={formatBRL(groups.grossCents)} />
        <Stat
          label="Líquido"
          value={formatBRL(summary.netCents)}
          hint={summary.feeCents > 0 ? `taxas ${formatBRL(summary.feeCents)}` : "sem taxas"}
        />
        <Stat
          label="Visitas"
          value={summary.visitCount}
          hint={summary.pendingCount > 0 ? `${summary.pendingCount} a classificar` : undefined}
        />
        <Stat label="Ticket médio" value={formatBRL(tickets.generalCents)} />
      </div>

      <Section title="Faturamento por grupo" defaultOpen>
        <RowList>
          {groupRows.map((g) => (
            <Row key={g.label} title={g.label} value={formatBRL(g.cents)} detail={`ticket ${formatBRL(g.ticket)}`} />
          ))}
          {groups.unclassifiedCents > 0 && (
            <Row
              title={<span className="text-amber-700 dark:text-amber-400">A classificar</span>}
              value={formatBRL(groups.unclassifiedCents)}
              detail={`${plural(summary.pendingCount, "visita")} sem itens: classifique para separar em Serviço/Extra/Produto`}
            />
          )}
        </RowList>
      </Section>

      <Section title="Por forma de pagamento" defaultOpen>
        <RowList>
          {summary.byPayment
            .filter((p) => p.count > 0)
            .map((p) => (
              <Row
                key={p.method}
                title={`${PAYMENT_METHOD_LABELS[p.method]} · ${p.count}`}
                value={formatBRL(p.grossCents)}
                detail={p.feeCents > 0 ? `taxa ${formatBRL(p.feeCents)} → líquido ${formatBRL(p.netCents)}` : undefined}
              />
            ))}
        </RowList>
      </Section>

      {summary.byBarber.length > 0 && (
        <Section title="Por barbeiro">
          <RowList>
            {summary.byBarber.map((b) => (
              <Row
                key={b.barberId}
                title={`${barberNames[b.barberId] ?? "—"} · ${plural(b.count, "visita")}`}
                value={formatBRL(b.grossCents)}
              />
            ))}
          </RowList>
        </Section>
      )}
    </div>
  );
}
