"use server";

// Server Actions do fechamento. TODO(login): verificar a sessão antes do deploy de produção.

import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidDayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { logActionError } from "@/lib/log";
import { brlCentsSchema, optionalTextSchema } from "@/schemas/money";
import { saveCashClosing } from "@/server/closing";

export type CashActionState = { error: string | null };

const cashSchema = z.object({
  opening: brlCentsSchema,
  counted: z.string().trim().min(1, "Informe quanto foi contado na gaveta.").pipe(brlCentsSchema),
  notes: optionalTextSchema(500),
});

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function saveCashClosingAction(dayKey: string, _prev: CashActionState, formData: FormData): Promise<CashActionState> {
  if (!isValidDayKey(dayKey)) return { error: "Dia inválido." };

  const parsed = cashSchema.safeParse({
    opening: text(formData, "opening"),
    counted: text(formData, "counted"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os valores." };

  try {
    await saveCashClosing(getDb(), {
      dayKey,
      openingCashCents: parsed.data.opening,
      countedCashCents: parsed.data.counted,
      notes: parsed.data.notes,
      now: new Date(),
    });
  } catch (error) {
    logActionError("fechamento", "conferência de caixa", error);
    return { error: "Não foi possível salvar a conferência agora. Tente de novo." };
  }
  redirect(`/fechamento?dia=${dayKey}`);
}
