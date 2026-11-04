// Gera, em memória, um .xlsx SINTÉTICO no formato do Histórico de Comandas do App Barber.
// Usado só nos testes. Nunca copiar dados da exportação real para cá.
//
// Reproduz o que importa do arquivo real: uma aba, células inlineStr, tudo como texto e um
// styles.xml com <fill/> vazio (o defeito que faz o openpyxl recusar o arquivo).

import { strToU8, zipSync } from "fflate";
import { APP_BARBER_COLUMNS, type AppBarberColumn } from "./columns";

export type FixtureRow = Partial<Record<AppBarberColumn, string>>;

/** Uma comanda fechada válida, com dados fictícios. Sobrescreva só o que o teste precisa. */
export function comanda(overrides: FixtureRow = {}): Record<AppBarberColumn, string> {
  return {
    Comanda: "100000001",
    Cartão: "",
    Status: "Fechada",
    Data: "03/11/2026 16:30",
    Valor: "40,00",
    Cliente: "Cliente Teste",
    Obs: "Comanda Aberta por Agendamento",
    "Tipo Pagamento": "PIX",
    Cadastro: "Atendente Teste",
    Profissional: "L.F",
    Finalização: "Responsável Teste",
    "Data Finalização": "03/11/2026 17:10",
    Inserção: "02/11/2026 20:00",
    "Em caixa": "",
    "Data Caixa": "",
    ...overrides,
  };
}

export type FixtureOptions = {
  /** Ordem/conjunto das colunas do cabeçalho (padrão: as 15, na ordem do App Barber). */
  columns?: readonly string[];
  /** Usa sharedStrings (t="s") em vez de inlineStr. */
  sharedStrings?: boolean;
  /** Linhas totalmente vazias inseridas entre as comandas. */
  blankRowAfter?: number[];
};

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const colLetter = (i: number) => {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function buildAppBarberXlsx(rows: FixtureRow[], options: FixtureOptions = {}): Uint8Array {
  const columns = options.columns ?? APP_BARBER_COLUMNS;
  const shared: string[] = [];
  const sharedIndex = new Map<string, number>();

  const cellXml = (ref: string, value: string) => {
    if (options.sharedStrings) {
      let idx = sharedIndex.get(value);
      if (idx === undefined) {
        idx = shared.length;
        shared.push(value);
        sharedIndex.set(value, idx);
      }
      return `<c r="${ref}" t="s"><v>${idx}</v></c>`;
    }
    return `<c t="inlineStr" r="${ref}" s="1"><is><t>${escapeXml(value)}</t></is></c>`;
  };

  const sheetRows: string[] = [];
  let rowNumber = 1;
  const pushRow = (values: string[]) => {
    const cells = values.map((v, i) => cellXml(`${colLetter(i)}${rowNumber}`, v)).join("");
    sheetRows.push(`<row r="${rowNumber}">${cells}</row>`);
    rowNumber++;
  };

  pushRow([...columns]);
  rows.forEach((row, i) => {
    pushRow(columns.map((c) => row[c as AppBarberColumn] ?? ""));
    if (options.blankRowAfter?.includes(i)) rowNumber++; // pula uma linha (fica vazia)
  });

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>${options.sharedStrings ? `<Relationship Id="rId3" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/>` : ""}</Relationships>`,
    ),
    // O mesmo defeito do arquivo real: <fill/> vazio dentro de <fills>.
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${MAIN_NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fillId="1"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`,
    ),
  };
  if (options.sharedStrings) {
    files["xl/sharedStrings.xml"] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${MAIN_NS}" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join("")}</sst>`,
    );
  }
  return zipSync(files);
}
