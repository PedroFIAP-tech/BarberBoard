"use server";

// Despesas. TODO(login): verificar a sessão antes do deploy de produção.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidMonthKey, monthKeyOf } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { logActionError } from "@/lib/log";
import { categorySchema, expenseSchema } from "@/schemas/expenses";
import { formText, isId } from "@/server/action-helpers";
import { createCategory, deleteExpense, ExpenseError, saveExpense, setCategoryActive } from "@/server/expenses";

function back(month: string, params: Record<string, string>): never {
  const mes = isValidMonthKey(month) ? month : "";
  redirect(`/despesas?${new URLSearchParams({ ...(mes ? { mes } : {}), ...params })}`);
}

function failure(error: unknown, where: string): string {
  if (error instanceof ExpenseError) return error.message;
  logActionError("despesas", where, error);
  return "Não foi possível salvar agora. Tente de novo.";
}

export async function saveExpenseAction(formData: FormData) {
  const id = formText(formData, "id") || null;
  const month = formText(formData, "mes");
  if (id !== null && !isId(id)) back(month, { erro: "Despesa inválida." });
  const parsed = expenseSchema.safeParse({
    date: formText(formData, "date"),
    categoryId: formText(formData, "categoryId"),
    amount: formText(formData, "amount"),
    description: formText(formData, "description"),
    barberId: formText(formData, "barberId"),
  });
  if (!parsed.success) back(month, { erro: parsed.error.issues[0]?.message ?? "Confira os campos." });

  let error: string | null = null;
  try {
    const { date, categoryId, amount, description, barberId } = parsed.data;
    await saveExpense(getDb(), id, { dayKey: date, categoryId, amountCents: amount, description, barberId });
  } catch (e) {
    error = failure(e, "salvar despesa");
  }
  revalidatePath("/", "layout");
  // Volta para o mês da despesa (pode ter sido lançada em outro mês).
  back(error ? month : monthKeyOf(parsed.data.date), error ? { erro: error } : { ok: id ? "Despesa atualizada." : "Despesa lançada." });
}

export async function deleteExpenseAction(id: string, month: string) {
  let params: Record<string, string> = { ok: "Despesa excluída." };
  if (isId(id)) {
    try {
      await deleteExpense(getDb(), id);
    } catch (e) {
      params = { erro: failure(e, "excluir despesa") };
    }
  }
  revalidatePath("/", "layout");
  back(month, params);
}

export async function createCategoryAction(formData: FormData) {
  const month = formText(formData, "mes");
  const parsed = categorySchema.safeParse({ name: formText(formData, "name") });
  if (!parsed.success) back(month, { erro: parsed.error.issues[0]?.message ?? "Nome inválido." });
  let error: string | null = null;
  try {
    await createCategory(getDb(), parsed.data.name);
  } catch (e) {
    error = failure(e, "criar categoria");
  }
  back(month, error ? { erro: error } : { ok: "Categoria criada." });
}

export async function toggleCategoryAction(id: string, active: boolean, month: string) {
  let params: Record<string, string> = { ok: active ? "Categoria reativada." : "Categoria desativada (as despesas antigas continuam)." };
  if (isId(id)) {
    try {
      await setCategoryActive(getDb(), id, active);
    } catch (e) {
      params = { erro: failure(e, "ativar/desativar categoria") };
    }
  }
  back(month, params);
}
