// Prévia da importação do App Barber (puro, sem Prisma): decide o destino de cada comanda.
//
//   Fechada nova, profissional conhecido ...... importa (itens pela regra, ou "a classificar")
//   Fechada já importada (mesmo externalId) ... não duplica
//   Só de barbeiro que não fecha comanda ...... "a confirmar" (Paulo): Aberta (qualquer data) ou
//                                               Fechada viram PendingConfirmation, não visita
//   Já é "a confirmar" (mesma comanda) ........ PENDING: atualiza horário/valor ou cancela;
//                                               confirmada/clube/não veio/cancelada: nunca volta
//   Fechada com vários profissionais .......... revisar: o usuário escolhe o barbeiro
//     (se, tirando os barbeiros manuais, sobra um só que importa → entra com ele, com aviso)
//   Aberta com data passada ................... pendente: "finalize no App Barber"
//   Aberta com data futura .................... agendada (só conta)
//   Cancelada ................................. ignorada
//   Profissional desconhecido / dado inválido . erro

import type { NormalizedRow, PaymentMethodValue, RowError } from "@/importers/app-barber/normalize-row";
import { toDayKeyBR } from "@/lib/dates";
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
  /** Comandas NOVAS que vão para "a confirmar". */
  toConfirmCount: number;
  errorCount: number;
};

export type ConfirmationStatusValue = "PENDING" | "CONFIRMED" | "CLUB" | "NO_SHOW" | "CANCELLED";

/** Comanda de barbeiro que não fecha comanda: vira PendingConfirmation (não conta em nenhuma soma). */
export type PlannedConfirmation = {
  rowNumber: number;
  externalId: string;
  barberId: string;
  barberName: string;
  scheduledAt: Date;
  valueCents: number;
  notes: string | null;
  /** Só quando a comanda veio Fechada. */
  paymentMethodHint: PaymentMethodValue | null;
  /** Regra de valor que se aplicaria (só para exibir; é reaplicada ao confirmar). */
  suggestedRuleLabel: string | null;
};

export type ImportPreview = {
  toImport: PlannedVisit[];
  duplicates: DuplicateRow[];
  /** Abertas de DIAS ANTERIORES: pendentes, "finalize no App Barber". */
  openPast: OpenRow[];
  /** Abertas de HOJE com horário já passado: em andamento (o Luiz fecha no fim do dia). */
  openToday: OpenRow[];
  openFuture: OpenRow[];
  cancelled: RowRef[];
  review: ReviewRow[];
  /** Comandas novas "a confirmar" (barbeiro que não fecha comanda). */
  toConfirm: PlannedConfirmation[];
  /** Pendências PENDING que mudaram de horário/valor no App Barber (serão atualizadas). */
  confirmUpdates: (RowRef & { scheduledAt: Date; valueCents: number })[];
  /** Pendências PENDING que vieram Canceladas (passam para CANCELLED e saem da lista). */
  confirmCancellations: RowRef[];
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
  /** Barber.appBarberCode → Barber.id (só barbeiros ativos que IMPORTAM do App Barber). */
  barberIdByCode: ReadonlyMap<string, string>;
  /** Barbeiros ativos que NÃO fecham comanda (importsFromAppBarber = false): código → id e nome. */
  manualBarbers?: ReadonlyMap<string, { id: string; name: string }>;
  /** Comandas que já são "a confirmar" (qualquer status), pela chave da comanda. */
  existingConfirmations?: ReadonlyMap<string, { status: ConfirmationStatusValue; scheduledAt: Date; valueCents: number }>;
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
    openToday: [],
    openFuture: [],
    cancelled: [],
    review: [],
    toConfirm: [],
    confirmUpdates: [],
    confirmCancellations: [],
    errors: [...input.parseErrors],
    warnings: [],
  };
  const validBarberIds = new Set(input.barberIdByCode.values());
  const manual = input.manualBarbers ?? new Map<string, { id: string; name: string }>();
  const manualNames = [...manual.values()].map((b) => b.name).join(" ou ");
  const confirmations = input.existingConfirmations ?? new Map();

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

    // Já é "a confirmar": só a PENDING acompanha o App Barber; as resolvidas nunca voltam.
    const confirmation = confirmations.get(row.comanda);
    if (confirmation) {
      if (confirmation.status === "PENDING" && row.status === "CANCELLED") {
        preview.confirmCancellations.push(ref);
      } else if (
        confirmation.status === "PENDING" &&
        row.scheduledAt &&
        (row.scheduledAt.getTime() !== confirmation.scheduledAt.getTime() || row.valueCents !== confirmation.valueCents)
      ) {
        preview.confirmUpdates.push({ ...ref, scheduledAt: row.scheduledAt, valueCents: row.valueCents });
      } else {
        preview.duplicates.push({ ...ref, status: row.status, valueChanged: false });
      }
      continue;
    }

    if (row.status === "CANCELLED") {
      preview.cancelled.push(ref);
      continue;
    }

    // Comanda (Aberta de qualquer data, ou Fechada) só de barbeiro que não fecha comanda:
    // vai para "a confirmar". "PH + 1" NÃO entra aqui: o "+1" pode ser um barbeiro que importa.
    if (
      row.professionalCodes.length > 0 &&
      row.extraProfessionals === 0 &&
      row.professionalCodes.every((code) => manual.has(code))
    ) {
      const barber = manual.get(row.professionalCodes[0])!;
      const suggestion = suggestForAmount(row.valueCents, input.rules);
      preview.toConfirm.push({
        rowNumber: row.rowNumber,
        externalId: row.comanda,
        barberId: barber.id,
        barberName: barber.name,
        scheduledAt: row.scheduledAt!,
        valueCents: row.valueCents,
        notes: row.notes,
        paymentMethodHint: row.status === "CLOSED" ? row.paymentMethod : null,
        suggestedRuleLabel: suggestion.kind === "RULE" ? suggestion.rule.label : null,
      });
      continue;
    }

    const unknown = row.professionalCodes.filter((code) => !input.barberIdByCode.has(code) && !manual.has(code));
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
      const target =
        row.scheduledAt! >= input.now
          ? preview.openFuture
          : toDayKeyBR(row.scheduledAt!) === toDayKeyBR(input.now)
            ? preview.openToday
            : preview.openPast;
      target.push(open);
      continue;
    }

    // Fechada nova.
    const multiple = row.professionalCodes.length > 1 || row.extraProfessionals > 0;

    // Vários profissionais: os barbeiros manuais saem da conta. Se sobra um único que importa,
    // a comanda é dele — com "+N" sem nome, só quando não existe outro barbeiro que importa
    // (aí o "+N" só pode ser alguém que lança manualmente). Fica um aviso: o outro pode ter lançado.
    const importing = row.professionalCodes.filter((code) => input.barberIdByCode.has(code));
    const droppedManual = row.professionalCodes.some((code) => manual.has(code));
    if (
      multiple &&
      importing.length === 1 &&
      (row.extraProfessionals === 0 ? droppedManual : input.barberIdByCode.size === 1 && manual.size > 0)
    ) {
      preview.toImport.push(planVisit(row, input.barberIdByCode.get(importing[0])!, input));
      preview.warnings.push({
        ...ref,
        message:
          row.extraProfessionals > 0
            ? `Comanda com outro profissional (+${row.extraProfessionals}): confira se ${manualNames} também lançou este cliente`
            : `Comanda também com ${row.professionalCodes.filter((c) => manual.has(c)).map((c) => manual.get(c)!.name).join(", ")}: confira se ele também lançou este cliente`,
      });
      continue;
    }

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
    // Comanda de assinante fechada com valor: pode ser dinheiro que não entrou (já pagou a mensalidade).
    if (row.valueCents > 0 && row.notes && /club/i.test(row.notes)) {
      preview.warnings.push({ ...ref, message: "Comanda de clube fechada com valor: confira se o cliente pagou ou é assinante" });
    }
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
      toConfirmCount: preview.toConfirm.length,
      errorCount: preview.errors.length,
    },
  };
}

// ─── Resumos para a tela ────────────────────────────────────────────────────

export type ImportSummary = {
  classified: { count: number; totalCents: number };
  unclassified: { count: number; totalCents: number };
  total: { count: number; totalCents: number };
};

/** Quantas visitas entram já com itens e quantas entram "a classificar", com as somas. */
export function summarizeToImport(visits: Pick<PlannedVisit, "classification" | "totalCents">[]): ImportSummary {
  const summary: ImportSummary = {
    classified: { count: 0, totalCents: 0 },
    unclassified: { count: 0, totalCents: 0 },
    total: { count: 0, totalCents: 0 },
  };
  for (const v of visits) {
    const bucket = v.classification === "CLASSIFIED" ? summary.classified : summary.unclassified;
    bucket.count += 1;
    bucket.totalCents += v.totalCents;
    summary.total.count += 1;
    summary.total.totalCents += v.totalCents;
  }
  return summary;
}

export const NO_PROFESSIONAL = "Sem profissional";

/**
 * Contagem por barbeiro (ex.: pendentes no App Barber: "Paulo: 48 · Luiz: 42").
 * Comanda com vários profissionais conta para cada um; código sem barbeiro cadastrado aparece
 * pelo próprio código. Ordem: mais comandas primeiro, empate por nome.
 */
export function countByProfessional(
  rows: Pick<OpenRow, "professionalCodes">[],
  nameByCode: ReadonlyMap<string, string>,
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const names = row.professionalCodes.length > 0 ? row.professionalCodes.map((c) => nameByCode.get(c) ?? c) : [NO_PROFESSIONAL];
    for (const name of new Set(names)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
}
