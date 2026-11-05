import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatTimeBR } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import type { DayVisitView } from "@/server/closing";
import { Section } from "@/components/parts";

/** Visitas do dia; tocar abre o detalhe. */
export function DayVisits({ visits }: { visits: DayVisitView[] }) {
  return (
    <Section title="Visitas do dia" count={visits.length}>
      <ul className="divide-y">
        {visits.map((v) => (
          <li key={v.id}>
            <Link href={`/visitas/${v.id}`} className="block py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="tabular-nums">{formatTimeBR(v.performedAt)}</span> · {v.barberName}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatBRL(v.totalCents)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {v.itemsLabel ? (
                  <span className="truncate">{v.itemsLabel}</span>
                ) : (
                  <Badge variant="outline" className="h-4 px-1.5 text-[0.65rem]">
                    a classificar
                  </Badge>
                )}
                <span>· {PAYMENT_METHOD_LABELS[v.paymentMethod]}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
