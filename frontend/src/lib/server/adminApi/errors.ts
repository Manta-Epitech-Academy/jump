/**
 * The errors a caller can act on, and the one place that says which those are.
 *
 * The distinction that matters here is not the HTTP status, it is whether the
 * message can safely be handed back. A caller error names something the caller
 * can fix (a campus that does not exist, a section that is misspelled, a form
 * that is not there, a plan that has gone stale) and its message is written to be
 * read; anything else is ours and stays opaque, logged on the server.
 *
 * Which is why the classes below are not the whole answer. The writes delegate to
 * the services the admin pages use, and those already draw the same line with a
 * status: a 4xx from one of them is that judgement arriving in SvelteKit's
 * vocabulary instead of ours, and dropping it on the floor is how a caller's own
 * mistake came back as an internal error.
 *
 * `execute.ts` asks this module on behalf of both consumers rather than either
 * listing `instanceof` checks of its own, so HTTP and MCP cannot end up
 * disagreeing about which failures explain themselves.
 */

import { isHttpError } from '@sveltejs/kit';
import { UnknownScopeError } from './scope';
import { StalePlanError } from './plan';

/**
 * The operation understood the request and will not carry it out: a
 * precondition is unmet, or a value it was given is not one it accepts.
 *
 * Distinct from {@link UnknownScopeError}, which is specifically "the campus,
 * event or school year you filtered on does not exist". Keeping them apart
 * keeps that one about scope resolution, where its refusal wording (listing the
 * values that would have worked) belongs.
 */
export class OperationRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationRefusedError';
  }
}

/** A failure the caller can fix: what to answer with, and what to hand back. */
export type CallerFacingError = { status: number; message: string };

/**
 * The caller's half of a failure, or null when the failure is ours.
 *
 * One function rather than a predicate plus a status lookup plus a `.message`
 * read at the call site: the three answers have to agree, and a classifier that
 * says "this one explains itself" without producing the explanation is how a
 * recognised refusal still went out with an undefined message.
 */
export function callerFacingError(err: unknown): CallerFacingError | null {
  // A stale plan is a conflict with the current state of the world rather than
  // a malformed request: the caller re-reads the plan and applies again.
  if (err instanceof StalePlanError) {
    return { status: 409, message: err.message };
  }
  if (
    err instanceof UnknownScopeError ||
    err instanceof OperationRefusedError
  ) {
    return { status: 400, message: err.message };
  }
  // A 4xx thrown by a service this tier shares with the admin pages, which say
  // "the request is at fault" the SvelteKit way (`error(400, ...)`) rather than
  // with one of the classes above. Writes delegate to those services on purpose,
  // so their judgement has to arrive as a judgement: without this, asking
  // `write_event_feedback_form` for a form that no longer exists answered
  // "Erreur interne", which tells the caller nothing to correct and books an
  // ordinary mistake as a Jump bug in the audit log.
  //
  // Re-checked per site rather than assumed: this is the one message this tier
  // hands back without having written it, and a staff page may legitimately name
  // a talent in a 4xx where this tier may not. Today's two sites (a missing
  // feedback form, a blank preset name) name neither a person nor an internal.
  if (isHttpError(err) && err.status < 500) {
    return { status: err.status, message: err.body.message };
  }
  return null;
}
