"use client";

import { useActionState } from "react";
import { uploadImportAction, type ActionState } from "@/app/importar/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initialState: ActionState = { error: null };

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadImportAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="sr-only">Arquivo .xlsx do App Barber</span>
        <input
          type="file"
          name="file"
          required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full rounded-lg border bg-background text-sm file:mr-3 file:h-11 file:border-0 file:bg-secondary file:px-4 file:text-sm file:font-medium"
        />
      </label>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full text-base">
        {pending ? "Lendo o arquivo…" : "Ver prévia"}
      </Button>
    </form>
  );
}
