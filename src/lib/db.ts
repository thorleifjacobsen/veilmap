import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { db?: PrismaClient };
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://veilmap:password@localhost:5432/veilmap';
const adapter = new PrismaPg({ connectionString: DATABASE_URL });

export const db = globalForPrisma.db ?? new PrismaClient({
  adapter,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.db = db;
}
