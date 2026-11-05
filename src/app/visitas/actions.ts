"use server";

// Visitas: corrigir itens, lançar/editar/excluir visita manual.
// TODO(login): verificar a sessão antes do deploy de produção.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { instantFromDayAndTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { logActionError } from "@/lib/log";
import { itemsJsonSchema } from "@/schemas/items";
import { optionalTextSchema } from "@/schemas/money";
import { manualVisitSchema } from "@/schemas/visits";
import { formText, isId } from "@/server/action-helpers";
import { setAppointmentItems, unclassifyVisit, VisitItemsError } from "@/server/appointments";
import { createManualVisit, deleteManualVisit, updateManualVisit, type ManualVisitData } from "@/server/manual-visits";

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

// ─── Visita lançada manualmente ─────────────────────────────────────────────

export type ManualVisitActionState = { error: string | null };

type ParsedVisit = { ok: true; data: ManualVisitData; dayKey: string } | { ok: false; error: string };

function parseManualVisit(formData: FormData): ParsedVisit {
  const parsed = manualVisitSchema.safeParse({
    date: formText(formData, "date"),
    time: formText(formData, "time"),
    barberId: formText(formData, "barberId"),
    paymentMethod: formText(formData, "paymentMethod"),
    items: formText(formData, "items"),
    notes: formText(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const performedAt = instantFromDayAndTime(parsed.data.date, parsed.data.time);
  if (!performedAt) return { ok: false, error: "Data ou hora inválida." };
  const { barberId, paymentMethod, items, notes } = parsed.data;
  return { ok: true, data: { performedAt, barberId, paymentMethod, items, notes }, dayKey: parsed.data.date };
}

export async function createManualVisitAction(_prev: ManualVisitActionState, formData: FormData): Promise<ManualVisitActionState> {
  const parsed = parseManualVisit(formData);
  if (!parsed.ok) return { error: parsed.error };
  try {
    await createManualVisit(getDb(), parsed.data);
  } catch (error) {
    if (error instanceof VisitItemsError) return { error: error.message };
    logActionError("visitas", "lançar visita", error);
    return { error: "Não foi possível lançar agora. Tente de novo." };
  }
  revalidatePath("/", "layout");
  redirect(`/fechamento?dia=${parsed.dayKey}&lancada=1`);
}

export async function updateManualVisitAction(id: string, _prev: ManualVisitActionState, formData: FormData): Promise<ManualVisitActionState> {
  if (!isId(id)) return { error: "Visita inválida." };
  const parsed = parseManualVisit(formData);
  if (!parsed.ok) return { error: parsed.error };
  try {
    await updateManualVisit(getDb(), id, parsed.data);
  } catch (error) {
    if (error instanceof VisitItemsError) return { error: error.message };
    logActionError("visitas", "editar visita", error);
    return { error: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath("/", "layout");
  redirect(`/visitas/${id}?salvo=1`);
}

export async function deleteManualVisitAction(id: string, dayKey: string) {
  let error: string | null = null;
  if (isId(id)) {
    try {
      await deleteManualVisit(getDb(), id);
    } catch (e) {
      error = e instanceof VisitItemsError ? e.message : "Não foi possível excluir agora.";
      if (!(e instanceof VisitItemsError)) logActionError("visitas", "excluir visita", e);
    }
  }
  revalidatePath("/", "layout");
  redirect(error ? `/visitas/${id}?erro=${encodeURIComponent(error)}` : `/fechamento?dia=${dayKey}&excluida=1`);
}
