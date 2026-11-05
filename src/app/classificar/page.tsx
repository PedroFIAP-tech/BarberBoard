import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplyAllOptions, OneTapOptions } from "@/components/classify/option-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { PAYMENT_METHOD_LABELS, plural } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getClassifyView } from "@/server/classify";

export const metadata: Metadata = { title: "Classificar · BarberBoard" };

export default function ClassificarPage({ searchParams }: PageProps<"/classificar">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <Classify searchParams={searchParams} />
    </Suspense>
  );
}

async function Classify({ searchParams }: { searchParams: PageProps<"/classificar">["searchParams"] }) {
  const { feito, erro } = await searchParams;
  await connection();
  const view = await getClassifyView(getDb());
  const done = Number(feito);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Classificar visitas</h1>
          <p className="text-sm text-muted-foreground">
            {view.totalPending === 0 ? "Nenhuma visita a classificar." : `${plural(view.totalPending, "visita")} sem itens`}
          </p>
        </div>
        <Link href="/regras" className={buttonVariants({ variant: "outline", className: "h-11 shrink-0" })}>
          Regras de valor
        </Link>
      </header>

      {Number.isInteger(done) && done > 0 && (
        <Alert>
          <AlertDescription>{plural(done, "visita classificada", "visitas classificadas")}.</AlertDescription>
        </Alert>
      )}
      {typeof erro === "string" && erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {view.totalPending === 0 && (
        <div className="rounded-xl border bg-card p-5 text-center">
          <p className="font-medium">Tudo classificado ✓</p>
          <p className="mt-1 text-sm text-muted-foreground">O faturamento já está separado em Serviço, Extra e Produto.</p>
        </div>
      )}
      {view.shown < view.totalPending && (
        <p className="text-xs text-muted-foreground">Mostrando as {view.shown} mais recentes.</p>
      )}

      {view.groups.map((group) => (
        <section key={group.amountCents} className="rounded-xl border bg-card">
          <header className="flex items-baseline justify-between gap-3 px-4 pt-3">
            <h2 className="text-lg font-semibold tabular-nums">{formatBRL(group.amountCents)}</h2>
            <span className="text-sm text-muted-foreground">{plural(group.visits.length, "visita")}</span>
          </header>

          <div className="space-y-2 px-4 pt-2">
            {group.options.length > 0 ? (
              group.visits.length > 1 && <ApplyAllOptions amountCents={group.amountCents} count={group.visits.length} options={group.options} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma regra nem serviço de {formatBRL(group.amountCents)}.{" "}
                <Link href={`/regras/nova?valor=${group.amountCents}`} className="underline underline-offset-4">
                  Criar regra de {formatBRL(group.amountCents)}
                </Link>{" "}
                ou abra a visita para escolher os itens.
              </p>
            )}
          </div>

          <ul className="mt-2 divide-y border-t">
            {group.visits.map((v) => (
              <li key={v.id} className="space-y-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {formatDateTimeBR(v.performedAt)} · {v.barberName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[v.paymentMethod]}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <OneTapOptions appointmentId={v.id} options={group.options} returnTo="/classificar" />
                  <Link href={`/visitas/${v.id}`} className={buttonVariants({ variant: "ghost", className: "h-11" })}>
                    {group.options.length > 0 ? "Outro…" : "Escolher itens…"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
