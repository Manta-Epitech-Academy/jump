import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL!;

// `max` is the per-pod Postgres connection pool size (node-postgres default: 10).
// Each replica opens its own pool, so keep `replicas * max` under Postgres
// `max_connections` (default 100), leaving headroom for cronjobs + the sf worker.
const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DB_POOL_MAX ?? 30),
});

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    // maxWait: how long a transaction waits to ACQUIRE a connection before it
    //   throws "Unable to start a transaction in the given time" (default 2s).
    // timeout: max RUN time once started (default 5s).
    // Both bumped so write bursts queue instead of erroring; the real capacity
    // lever is `max` above, not these.
    transactionOptions: {
      maxWait: Number(process.env.DB_TX_MAX_WAIT_MS ?? 10000),
      timeout: Number(process.env.DB_TX_TIMEOUT_MS ?? 15000),
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
