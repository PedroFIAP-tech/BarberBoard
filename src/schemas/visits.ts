import { z } from "zod";
import { PAYMENT_METHODS } from "@/domain/payments";
import { isValidDayKey } from "@/lib/dates";
import { itemsJsonSchema } from "./items";
import { optionalTextSchema } from "./money";

export const manualVisitSchema = z.object({
  date: z.string().refine(isValidDayKey, "Data inválida."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida."),
  barberId: z.string().regex(/^[a-z0-9]{1,64}$/i, "Escolha o barbeiro."),
  paymentMethod: z.enum(PAYMENT_METHODS, { message: "Escolha a forma de pagamento." }),
  items: itemsJsonSchema,
  notes: optionalTextSchema(500),
});
