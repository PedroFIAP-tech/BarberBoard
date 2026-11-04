import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Em runtime a app usa DATABASE_URL (pooler do Supabase, porta 6543).
// O Prisma CLI usa DIRECT_URL — ver prisma.config.ts.
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida. Veja o .env.example.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Reaproveita a mesma instância entre hot reloads do `next dev`,
// evitando abrir uma conexão nova a cada alteração de arquivo.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
