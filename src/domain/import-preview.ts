// Prévia da importação do App Barber (puro, sem Prisma): decide o destino de cada comanda.
//
//   Fechada nova, profissional conhecido ...... importa (itens pela regra, ou "a classificar")
//   Fechada já importada (mesmo externalId) ... não duplica
//   Fechada com vários profissionais .......... revisar: o usuário escolhe o barbeiro
//   Aberta com data passada ................... pendente: "finalize no App Barber"
//   Aberta com data futura .................... agendada (só conta)
//   Cancelada ................................. ignorada
//   Profissional desconhecido / dado inválido . erro

import type { NormalizedRow, PaymentMethodValue, RowError } from "@/importers/app-barber/normalize-row";
import { calcFee } from "./pricing";
import { itemsFromRule, suggestForAmount, type ItemDraft, type PriceRuleInput } from "./price-rules";

export type ClassificationValue = "CLASSIFIED" | "PENDING";

export type PlannedVisit = {
  rowNumber: number;
  externalId: string;
  performedAt: Date;
  barberId: string;
  paymentMethod: PaymentMethodValue;
  feeBps: number;
  totalCents: number;
  feeCents: number;
  netCents: number;
  notes: string | null;
  classification: ClassificationValue;
  priceRuleId: string | null;
  /** Como os itens foram (ou não) definidos. */
  suggestion: "RULE" | "NONE" | "AMBIGUOUS";
  items: ItemDraft[];
};

type RowRef = { rowNumber: number; comanda: string };

export type ReviewRow = RowRef & {
  scheduledAt: Date;
  valueCents: number;
  professionalCodes: string[];
  extraProfessionals: number;
};

export type OpenRow = RowRef & { scheduledAt: Date; valueCents: number; professionalCodes: string[] };

export type DuplicateRow = RowRef & {
  status: NormalizedRow["status"];
  /** O valor no App Barber mudou desde a importação (não é atualizado automaticamente). */
  valueChanged: boolean;
};

export type PreviewWarning = RowRef & { message: string };

export type PreviewCounts = {
  rowCount: number;
  importedCount: number;
  unclassifiedCount: number;
  duplicateCount: number;
  openPastCount: number;
  openFutureCount: number;
  cancelledCount: number;
  reviewCount: number;
  errorCount: number;
};

export type ImportPreview = {
  toImport: PlannedVisit[];
  duplicates: DuplicateRow[];
  openPast: OpenRow[];
  openFuture: OpenRow[];
  cancelled: RowRef[];
  review: ReviewRow[];
  errors: RowError[];
  warnings: PreviewWarning[];
  counts: PreviewCounts;
};

export type PreviewInput = {
  rowCount: number;
  rows: NormalizedRow[];
  /** Erros que o parser já encontrou (entram na lista de erros da prévia). */
  parseErrors: RowError[];
  now: Date;
  /** Comandas já importadas (externalId → total salvo). */
  existing: ReadonlyMap<string, { totalCents: number }>;
  /** Barber.appBarberCode → Barber.id (só barbeiros ativos). */
  barberIdByCode: ReadonlyMap<string, string>;
  feeBpsByMethod: Readonly<Record<PaymentMethodValue, number>>;
  rules: PriceRuleInput[];
  productCosts: ReadonlyMap<string, number | null>;
  /** Barbeiro escolhido na prévia para comandas com vários profissionais (comanda → Barber.id). */
  reviewChoices?: ReadonlyMap<string, string>;
};

/** Visita CLASSIFIED tem itens que somam o total; PENDING não tem itens. */
export function assertVisitItemsConsistent(visit: Pick<PlannedVisit, "externalId" | "classification" | "totalCents" | "items">) {
  const sum = visit.items.reduce((s, i) => s + i.totalCents, 0);
  if (visit.classification === "CLASSIFIED" && (visit.items.length === 0 || sum !== visit.totalCents)) {
    throw new Error(`Comanda ${visit.externalId}: itens (${sum}) não fecham com o total (${visit.totalCents})`);
  }
  if (visit.classification === "PENDING" && visit.items.length > 0) {
    throw new Error(`Comanda ${visit.externalId}: visita a classificar não pode ter itens`);
  }
}

function planVisit(row: NormalizedRow, barberId: string, input: PreviewInput): PlannedVisit {
  const paymentMethod = row.paymentMethod!;
  const feeBps = input.feeBpsByMethod[paymentMethod];
  const { feeCents, netCents } = calcFee(row.valueCents, feeBps);
  const suggestion = suggestForAmount(row.valueCents, input.rules);

  const visit: PlannedVisit = {
    rowNumber: row.rowNumber,
    externalId: row.comanda,
    performedAt: row.scheduledAt!,
    barberId,
    paymentMethod,
    feeBps,
    totalCents: row.valueCents,
    feeCents,
    netCents,
    notes: row.notes,
    classification: suggestion.kind === "RULE" ? "CLASSIFIED" : "PENDING",
    priceRuleId: suggestion.kind === "RULE" ? suggestion.rule.id : null,
    suggestion: suggestion.kind,
    items: suggestion.kind === "RULE" ? itemsFromRule(suggestion.rule, input.productCosts) : [],
  };
  assertVisitItemsConsistent(visit);
  return visit;
}

export function buildImportPreview(input: PreviewInput): ImportPreview {
  const preview: Omit<ImportPreview, "counts"> = {
    toImport: [],
    duplicates: [],
    openPast: [],
    openFuture: [],
    cancelled: [],
    review: [],
    errors: [...input.parseErrors],
    warnings: [],
  };
  const validBarberIds = new Set(input.barberIdByCode.values());

  for (const row of input.rows) {
    const ref = { rowNumber: row.rowNumber, comanda: row.comanda };
    const saved = input.existing.get(row.comanda);

    if (saved) {
      const valueChanged = row.status === "CLOSED" && saved.totalCents !== row.valueCents;
      preview.duplicates.push({ ...ref, status: row.status, valueChanged });
      if (row.status !== "CLOSED") {
        const statusNow = row.status === "CANCELLED" ? "Cancelada" : "Aberta";
        preview.warnings.push({ ...ref, message: `Já importada como Fechada, mas agora está ${statusNow} no App Barber` });
      } else if (valueChanged) {
        preview.warnings.push({ ...ref, message: "Já importada, mas o valor mudou no App Barber (não foi atualizado)" });
      }
      continue;
    }

    if (row.status === "CANCELLED") {
      preview.cancelled.push(ref);
      continue;
    }

    const unknown = row.professionalCodes.filter((code) => !input.barberIdByCode.has(code));
    if (unknown.length > 0) {
      preview.errors.push({
        ...ref,
        field: "Profissional",
        message: `Profissional desconhecido: ${unknown.map((c) => `"${c}"`).join(", ")}. Cadastre o código do App Barber no barbeiro.`,
      });
      continue;
    }

    if (row.status === "OPEN") {
      const open: OpenRow = { ...ref, scheduledAt: row.scheduledAt!, valueCents: row.valueCents, professionalCodes: row.professionalCodes };
      (row.scheduledAt! < input.now ? preview.openPast : preview.openFuture).push(open);
      continue;
    }

    // Fechada nova.
    const multiple = row.professionalCodes.length > 1 || row.extraProfessionals > 0;
    if (multiple) {
      const choice = input.reviewChoices?.get(row.comanda);
      if (choice === undefined) {
        preview.review.push({
          ...ref,
          scheduledAt: row.scheduledAt!,
          valueCents: row.valueCents,
          professionalCodes: row.professionalCodes,
          extraProfessionals: row.extraProfessionals,
        });
        continue;
      }
      if (!validBarberIds.has(choice)) {
        preview.errors.push({ ...ref, field: "Profissional", message: "Barbeiro escolhido na revisão não existe" });
        continue;
      }
      preview.toImport.push(planVisit(row, choice, input));
      continue;
    }

    preview.toImport.push(planVisit(row, input.barberIdByCode.get(row.professionalCodes[0])!, input));
  }

  preview.errors.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    ...preview,
    counts: {
      rowCount: input.rowCount,
      importedCount: preview.toImport.length,
      unclassifiedCount: preview.toImport.filter((v) => v.classification === "PENDING").length,
      duplicateCount: preview.duplicates.length,
      openPastCount: preview.openPast.length,
      openFutureCount: preview.openFuture.length,
      cancelledCount: preview.cancelled.length,
      reviewCount: preview.review.length,
      errorCount: preview.errors.length,
    },
  };
}
