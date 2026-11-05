import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmLabel, hasWork } from "./confirm-label";

test("texto e habilitação do botão de importar", () => {
  const cases: [number, number, number, string, boolean][] = [
    [4, 9, 0, "Importar 4 visitas e 9 a confirmar", true],
    [1, 0, 0, "Importar 1 visita", true],
    [0, 9, 0, "Importar 9 comandas a confirmar", true],
    [0, 1, 0, "Importar 1 comanda a confirmar", true],
    [0, 0, 2, "Atualizar 2 comandas a confirmar", true],
    [0, 0, 0, "Nada novo para importar", false],
  ];
  for (const [visits, toConfirm, confirmChanges, label, enabled] of cases) {
    assert.equal(confirmLabel({ visits, toConfirm, confirmChanges }), label);
    assert.equal(hasWork({ visits, toConfirm, confirmChanges }), enabled);
  }
});
