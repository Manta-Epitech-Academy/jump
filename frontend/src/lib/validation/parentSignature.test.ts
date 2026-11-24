import { describe, it, expect } from 'vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  imageRightsSignatureSchema,
  parentRulesSignatureSchema,
} from './parentSignature';

/** A form post as the browser sends it. */
function post(fields: Record<string, string>): Request {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request('http://localhost/parent/x', { method: 'POST', body });
}

const signer = {
  talentId: 't1',
  signerPrenom: 'Anne',
  signerNom: 'Martin',
  relationship: 'mère',
  city: 'Lille',
};

describe('the parent signature schemas', () => {
  it('opens a form with no decision and no relationship chosen', async () => {
    const image = await superValidate(zod4(imageRightsSignatureSchema));
    expect(image.data.decision).toBeNull();
    expect(image.data.relationship).toBeNull();
    const rules = await superValidate(zod4(parentRulesSignatureSchema));
    expect(rules.data.accepted).toBe(false);
  });

  it('refuses a post that leaves the decision out, rather than consenting', async () => {
    const form = await superValidate(
      post(signer),
      zod4(imageRightsSignatureSchema),
    );
    expect(form.valid).toBe(false);
    expect(form.data.decision).toBeNull();
    expect(form.errors.decision).toBeDefined();
  });

  it('refuses a règlement signature without the acceptance', async () => {
    const without = await superValidate(
      post(signer),
      zod4(parentRulesSignatureSchema),
    );
    expect(without.valid).toBe(false);
    expect(without.errors.accepted).toBeDefined();
    const accepted = await superValidate(
      post({ ...signer, accepted: 'on' }),
      zod4(parentRulesSignatureSchema),
    );
    expect(accepted.valid).toBe(true);
  });

  it('takes only a relationship the form offers', async () => {
    const valid = await superValidate(
      post({ ...signer, relationship: 'tutrice légale', decision: 'refused' }),
      zod4(imageRightsSignatureSchema),
    );
    expect(valid.valid).toBe(true);
    const invented = await superValidate(
      post({ ...signer, relationship: 'Parent', decision: 'refused' }),
      zod4(imageRightsSignatureSchema),
    );
    expect(invented.valid).toBe(false);
    expect(invented.errors.relationship).toBeDefined();
  });

  it('trims what the guardian typed and caps its length', async () => {
    const padded = await superValidate(
      post({ ...signer, signerPrenom: '  Anne  ', decision: 'accepted' }),
      zod4(imageRightsSignatureSchema),
    );
    expect(padded.valid).toBe(true);
    expect(padded.data.signerPrenom).toBe('Anne');
    const long = await superValidate(
      post({ ...signer, city: 'x'.repeat(101), decision: 'accepted' }),
      zod4(imageRightsSignatureSchema),
    );
    expect(long.errors.city).toBeDefined();
  });
});
