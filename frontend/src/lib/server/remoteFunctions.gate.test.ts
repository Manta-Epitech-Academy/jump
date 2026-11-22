import { describe, it, expect, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { callAs } from '#lib/testing/kitRemote.ts';

/**
 * The gate every remote function runs, exercised through the wrapper itself.
 *
 * `guards.remoteCaller.test.ts` holds what each gate admits, and
 * `remoteFunctions.test.ts` that every remote export is declared through the
 * wrapper. Neither runs the wrapper, so dropping its `admitCaller` call, or
 * moving it after the schema, failed nothing while it is the only access
 * control a remote function has. Kit's `$app/server` is replaced by
 * `#lib/testing/kitRemote.ts`, so what runs is `gatedQuery` / `gatedCommand`
 * and the function each module declares, called as the caller each case sets.
 */

vi.mock('$app/server', () => import('#lib/testing/kitRemote.ts'));

async function statusOf(call: () => unknown): Promise<number | 'admitted'> {
  try {
    await call();
    return 'admitted';
  } catch (e) {
    if (isHttpError(e)) return e.status;
    throw e;
  }
}

const remoteModules = import.meta.glob<Record<string, unknown>>(
  '/src/**/*.remote.ts',
);

describe('the gate of every remote function', () => {
  it('refuses a caller with no session before reading the argument', async () => {
    const answers: string[] = [];
    for (const [file, load] of Object.entries(remoteModules)) {
      for (const [name, fn] of Object.entries(await load())) {
        if (typeof fn !== 'function') continue;
        callAs({});
        // No argument at all, which every schema but the export timelines'
        // refuses: a 400 here means the schema ran before the gate.
        answers.push(`${file}: ${name} -> ${await statusOf(() => fn())}`);
      }
    }
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.filter((a) => !a.endsWith('-> 401'))).toEqual([]);
  });

  it('answers an admitted caller with the schema’s own message', async () => {
    const { createTalentNote } =
      await import('#lib/components/dev/notes/talentNotes.remote.ts');
    callAs({
      staffProfile: {
        id: 'p1',
        staffRole: 'dev',
      } as App.Locals['staffProfile'],
    });
    const refusal = await createTalentNote({
      talentId: 't1',
      note: { body: '' },
    }).catch((e: unknown) => e);
    expect(isHttpError(refusal) && refusal.status).toBe(400);
    expect(isHttpError(refusal) && refusal.body.message).toBe(
      'La note est vide',
    );
  });

  it('refuses feedback from a talent who has not signed the charte', async () => {
    // The bug the remote command fixed: the route it replaced checked only for
    // a session, so a talent past the welcome splash could store answers before
    // the charte. A collégien walks no dossier, so the charte is all that
    // stands in front of them.
    const { submitFeedback } =
      await import('../../routes/(talent)/feedback/[eventId]/[formId]/feedback.remote.ts');
    callAs({
      talent: {
        id: 't1',
        niveau: '4eme',
        charterAcceptedAt: null,
      } as unknown as App.Locals['talent'],
    });
    expect(
      await statusOf(() =>
        submitFeedback({ eventId: 'e1', formId: 'f1', answers: {} }),
      ),
    ).toBe(403);
  });
});
