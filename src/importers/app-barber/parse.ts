// Ponto de entrada do parser: .xlsx do App Barber → linhas normalizadas + erros por linha.

import { checkHeader } from "./columns";
import { normalizeRow, type NormalizedRow, type RowError } from "./normalize-row";
import { readFirstSheet, XlsxReadError } from "./xlsx-reader";

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

export type ParsedExport = {
  /** Linhas de dados (sem o cabeçalho). */
  rowCount: number;
  rows: NormalizedRow[];
  errors: RowError[];
  /** Colunas presentes no arquivo que não fazem parte do formato conhecido. */
  unexpectedColumns: string[];
};

export function parseAppBarberExport(data: Uint8Array): ParsedExport {
  let sheet;
  try {
    sheet = readFirstSheet(data);
  } catch (error) {
    if (error instanceof XlsxReadError) throw new ImportFileError(error.message);
    throw error;
  }
  if (sheet.length === 0) throw new ImportFileError("A planilha está vazia");

  const [header, ...dataRows] = sheet;
  const check = checkHeader(header.cells);
  if (!check.ok) {
    throw new ImportFileError(
      `Este arquivo não parece o Histórico de Comandas do App Barber. Faltam as colunas: ${check.missing.join(", ")}`,
    );
  }

  const rows: NormalizedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>(); // comanda → linha onde apareceu

  for (const { rowNumber, cells } of dataRows) {
    const result = normalizeRow(rowNumber, cells, check.index);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    const firstRow = seen.get(result.row.comanda);
    if (firstRow !== undefined) {
      errors.push({
        rowNumber,
        comanda: result.row.comanda,
        field: "Comanda",
        message: `Comanda repetida no arquivo (já aparece na linha ${firstRow})`,
      });
      continue;
    }
    seen.set(result.row.comanda, rowNumber);
    rows.push(result.row);
  }

  return { rowCount: dataRows.length, rows, errors, unexpectedColumns: check.unexpected };
}
