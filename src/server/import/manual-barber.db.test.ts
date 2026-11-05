// Importação com barbeiro que não fecha comanda (Paulo, PH): comandas "a confirmar". Fixture SINTÉTICA.
// ⚠️ APAGA o banco de TEST_DATABASE_URL; só roda com host local (use `pnpm test:db`).

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { buildAppBarberXlsx, comanda } from "@/importers/app-barber/test-fixture";
import { getDayClosingView } from "../closing";
import { getImportView } from "./queries";
import { confirmImport, createImportPreview } from "./service";

const DB_URL = process.env.TEST_DATABASE_URL;
const isLocal = (() => {
  try {
    return !!DB_URL && ["localhost", "127.0.0.1"].includes(new URL(DB_URL).hostname);
  } catch {
    return false;
  }
})();

const TABLES = [
  "pending_confirmations", "appointment_items", "appointments", "price_rule_items", "price_rules", "import_batches",
  "cash_closings", "expenses", "expense_categories", "payment_fees", "products", "services", "barbers",
];
const NOW = new Date("2026-11-04T15:00:00Z"); // 04/11 12:00 em Brasília

describe("comandas a confirmar do barbeiro que não fecha comanda (banco)", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, () => {
  let db: PrismaClient;
  let luiz = "";
  let paulo = "";

  const importFile = async (rows: Parameters<typeof comanda>[0][]) => {
    const { batchId, preview } = await createImportPreview(db, { fileName: "h.xlsx", data: buildAppBarberXlsx(rows.map((r) => comanda(r))), now: NOW });
    await confirmImport(db, { batchId, now: NOW });
    return { batchId, preview };
  };
  const pc = (externalId: string) => db.pendingConfirmation.findUniqueOrThrow({ where: { externalId } });

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
    luiz = (await db.barber.create({ data: { name: "Luiz", appBarberCode: "L.F" } })).id;
    paulo = (await db.barber.create({ data: { name: "Paulo", appBarberCode: "PH", importsFromAppBarber: false } })).id;
    await db.paymentFee.createMany({ data: ["PIX", "CASH", "DEBIT", "CREDIT"].map((method) => ({ method: method as "PIX", feeBps: 0 })) });
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("importar: comandas do PH viram 'a confirmar' (não visita); L.F + 1 entra para o Luiz com aviso", async () => {
    const { batchId, preview } = await createImportPreview(db, {
      fileName: "h.xlsx",
      data: buildAppBarberXlsx([
        comanda({ Comanda: "700000001", Profissional: "PH", Valor: "50,00", "Tipo Pagamento": "Dinheiro", Obs: "club" }),
        comanda({ Comanda: "700000002", Profissional: "PH", Status: "Aberta", "Tipo Pagamento": "", Data: "04/11/2026 10:00" }),
        comanda({ Comanda: "700000003", Profissional: "PH", Status: "Aberta", "Tipo Pagamento": "", Data: "06/11/2026 10:00" }),
        comanda({ Comanda: "700000004", Profissional: "L.F" }),
        comanda({ Comanda: "700000005", Profissional: "L.F + 1" }),
      ]),
      now: NOW,
    });
    assert.deepEqual(
      [preview.counts.toConfirmCount, preview.counts.importedCount, preview.counts.openPastCount, preview.counts.openFutureCount, preview.counts.reviewCount],
      [3, 2, 0, 0, 0],
    );
    const pendingView = await getImportView(db, { batchId, now: NOW });
    if (pendingView?.kind === "PENDING") assert.deepEqual(pendingView.toConfirmByBarber, [{ name: "Paulo", count: 3, totalCents: 13000 }]);

    await confirmImport(db, { batchId, now: NOW });
    const visits = await db.appointment.findMany({ select: { externalId: true, barberId: true }, orderBy: { externalId: "asc" } });
    assert.deepEqual(visits.map((v) => v.externalId), ["700000004", "700000005"]);
    assert.ok(visits.every((v) => v.barberId === luiz), "nenhuma visita do Paulo foi criada");

    const first = await pc("700000001");
    assert.deepEqual([first.status, first.barberId, first.valueCents, first.paymentMethodHint, first.notes, first.importBatchId], ["PENDING", paulo, 5000, "CASH", "club", batchId]);
    assert.equal((await pc("700000003")).status, "PENDING", "agendamento futuro também vira pendência");

    const done = await getImportView(db, { batchId, now: NOW });
    if (done?.kind === "COMPLETED") {
      assert.equal(done.counts.toConfirmCount, 3);
      assert.match(done.warnings.find((w) => w.comanda === "700000005")!.message, /confira se Paulo também lançou/);
    }
  });

  test("fechamento do dia: comandas a confirmar aparecem à parte e NÃO somam no bruto nem no caixa", async () => {
    const day = await getDayClosingView(db, { dayKey: "2026-11-03" });
    // 700000001 (03/11 16:30) é do Paulo e está a confirmar; 700000004 e 700000005 são do Luiz (R$ 40 cada)
    assert.deepEqual(day.toConfirm, [{ barberName: "Paulo", count: 1, totalCents: 5000 }]);
    assert.equal(day.summary.groups.grossCents, 8000);
    assert.equal(day.summary.visitCount, 2);
    assert.equal(day.summary.cashSalesCents, 0, "o pagamento sugerido (Dinheiro) não entra no caixa");
  });

  test("reimportar: PENDING atualiza horário/valor, Cancelada cancela, nada duplica", async () => {
    const { preview } = await importFile([
      { Comanda: "700000001", Profissional: "PH", Valor: "50,00", "Tipo Pagamento": "Dinheiro", Obs: "club" },
      { Comanda: "700000002", Profissional: "PH", Status: "Aberta", "Tipo Pagamento": "", Data: "04/11/2026 11:30", Valor: "80,00" },
      { Comanda: "700000003", Profissional: "PH", Status: "Cancelada", "Tipo Pagamento": "" },
    ]);
    assert.deepEqual([preview.confirmUpdates.length, preview.confirmCancellations.length, preview.counts.toConfirmCount], [1, 1, 0]);
    const updated = await pc("700000002");
    assert.deepEqual([updated.valueCents, updated.scheduledAt.toISOString(), updated.status], [8000, "2026-11-04T14:30:00.000Z", "PENDING"]);
    const cancelled = await pc("700000003");
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.resolvedAt);
    assert.equal(await db.pendingConfirmation.count(), 3);
  });

  test("resolvidas (confirmada, clube, não veio, cancelada) nunca voltam nem mudam", async () => {
    await db.pendingConfirmation.update({ where: { externalId: "700000001" }, data: { status: "CLUB", resolvedAt: NOW } });
    await db.pendingConfirmation.update({ where: { externalId: "700000002" }, data: { status: "NO_SHOW", resolvedAt: NOW } });
    const { preview } = await importFile([
      { Comanda: "700000001", Profissional: "PH", Valor: "99,00", "Tipo Pagamento": "Dinheiro" },
      { Comanda: "700000002", Profissional: "PH", Status: "Aberta", "Tipo Pagamento": "", Valor: "99,00" },
      { Comanda: "700000003", Profissional: "PH", Status: "Aberta", "Tipo Pagamento": "", Valor: "99,00" },
    ]);
    assert.deepEqual([preview.counts.duplicateCount, preview.counts.toConfirmCount, preview.confirmUpdates.length], [3, 0, 0]);
    assert.deepEqual(
      (await db.pendingConfirmation.findMany({ orderBy: { externalId: "asc" } })).map((c) => [c.status, c.valueCents]),
      [["CLUB", 5000], ["NO_SHOW", 8000], ["CANCELLED", 4000]],
    );
  });

  test("lote só com comandas a confirmar (nenhuma visita nova) também é gravado", async () => {
    const { batchId, preview } = await createImportPreview(db, {
      fileName: "so-paulo.xlsx",
      data: buildAppBarberXlsx([
        comanda({ Comanda: "710000001", Profissional: "PH", Status: "Aberta", "Tipo Pagamento": "", Data: "05/11/2026 09:00" }),
        comanda({ Comanda: "710000002", Profissional: "PH", Status: "Aberta", "Tipo Pagamento": "", Data: "05/11/2026 10:00" }),
      ]),
      now: NOW,
    });
    assert.deepEqual([preview.counts.importedCount, preview.counts.toConfirmCount], [0, 2]);
    await confirmImport(db, { batchId, now: NOW });
    assert.equal(await db.pendingConfirmation.count({ where: { externalId: { in: ["710000001", "710000002"] }, status: "PENDING" } }), 2);
    assert.equal((await db.importBatch.findUniqueOrThrow({ where: { id: batchId } })).status, "COMPLETED");
  });

  test("visitas novas têm horário exato e não são de clube por padrão", async () => {
    const v = await db.appointment.findFirstOrThrow({ select: { performedAtApproximate: true, subscriptionVisit: true } });
    assert.deepEqual([v.performedAtApproximate, v.subscriptionVisit], [false, false]);
  });
});
