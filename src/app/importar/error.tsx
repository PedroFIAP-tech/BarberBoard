"use client";

import { RouteError } from "@/components/route-error";

export default function ImportarError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      title="Algo deu errado na importação"
      description="Nada foi gravado. Tente de novo; se continuar, exporte o arquivo outra vez no App Barber."
      reset={reset}
    />
  );
}
