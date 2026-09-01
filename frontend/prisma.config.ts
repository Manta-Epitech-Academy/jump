import path from 'node:path';
import dotenv from 'dotenv';

// Load .env from project root (one level up from frontend/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { defineConfig, env } from 'prisma/config';

// No `migrations.seed` entry, deliberately. `prisma db seed` was declared twice
// here and in package.json, with two different commands, and nothing ever ran it
// in a deployed environment: the container's CMD is `migrate deploy` and nothing
// else. The generator is a named script instead (`bun run seed`), which is also
// what frees it to import `src/lib/domain` - the standalone rule the old seed
// carried existed only because `prisma/` ships in the image and `src/` does not.

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
