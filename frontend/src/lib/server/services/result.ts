/**
 * Tagged outcome returned by services whose failures are ordinary domain
 * outcomes rather than exceptions (an address already invited, an extId already
 * taken, a role that isn't one).
 *
 * Why not throw, and why not `fail()`: the route is the only layer that knows it
 * is serving a form, so it owns the HTTP status and the French copy. The service
 * names what happened; the caller decides how to say it. A second caller (a
 * job, a curated API operation) then reuses the write with no Superforms in
 * sight.
 *
 *   ServiceResult<'not_found' | 'clash'>              → { ok: true } | { ok: false, reason }
 *   ServiceResult<'unknown', { count: number }>       → { ok: true, count } | { ok: false, reason }
 */
export type ServiceResult<
  Reason extends string,
  Payload extends object = Record<never, never>,
> = ({ ok: true } & Payload) | { ok: false; reason: Reason };
