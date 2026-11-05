// Itens enviados pelo editor (campo oculto "items" com JSON) → lista validada.

import { z } from "zod";

const keySchema = z.string().regex(/^[sp]:[a-z0-9]{1,64}$/i, "Item inválido");

const itemSchema = z.object({
  key: keySchema,
  quantity: z.number().int().min(1, "Quantidade mínima é 1").max(99, "Quantidade máxima é 99"),
  unitPriceCents: z.number().int("Preço inválido").min(0, "Preço inválido").max(100_000_00, "Preço alto demais"),
});

/** JSON do editor → itens no formato do domínio (serviceId XOR productId). */
export const itemsJsonSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Itens inválidos" });
      return z.NEVER;
    }
  })
  .pipe(z.array(itemSchema).min(1, "Adicione pelo menos um item").max(30, "Itens demais"))
  .transform((items) =>
    items.map((i) => ({
      serviceId: i.key.startsWith("s:") ? i.key.slice(2) : null,
      productId: i.key.startsWith("p:") ? i.key.slice(2) : null,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
    })),
  );
