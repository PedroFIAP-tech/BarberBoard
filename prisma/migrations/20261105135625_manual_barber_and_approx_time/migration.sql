-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "performed_at_approximate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "barbers" ADD COLUMN     "imports_from_app_barber" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "ignored_manual_count" INTEGER NOT NULL DEFAULT 0;

-- ─── Dados (escrito à mão) ──────────────────────────────────────────────────
-- O Paulo (código "PH" no App Barber) nunca fecha comanda: as visitas dele entram por lançamento
-- manual. Não faz nada se não existir barbeiro com esse código.
UPDATE "barbers" SET "imports_from_app_barber" = false WHERE "app_barber_code" = 'PH';
