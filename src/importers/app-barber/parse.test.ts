// Testes do parser com a fixture SINTÉTICA (test-fixture.ts). Nada aqui vem da exportação real.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { APP_BARBER_COLUMNS } from "./columns";
import { parseProfessionals } from "./normalize-row";
import { ImportFileError, parseAppBarberExport } from "./parse";
import { buildAppBarberXlsx, comanda } from "./test-fixture";
import { readFirstSheet, XlsxReadError } from "./xlsx-reader";

describe("readFirstSheet", () => {
  test("lê inlineStr e ignora o styles.xml defeituoso (<fill/> vazio)", () => {
    const rows = readFirstSheet(buildAppBarberXlsx([comanda()]));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0].cells, [...APP_BARBER_COLUMNS]);
    assert.equal(rows[1].rowNumber, 2);
    assert.equal(rows[1].cells[0], "100000001");
  });

  test("lê sharedStrings também", () => {
    const rows = readFirstSheet(buildAppBarberXlsx([comanda({ Valor: "50,00" })], { sharedStrings: true }));
    assert.equal(rows[1].cells[4], "50,00");
  });

  test("descarta linhas vazias, mas mantém o número real da linha", () => {
    const rows = readFirstSheet(
      buildAppBarberXlsx([comanda(), comanda({ Comanda: "100000002" })], { blankRowAfter: [0] }),
    );
    assert.deepEqual(rows.map((r) => r.rowNumber), [1, 2, 4]);
  });

  test("decodifica entidades XML (&amp;)", () => {
    const rows = readFirstSheet(buildAppBarberXlsx([comanda({ Obs: "A & B <teste>" })]));
    assert.equal(rows[1].cells[6], "A & B <teste>");
  });

  test("arquivo que não é zip → erro claro", () => {
    assert.throws(() => readFirstSheet(strToU8("isto não é um xlsx")), XlsxReadError);
  });

  test("zip sem as partes do Excel → erro claro", () => {
    assert.throws(() => readFirstSheet(zipSync({ "leia-me.txt": strToU8("oi") })), /workbook\.xml/);
  });

  test("limite de linhas", () => {
    const data = buildAppBarberXlsx([comanda(), comanda({ Comanda: "2" }), comanda({ Comanda: "3" })]);
    assert.throws(() => readFirstSheet(data, { maxPartBytes: 1e9, maxRows: 2 }), /mais de 2 linhas/);
  });

  test("limite de tamanho descompactado (proteção contra zip-bomba)", () => {
    assert.throws(() => readFirstSheet(buildAppBarberXlsx([comanda()]), { maxPartBytes: 100, maxRows: 10 }), /grande demais/);
  });
});

describe("parseAppBarberExport: estrutura", () => {
  test("planilha vazia", () => {
    const empty = zipSync({
      "xl/workbook.xml": strToU8(
        `<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData/></worksheet>`),
    });
    assert.throws(() => parseAppBarberExport(empty), /vazia/);
  });

  test("coluna faltando → erro dizendo quais", () => {
    const columns = APP_BARBER_COLUMNS.filter((c) => c !== "Valor" && c !== "Profissional");
    const error = (() => {
      try {
        parseAppBarberExport(buildAppBarberXlsx([comanda()], { columns }));
      } catch (e) {
        return e;
      }
    })();
    assert.ok(error instanceof ImportFileError);
    assert.match(error.message, /Valor, Profissional/);
  });

  test("colunas em outra ordem → lidas pelo nome", () => {
    const columns = [...APP_BARBER_COLUMNS].reverse();
    const { rows, errors } = parseAppBarberExport(buildAppBarberXlsx([comanda({ Valor: "50,00" })], { columns }));
    assert.deepEqual(errors, []);
    assert.equal(rows[0].valueCents, 5000);
  });

  test("coluna extra → aviso, não erro", () => {
    const columns = [...APP_BARBER_COLUMNS, "Coluna Nova"];
    const parsed = parseAppBarberExport(buildAppBarberXlsx([comanda()], { columns }));
    assert.deepEqual(parsed.unexpectedColumns, ["Coluna Nova"]);
    assert.equal(parsed.rows.length, 1);
  });
});

describe("parseAppBarberExport: linhas", () => {
  test("comanda fechada completa", () => {
    const { rows, errors, rowCount } = parseAppBarberExport(
      buildAppBarberXlsx([comanda({ Valor: "100,00", "Tipo Pagamento": "Cartão de Crédito", Obs: "Prefere degradê" })]),
    );
    assert.equal(rowCount, 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(rows[0], {
      rowNumber: 2,
      comanda: "100000001",
      status: "CLOSED",
      notes: "Prefere degradê",
      scheduledAt: new Date("2026-11-03T19:30:00.000Z"), // 16:30 em Brasília
      valueCents: 10000,
      paymentMethod: "CREDIT",
      professionalCodes: ["L.F"],
      extraProfessionals: 0,
    });
  });

  test("Cliente, Cadastro e Finalização nunca saem do parser", () => {
    const { rows } = parseAppBarberExport(buildAppBarberXlsx([comanda()]));
    const text = JSON.stringify(rows);
    for (const secret of ["Cliente Teste", "Atendente Teste", "Responsável Teste"]) {
      assert.equal(text.includes(secret), false, `${secret} vazou para as linhas normalizadas`);
    }
  });

  test("texto automático da Obs vira null; Obs vazia também", () => {
    const { rows } = parseAppBarberExport(
      buildAppBarberXlsx([
        comanda({ Comanda: "1" }),
        comanda({ Comanda: "2", Obs: "  comanda aberta por agendamento " }),
        comanda({ Comanda: "3", Obs: "" }),
      ]),
    );
    assert.deepEqual(rows.map((r) => r.notes), [null, null, null]);
  });

  test("as 4 formas de pagamento", () => {
    const methods = { PIX: "PIX", Dinheiro: "CASH", "Cartão de Débito": "DEBIT", "Cartão de Crédito": "CREDIT" };
    const { rows } = parseAppBarberExport(
      buildAppBarberXlsx(Object.keys(methods).map((m, i) => comanda({ Comanda: String(i + 1), "Tipo Pagamento": m }))),
    );
    assert.deepEqual(rows.map((r) => r.paymentMethod), Object.values(methods));
  });

  test("Aberta e Cancelada não exigem pagamento", () => {
    const { rows, errors } = parseAppBarberExport(
      buildAppBarberXlsx([
        comanda({ Comanda: "1", Status: "Aberta", "Tipo Pagamento": "" }),
        comanda({ Comanda: "2", Status: "Cancelada", "Tipo Pagamento": "", Data: "", Valor: "", Profissional: "" }),
      ]),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(rows.map((r) => [r.status, r.paymentMethod]), [["OPEN", null], ["CANCELLED", null]]);
    assert.equal(rows[1].scheduledAt, null);
  });

  test("Fechada com R$ 0,00 é válida (cortesia / assinante)", () => {
    const { rows, errors } = parseAppBarberExport(buildAppBarberXlsx([comanda({ Valor: "0,00" })]));
    assert.deepEqual(errors, []);
    assert.equal(rows[0].valueCents, 0);
  });

  test("vários profissionais", () => {
    const { rows } = parseAppBarberExport(buildAppBarberXlsx([comanda({ Profissional: "L.F + 1" })]));
    assert.deepEqual([rows[0].professionalCodes, rows[0].extraProfessionals], [["L.F"], 1]);
  });

  test("erros por linha, sem derrubar o arquivo", () => {
    const { rows, errors } = parseAppBarberExport(
      buildAppBarberXlsx([
        comanda({ Comanda: "1" }),
        comanda({ Comanda: "2", Valor: "abc" }),
        comanda({ Comanda: "3", Data: "31/02/2026 10:00" }),
        comanda({ Comanda: "4", "Tipo Pagamento": "Vale" }),
        comanda({ Comanda: "5", "Tipo Pagamento": "" }),
        comanda({ Comanda: "6", Profissional: "" }),
        comanda({ Comanda: "7", Status: "Pendente" }),
        comanda({ Comanda: "" }),
        comanda({ Comanda: "1" }), // repetida
        comanda({ Comanda: "10", Valor: "-5,00" }),
      ]),
    );
    assert.deepEqual(rows.map((r) => r.comanda), ["1"]);
    assert.deepEqual(
      errors.map((e) => [e.rowNumber, e.field]),
      [
        [3, "Valor"],
        [4, "Data"],
        [5, "Tipo Pagamento"],
        [6, "Tipo Pagamento"],
        [7, "Profissional"],
        [8, "Status"],
        [9, "Comanda"],
        [10, "Comanda"],
        [11, "Valor"],
      ],
    );
    assert.match(errors.find((e) => e.rowNumber === 10)!.message, /repetida.*linha 2/);
  });

  test("mensagens de erro nunca contêm a Obs", () => {
    const obs = "Obs secreta 123";
    const { errors } = parseAppBarberExport(
      buildAppBarberXlsx([
        comanda({ Comanda: "1", Valor: "abc", Obs: obs }),
        comanda({ Comanda: "2", Data: "x", Obs: obs }),
        comanda({ Comanda: "3", "Tipo Pagamento": "Vale", Obs: obs }),
        comanda({ Comanda: "4", Status: "?", Obs: obs }),
      ]),
    );
    assert.equal(errors.length, 4);
    assert.equal(JSON.stringify(errors).includes(obs), false);
  });
});

test("parseProfessionals", () => {
  assert.deepEqual(parseProfessionals("PH"), { codes: ["PH"], extra: 0 });
  assert.deepEqual(parseProfessionals("L.F + 1"), { codes: ["L.F"], extra: 1 });
  assert.deepEqual(parseProfessionals("L.F + PH"), { codes: ["L.F", "PH"], extra: 0 });
  assert.deepEqual(parseProfessionals(""), { codes: [], extra: 0 });
});
