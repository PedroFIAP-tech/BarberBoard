import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ManualVisitForm } from "@/components/items/manual-visit-form";
import { formatTimeBR, isValidDayKey, toDayKeyBR } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { listFees } from "@/server/catalog";
import { getEditorCatalog } from "@/server/classify";

export const metadata: Metadata = { title: "Lançar visita · BarberBoard" };

export default function NovaVisitaPage({ searchParams }: PageProps<"/visitas/nova">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <NewVisit searchParams={searchParams} />
    </Suspense>
  );
}

async function NewVisit({ searchParams }: { searchParams: PageProps<"/visitas/nova">["searchParams"] }) {
  const { dia } = await searchParams;
  await connection();
  const now = new Date();
  const today = toDayKeyBR(now);
  const date = isValidDayKey(dia) ? dia : today;
  const db = getDb();
  const [catalog, barbers, fees] = await Promise.all([
    getEditorCatalog(db),
    db.barber.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listFees(db),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <Link href={`/fechamento?dia=${date}`} className="text-sm text-muted-foreground">
          ‹ Fechamento do dia
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Lançar visita</h1>
        <p className="text-sm text-muted-foreground">
          Para atendimento que não passou pelo App Barber. Se a comanda existe lá, prefira importar: assim ela não entra duas vezes.
        </p>
      </header>
      {barbers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum barbeiro ativo cadastrado.</p>
      ) : (
        <ManualVisitForm
          visitId={null}
          catalog={catalog}
          barbers={barbers}
          feeBpsByMethod={Object.fromEntries(fees.map((f) => [f.method, f.feeBps])) as Record<(typeof fees)[number]["method"], number>}
          initial={{
            date,
            time: date === today ? formatTimeBR(now) : "12:00",
            barberId: barbers[0].id,
            paymentMethod: "PIX",
            rows: [],
            notes: "",
          }}
        />
      )}
    </div>
  );
}
