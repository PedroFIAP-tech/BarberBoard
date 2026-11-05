"use client";

import { RouteError } from "@/components/route-error";

export default function RegrasError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Não foi possível abrir as regras" description="Verifique a conexão e tente de novo." reset={reset} />;
}
