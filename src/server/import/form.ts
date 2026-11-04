// Leitura do formulário de confirmação da importação (puro, testável).

import { z } from "zod";

/** Campo do <select> de revisão: name="review:<comanda>", value=<Barber.id> ("" = não importar agora). */
export const REVIEW_FIELD_PREFIX = "review:";

const comandaSchema = z.string().regex(/^\d{1,20}$/);
const barberIdSchema = z.string().regex(/^[a-z0-9]{1,64}$/i);

/**
 * Converte os campos "review:<comanda>" do formulário em comanda → Barber.id.
 * Valores vazios (não importar agora) e campos malformados são ignorados; se o id não for de um
 * barbeiro de verdade, a prévia transforma a linha em erro.
 */
export function parseReviewChoices(entries: Iterable<[string, FormDataEntryValue]>): Map<string, string> {
  const choices = new Map<string, string>();
  for (const [name, value] of entries) {
    if (!name.startsWith(REVIEW_FIELD_PREFIX) || typeof value !== "string" || value === "") continue;
    const comanda = comandaSchema.safeParse(name.slice(REVIEW_FIELD_PREFIX.length));
    const barberId = barberIdSchema.safeParse(value);
    if (comanda.success && barberId.success) choices.set(comanda.data, barberId.data);
  }
  return choices;
}
