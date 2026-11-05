// Pequenos utilitários compartilhados pelas Server Actions (sem acesso ao banco).

/** Valor de texto de um campo do formulário ("" quando ausente ou arquivo). */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Ids gerados pelo Prisma (cuid) e afins: só letras e números. */
export const isId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9-]{1,64}$/i.test(value);

/** Opção de classificação de um toque: "rule:<id>" ou "service:<id>". */
export function parseOption(value: string): { kind: "RULE" | "SERVICE"; id: string } | null {
  const m = /^(rule|service):([a-z0-9]{1,64})$/i.exec(value);
  if (!m) return null;
  return { kind: m[1].toLowerCase() === "rule" ? "RULE" : "SERVICE", id: m[2] };
}

/** Caminho interno seguro para voltar depois da ação (evita redirecionar para fora do app). */
export function safeReturnPath(value: string, fallback: string): string {
  return /^\/[a-z0-9/_?=&-]*$/i.test(value) && !value.startsWith("//") ? value : fallback;
}
