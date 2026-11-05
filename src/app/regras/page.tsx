import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { applyRuleToPendingAction, toggleRuleAction } from "@/app/regras/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { plural } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listRules } from "@/server/rules";

export const metadata: Metadata = { title: "Regras de valor · BarberBoard" };

export default function RegrasPage({ searchParams }: PageProps<"/regras">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <Rules searchParams={searchParams} />
    </Suspense>
  );
}

async function Rules({ searchParams }: { searchParams: PageProps<"/regras">["searchParams"] }) {
  const { salva, aplicadas, erro } = await searchParams;
  await connection();
  const rules = await listRules(getDb());
  const applied = Number(aplicadas);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link href="/classificar" className="text-sm text-muted-foreground">
          ‹ Classificar
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">Regras de valor</h1>
          <Link href="/regras/nova" className={buttonVariants({ className: "h-11 shrink-0" })}>
            Nova regra
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Comanda de R$ X no App Barber = estes itens. Valor com uma regra ativa entra classificado na importação; sem
          regra (ou com mais de uma), fica a classificar.
        </p>
      </header>

      {typeof salva === "string" && (
        <Alert>
          <AlertDescription>Regra salva. Visitas já classificadas não mudam.</AlertDescription>
        </Alert>
      )}
      {Number.isInteger(applied) && aplicadas !== undefined && (
        <Alert>
          <AlertDescription>{plural(applied, "visita classificada", "visitas classificadas")} pela regra.</AlertDescription>
        </Alert>
      )}
      {typeof erro === "string" && erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className={cn("space-y-2 rounded-xl border bg-card p-4", !r.active && "opacity-60", salva === r.id && "ring-2 ring-ring/40")}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold tabular-nums">{formatBRL(r.amountCents)}</span>
              <span className="min-w-0 truncate text-sm">{r.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{r.itemsText}</p>
            <div className="flex flex-wrap gap-1.5">
              {!r.active && <Badge variant="outline">desativada</Badge>}
              {r.active && r.sameAmountActiveCount > 0 && (
                <Badge variant="destructive">outra regra ativa de {formatBRL(r.amountCents)}: comandas desse valor ficam a classificar</Badge>
              )}
            </div>
            {r.active && r.pendingCount > 0 && (
              <form action={applyRuleToPendingAction.bind(null, r.id)}>
                <Button type="submit" variant={salva === r.id ? "default" : "secondary"} className="h-11 w-full">
                  Aplicar às {plural(r.pendingCount, "visita pendente", "visitas pendentes")} de {formatBRL(r.amountCents)}
                </Button>
              </form>
            )}
            <div className="flex gap-2">
              <Link href={`/regras/${r.id}`} className={buttonVariants({ variant: "outline", className: "h-11 flex-1" })}>
                Editar
              </Link>
              <form action={toggleRuleAction.bind(null, r.id, !r.active)} className="flex-1">
                <Button type="submit" variant="ghost" className="h-11 w-full">
                  {r.active ? "Desativar" : "Reativar"}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
