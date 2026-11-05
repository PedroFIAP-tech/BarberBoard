"use server";

// Regras de valor. TODO(login): verificar a sessão antes do deploy de produção.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { logActionError } from "@/lib/log";
import { itemsJsonSchema } from "@/schemas/items";
import { brlCentsSchema } from "@/schemas/money";
import { formText, isId } from "@/server/action-helpers";
import { applyRuleToPending, VisitItemsError } from "@/server/appointments";
import { createRule, setRuleActive, updateRule } from "@/server/rules";

export type RuleActionState = { error: string | null };

const ruleSchema = z.object({
  label: z.string().trim().min(1, "Dê um nome para a regra.").max(80, "Nome longo demais."),
  amount: z.string().trim().min(1, "Informe o valor da comanda.").pipe(brlCentsSchema),
  items: itemsJsonSchema,
});

export async function saveRuleAction(ruleId: string | null, _prev: RuleActionState, formData: FormData): Promise<RuleActionState> {
  if (ruleId !== null && !isId(ruleId)) return { error: "Regra inválida." };
  const parsed = ruleSchema.safeParse({
    label: formText(formData, "label"),
    amount: formText(formData, "amount"),
    items: formText(formData, "items"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira a regra." };

  let id: string;
  try {
    const data = { label: parsed.data.label, amountCents: parsed.data.amount, items: parsed.data.items };
    id = ruleId ? await updateRule(getDb(), ruleId, data) : await createRule(getDb(), data);
  } catch (error) {
    if (error instanceof VisitItemsError) return { error: error.message };
    logActionError("regras", "salvar regra", error);
    return { error: "Não foi possível salvar a regra agora. Tente de novo." };
  }
  revalidatePath("/", "layout");
  redirect(`/regras?salva=${id}`);
}

export async function toggleRuleAction(ruleId: string, active: boolean) {
  if (isId(ruleId)) {
    try {
      await setRuleActive(getDb(), ruleId, active);
    } catch (error) {
      logActionError("regras", "ativar/desativar", error);
    }
  }
  revalidatePath("/", "layout");
  redirect("/regras");
}

export async function applyRuleToPendingAction(ruleId: string) {
  let count = 0;
  let error: string | null = null;
  if (isId(ruleId)) {
    try {
      count = await applyRuleToPending(getDb(), ruleId);
    } catch (e) {
      error = e instanceof VisitItemsError ? e.message : "Não foi possível aplicar agora. Tente de novo.";
      if (!(e instanceof VisitItemsError)) logActionError("regras", "aplicar às pendentes", e);
    }
  }
  revalidatePath("/", "layout");
  redirect(error ? `/regras?erro=${encodeURIComponent(error)}` : `/regras?aplicadas=${count}`);
}
