import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReviewChoices, REVIEW_FIELD_PREFIX } from "./form";

test("parseReviewChoices lê só campos de revisão válidos", () => {
  const form = new FormData();
  form.append(`${REVIEW_FIELD_PREFIX}200000005`, "cmw2733gb0002u777lm47we9f");
  form.append(`${REVIEW_FIELD_PREFIX}200000006`, ""); // "não importar agora"
  form.append(`${REVIEW_FIELD_PREFIX}abc`, "cmw2733gb0002u777lm47we9f"); // comanda inválida
  form.append(`${REVIEW_FIELD_PREFIX}200000007`, "id com espaço"); // id inválido
  form.append("$ACTION_ID_123", "x"); // campo interno do Next
  form.append("outro", "y");

  assert.deepEqual([...parseReviewChoices(form.entries())], [["200000005", "cmw2733gb0002u777lm47we9f"]]);
});

test("parseReviewChoices sem campos → vazio", () => {
  assert.equal(parseReviewChoices(new FormData().entries()).size, 0);
});
