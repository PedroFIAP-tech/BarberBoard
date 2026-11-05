-- ─── Row Level Security em todas as tabelas (escrita à mão) ──────────────────
-- O Supabase expõe o schema public pela Data API (REST/GraphQL) para quem tiver a URL do projeto
-- e a chave publishable. Com RLS habilitado e SEM policies, os papéis anon/authenticated não leem
-- nem escrevem nada por essa API.
-- O app não é afetado: o Prisma conecta como dono das tabelas (papel postgres), e o dono ignora RLS.
-- Regra do projeto: toda tabela nova entra numa migration com ENABLE ROW LEVEL SECURITY
-- (o teste src/server/db-security.db.test.ts falha se alguma ficar sem).

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "barbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_fees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_rule_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_closings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;
