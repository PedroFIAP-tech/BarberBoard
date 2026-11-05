import assert from "node:assert/strict";
import { test } from "node:test";
import { Upload } from "lucide-react";
import { isActive, visibleNav, type NavItem } from "./nav-items";

const item = (href: string, ready: boolean): NavItem => ({ href, label: href, icon: Upload, ready });

test("visibleNav mostra só as telas prontas", () => {
  const nav = visibleNav([item("/fechamento", false), item("/importar", true)], [item("/catalogo", false)]);
  assert.deepEqual(nav.primary.map((i) => i.href), ["/importar"]);
  assert.deepEqual(nav.more, []);
  assert.equal(nav.showMore, false, '"Mais" fica oculto sem nenhum item pronto');
});

test('visibleNav mostra "Mais" quando algum item dele está pronto', () => {
  const nav = visibleNav([item("/importar", true)], [item("/catalogo", false), item("/despesas", true)]);
  assert.equal(nav.showMore, true);
  assert.deepEqual(nav.more.map((i) => i.href), ["/despesas"]);
});

test("isActive casa a rota e as sub-rotas, sem falso positivo por prefixo", () => {
  assert.equal(isActive("/importar", "/importar"), true);
  assert.equal(isActive("/importar/abc123", "/importar"), true);
  assert.equal(isActive("/importarx", "/importar"), false);
  assert.equal(isActive("/", "/importar"), false);
  assert.equal(isActive(null, "/importar"), false);
});
