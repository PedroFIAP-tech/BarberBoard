// Leituras da importação, já no formato que as telas mostram.
// Nada de Obs nem das linhas cruas do lote: só o necessário para a prévia e o resultado.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  countByProfessional,
  summarizeToImport,
  type ImportSummary,
  type PreviewWarning,
} from "@/domain/import-preview";
import type { PaymentMethodValue, RowError } from "@/importers/app-barber/normalize-row";
import { getImportPreview, type CompletedMeta } from "./service";

type Db = PrismaClient | Prisma.TransactionClient;

export type ImportListItem = {
  id: string;
  fileName: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: Date;
  rowCount: number;
  importedCount: number;
  unclassifiedCount: number;
  errorCount: number;
};

export async function listRecentImports(db: Db, limit = 10): Promise<ImportListItem[]> {
  return db.importBatch.findMany({
    where: { source: "APP_BARBER" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      rowCount: true,
      importedCount: true,
      unclassifiedCount: true,
      errorCount: true,
    },
  });
}

export type VisitRowView = {
  comanda: string;
  performedAt: Date;
  barberName: string;
  valueCents: number;
  paymentMethod: PaymentMethodValue;
  /** Nome da regra que gerou os itens; null = "a classificar". */
  ruleLabel: string | null;
};

export type OpenRowView = { comanda: string; scheduledAt: Date; valueCents: number; professionals: string };

export type Period = { from: Date | null; to: Date | null };

export type PendingImportView = {
  kind: "PENDING";
  batch: { id: string; fileName: string; createdAt: Date };
  period: Period;
  summary: ImportSummary;
  toImport: VisitRowView[];
  review: OpenRowView[];
  openPast: OpenRowView[];
  /** Abertas de hoje com horário já passado, por barbeiro (em andamento, neutro). */
  openTodayByBarber: { name: string; count: number }[];
  openPastByBarber: { name: string; count: number }[];
  openFutureCount: number;
  duplicateCount: number;
  cancelledCount: number;
  /** Comandas novas "a confirmar" por barbeiro (ex.: Paulo: 48 · R$ 2.420,00). Não somam nada. */
  toConfirmByBarber: { name: string; count: number; totalCents: number }[];
  /** Pendências que serão atualizadas (mudaram no App Barber) ou canceladas. */
  confirmUpdatedCount: number;
  confirmCancelledCount: number;
  warnings: PreviewWarning[];
  errors: RowError[];
  barbers: { id: string; name: string }[];
};

export type CompletedImportView = {
  kind: "COMPLETED" | "FAILED";
  batch: { id: string; fileName: string; createdAt: Date; updatedAt: Date };
  period: Period;
  counts: {
    rowCount: number;
    importedCount: number;
    unclassifiedCount: number;
    duplicateCount: number;
    openPastCount: number;
    openFutureCount: number;
    cancelledCount: number;
    reviewCount: number;
    toConfirmCount: number;
    errorCount: number;
  };
  /** Visitas que este lote criou (e o total delas), lidas do banco. */
  created: { count: number; totalCents: number; unclassifiedCount: number };
  warnings: PreviewWarning[];
  errors: RowError[];
};

export type ImportView = PendingImportView | CompletedImportView;

const toPeriod = (p: { from: string | null; to: string | null } | undefined): Period => ({
  from: p?.from ? new Date(p.from) : null,
  to: p?.to ? new Date(p.to) : null,
});

/** Prévia (lote PENDING) ou resultado (lote concluído). null se o lote não existe. */
export async function getImportView(db: Db, input: { batchId: string; now: Date }): Promise<ImportView | null> {
  const batch = await db.importBatch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      status: true,
      fileName: true,
      createdAt: true,
      updatedAt: true,
      meta: true,
      rowCount: true,
      importedCount: true,
      unclassifiedCount: true,
      duplicateCount: true,
      openPastCount: true,
      openFutureCount: true,
      cancelledCount: true,
      reviewCount: true,
      toConfirmCount: true,
      errorCount: true,
    },
  });
  if (!batch) return null;
  if (batch.status === "PENDING") return pendingView(db, input);

  const created = await db.appointment.groupBy({
    by: ["classification"],
    where: { importBatchId: batch.id },
    _count: { _all: true },
    _sum: { totalCents: true },
  });
  const meta = (batch.meta ?? {}) as Partial<CompletedMeta>;

  return {
    kind: batch.status,
    batch: { id: batch.id, fileName: batch.fileName, createdAt: batch.createdAt, updatedAt: batch.updatedAt },
    period: toPeriod(meta.period),
    counts: {
      rowCount: batch.rowCount,
      importedCount: batch.importedCount,
      unclassifiedCount: batch.unclassifiedCount,
      duplicateCount: batch.duplicateCount,
      openPastCount: batch.openPastCount,
      openFutureCount: batch.openFutureCount,
      cancelledCount: batch.cancelledCount,
      reviewCount: batch.reviewCount,
      toConfirmCount: batch.toConfirmCount,
      errorCount: batch.errorCount,
    },
    created: {
      count: created.reduce((s, g) => s + g._count._all, 0),
      totalCents: created.reduce((s, g) => s + (g._sum.totalCents ?? 0), 0),
      unclassifiedCount: created.find((g) => g.classification === "PENDING")?._count._all ?? 0,
    },
    warnings: meta.warnings ?? [],
    errors: meta.errors ?? [],
  };
}

async function pendingView(db: Db, input: { batchId: string; now: Date }): Promise<PendingImportView> {
  const { batch, period, preview } = await getImportPreview(db, input);

  const ruleIds = [...new Set(preview.toImport.map((v) => v.priceRuleId).filter((id): id is string => id !== null))];
  const [barbers, rules] = await Promise.all([
    db.barber.findMany({ where: { active: true }, select: { id: true, name: true, appBarberCode: true }, orderBy: { name: "asc" } }),
    db.priceRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, label: true } }),
  ]);
  const barberName = new Map(barbers.map((b) => [b.id, b.name]));
  const nameByCode = new Map(barbers.filter((b) => b.appBarberCode).map((b) => [b.appBarberCode!, b.name]));
  const ruleLabel = new Map(rules.map((r) => [r.id, r.label]));

  // ["L.F"] + 1 → "Luiz + 1 outro"
  const professionals = (codes: string[], extra = 0) =>
    [...codes.map((c) => nameByCode.get(c) ?? c), ...(extra > 0 ? [`${extra} ${extra === 1 ? "outro" : "outros"}`] : [])].join(
      " + ",
    ) || "—";

  return {
    kind: "PENDING",
    batch,
    period: toPeriod(period),
    summary: summarizeToImport(preview.toImport),
    toImport: preview.toImport
      .map((v) => ({
        comanda: v.externalId,
        performedAt: v.performedAt,
        barberName: barberName.get(v.barberId) ?? "—",
        valueCents: v.totalCents,
        paymentMethod: v.paymentMethod,
        ruleLabel: v.priceRuleId ? (ruleLabel.get(v.priceRuleId) ?? null) : null,
      }))
      .sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime()),
    review: preview.review.map((r) => ({
      comanda: r.comanda,
      scheduledAt: r.scheduledAt,
      valueCents: r.valueCents,
      professionals: professionals(r.professionalCodes, r.extraProfessionals),
    })),
    openPast: preview.openPast
      .map((r) => ({
        comanda: r.comanda,
        scheduledAt: r.scheduledAt,
        valueCents: r.valueCents,
        professionals: professionals(r.professionalCodes),
      }))
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()),
    openPastByBarber: countByProfessional(preview.openPast, nameByCode),
    openTodayByBarber: countByProfessional(preview.openToday, nameByCode),
    openFutureCount: preview.openFuture.length,
    duplicateCount: preview.duplicates.length,
    cancelledCount: preview.cancelled.length,
    toConfirmByBarber: [
      ...preview.toConfirm
        .reduce((acc, c) => {
          const cur = acc.get(c.barberName) ?? { name: c.barberName, count: 0, totalCents: 0 };
          cur.count += 1;
          cur.totalCents += c.valueCents;
          return acc.set(c.barberName, cur);
        }, new Map<string, { name: string; count: number; totalCents: number }>())
        .values(),
    ],
    confirmUpdatedCount: preview.confirmUpdates.length,
    confirmCancelledCount: preview.confirmCancellations.length,
    warnings: preview.warnings,
    errors: preview.errors,
    barbers: barbers.map((b) => ({ id: b.id, name: b.name })),
  };
}
