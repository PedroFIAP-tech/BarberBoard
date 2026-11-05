"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Conteúdo padrão dos error.tsx das rotas: mensagem amigável + tentar de novo. */
export function RouteError({ title, description, reset }: { title: string; description: string; reset: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{description}</p>
        <Button variant="outline" onClick={reset} className="h-11">
          Tentar de novo
        </Button>
      </AlertDescription>
    </Alert>
  );
}
