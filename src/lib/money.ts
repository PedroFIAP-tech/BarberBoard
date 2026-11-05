// Utilitários de dinheiro. Todo valor monetário do sistema é um inteiro em CENTAVOS.

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** 4590 → "R$ 45,90" */
export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100);
}

// Aceita "45", "45,9", "45,90", "1.234,56", "1234,56", com ou sem "R$" e sinal.
const BRL_INPUT = /^(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * Converte o texto digitado pelo usuário em centavos, sem passar por float.
 * "45,90" → 4590 · "1.234,5" → 123450 · "abc" → null
 */
export function parseBRLToCents(input: string): number | null {
  const cleaned = input.replace(/R\$/i, "").replace(/\s/g, "");
  const match = BRL_INPUT.exec(cleaned);
  if (!match) return null;

  const [, sign, intPart, decPart = ""] = match;
  const reais = Number(intPart.replace(/\./g, ""));
  const centavos = Number(decPart.padEnd(2, "0"));
  const total = reais * 100 + centavos;

  if (!Number.isSafeInteger(total)) return null;
  return sign ? -total : total;
}

// Taxas são guardadas em basis points: 1 bp = 0,01%. Ex.: 1,99% = 199 bps.

/** 1.99 → 199 */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** 199 → 1.99 */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 199 → "1,99%" */
export function formatBps(bps: number): string {
  return `${percentFormatter.format(bpsToPercent(bps))}%`;
}

/** Valor para preencher um campo de texto: 10000 → "100,00" (sem "R$", sem separador de milhar). */
export function formatCentsForInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Percentual digitado → basis points: "1,99" → 199 · "5" → 500 · "4,9%" → 490 · "abc" → null.
 * Aceita até 2 casas decimais e de 0% a 100%.
 */
export function parsePercentToBps(input: string): number | null {
  const bps = parseBRLToCents(input.replace("%", "")); // mesma regra de "1.234,56" com 2 casas
  return bps !== null && bps >= 0 && bps <= 10_000 ? bps : null;
}

/** 199 → "1,99" (para preencher campo de percentual). */
export function formatBpsForInput(bps: number): string {
  return formatCentsForInput(bps);
}
