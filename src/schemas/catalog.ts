// Validação dos formulários do catálogo (usada pelas Server Actions).

import { z } from "zod";
import { PAYMENT_METHODS } from "@/domain/payments";
import { parseBRLToCents, parsePercentToBps } from "@/lib/money";
import { brlCentsSchema } from "./money";

const nameSchema = z.string().trim().min(1, "Informe o nome.").max(60, "Nome longo demais (máx. 60).");
const priceSchema = z.string().trim().min(1, "Informe o preço.").pipe(brlCentsSchema);

/** Duração opcional em minutos: vazio → null; senão inteiro de 1 a 600. */
const durationSchema = z.string().transform((value, ctx) => {
  const text = value.trim();
  if (text === "") return null;
  const minutes = Number(text);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
    ctx.addIssue({ code: "custom", message: "Duração inválida (minutos inteiros, de 1 a 600)." });
    return z.NEVER;
  }
  return minutes;
});

/** Custo opcional em reais: vazio → null (sem custo, fica fora da margem). */
const optionalCostSchema = z.string().transform((value, ctx) => {
  const text = value.trim();
  if (text === "") return null;
  const cents = parseBRLToCents(text);
  if (cents === null || cents < 0) {
    ctx.addIssue({ code: "custom", message: "Custo inválido. Use o formato 17,50" });
    return z.NEVER;
  }
  return cents;
});

export const serviceSchema = z.object({
  name: nameSchema,
  category: z.enum(["MAIN", "EXTRA"], { message: "Escolha Principal ou Extra." }),
  price: priceSchema,
  duration: durationSchema,
});

export const productSchema = z.object({
  name: nameSchema,
  price: priceSchema,
  cost: optionalCostSchema,
});

export const feeSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  percent: z.string().transform((value, ctx) => {
    const bps = parsePercentToBps(value.trim());
    if (bps === null) {
      ctx.addIssue({ code: "custom", message: "Taxa inválida. Use, por exemplo, 1,99 (entre 0 e 100)." });
      return z.NEVER;
    }
    return bps;
  }),
});
