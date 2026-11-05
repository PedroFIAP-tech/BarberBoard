-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CLUB', 'NO_SHOW', 'CANCELLED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "subscription_visit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (escrito à mão: RENAME em vez de DROP + ADD, para manter a contagem dos lotes já gravados)
-- As comandas do Paulo deixaram de ser "ignoradas" e passaram a ficar "a confirmar".
ALTER TABLE "import_batches" RENAME COLUMN "ignored_manual_count" TO "to_confirm_count";

-- CreateTable
CREATE TABLE "pending_confirmations" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "barber_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "value_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "payment_method_hint" "PaymentMethod",
    "status" "ConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "appointment_id" TEXT,
    "import_batch_id" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pending_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_confirmations_external_id_key" ON "pending_confirmations"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_confirmations_appointment_id_key" ON "pending_confirmations"("appointment_id");

-- CreateIndex
CREATE INDEX "pending_confirmations_status_scheduled_at_idx" ON "pending_confirmations"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "pending_confirmations_barber_id_scheduled_at_idx" ON "pending_confirmations"("barber_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "pending_confirmations" ADD CONSTRAINT "pending_confirmations_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_confirmations" ADD CONSTRAINT "pending_confirmations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_confirmations" ADD CONSTRAINT "pending_confirmations_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Row Level Security (escrito à mão; regra do projeto: toda tabela nova) ──
ALTER TABLE "pending_confirmations" ENABLE ROW LEVEL SECURITY;
