// Importação do App Barber: a única parte que fala com o banco.
// Recebe o client do Prisma como parâmetro (a app passa `db`; os testes passam um banco temporário).
//
// Fluxo:
//   1. createImportPreview: lê o arquivo, monta a prévia e grava um ImportBatch PENDING com as
//      linhas normalizadas em meta (sem Cliente, Cadastro nem Finalização).
//   2. getImportPreview: refaz a prévia a partir do lote (com os dados atuais do banco).
//   3. confirmImport: numa transação, refaz a prévia, cria as visitas e marca o lote COMPLETED.
//      As linhas saem do meta; ficam as contagens, os erros e os avisos.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { buildImportPreview, type ImportPreview, type PreviewWarning } from "@/domain/import-preview";
import type { PriceRuleInput } from "@/domain/price-rules";
import type { NormalizedRow, PaymentMethodValue, RowError } from "@/importers/app-barber/normalize-row";
import { ImportFileError, parseAppBarberExport } from "@/importers/app-barber/parse";

type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;
const META_VERSION = 1;

export class ImportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportStateError";
  }
}

// ─── Serialização das linhas no ImportBatch.meta ────────────────────────────

type StoredRow = Omit<NormalizedRow, "scheduledAt"> & { scheduledAt: string | null };

type PendingMeta = {
  version: number;
  rows: StoredRow[];
  parseErrors: RowError[];
  unexpectedColumns: string[];
};

export type CompletedMeta = {
  version: number;
  errors: RowError[];
  warnings: PreviewWarning[];
  unexpectedColumns: string[];
  period: { from: string | null; to: string | null };
};

const toStored = (row: NormalizedRow): StoredRow => ({ ...row, scheduledAt: row.scheduledAt?.toISOString() ?? null });
const fromStored = (row: StoredRow): NormalizedRow => ({
  ...row,
  scheduledAt: row.scheduledAt ? new Date(row.scheduledAt) : null,
});

/** Primeiro e último horário (coluna Data) das comandas do arquivo. */
function periodOf(rows: StoredRow[]): { from: string | null; to: string | null } {
  const dates = rows.map((r) => r.scheduledAt).filter((d): d is string => d !== null).sort();
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null };
}

function readPendingMeta(meta: Prisma.JsonValue | null): PendingMeta {
  const m = meta as PendingMeta | null;
  if (!m || m.version !== META_VERSION || !Array.isArray(m.rows)) {
    throw new ImportStateError("Importação sem dados de prévia");
  }
  return m;
}

// ─── Contexto do banco para montar a prévia ─────────────────────────────────

async function loadPreviewContext(db: Db, comandas: string[]) {
  const [existing, barbers, fees, rules, products] = await Promise.all([
    db.appointment.findMany({
      where: { source: "APP_BARBER", externalId: { in: comandas } },
      select: { externalId: true, totalCents: true },
    }),
    db.barber.findMany({ where: { active: true, appBarberCode: { not: null } }, select: { id: true, appBarberCode: true } }),
    db.paymentFee.findMany({ select: { method: true, feeBps: true } }),
    db.priceRule.findMany({ where: { active: true }, include: { items: { orderBy: { sortOrder: "asc" } } } }),
    db.product.findMany({ select: { id: true, costCents: true } }),
  ]);

  const feeBpsByMethod = {} as Record<PaymentMethodValue, number>;
  for (const method of ["PIX", "CASH", "DEBIT", "CREDIT"] as const) {
    const fee = fees.find((f) => f.method === method);
    if (!fee) throw new ImportStateError(`Taxa da forma de pagamento ${method} não cadastrada`);
    feeBpsByMethod[method] = fee.feeBps;
  }

  return {
    existing: new Map(existing.map((a) => [a.externalId!, { totalCents: a.totalCents }])),
    barberIdByCode: new Map(barbers.map((b) => [b.appBarberCode!, b.id])),
    feeBpsByMethod,
    rules: rules.map(
      (r): PriceRuleInput => ({
        id: r.id,
        label: r.label,
        amountCents: r.amountCents,
        active: r.active,
        items: r.items.map((i) => ({
          serviceId: i.serviceId,
          productId: i.productId,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
        })),
      }),
    ),
    productCosts: new Map(products.map((p) => [p.id, p.costCents])),
  };
}

async function previewFromRows(
  db: Db,
  meta: PendingMeta,
  rowCount: number,
  now: Date,
  reviewChoices?: ReadonlyMap<string, string>,
): Promise<ImportPreview> {
  const rows = meta.rows.map(fromStored);
  const context = await loadPreviewContext(db, rows.map((r) => r.comanda));
  return buildImportPreview({ rowCount, rows, parseErrors: meta.parseErrors, now, reviewChoices, ...context });
}

// ─── API ────────────────────────────────────────────────────────────────────

export async function createImportPreview(
  db: PrismaClient,
  input: { fileName: string; data: Uint8Array; now: Date },
): Promise<{ batchId: string; preview: ImportPreview }> {
  if (input.data.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError("Arquivo maior que 4 MB. Exporte um período menor.");
  }
  const parsed = parseAppBarberExport(input.data);
  const meta: PendingMeta = {
    version: META_VERSION,
    rows: parsed.rows.map(toStored),
    parseErrors: parsed.errors,
    unexpectedColumns: parsed.unexpectedColumns,
  };
  const preview = await previewFromRows(db, meta, parsed.rowCount, input.now);

  const batch = await db.importBatch.create({
    data: {
      source: "APP_BARBER",
      fileName: input.fileName.slice(0, 255),
      status: "PENDING",
      ...preview.counts,
      meta: meta as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { batchId: batch.id, preview };
}

export async function getImportPreview(
  db: Db,
  input: { batchId: string; now: Date; reviewChoices?: ReadonlyMap<string, string> },
) {
  const batch = await db.importBatch.findUnique({ where: { id: input.batchId } });
  if (!batch) throw new ImportStateError("Importação não encontrada");
  if (batch.status !== "PENDING") throw new ImportStateError("Esta importação já foi concluída");
  const meta = readPendingMeta(batch.meta);
  const preview = await previewFromRows(db, meta, batch.rowCount, input.now, input.reviewChoices);
  return {
    batch: { id: batch.id, fileName: batch.fileName, createdAt: batch.createdAt },
    period: periodOf(meta.rows),
    preview,
  };
}

/** Descarta uma prévia não confirmada. Lote já concluído nunca é apagado (devolve false). */
export async function discardImport(db: Db, batchId: string): Promise<boolean> {
  const { count } = await db.importBatch.deleteMany({ where: { id: batchId, status: "PENDING" } });
  return count > 0;
}

export async function confirmImport(
  db: PrismaClient,
  input: { batchId: string; now: Date; reviewChoices?: ReadonlyMap<string, string> },
): Promise<{ batchId: string; counts: ImportPreview["counts"] }> {
  return db.$transaction(
    async (tx) => {
      // Trava o lote: duas confirmações simultâneas do mesmo arquivo não criam visitas em dobro.
      const locked = await tx.importBatch.updateMany({
        where: { id: input.batchId, status: "PENDING" },
        data: { updatedAt: input.now },
      });
      if (locked.count === 0) throw new ImportStateError("Importação não encontrada ou já concluída");

      const batch = await tx.importBatch.findUniqueOrThrow({ where: { id: input.batchId } });
      const meta = readPendingMeta(batch.meta);
      const preview = await previewFromRows(tx, meta, batch.rowCount, input.now, input.reviewChoices);

      if (preview.toImport.length > 0) {
        const created = await tx.appointment.createManyAndReturn({
          data: preview.toImport.map((v) => ({
            performedAt: v.performedAt,
            barberId: v.barberId,
            paymentMethod: v.paymentMethod,
            feeBps: v.feeBps,
            totalCents: v.totalCents,
            feeCents: v.feeCents,
            netCents: v.netCents,
            notes: v.notes,
            source: "APP_BARBER" as const,
            externalId: v.externalId,
            importBatchId: batch.id,
            classification: v.classification,
            priceRuleId: v.priceRuleId,
          })),
          select: { id: true, externalId: true },
        });
        const idByExternal = new Map(created.map((a) => [a.externalId!, a.id]));

        const items = preview.toImport.flatMap((v) =>
          v.items.map((item) => ({ appointmentId: idByExternal.get(v.externalId)!, ...item })),
        );
        if (items.length > 0) await tx.appointmentItem.createMany({ data: items });
      }

      const completed: CompletedMeta = {
        version: META_VERSION,
        errors: preview.errors,
        warnings: preview.warnings,
        unexpectedColumns: meta.unexpectedColumns,
        period: periodOf(meta.rows),
      };
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: "COMPLETED", ...preview.counts, meta: completed as unknown as Prisma.InputJsonValue },
      });

      return { batchId: batch.id, counts: preview.counts };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
