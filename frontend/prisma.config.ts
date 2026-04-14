import path from 'node:path';
import dotenv from 'dotenv';

// Load .env from project root (one level up from frontend/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'bun ./prisma/seed.ts',
  },
});
