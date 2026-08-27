/**
 * The Prisma client the E2E fixtures write with.
 *
 * Its own client rather than `$lib/server/db`: this file runs under Playwright's
 * Node runner, outside Vite, so the `$lib` alias does not resolve and the pool
 * tuning that matters for a pod does not matter for a seeder.
 *
 * The safety rail is deliberately NOT its own copy. `assertTestDatabase` lives
 * with the integration suites and is imported here across the tree, because what
 * it protects is identical on both sides: the worktrees on a dev machine share
 * one Postgres, so "the wrong DATABASE_URL" is a realistic accident, and this
 * seeder writes talents, staff and events exactly like they do. Two copies of
 * that rule would be two chances to relax one of them.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertTestDatabase } from '../../../src/lib/server/services/__integration__/testDatabase';

assertTestDatabase();

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
