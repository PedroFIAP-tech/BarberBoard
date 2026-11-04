// Leitor mínimo de .xlsx: devolve a primeira aba como linhas de texto.
//
// Por que não uma lib de planilha? A exportação do App Barber traz um styles.xml que libs
// como o openpyxl rejeitam. Aqui o styles.xml nunca é aberto: só lemos o workbook (para achar
// a primeira aba), os relacionamentos, o sharedStrings (se houver) e a própria aba.
// Todo valor sai como texto, exatamente como está na célula.

import { strFromU8, unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxReadError";
  }
}

export type SheetRow = {
  /** Número da linha na planilha (1 = cabeçalho). */
  rowNumber: number;
  cells: string[];
};

export type ReadLimits = {
  /** Tamanho máximo descompactado de cada parte lida do zip. */
  maxPartBytes: number;
  maxRows: number;
};

const DEFAULT_LIMITS: ReadLimits = {
  maxPartBytes: 50 * 1024 * 1024,
  maxRows: 50_000,
};

const WANTED_PARTS = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) => ["sheet", "Relationship", "si", "row", "c", "r"].includes(name),
});

type XmlNode = Record<string, unknown>;

/** Texto de um nó <t> ou de um nó com runs (<r><t>..</t></r>), como em <si> e <is>. */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  const n = node as XmlNode;
  if ("#text" in n) return String(n["#text"]);
  let out = "";
  if ("t" in n) out += textOf(n.t);
  if (Array.isArray(n.r)) for (const run of n.r) out += textOf((run as XmlNode).t);
  return out;
}

/** "AB12" → 27 (índice da coluna, base 0). */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0];
  if (!letters) throw new XlsxReadError(`Referência de célula inválida: ${ref}`);
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseXml(files: Record<string, Uint8Array>, name: string): XmlNode {
  const data = files[name];
  if (!data) throw new XlsxReadError(`Arquivo inválido: parte ${name} não encontrada`);
  try {
    return parser.parse(strFromU8(data)) as XmlNode;
  } catch {
    throw new XlsxReadError(`Arquivo inválido: ${name} não é um XML válido`);
  }
}

/** Caminho da primeira aba, seguindo workbook.xml → workbook.xml.rels. */
function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = parseXml(files, "xl/workbook.xml");
  const sheets = ((workbook.workbook as XmlNode)?.sheets as XmlNode)?.sheet as XmlNode[] | undefined;
  const first = sheets?.[0];
  const relId = first?.["r:id"] as string | undefined;
  if (!relId) throw new XlsxReadError("A planilha não tem nenhuma aba");

  const rels = parseXml(files, "xl/_rels/workbook.xml.rels");
  const rel = ((rels.Relationships as XmlNode)?.Relationship as XmlNode[] | undefined)?.find(
    (r) => r.Id === relId,
  );
  const target = rel?.Target as string | undefined;
  if (!target) throw new XlsxReadError("Não foi possível localizar a primeira aba");
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  if (!files["xl/sharedStrings.xml"]) return [];
  const doc = parseXml(files, "xl/sharedStrings.xml");
  const items = (doc.sst as XmlNode)?.si as unknown[] | undefined;
  return (items ?? []).map(textOf);
}

function cellText(cell: XmlNode, shared: string[]): string {
  const type = cell.t as string | undefined;
  if (type === "inlineStr") return textOf(cell.is);
  const raw = cell.v === undefined ? "" : textOf(cell.v);
  if (type === "s") {
    const idx = Number(raw);
    if (!Number.isInteger(idx) || idx < 0 || idx >= shared.length) {
      throw new XlsxReadError(`Célula ${String(cell.r)} aponta para um texto inexistente`);
    }
    return shared[idx];
  }
  return raw; // números, booleanos e fórmulas de texto: o valor como está
}

/** Lê a primeira aba do .xlsx. Linhas totalmente vazias são descartadas. */
export function readFirstSheet(data: Uint8Array, limits: ReadLimits = DEFAULT_LIMITS): SheetRow[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (file) => {
        if (!WANTED_PARTS.test(file.name)) return false;
        if (file.originalSize > limits.maxPartBytes) {
          throw new XlsxReadError(`Arquivo grande demais (${file.name})`);
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof XlsxReadError) throw error;
    throw new XlsxReadError("O arquivo não é um .xlsx válido");
  }

  const shared = readSharedStrings(files);
  const sheet = parseXml(files, firstSheetPath(files));
  const rows = (((sheet.worksheet as XmlNode)?.sheetData as XmlNode)?.row as XmlNode[] | undefined) ?? [];
  if (rows.length > limits.maxRows) {
    throw new XlsxReadError(`A planilha tem mais de ${limits.maxRows} linhas`);
  }

  const out: SheetRow[] = [];
  rows.forEach((row, i) => {
    const rowNumber = row.r ? Number(row.r) : i + 1;
    const cells: string[] = [];
    let next = 0;
    for (const cell of (row.c as XmlNode[] | undefined) ?? []) {
      const idx = cell.r ? columnIndex(String(cell.r)) : next;
      cells[idx] = cellText(cell, shared);
      next = idx + 1;
    }
    const dense = Array.from(cells, (c) => c ?? "");
    if (dense.some((c) => c.trim() !== "")) out.push({ rowNumber, cells: dense });
  });
  return out;
}
