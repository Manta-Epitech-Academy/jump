/**
 * The errors a caller can act on, and the one place that says which those are.
 *
 * The distinction that matters here is not the HTTP status, it is whether the
 * message can safely be handed back. A caller error names something the caller
 * can fix (a campus that does not exist, a section that is misspelled, a plan
 * that has gone stale) and its message is written to be read; anything else is
 * ours and stays opaque, logged on the server.
 *
 * Both consumers ask this module rather than listing `instanceof` checks of
 * their own, so HTTP and MCP cannot end up disagreeing about which failures
 * explain themselves.
 */

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

/** Whether this failure is the caller's to fix, and its message theirs to read. */
export function isCallerError(err: unknown): err is Error {
  return (
    err instanceof UnknownScopeError ||
    err instanceof OperationRefusedError ||
    err instanceof StalePlanError
  );
}

/** The status a caller error answers with. */
export function statusForCallerError(err: unknown): 400 | 409 {
  // A stale plan is a conflict with the current state of the world rather than
  // a malformed request: the caller re-reads the plan and applies again.
  return err instanceof StalePlanError ? 409 : 400;
}
