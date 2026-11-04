"use server";

// Server Actions da importação. Ficam finas: validam a entrada, chamam o serviço e redirecionam.
// TODO(login): verificar a sessão em cada action antes do deploy de produção.
//
// Erros inesperados são registrados só pelo nome/código: mensagens do Prisma podem conter os dados
// da consulta (inclusive a Obs), que não podem ir para o log.

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ImportFileError } from "@/importers/app-barber/parse";
import { parseReviewChoices } from "@/server/import/form";
import {
  confirmImport,
  createImportPreview,
  discardImport,
  ImportStateError,
  MAX_IMPORT_FILE_BYTES,
} from "@/server/import/service";

export type ActionState = { error: string | null };

function logUnexpected(where: string, error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  console.error(`[importar] ${where} falhou: ${name}${code ? ` (${String(code)})` : ""}`);
}

const batchIdOk = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9]{1,64}$/i.test(id);

export async function uploadImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Escolha o arquivo .xlsx exportado do App Barber." };
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return { error: "O arquivo precisa ser .xlsx (Excel), como o App Barber exporta." };
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: "Arquivo maior que 4 MB. Exporte um período menor no App Barber." };
  }

  let batchId: string;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    ({ batchId } = await createImportPreview(getDb(), { fileName: file.name, data, now: new Date() }));
  } catch (error) {
    if (error instanceof ImportFileError || error instanceof ImportStateError) return { error: error.message };
    logUnexpected("prévia", error);
    return { error: "Não foi possível ler o arquivo agora. Tente de novo em instantes." };
  }
  redirect(`/importar/${batchId}`); // fora do try: redirect() funciona lançando uma exceção
}

export async function confirmImportAction(batchId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!batchIdOk(batchId)) return { error: "Importação inválida." };
  try {
    await confirmImport(getDb(), { batchId, now: new Date(), reviewChoices: parseReviewChoices(formData.entries()) });
  } catch (error) {
    if (error instanceof ImportStateError) return { error: error.message };
    logUnexpected("confirmação", error);
    return { error: "Não foi possível concluir a importação. Nada foi gravado; tente de novo." };
  }
  redirect(`/importar/${batchId}`);
}

export async function discardImportAction(batchId: string): Promise<void> {
  if (batchIdOk(batchId)) await discardImport(getDb(), batchId);
  redirect("/importar");
}
