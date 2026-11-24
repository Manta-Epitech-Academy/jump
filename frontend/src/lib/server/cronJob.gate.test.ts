import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type RequestEvent } from '@sveltejs/kit';

/**
 * The bearer check of every cron job, exercised through each route's own
 * export rather than through `cronJob`.
 *
 * Testing the wrapper alone would prove nothing about a route that does not
 * use it, which is the case this test exists for: a job route added without
 * the check, or with a hand-written variant that gets it wrong, fails here.
 * The database is replaced by a trap, so a route whose body runs without the
 * secret throws instead of writing anything.
 */

const env: { secret: string | undefined } = { secret: 'the-cron-secret' };
vi.mock('$app/env/private', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$app/env/private')>()),
  // Read at import by `auth.ts`, which a job reaches through the rate limiter.
  MICROSOFT_TENANT_ID: '8a1b3c4d-0000-4000-8000-000000000000',
  get CRON_SECRET() {
    return env.secret;
  },
}));

function reached(): never {
  throw new Error('a job body ran without its bearer secret');
}
function trap(): unknown {
  return new Proxy(function () {}, {
    get: (_target, key) => (key === 'then' ? undefined : trap()),
    apply: reached,
  });
}
vi.mock('#lib/server/db.ts', () => ({ prisma: trap() }));

const jobRoutes = import.meta.glob<Record<string, unknown>>(
  '/src/routes/api/jobs/**/+server.ts',
);

async function statusOf(
  handler: (event: RequestEvent) => unknown,
  authorization: string | null,
): Promise<number | 'ran'> {
  const headers = authorization ? { authorization } : undefined;
  const request = new Request('http://localhost/api/jobs/x', {
    method: 'POST',
    headers,
  });
  try {
    await handler({ request } as RequestEvent);
    return 'ran';
  } catch (e) {
    if (isHttpError(e)) return e.status;
    throw e;
  }
}

async function answers(authorization: string | null): Promise<string[]> {
  const lines: string[] = [];
  for (const [file, load] of Object.entries(jobRoutes)) {
    for (const [method, handler] of Object.entries(await load())) {
      if (typeof handler !== 'function') continue;
      const status = await statusOf(
        handler as (event: RequestEvent) => unknown,
        authorization,
      );
      lines.push(`${file} ${method} -> ${status}`);
    }
  }
  return lines;
}

describe('the bearer check of every cron job', () => {
  beforeEach(() => {
    env.secret = 'the-cron-secret';
  });

  it('refuses a call with no Authorization header', async () => {
    const lines = await answers(null);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((l) => !l.endsWith('-> 401'))).toEqual([]);
  });

  it('refuses a wrong token', async () => {
    const lines = await answers('Bearer not-the-cron-secret');
    expect(lines.filter((l) => !l.endsWith('-> 401'))).toEqual([]);
  });

  it('refuses even the right token when CRON_SECRET is unset', async () => {
    env.secret = undefined;
    const lines = await answers('Bearer the-cron-secret');
    expect(lines.filter((l) => !l.endsWith('-> 401'))).toEqual([]);
  });
});

describe('cronJob', () => {
  beforeEach(() => {
    env.secret = 'the-cron-secret';
  });

  it('runs the job for the right token and answers its JSON', async () => {
    const { cronJob } = await import('./cronJob');
    const handler = cronJob('test', async () => ({ success: true, count: 3 }));
    const response = (await handler({
      request: new Request('http://localhost/api/jobs/x', {
        method: 'POST',
        headers: { authorization: 'Bearer the-cron-secret' },
      }),
    } as RequestEvent)) as Response;
    expect(await response.json()).toEqual({ success: true, count: 3 });
  });

  it('answers a bare 500 when the job throws', async () => {
    const { cronJob } = await import('./cronJob');
    const handler = cronJob('test', async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await statusOf(
        handler as (event: RequestEvent) => unknown,
        'Bearer the-cron-secret',
      ),
    ).toBe(500);
  });
});
