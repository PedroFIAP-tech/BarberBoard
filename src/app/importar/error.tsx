"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ImportarError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Algo deu errado na importação</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Nada foi gravado. Tente de novo; se continuar, exporte o arquivo outra vez no App Barber.</p>
        <Button variant="outline" onClick={reset}>
          Tentar de novo
        </Button>
      </AlertDescription>
    </Alert>
  );
}
