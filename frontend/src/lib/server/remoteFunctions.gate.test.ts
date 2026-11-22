import { describe, it, expect, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

/**
 * The gate every remote function runs, exercised through the wrapper itself.
 *
 * `guards.remoteCaller.test.ts` holds what each gate admits, and
 * `remoteFunctions.test.ts` that every remote export is declared through the
 * wrapper. Neither runs the wrapper, so dropping its `admitCaller` call, or
 * moving it after the schema, failed nothing while it is the only access
 * control a remote function has. Kit's `query` and `command` are replaced by
 * the function they wrap (with the `__` kit's own module registration reads),
 * and `getRequestEvent` by the caller each case sets: what runs is
 * `gatedQuery` / `gatedCommand` and the function each module declares.
 */

const request = vi.hoisted(() => ({ locals: {} as App.Locals }));

vi.mock('$app/server', () => {
  const declare =
    (type: 'query' | 'command') =>
    (_validate: unknown, fn: (raw: unknown) => unknown) =>
      Object.assign((raw: unknown) => fn(raw), { __: { type } });
  return {
    query: declare('query'),
    command: declare('command'),
    getRequestEvent: () => request,
  };
});

function as(over: Partial<App.Locals>) {
  request.locals = {
    user: null,
    session: null,
    staffProfile: null,
    talent: null,
    ...over,
  } as App.Locals;
}

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
        as({});
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
    as({
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
    as({
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
