"use server";

// Catálogo: serviços, produtos e taxas. TODO(login): verificar a sessão antes do deploy de produção.
// O retorno vai pela URL (?ok=, ?erro=, ?aviso=), então a tela pode ser 100% Server Component.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { logActionError } from "@/lib/log";
import { feeSchema, productSchema, serviceSchema } from "@/schemas/catalog";
import { formText, isId } from "@/server/action-helpers";
import { CatalogError, saveFee, saveProduct, saveService, setProductActive, setServiceActive } from "@/server/catalog";

type Tab = "servicos" | "produtos" | "taxas";

function back(tab: Tab, params: Record<string, string>): never {
  redirect(`/catalogo?${new URLSearchParams({ aba: tab, ...params })}`);
}

function failure(error: unknown, where: string): string {
  if (error instanceof CatalogError) return error.message;
  logActionError("catalogo", where, error);
  return "Não foi possível salvar agora. Tente de novo.";
}

const rulesWarning = (what: string, rules: string[]) =>
  rules.length === 0
    ? null
    : `Atenção: ${rules.length === 1 ? "a regra" : "as regras"} ${rules.map((r) => `"${r}"`).join(", ")} ainda ${rules.length === 1 ? "usa" : "usam"} este ${what}. Revise em Regras de valor.`;

export async function saveServiceAction(formData: FormData) {
  const id = formText(formData, "id") || null;
  if (id !== null && !isId(id)) back("servicos", { erro: "Serviço inválido." });
  const parsed = serviceSchema.safeParse({
    name: formText(formData, "name"),
    category: formText(formData, "category"),
    price: formText(formData, "price"),
    duration: formText(formData, "duration"),
  });
  if (!parsed.success) back("servicos", { erro: parsed.error.issues[0]?.message ?? "Confira os campos." });

  let error: string | null = null;
  try {
    const { name, category, price, duration } = parsed.data;
    await saveService(getDb(), id, { name, category, defaultPriceCents: price, durationMin: duration });
  } catch (e) {
    error = failure(e, "salvar serviço");
  }
  revalidatePath("/", "layout");
  back("servicos", error ? { erro: error } : { ok: id ? "Serviço atualizado. Visitas já lançadas não mudam." : "Serviço adicionado." });
}

export async function toggleServiceAction(id: string, active: boolean) {
  let params: Record<string, string> = {};
  if (isId(id)) {
    try {
      const { affectedRules } = await setServiceActive(getDb(), id, active);
      const warning = rulesWarning("serviço", affectedRules);
      params = warning ? { aviso: warning } : { ok: active ? "Serviço reativado." : "Serviço desativado." };
    } catch (e) {
      params = { erro: failure(e, "ativar/desativar serviço") };
    }
  }
  revalidatePath("/", "layout");
  back("servicos", params);
}

export async function saveProductAction(formData: FormData) {
  const id = formText(formData, "id") || null;
  if (id !== null && !isId(id)) back("produtos", { erro: "Produto inválido." });
  const parsed = productSchema.safeParse({
    name: formText(formData, "name"),
    price: formText(formData, "price"),
    cost: formText(formData, "cost"),
  });
  if (!parsed.success) back("produtos", { erro: parsed.error.issues[0]?.message ?? "Confira os campos." });

  let error: string | null = null;
  try {
    await saveProduct(getDb(), id, { name: parsed.data.name, priceCents: parsed.data.price, costCents: parsed.data.cost });
  } catch (e) {
    error = failure(e, "salvar produto");
  }
  revalidatePath("/", "layout");
  back("produtos", error ? { erro: error } : { ok: id ? "Produto atualizado. Vendas já lançadas não mudam." : "Produto adicionado." });
}

export async function toggleProductAction(id: string, active: boolean) {
  let params: Record<string, string> = {};
  if (isId(id)) {
    try {
      const { affectedRules } = await setProductActive(getDb(), id, active);
      const warning = rulesWarning("produto", affectedRules);
      params = warning ? { aviso: warning } : { ok: active ? "Produto reativado." : "Produto desativado." };
    } catch (e) {
      params = { erro: failure(e, "ativar/desativar produto") };
    }
  }
  revalidatePath("/", "layout");
  back("produtos", params);
}

export async function saveFeeAction(formData: FormData) {
  const parsed = feeSchema.safeParse({ method: formText(formData, "method"), percent: formText(formData, "percent") });
  if (!parsed.success) back("taxas", { erro: parsed.error.issues[0]?.message ?? "Taxa inválida." });

  let error: string | null = null;
  try {
    await saveFee(getDb(), parsed.data.method, parsed.data.percent);
  } catch (e) {
    error = failure(e, "salvar taxa");
  }
  revalidatePath("/", "layout");
  back("taxas", error ? { erro: error } : { ok: "Taxa salva. Vale para as próximas visitas; as já lançadas não mudam." });
}
