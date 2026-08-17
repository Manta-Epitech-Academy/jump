/**
 * Which failures explain themselves to the caller, and with what.
 *
 * Worth its own test because the wrong answer is silent in both directions. A
 * failure wrongly classified as ours answers "Erreur interne" to somebody holding
 * the fix (and books their mistake as a Jump bug, which `ops_api_usage` reports as
 * something to go and look at). A failure wrongly classified as theirs hands back
 * whatever an internal error happened to say.
 *
 * The `HttpError` case is the regression: the writes delegate to the services the
 * admin pages use, and those say "your request is at fault" with SvelteKit's
 * `error(400, ...)` rather than with one of this tier's own classes.
 */

import { describe, it, expect, vi } from 'vitest';
import { error } from '@sveltejs/kit';

// `errors.ts` pulls in `scope.ts` for `UnknownScopeError`, which reaches the
// Prisma singleton. Nothing here queries; the module just has to load.
vi.mock('$lib/server/db', () => ({ prisma: {} }));

const { callerFacingError, OperationRefusedError } = await import('./errors');
const { UnknownScopeError } = await import('./scope');
const { StalePlanError } = await import('./plan');

describe('callerFacingError', () => {
  it('hands back an unknown scope as a 400, with the values that would have worked', () => {
    const refusal = callerFacingError(
      new UnknownScopeError(
        'Campus « Lile » inconnu. Campus disponibles : Lille.',
      ),
    );

    expect(refusal).toEqual({
      status: 400,
      message: 'Campus « Lile » inconnu. Campus disponibles : Lille.',
    });
  });

  it('hands back a refused operation as a 400', () => {
    expect(
      callerFacingError(
        new OperationRefusedError('Section inconnue : bilanx.'),
      ),
    ).toEqual({ status: 400, message: 'Section inconnue : bilanx.' });
  });

  // A conflict with the state of the world, not a malformed request: the caller
  // re-runs the dry run and applies with the digest the message names.
  it('hands back a stale plan as a 409', () => {
    const refusal = callerFacingError(new StalePlanError('Le plan a changé.'));

    expect(refusal?.status).toBe(409);
    expect(refusal?.message).toBe('Le plan a changé.');
  });

  // The one message this tier hands back without having written it. It has to
  // arrive whole: a classifier that recognised the failure but read `.message`
  // off an object that carries `body.message` answered with nothing at all.
  it('hands back a 4xx from a shared admin service, message included', () => {
    let thrown: unknown;
    try {
      error(400, 'Formulaire de feedback introuvable.');
    } catch (err) {
      thrown = err;
    }

    expect(callerFacingError(thrown)).toEqual({
      status: 400,
      message: 'Formulaire de feedback introuvable.',
    });
  });

  it('keeps a 4xx status other than 400 rather than flattening it', () => {
    let thrown: unknown;
    try {
      error(404, 'Introuvable.');
    } catch (err) {
      thrown = err;
    }

    expect(callerFacingError(thrown)?.status).toBe(404);
  });

  it('keeps a 5xx to itself, since a server failure is not the caller to fix', () => {
    let thrown: unknown;
    try {
      error(503, 'Base de données indisponible.');
    } catch (err) {
      thrown = err;
    }

    expect(callerFacingError(thrown)).toBeNull();
  });

  it('keeps anything unrecognised to itself', () => {
    expect(callerFacingError(new Error('read ECONNRESET'))).toBeNull();
    expect(callerFacingError('not even an error')).toBeNull();
    expect(callerFacingError(undefined)).toBeNull();
  });
});
