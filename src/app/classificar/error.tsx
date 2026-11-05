"use client";

import { RouteError } from "@/components/route-error";

export default function ClassificarError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Não foi possível abrir a classificação" description="Verifique a conexão e tente de novo." reset={reset} />;
}
