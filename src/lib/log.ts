// Log de erros inesperados das Server Actions.
// Registra só o nome e o código do erro: mensagens do Prisma podem conter os dados da consulta
// (inclusive a Obs, que pode ter o nome do cliente), e isso não pode ir para o log.

export function logActionError(area: string, where: string, error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  console.error(`[${area}] ${where} falhou: ${name}${code ? ` (${String(code)})` : ""}`);
}
