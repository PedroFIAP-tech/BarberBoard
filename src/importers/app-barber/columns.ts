// As 15 colunas do Histórico de Comandas do App Barber
// (Comandas → Histórico de Comandas → filtro "Clientes" → botão Excel).
// As colunas são localizadas pelo NOME, então a ordem no arquivo não importa.

export const APP_BARBER_COLUMNS = [
  "Comanda",
  "Cartão",
  "Status",
  "Data",
  "Valor",
  "Cliente",
  "Obs",
  "Tipo Pagamento",
  "Cadastro",
  "Profissional",
  "Finalização",
  "Data Finalização",
  "Inserção",
  "Em caixa",
  "Data Caixa",
] as const;

export type AppBarberColumn = (typeof APP_BARBER_COLUMNS)[number];

/**
 * Colunas que o BarberBoard de fato lê. Cliente, Cadastro e Finalização têm nomes de pessoas
 * e nunca são lidas; as demais não são usadas por enquanto.
 */
export const USED_COLUMNS = ["Comanda", "Status", "Data", "Valor", "Obs", "Tipo Pagamento", "Profissional"] as const;
export type UsedColumn = (typeof USED_COLUMNS)[number];

export type ColumnIndex = Record<UsedColumn, number>;

export type HeaderCheck =
  | { ok: true; index: ColumnIndex; unexpected: string[] }
  | { ok: false; missing: string[]; unexpected: string[] };

const normalize = (name: string) => name.normalize("NFC").trim().toLowerCase();

/** Confere o cabeçalho: as 15 colunas precisam existir; colunas a mais só geram aviso. */
export function checkHeader(header: string[]): HeaderCheck {
  const positions = new Map<string, number>();
  header.forEach((name, i) => {
    const key = normalize(name);
    if (key !== "" && !positions.has(key)) positions.set(key, i);
  });

  const expected = new Set(APP_BARBER_COLUMNS.map(normalize));
  const missing = APP_BARBER_COLUMNS.filter((c) => !positions.has(normalize(c)));
  const unexpected = header.filter((h) => h.trim() !== "" && !expected.has(normalize(h)));
  if (missing.length > 0) return { ok: false, missing, unexpected };

  const index = Object.fromEntries(USED_COLUMNS.map((c) => [c, positions.get(normalize(c))!])) as ColumnIndex;
  return { ok: true, index, unexpected };
}
