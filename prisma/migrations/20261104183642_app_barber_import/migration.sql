-- CreateEnum
CREATE TYPE "ClassificationStatus" AS ENUM ('CLASSIFIED', 'PENDING');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "classification" "ClassificationStatus" NOT NULL DEFAULT 'CLASSIFIED',
ADD COLUMN     "price_rule_id" TEXT;

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "cancelled_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duplicate_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "imported_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "open_future_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "open_past_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unclassified_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "price_rules" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rule_items" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "service_id" TEXT,
    "product_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "price_rule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_rules_amount_cents_idx" ON "price_rules"("amount_cents");

-- CreateIndex
CREATE INDEX "price_rule_items_rule_id_idx" ON "price_rule_items"("rule_id");

-- CreateIndex
CREATE INDEX "appointments_classification_performed_at_idx" ON "appointments"("classification", "performed_at");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_price_rule_id_fkey" FOREIGN KEY ("price_rule_id") REFERENCES "price_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rule_items" ADD CONSTRAINT "price_rule_items_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "price_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rule_items" ADD CONSTRAINT "price_rule_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rule_items" ADD CONSTRAINT "price_rule_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Adicionado manualmente (o Prisma não gera CHECK constraints) ───────────
-- Cada item de regra é um serviço OU um produto, nunca os dois nem nenhum.
ALTER TABLE "price_rule_items"
  ADD CONSTRAINT "price_rule_items_service_xor_product"
  CHECK (num_nonnulls("service_id", "product_id") = 1);
