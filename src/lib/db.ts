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

/**
 * Client do Prisma da aplicação. Criado no primeiro uso (e não ao importar o módulo),
 * para que o `next build` funcione mesmo sem DATABASE_URL no ambiente de build.
 */
export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrismaClient();
  return globalForPrisma.prisma;
}
