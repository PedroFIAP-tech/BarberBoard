import "dotenv/config";
import { defineConfig } from "prisma/config";

// O Prisma CLI (migrate, db seed, studio) usa a conexão DIRETA do Supabase (porta 5432).
// A aplicação em runtime usa DATABASE_URL (pooler, porta 6543) — ver src/lib/db.ts.
// Usamos process.env (e não env()) para que `prisma generate` funcione sem banco configurado.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
