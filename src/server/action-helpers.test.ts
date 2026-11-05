import assert from "node:assert/strict";
import { test } from "node:test";
import { isId, parseOption, safeReturnPath } from "./action-helpers";

test("parseOption", () => {
  assert.deepEqual(parseOption("rule:abc123"), { kind: "RULE", id: "abc123" });
  assert.deepEqual(parseOption("service:x9"), { kind: "SERVICE", id: "x9" });
  assert.equal(parseOption("product:x9"), null);
  assert.equal(parseOption("rule:"), null);
  assert.equal(parseOption("rule:a;drop"), null);
});

test("safeReturnPath só aceita caminhos internos", () => {
  assert.equal(safeReturnPath("/classificar", "/"), "/classificar");
  assert.equal(safeReturnPath("/visitas/abc?salvo=1", "/"), "/visitas/abc?salvo=1");
  assert.equal(safeReturnPath("https://evil.com", "/"), "/");
  assert.equal(safeReturnPath("//evil.com", "/"), "/");
  assert.equal(safeReturnPath("", "/x"), "/x");
});

test("isId", () => {
  assert.equal(isId("cmw2733gb0002u777lm47we9f"), true);
  assert.equal(isId("a b"), false);
  assert.equal(isId(undefined), false);
});
