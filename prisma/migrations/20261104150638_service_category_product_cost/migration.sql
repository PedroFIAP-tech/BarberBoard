-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('MAIN', 'EXTRA');

-- AlterTable
ALTER TABLE "appointment_items" ADD COLUMN     "unit_cost_cents" INTEGER;

-- AlterTable
ALTER TABLE "barbers" ADD COLUMN     "app_barber_code" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cost_cents" INTEGER;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "category" "ServiceCategory" NOT NULL DEFAULT 'MAIN';

-- CreateIndex
CREATE UNIQUE INDEX "barbers_app_barber_code_key" ON "barbers"("app_barber_code");
