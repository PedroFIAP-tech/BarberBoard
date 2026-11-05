import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { unclassifyVisitAction } from "@/app/visitas/actions";
import { OneTapOptions } from "@/components/classify/option-buttons";
import { rowsFromItems } from "@/components/items/editor-rows";
import { VisitItemsForm } from "@/components/items/visit-items-form";
import { Row, RowList } from "@/components/parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeBR, toDayKeyBR } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { formatBps, formatBRL } from "@/lib/money";
import { getEditorCatalog, getOptionsForAmount, hasActiveRuleFor } from "@/server/classify";
import { getVisitDetail } from "@/server/visits";

export const metadata: Metadata = { title: "Visita · BarberBoard" };

const KIND_LABEL = { MAIN: "Serviço", EXTRA: "Extra", PRODUCT: "Produto" } as const;

export default function VisitPage({ params, searchParams }: PageProps<"/visitas/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando a visita…</p>}>
      <VisitDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function VisitDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: PageProps<"/visitas/[id]">["searchParams"];
}) {
  const [{ id }, { salvo, erro }] = await Promise.all([params, searchParams]);
  await connection();
  const db = getDb();
  const visit = await getVisitDetail(db, id);
  if (!visit) notFound();

  const pending = visit.classification === "PENDING";
  const [catalog, options, ruleExists] = await Promise.all([
    getEditorCatalog(db, {
      serviceIds: visit.items.flatMap((i) => (i.serviceId ? [i.serviceId] : [])),
      productIds: visit.items.flatMap((i) => (i.productId ? [i.productId] : [])),
    }),
    getOptionsForAmount(db, visit.totalCents),
    hasActiveRuleFor(db, visit.totalCents),
  ]);
  const returnTo = `/visitas/${visit.id}`;

  const editor = (
    <VisitItemsForm
      appointmentId={visit.id}
      totalCents={visit.totalCents}
      catalog={catalog}
      initialRows={rowsFromItems(visit.items)}
      canSaveAsRule={!ruleExists}
    />
  );

  return (
    <div className="space-y-4">
      <header>
        <Link href={`/fechamento?dia=${toDayKeyBR(visit.performedAt)}`} className="text-sm text-muted-foreground">
          ‹ Fechamento do dia
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(visit.totalCents)}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTimeBR(visit.performedAt, { withYear: true })} · {visit.barberName}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pending ? <Badge variant="outline">a classificar</Badge> : visit.ruleLabel && <Badge variant="secondary">{visit.ruleLabel}</Badge>}
          <Badge variant="outline">
            {visit.source === "APP_BARBER" ? `App Barber · comanda ${visit.externalId}` : "Lançada manualmente"}
          </Badge>
        </div>
      </header>

      {salvo === "1" && (
        <Alert>
          <AlertDescription>Itens salvos.</AlertDescription>
        </Alert>
      )}
      {typeof erro === "string" && erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <section className="rounded-xl border bg-card px-4 py-2">
        <RowList>
          <Row title="Pagamento" value={PAYMENT_METHOD_LABELS[visit.paymentMethod]} />
          <Row title={`Taxa da maquininha (${formatBps(visit.feeBps)})`} value={formatBRL(visit.feeCents)} />
          <Row title="Líquido" value={formatBRL(visit.netCents)} />
        </RowList>
      </section>

      {pending ? (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">Classificar esta visita</h2>
          <p className="text-sm text-muted-foreground">
            Veio do App Barber só com o total. Escolha o que foi feito para separar em Serviço, Extra e Produto.
          </p>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <OneTapOptions appointmentId={visit.id} options={options} returnTo={returnTo} />
            </div>
          )}
          <details open={options.length === 0}>
            <summary className="cursor-pointer py-2 text-sm text-muted-foreground">Escolher os itens…</summary>
            <div className="pt-2">{editor}</div>
          </details>
        </section>
      ) : (
        <section className="rounded-xl border bg-card px-4 py-2">
          <h2 className="pt-1 text-sm font-medium">Itens</h2>
          <RowList>
            {visit.items.map((item) => (
              <Row
                key={item.id}
                title={item.quantity > 1 ? `${item.quantity}× ${item.name}` : item.name}
                value={formatBRL(item.totalCents)}
                detail={`${KIND_LABEL[item.kind]}${item.quantity > 1 ? ` · ${formatBRL(item.unitPriceCents)} cada` : ""}`}
              />
            ))}
          </RowList>
          <details className="border-t py-2">
            <summary className="cursor-pointer py-2 text-sm font-medium">Corrigir itens</summary>
            <div className="space-y-3 pt-2">
              {options.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <OneTapOptions appointmentId={visit.id} options={options} returnTo={returnTo} />
                </div>
              )}
              {editor}
              {visit.source === "APP_BARBER" && (
                <form action={unclassifyVisitAction.bind(null, visit.id)}>
                  <Button type="submit" variant="ghost" className="h-11 w-full text-muted-foreground">
                    Voltar para &quot;a classificar&quot;
                  </Button>
                </form>
              )}
            </div>
          </details>
        </section>
      )}

      {visit.notes && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">Observação</h2>
          <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{visit.notes}</p>
        </section>
      )}
    </div>
  );
}
