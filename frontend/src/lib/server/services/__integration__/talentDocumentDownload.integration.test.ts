import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { assertTestDatabase } from './testDatabase';

// The storage as a pod sees it: an internal address the server talks to, and a
// public one the browser can reach. Signing a URL is computed locally, so no S3
// has to answer; what is under test is that the URL the storage signs and the
// origin the route lets a redirect leave for come from the same settings.
const PUBLIC_ENDPOINT = 'https://files.example.invalid';
vi.mock('$app/env/private', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$app/env/private')>()),
  S3_ENDPOINT: 'http://garage.internal:3900',
  S3_PUBLIC_ENDPOINT: PUBLIC_ENDPOINT,
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
}));

const { GET } =
  await import('../../../../routes/(talent)/settings/documents/[type]/+server');

/**
 * A talent opens their signed règlement from their settings, and the route
 * answers with a redirect to a presigned URL on the storage's public address.
 * SvelteKit refuses a redirect to another origin unless that origin is named,
 * so the route names it; without it, every download would be a 500 and nothing
 * else in the suites would notice.
 */
describe('a talent downloading a signed document (integration)', () => {
  let talent: {
    id: string;
    prenom: string;
    nom: string;
    externalId: string | null;
  };

  beforeAll(async () => {
    assertTestDatabase();
    talent = await prisma.talent.create({
      data: {
        prenom: 'Lou',
        nom: `Document ${Date.now()}`,
        onboardingRecords: {
          create: {
            schoolYear: '2026-2027',
            rulesSignedAt: new Date(),
            rulesFilePath: 'onboarding/rules/test-download.pdf',
          },
        },
      },
      select: { id: true, prenom: true, nom: true, externalId: true },
    });
  });

  afterAll(async () => {
    await prisma.talent.deleteMany({ where: { id: talent.id } });
  });

  /** The redirect the route throws, or whatever it threw instead. */
  async function download(): Promise<unknown> {
    try {
      await GET({
        params: { type: 'rules' },
        url: new URL('http://localhost/settings/documents/rules'),
        locals: { talent },
      } as unknown as Parameters<typeof GET>[0]);
    } catch (thrown) {
      return thrown;
    }
    throw new Error('the route answered instead of redirecting');
  }

  it('redirects to the presigned URL on the public address', async () => {
    const thrown = await download();

    if (!isRedirect(thrown)) throw thrown;
    expect(thrown.status).toBe(302);
    const location = new URL(thrown.location);
    expect(location.origin).toBe(PUBLIC_ENDPOINT);
    expect(location.pathname).toBe(
      '/jump-files/onboarding/rules/test-download.pdf',
    );
    expect(location.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });
});
