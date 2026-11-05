"use client";

import { RouteError } from "@/components/route-error";

export default function VisitasError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Não foi possível abrir a visita" description="Verifique a conexão e tente de novo." reset={reset} />;
}
