"use server";

// Classificar com um toque: uma visita ou todas as de um valor.
// TODO(login): verificar a sessão antes do deploy de produção.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { logActionError } from "@/lib/log";
import { formText, isId, parseOption, safeReturnPath } from "@/server/action-helpers";
import {
  applyRuleToPending,
  applyRuleToVisit,
  applyServiceToVisit,
  classifyPendingByAmount,
  VisitItemsError,
} from "@/server/appointments";

function fail(error: unknown, returnTo: string): never {
  const message = error instanceof VisitItemsError ? error.message : "Não foi possível classificar agora. Tente de novo.";
  if (!(error instanceof VisitItemsError)) logActionError("classificar", "classificação", error);
  redirect(`${returnTo.split("?")[0]}?erro=${encodeURIComponent(message)}`);
}

/** Uma visita: aplica a regra ou o serviço escolhido. */
export async function classifyOneAction(formData: FormData) {
  const appointmentId = formText(formData, "appointmentId");
  const option = parseOption(formText(formData, "option"));
  const returnTo = safeReturnPath(formText(formData, "returnTo"), "/classificar");
  if (!isId(appointmentId) || !option) fail(new VisitItemsError("Escolha inválida."), returnTo);

  try {
    const db = getDb();
    if (option.kind === "RULE") await applyRuleToVisit(db, { appointmentId, ruleId: option.id });
    else await applyServiceToVisit(db, { appointmentId, serviceId: option.id });
  } catch (error) {
    fail(error, returnTo);
  }
  revalidatePath("/", "layout");
  redirect(returnTo);
}

/** Todas as visitas a classificar de um valor, com a mesma opção. */
export async function classifyAllAction(formData: FormData) {
  const amountCents = Number(formText(formData, "amountCents"));
  const option = parseOption(formText(formData, "option"));
  if (!Number.isInteger(amountCents) || amountCents < 0 || !option) fail(new VisitItemsError("Escolha inválida."), "/classificar");

  let count = 0;
  try {
    const db = getDb();
    count =
      option.kind === "RULE"
        ? await applyRuleToPending(db, option.id)
        : await classifyPendingByAmount(db, {
            amountCents,
            items: [{ serviceId: option.id, productId: null, quantity: 1, unitPriceCents: amountCents }],
            priceRuleId: null,
          });
  } catch (error) {
    fail(error, "/classificar");
  }
  revalidatePath("/", "layout");
  redirect(`/classificar?feito=${count}`);
}
