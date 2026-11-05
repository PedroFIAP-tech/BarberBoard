"use server";

// Corrigir os itens de uma visita. TODO(login): verificar a sessão antes do deploy de produção.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { logActionError } from "@/lib/log";
import { itemsJsonSchema } from "@/schemas/items";
import { optionalTextSchema } from "@/schemas/money";
import { formText, isId } from "@/server/action-helpers";
import { setAppointmentItems, unclassifyVisit, VisitItemsError } from "@/server/appointments";

export type ItemsActionState = { error: string | null };

export async function saveVisitItemsAction(appointmentId: string, _prev: ItemsActionState, formData: FormData): Promise<ItemsActionState> {
  if (!isId(appointmentId)) return { error: "Visita inválida." };
  const items = itemsJsonSchema.safeParse(formText(formData, "items"));
  if (!items.success) return { error: items.error.issues[0]?.message ?? "Confira os itens." };
  const saveAsRule = formText(formData, "saveAsRule") === "on";
  const label = optionalTextSchema(80).safeParse(formText(formData, "ruleLabel"));
  if (saveAsRule && (!label.success || !label.data)) return { error: "Dê um nome para a regra." };

  try {
    await setAppointmentItems(getDb(), {
      appointmentId,
      items: items.data,
      priceRuleId: null,
      saveAsRuleLabel: saveAsRule && label.success ? label.data : null,
    });
  } catch (error) {
    if (error instanceof VisitItemsError) return { error: error.message };
    logActionError("visitas", "salvar itens", error);
    return { error: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath("/", "layout");
  redirect(`/visitas/${appointmentId}?salvo=1`);
}

export async function unclassifyVisitAction(appointmentId: string) {
  if (isId(appointmentId)) {
    try {
      await unclassifyVisit(getDb(), appointmentId);
    } catch (error) {
      logActionError("visitas", "voltar para a classificar", error);
    }
  }
  revalidatePath("/", "layout");
  redirect(`/visitas/${appointmentId}`);
}
