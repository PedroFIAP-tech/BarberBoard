// Confere o parser contra a exportação REAL do App Barber (docs/referencia/, fora do git).
// Só compara contagens e somas: nenhuma linha, nome ou Obs é impressa ou comparada.
// Sem o arquivo (ex.: em CI), o teste é pulado.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
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
