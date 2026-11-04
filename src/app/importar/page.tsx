import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportHistory } from "@/components/import/import-history";
import { UploadForm } from "@/components/import/upload-form";

export const metadata: Metadata = { title: "Importar · BarberBoard" };

export default function ImportarPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Importar do App Barber</h1>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
            <li>No App Barber: Comandas → Histórico de Comandas</li>
            <li>Filtro &quot;Clientes&quot;, escolha o período e toque em Excel</li>
            <li>Envie o arquivo aqui. Nada é gravado antes de você confirmar a prévia.</li>
          </ol>
        </div>
        <UploadForm />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Importações recentes</h2>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
          <ImportHistory />
        </Suspense>
      </section>
    </div>
  );
}
