// Schemas zod compartilhados entre formulários e Server Actions.

import { z } from "zod";
import { parseBRLToCents } from "@/lib/money";

/** Texto em reais ("45", "45,90", "1.234,56", "R$ 10") → centavos (inteiro >= 0). Vazio = 0. */
export const brlCentsSchema = z.string().transform((value, ctx) => {
  if (value.trim() === "") return 0;
  const cents = parseBRLToCents(value);
  if (cents === null || cents < 0) {
    ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 45,90" });
    return z.NEVER;
  }
  return cents;
});

/** Texto livre opcional: espaços nas pontas removidos; vazio vira null. */
export const optionalTextSchema = (max: number) =>
  z
    .string()
    .max(max, `Use no máximo ${max} caracteres`)
    .transform((value) => (value.trim() === "" ? null : value.trim()));
