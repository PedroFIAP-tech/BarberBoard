// Confere o parser contra a exportação REAL do App Barber (docs/referencia/, fora do git).
// Só compara contagens e somas: nenhuma linha, nome ou Obs é impressa ou comparada.
// Sem o arquivo (ex.: em CI), o teste é pulado.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildImportPreview } from "@/domain/import-preview";
import { parseAppBarberExport } from "./parse";

const FILE = join(process.cwd(), "docs/referencia/AppBarber-Historico-30dias.xlsx");

test("exportação real de 30 dias: 269 linhas, 133 fechadas, R$ 7.015,00", { skip: !existsSync(FILE) && "arquivo de referência ausente" }, () => {
  const parsed = parseAppBarberExport(new Uint8Array(readFileSync(FILE)));
  const closed = parsed.rows.filter((r) => r.status === "CLOSED");
  const closedCents = closed.reduce((sum, r) => sum + r.valueCents, 0);

  assert.equal(parsed.rowCount, 269);
  assert.equal(parsed.errors.length, 0, `${parsed.errors.length} linhas com erro`);
  assert.equal(closed.length, 133);
  assert.equal(closedCents, 701_500);
  assert.deepEqual(parsed.unexpectedColumns, []);
});

test(
  "exportação real: comandas do PH vão para \"a confirmar\" (nenhuma pendente), as 133 fechadas do Luiz entram",
  { skip: !existsSync(FILE) && "arquivo de referência ausente" },
  () => {
    const parsed = parseAppBarberExport(new Uint8Array(readFileSync(FILE)));
    const preview = buildImportPreview({
      rowCount: parsed.rowCount,
      rows: parsed.rows,
      parseErrors: parsed.errors,
      now: new Date("2026-11-04T15:00:00Z"),
      existing: new Map(),
      barberIdByCode: new Map([["L.F", "luiz"]]),
      manualBarbers: new Map([["PH", { id: "paulo", name: "Paulo" }]]),
      feeBpsByMethod: { PIX: 0, CASH: 0, DEBIT: 199, CREDIT: 498 },
      rules: [],
      productCosts: new Map(),
    });
    const phInOpenPast = preview.openPast.filter((r) => r.professionalCodes.includes("PH")).length;

    // As 48 Abertas do PH (passadas e futuras) vão para "a confirmar"; as 11 Canceladas são descartadas.
    assert.equal(preview.counts.toConfirmCount, 48);
    assert.equal(preview.openFuture.filter((r) => r.professionalCodes.includes("PH")).length, 0);
    assert.equal(phInOpenPast, 0, "nenhuma comanda do PH como pendente");
    assert.equal(preview.counts.importedCount, 133);
    assert.equal(preview.counts.reviewCount, 0);
    assert.equal(preview.counts.errorCount, 0);
    assert.equal(preview.toImport.reduce((sum, v) => sum + v.totalCents, 0), 701_500);
    assert.equal(preview.warnings.filter((w) => w.message.includes("(+1)")).length, 1);
  },
);
