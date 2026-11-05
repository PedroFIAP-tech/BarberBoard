import { z } from "zod";
import { isValidDayKey } from "@/lib/dates";
import { brlCentsSchema, optionalTextSchema } from "./money";

const idSchema = z.string().regex(/^[a-z0-9]{1,64}$/i, "Escolha uma opção válida.");

export const expenseSchema = z.object({
  date: z.string().refine(isValidDayKey, "Data inválida."),
  categoryId: idSchema,
  amount: z.string().trim().min(1, "Informe o valor.").pipe(brlCentsSchema).refine((c) => c > 0, "Informe um valor maior que zero."),
  description: optionalTextSchema(200),
  barberId: z.union([z.literal("").transform(() => null), idSchema]),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da categoria.").max(40, "Nome longo demais (máx. 40)."),
});
