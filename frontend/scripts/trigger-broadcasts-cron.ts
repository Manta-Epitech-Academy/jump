/**
 * Trigger the broadcast-queue worker endpoint locally.
 *
 * Polls `POST /api/jobs/broadcasts/process` with the `CRON_SECRET` from
 * the repo `.env`, so you don't have to copy the token by hand. By
 * default it drains the queue (loops until the server reports
 * `processed: false`), with a small back-off between calls.
 *
 *   Usage:
 *     bun run scripts/trigger-broadcasts-cron.ts                # drain
 *     bun run scripts/trigger-broadcasts-cron.ts --once         # single tick
 *     bun run scripts/trigger-broadcasts-cron.ts --url=http://staging.example.com
 *
 *   Env (read from .env, can be overridden via shell):
 *     CRON_SECRET   : required
 *     ORIGIN        : base URL; falls back to http://localhost:3030
 *
 * Exit codes:
 *   0   queue drained (or single tick succeeded)
 *   1   missing/invalid CRON_SECRET, transport error, or non-2xx response
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_URL = 'http://localhost:3030';
const POLL_DELAY_MS = 500;
const MAX_ITERATIONS = 1000;

interface Args {
  once: boolean;
  url: string;
}

function parseArgs(): Args {
  const args: Args = {
    once: false,
    url: process.env.ORIGIN || DEFAULT_URL,
  };
  for (const raw of process.argv.slice(2)) {
    if (raw === '--once') {
      args.once = true;
    } else if (raw.startsWith('--url=')) {
      args.url = raw.slice('--url='.length);
    } else if (raw === '--help' || raw === '-h') {
      console.log(
        [
          'Usage: bun run scripts/trigger-broadcasts-cron.ts [--once] [--url=<base>]',
          '',
          '  --once        Fire a single request and exit (default: drain queue).',
          '  --url=<base>  Override the server base URL (default: $ORIGIN or http://localhost:3030).',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${raw}`);
      process.exit(1);
    }
  }
  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tick(
  baseUrl: string,
  secret: string,
): Promise<{ processed: boolean; broadcastId?: string }> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/jobs/broadcasts/process`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`,
    );
  }

  const data = (await response.json()) as {
    processed: boolean;
    broadcastId?: string;
  };
  return data;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      'CRON_SECRET is not set in .env: add one and restart the dev server.',
    );
    process.exit(1);
  }

  console.log(`→ ${args.url}/api/jobs/broadcasts/process`);

  let processedCount = 0;
  let iterations = 0;
  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    const result = await tick(args.url, secret);
    if (result.processed && result.broadcastId) {
      processedCount += 1;
      console.log(`  ✓ processed broadcast ${result.broadcastId}`);
      if (args.once) break;
      await sleep(POLL_DELAY_MS);
      continue;
    }
    console.log(
      processedCount === 0
        ? '  · queue empty: nothing to process.'
        : `  · queue drained: ${processedCount} broadcast(s) processed.`,
    );
    break;
  }

  if (iterations >= MAX_ITERATIONS) {
    console.error(
      `Stopped after ${MAX_ITERATIONS} iterations as a safety net: check the queue manually.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
