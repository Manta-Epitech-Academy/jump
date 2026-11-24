import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { parentSignatureFormId } from '#lib/validation/parentSignature.ts';
import { assertTestDatabase } from './testDatabase';
import { drainOnboardingPdfJobs } from './onboardingPdfJobs';

/**
 * A guardian's signature, through the three actions that take one. What is
 * pinned is what the server refuses on its own: before these actions shared a
 * schema, the règlement's acceptance was checked only by the browser, and any
 * relationship a client posted went into the signed PDF. Puppeteer and S3 are
 * stubbed, as in `imageRightsAnnual.integration.test.ts`; the rest is the real
 * write path against the real database.
 */

vi.mock('../onboardingDocumentGenerator', () => ({
  generateOnboardingPDF: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock('#lib/server/infra/storage.ts', () => ({
  getStorage: () => ({
    save: async (key: string) => key,
    get: async () => Buffer.from([]),
    delete: async () => {},
    getDownloadUrl: async (key: string) => `https://example.invalid/${key}`,
  }),
  isObjectNotFound: () => false,
}));

const { runOnboardingPdfJob } = await import('../onboardingPdfJobService');
const reglement =
  await import('../../../../routes/(parent)/parent/reglement/+page.server');
const signature =
  await import('../../../../routes/(parent)/parent/signature/+page.server');
const enfant =
  await import('../../../../routes/(parent)/parent/enfant/[talentId]/+page.server');

const stamp = Date.now();
const guardian = `parent.sig.${stamp}@example.invalid`;
const stranger = `parent.other.${stamp}@example.invalid`;
let first = '';
let second = '';
let notMine = '';

async function child(parentEmail: string, prenom: string): Promise<string> {
  return (
    await prisma.talent.create({
      data: { prenom, nom: 'Signature', niveau: '1ere', parentEmail },
    })
  ).id;
}

const signer = {
  signerPrenom: 'Anne',
  signerNom: 'Signature',
  relationship: 'mère',
  city: 'Lille',
};

/** Post `fields` to `action` as the guardian, the way the browser form does. */
async function post(
  action: (event: never) => unknown,
  formId: string,
  fields: Record<string, string>,
  params: Record<string, string> = {},
): Promise<unknown> {
  const body = new FormData();
  body.set('__superform_id', formId);
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  try {
    return await action({
      request: new Request('http://localhost/parent/x', {
        method: 'POST',
        body,
      }),
      locals: { user: { email: guardian, role: 'parent' } },
      params,
    } as never);
  } catch (e) {
    return e;
  }
}

/** The status an action answered with: a failure's, a throw's, or 200. */
function statusOf(answer: unknown): number {
  if (isHttpError(answer) || isRedirect(answer)) return answer.status;
  const status = (answer as { status?: number }).status;
  return typeof status === 'number' ? status : 200;
}

beforeAll(async () => {
  assertTestDatabase();
  first = await child(guardian, 'Premier');
  second = await child(guardian, 'Second');
  notMine = await child(stranger, 'Autre');
});

afterAll(async () => {
  for (const talentId of [first, second, notMine]) {
    await drainOnboardingPdfJobs({ talentId, run: runOnboardingPdfJob });
  }
  await prisma.talent.deleteMany({
    where: { id: { in: [first, second, notMine] } },
  });
});

describe('the règlement co-signature', () => {
  it('refuses a signature without the acceptance, and writes nothing', async () => {
    const answer = await post(
      reglement.actions.sign,
      parentSignatureFormId('rules', first),
      { ...signer, talentId: first },
    );
    expect(statusOf(answer)).toBe(400);
    expect(
      (await prisma.talent.findUniqueOrThrow({ where: { id: first } }))
        .parentRulesSignedAt,
    ).toBeNull();
  });

  it('refuses a relationship the form does not offer', async () => {
    const answer = await post(
      reglement.actions.sign,
      parentSignatureFormId('rules', first),
      { ...signer, relationship: 'Parent', accepted: 'on', talentId: first },
    );
    expect(statusOf(answer)).toBe(400);
  });

  it('refuses to sign for somebody else’s child', async () => {
    const answer = await post(
      reglement.actions.sign,
      parentSignatureFormId('rules', notMine),
      { ...signer, accepted: 'on', talentId: notMine },
    );
    expect(statusOf(answer)).toBe(403);
  });

  it('records a signature on the form it came from', async () => {
    const answer = (await post(
      reglement.actions.sign,
      parentSignatureFormId('rules', first),
      { ...signer, accepted: 'on', talentId: first },
    )) as { form: { id: string; message: { signedFor: string } } };
    expect(answer.form.id).toBe(parentSignatureFormId('rules', first));
    expect(answer.form.message.signedFor).toBe('Premier Signature');
    const dossier = await prisma.talent.findUniqueOrThrow({
      where: { id: first },
    });
    expect(dossier.parentRulesSignedAt).not.toBeNull();
    expect(dossier.parentRulesRelationship).toBe('mère');
  });

  it('moves on to the image rights once the last child is signed', async () => {
    const answer = await post(
      reglement.actions.sign,
      parentSignatureFormId('rules', second),
      { ...signer, accepted: 'on', talentId: second },
    );
    expect(isRedirect(answer) && answer.location).toBe('/parent/signature');
  });
});

describe('the image-rights decision', () => {
  it('refuses a post with no decision rather than reading it as consent', async () => {
    const answer = await post(
      signature.actions.decide,
      parentSignatureFormId('image-rights', first),
      { ...signer, talentId: first },
    );
    expect(statusOf(answer)).toBe(400);
    expect(
      (await prisma.talent.findUniqueOrThrow({ where: { id: first } }))
        .imageRightsDecidedAt,
    ).toBeNull();
  });

  it('decides only for the child the page shows', async () => {
    const answer = await post(
      enfant.actions.decide,
      parentSignatureFormId('image-rights', first),
      { ...signer, decision: 'refused', talentId: second },
      { talentId: first },
    );
    expect(statusOf(answer)).toBe(400);
    expect(
      (await prisma.talent.findUniqueOrThrow({ where: { id: second } }))
        .imageRightsDecidedAt,
    ).toBeNull();
  });

  it('records a refusal on the child page', async () => {
    const answer = (await post(
      enfant.actions.decide,
      parentSignatureFormId('image-rights', first),
      { ...signer, decision: 'refused', talentId: first },
      { talentId: first },
    )) as { form: { message: { decision: string } } };
    expect(answer.form.message.decision).toBe('refused');
    expect(
      (await prisma.talent.findUniqueOrThrow({ where: { id: first } }))
        .imageRightsDecision,
    ).toBe('refused');
  });
});
