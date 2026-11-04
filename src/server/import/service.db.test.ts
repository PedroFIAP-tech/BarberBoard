// Teste ponta a ponta da importação contra um Postgres de verdade.
// ⚠️ APAGA o banco apontado por TEST_DATABASE_URL. Só roda se o host for local (localhost/127.0.0.1);
// use `pnpm test:db`, que sobe um Postgres temporário em Docker e o descarta no fim.
// Os dados são da fixture sintética; nada vem da exportação real.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { buildAppBarberXlsx, comanda } from "@/importers/app-barber/test-fixture";
import { ImportFileError } from "@/importers/app-barber/parse";
import { confirmImport, createImportPreview, getImportPreview, ImportStateError } from "./service";

const DB_URL = process.env.TEST_DATABASE_URL;
const isLocal = (() => {
  try {
    return !!DB_URL && ["localhost", "127.0.0.1"].includes(new URL(DB_URL).hostname);
  } catch {
    return false;
  }
})();

const NOW = new Date("2026-11-04T15:00:00Z"); // 04/11 12:00 em Brasília

const FILE_ROWS = [
  comanda({ Comanda: "200000001", Valor: "40,00", "Tipo Pagamento": "PIX", Profissional: "L.F" }),
  comanda({ Comanda: "200000002", Valor: "50,00", "Tipo Pagamento": "Cartão de Crédito", Profissional: "PH" }),
  comanda({ Comanda: "200000003", Valor: "65,00", "Tipo Pagamento": "Dinheiro", Obs: "Prefere tesoura" }),
  comanda({ Comanda: "200000004", Valor: "0,00" }),
  comanda({ Comanda: "200000005", Valor: "80,00", Profissional: "L.F + 1" }),
  comanda({ Comanda: "200000006", Status: "Aberta", "Tipo Pagamento": "", Data: "03/11/2026 10:00" }),
  comanda({ Comanda: "200000007", Status: "Aberta", "Tipo Pagamento": "", Data: "05/11/2026 10:00" }),
  comanda({ Comanda: "200000008", Status: "Cancelada", "Tipo Pagamento": "" }),
  comanda({ Comanda: "200000009", Profissional: "Z.Z" }),
  comanda({ Comanda: "200000010", Valor: "abc" }),
];

const TABLES = [
  "appointment_items", "appointments", "price_rule_items", "price_rules", "import_batches",
  "cash_closings", "expenses", "expense_categories", "payment_fees", "products", "services", "barbers",
];

describe("importação do App Barber (banco)", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, () => {
  let db: PrismaClient;
  const ids = { luiz: "", paulo: "", corte: "", sobrancelha: "" };

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);

    ids.luiz = (await db.barber.create({ data: { name: "Luiz", appBarberCode: "L.F" } })).id;
    ids.paulo = (await db.barber.create({ data: { name: "Paulo", appBarberCode: "PH" } })).id;
    ids.corte = (await db.service.create({ data: { name: "Corte", category: "MAIN", defaultPriceCents: 4000 } })).id;
    ids.sobrancelha = (
      await db.service.create({ data: { name: "Sobrancelha", category: "EXTRA", defaultPriceCents: 1000 } })
    ).id;
    await db.paymentFee.createMany({
      data: [
        { method: "PIX", feeBps: 0 },
        { method: "CASH", feeBps: 0 },
        { method: "DEBIT", feeBps: 199 },
        { method: "CREDIT", feeBps: 498 },
      ],
    });
    await db.priceRule.create({
      data: { label: "Corte", amountCents: 4000, items: { create: [{ serviceId: ids.corte, unitPriceCents: 4000 }] } },
    });
    await db.priceRule.create({
      data: {
        label: "Corte e sobrancelha",
        amountCents: 5000,
        items: {
          create: [
            { serviceId: ids.corte, unitPriceCents: 4000, sortOrder: 0 },
            { serviceId: ids.sobrancelha, unitPriceCents: 1000, sortOrder: 1 },
          ],
        },
      },
    });
  });

  after(async () => {
    await db?.$disconnect();
  });

  let batchId = "";

  test("prévia: cada comanda no seu grupo, lote PENDING sem dados pessoais", async () => {
    const result = await createImportPreview(db, { fileName: "historico.xlsx", data: buildAppBarberXlsx(FILE_ROWS), now: NOW });
    batchId = result.batchId;
    assert.deepEqual(result.preview.counts, {
      rowCount: 10,
      importedCount: 4, // 001, 002, 003, 004
      unclassifiedCount: 2, // 003 (R$ 65) e 004 (R$ 0)
      duplicateCount: 0,
      openPastCount: 1,
      openFutureCount: 1,
      cancelledCount: 1,
      reviewCount: 1, // 005 "L.F + 1"
      errorCount: 2, // 009 profissional desconhecido, 010 valor inválido
    });

    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    assert.equal(batch.status, "PENDING");
    assert.equal(batch.importedCount, 4);
    const meta = JSON.stringify(batch.meta);
    for (const secret of ["Cliente Teste", "Atendente Teste", "Responsável Teste"]) {
      assert.equal(meta.includes(secret), false, `${secret} foi gravado no lote`);
    }
    assert.equal(await db.appointment.count(), 0, "a prévia não cria visitas");
  });

  test("revisão: escolher o barbeiro tira a comanda de 'revisar'", async () => {
    const { preview } = await getImportPreview(db, { batchId, now: NOW, reviewChoices: new Map([["200000005", ids.paulo]]) });
    assert.equal(preview.counts.reviewCount, 0);
    assert.equal(preview.counts.importedCount, 5);
  });

  test("confirmar: cria as visitas com regra, taxa, horário e Obs corretos", async () => {
    const { counts } = await confirmImport(db, { batchId, now: NOW, reviewChoices: new Map([["200000005", ids.paulo]]) });
    assert.equal(counts.importedCount, 5);

    const visits = await db.appointment.findMany({
      include: { items: { orderBy: { totalCents: "desc" } }, priceRule: true },
      orderBy: { externalId: "asc" },
    });
    assert.deepEqual(visits.map((v) => v.externalId), ["200000001", "200000002", "200000003", "200000004", "200000005"]);
    assert.ok(visits.every((v) => v.source === "APP_BARBER" && v.importBatchId === batchId));

    const [v1, v2, v3, v4, v5] = visits;
    assert.equal(v1.classification, "CLASSIFIED");
    assert.equal(v1.priceRule?.label, "Corte");
    assert.equal(v1.notes, null); // texto automático descartado
    assert.equal(v1.performedAt.toISOString(), "2026-11-03T19:30:00.000Z"); // coluna Data, 16:30 BR

    assert.equal(v2.barberId, ids.paulo);
    assert.equal(v2.priceRule?.label, "Corte e sobrancelha");
    assert.deepEqual(v2.items.map((i) => [i.serviceId, i.totalCents]), [[ids.corte, 4000], [ids.sobrancelha, 1000]]);
    assert.deepEqual([v2.paymentMethod, v2.feeBps, v2.feeCents, v2.netCents], ["CREDIT", 498, 249, 4751]);

    assert.equal(v3.classification, "PENDING");
    assert.equal(v3.items.length, 0);
    assert.equal(v3.notes, "Prefere tesoura");
    assert.equal(v3.paymentMethod, "CASH");

    assert.deepEqual([v4.totalCents, v4.classification], [0, "PENDING"]); // cortesia
    assert.deepEqual([v5.barberId, v5.classification], [ids.paulo, "PENDING"]); // revisado; R$ 80 sem regra aqui

    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    assert.equal(batch.status, "COMPLETED");
    const meta = batch.meta as { rows?: unknown; errors: unknown[]; period: { from: string; to: string } };
    assert.equal(meta.rows, undefined, "linhas brutas saem do lote ao concluir");
    assert.equal(meta.errors.length, 2);
    assert.equal(meta.period.to, "2026-11-05T13:00:00.000Z");
  });

  test("confirmar de novo o mesmo lote → erro, nada duplicado", async () => {
    await assert.rejects(confirmImport(db, { batchId, now: NOW }), ImportStateError);
    assert.equal(await db.appointment.count(), 5);
  });

  test("reimportar o mesmo arquivo não duplica", async () => {
    const { batchId: again, preview } = await createImportPreview(db, {
      fileName: "historico.xlsx",
      data: buildAppBarberXlsx(FILE_ROWS),
      now: NOW,
    });
    assert.equal(preview.counts.importedCount, 0);
    assert.equal(preview.counts.duplicateCount, 5);
    await confirmImport(db, { batchId: again, now: NOW });
    assert.equal(await db.appointment.count(), 5);
  });

  test("comanda que era Aberta e virou Fechada entra na próxima importação", async () => {
    const rows = FILE_ROWS.map((r) =>
      r.Comanda === "200000006" ? { ...r, Status: "Fechada", "Tipo Pagamento": "PIX" } : r,
    );
    const { batchId: next, preview } = await createImportPreview(db, { fileName: "h2.xlsx", data: buildAppBarberXlsx(rows), now: NOW });
    assert.equal(preview.counts.importedCount, 1);
    assert.equal(preview.toImport[0].externalId, "200000006");
    await confirmImport(db, { batchId: next, now: NOW });
    assert.equal(await db.appointment.count(), 6);
  });

  test("duas confirmações simultâneas do mesmo lote: só uma cria visitas", async () => {
    const rows = [comanda({ Comanda: "300000001" }), comanda({ Comanda: "300000002", Valor: "50,00" })];
    const { batchId: race } = await createImportPreview(db, { fileName: "r.xlsx", data: buildAppBarberXlsx(rows), now: NOW });
    const results = await Promise.allSettled([
      confirmImport(db, { batchId: race, now: NOW }),
      confirmImport(db, { batchId: race, now: NOW }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
    assert.equal(await db.appointment.count({ where: { externalId: { in: ["300000001", "300000002"] } } }), 2);
  });

  test("invariante: classificada fecha com os itens; a classificar não tem itens", async () => {
    const broken = await db.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT count(*) AS n FROM appointments a
      WHERE (a.classification = 'CLASSIFIED' AND a.total_cents <> COALESCE((SELECT sum(total_cents) FROM appointment_items i WHERE i.appointment_id = a.id), -1))
         OR (a.classification = 'PENDING' AND EXISTS (SELECT 1 FROM appointment_items i WHERE i.appointment_id = a.id))`);
    assert.equal(Number(broken[0].n), 0);
  });

  test("arquivo inválido → erro e nenhum lote criado", async () => {
    const before = await db.importBatch.count();
    await assert.rejects(
      createImportPreview(db, { fileName: "x.xlsx", data: new TextEncoder().encode("não é xlsx"), now: NOW }),
      ImportFileError,
    );
    assert.equal(await db.importBatch.count(), before);
  });

  test("CHECK em price_rule_items: serviço OU produto", async () => {
    const rule = await db.priceRule.findFirstOrThrow();
    await assert.rejects(
      db.$executeRawUnsafe(
        `INSERT INTO price_rule_items (id, rule_id, quantity, unit_price_cents, updated_at) VALUES ('x', '${rule.id}', 1, 100, now())`,
      ),
      /price_rule_items_service_xor_product/,
    );
  });
});
