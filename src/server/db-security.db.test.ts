// Garante que TODA tabela do schema public tem Row Level Security habilitado.
// Sem RLS, a Data API do Supabase expõe a tabela para quem tiver a URL e a chave publishable.
// Se este teste falhar: a migration que criou a tabela precisa de
//   ALTER TABLE "<tabela>" ENABLE ROW LEVEL SECURITY;
// Só roda com TEST_DATABASE_URL local (use `pnpm test:db`).

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const DB_URL = process.env.TEST_DATABASE_URL;
const isLocal = (() => {
  try {
    return !!DB_URL && ["localhost", "127.0.0.1"].includes(new URL(DB_URL).hostname);
  } catch {
    return false;
  }
})();

let db: PrismaClient;

before(() => {
  if (isLocal) db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
});

after(async () => {
  await db?.$disconnect();
});

test("toda tabela do schema public tem RLS habilitado", { skip: !isLocal && "TEST_DATABASE_URL ausente ou não local" }, async () => {
  const tables = await db.$queryRawUnsafe<{ name: string; rls: boolean }[]>(`
    SELECT c.relname AS name, c.relrowsecurity AS rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname`);

  assert.ok(tables.length >= 13, `esperava as 12 tabelas do app + _prisma_migrations, achei ${tables.length}`);
  const withoutRls = tables.filter((t) => !t.rls).map((t) => t.name);
  assert.deepEqual(withoutRls, [], `tabelas sem RLS: ${withoutRls.join(", ")}`);
});
