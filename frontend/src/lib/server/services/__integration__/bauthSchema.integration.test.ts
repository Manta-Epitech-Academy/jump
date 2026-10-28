/**
 * The `bauth_*` tables are BetterAuth's, generated from its models rather than
 * authored here, so a BetterAuth bump can change what it writes without
 * anything in this codebase noticing. It has happened twice. 1.7.0 started
 * writing a required `bauth_account.issuer` that the schema lacked (#296), and
 * 1.7.3 stopped writing it again while our migration had made it NOT NULL:
 * both times every Microsoft sign-in failed, at query time, in production.
 *
 * BetterAuth checks this itself at startup for its Kysely and Drizzle adapters,
 * and rejects requests on a mismatch. Its Prisma adapter registers no such
 * check, so this test runs the same comparison (`diffSchema`, against what
 * `getExpectedSchema` says this configuration writes) on the migrated test
 * database. It fails on the bump that drifts, naming the table and column,
 * instead of on the first insert in production.
 *
 * `microsoftOAuthCallback.integration.test.ts` stays the round-trip proof on
 * top of this one: it drives a real callback through BetterAuth.
 */
import { describe, it, expect } from 'vitest';
import {
  diffSchema,
  formatSchemaFinding,
  getExpectedSchema,
  type IntrospectedTable,
} from '@better-auth/core/db/internal';
import { createAuthOptions } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';

type ColumnRow = {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
};

describe('BetterAuth tables (integration)', () => {
  it('hold every column the installed BetterAuth writes, and require none it never writes', async () => {
    assertTestDatabase();

    const expected = getExpectedSchema(createAuthOptions());
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT table_name, column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY(${Object.keys(expected)})`;

    const tables = new Map<string, IntrospectedTable>();
    for (const row of rows) {
      const table = tables.get(row.table_name) ?? {
        name: row.table_name,
        columns: [],
      };
      table.columns.push({
        name: row.column_name,
        nullable: row.is_nullable === 'YES',
        hasDefault: row.column_default !== null,
      });
      tables.set(row.table_name, table);
    }

    const findings = diffSchema(expected, [...tables.values()]).map((finding) =>
      formatSchemaFinding(finding, 'prisma'),
    );
    expect(findings).toEqual([]);
  });
});
