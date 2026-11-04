import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ImportResult } from "@/components/import/import-result";
import { PendingPreview } from "@/components/import/pending-preview";
import { getDb } from "@/lib/db";
import { getImportView } from "@/server/import/queries";

export const metadata: Metadata = { title: "Prévia da importação · BarberBoard" };

export default function ImportDetailPage({ params }: PageProps<"/importar/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Montando a prévia…</p>}>
      <ImportDetail params={params} />
    </Suspense>
  );
}

async function ImportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection(); // a prévia depende de "agora" (aberta passada x futura) e do banco atual
  const view = await getImportView(getDb(), { batchId: id, now: new Date() });
  if (!view) notFound();
  return view.kind === "PENDING" ? <PendingPreview view={view} /> : <ImportResult view={view} />;
}
