/**
 * The two-step contract behind the bulk write operations: a dry run first, then
 * an apply that has to echo that dry run's digest.
 *
 * Why a digest and not a stored plan. The pods scale horizontally and hold no
 * source-of-truth state, so a plan parked in process memory would simply be
 * absent on the next request. Persisting one would work, but it answers the
 * wrong question: what matters is not "did this caller see a plan", it is "is
 * the plan they saw still the plan". So the apply recomputes the plan from live
 * data, hashes it, and compares. That catches a stale plan AND a world that
 * moved between the two calls (an event configured by a colleague in the
 * meantime), and it adds no table.
 *
 * The contract lives here rather than inside each tool: {@link runTwoStep} is
 * what the three bulk operations share, so none of them can implement "check the
 * digest" slightly differently.
 */

import { createHash } from 'node:crypto';

/**
 * The outcome of a mutating operation, discriminated so the answer tells the
 * model what actually happened instead of leaving it to infer success.
 *
 * `before` / `after` are what lands on the audit row, which is what turns the
 * call log into a change history. A dry run changed nothing, so it records
 * neither.
 */
export type WriteOutcome =
  | { applied: true; before: unknown; after: unknown }
  | { applied: false; plan: unknown; planDigest: string };

/**
 * What a call should record on its audit row, derived from what the operation
 * returned. Reads record nothing, an applied write records its before and after,
 * and a dry run records nothing because it changed nothing.
 *
 * Shared by both consumers (`route.ts`, `mcpServer.ts`) so the log cannot mean
 * one thing over HTTP and another over MCP.
 */
export function auditChangeOf(
  kind: 'read' | 'write',
  data: unknown,
): { before: unknown; after: unknown } | undefined {
  if (kind !== 'write') return undefined;
  const outcome = data as WriteOutcome;
  return outcome.applied
    ? { before: outcome.before, after: outcome.after }
    : undefined;
}

/** The caller's `planDigest` did not match a freshly computed plan. */
export class StalePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StalePlanError';
  }
}

/**
 * Deterministic JSON: object keys sorted at every depth, `undefined` dropped.
 *
 * Array order is preserved rather than sorted, because for most payloads order
 * is meaning. A plan builder is therefore responsible for emitting its affected
 * rows in a stable order (sort by id) - see {@link runTwoStep}.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  return value;
}

/** Short sha256 of a plan. Short because a human reads it back over chat. */
export function planDigest(plan: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(plan))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Run a bulk operation under the dry-run-then-apply contract.
 *
 * `buildPlan` must be a pure read that returns the affected rows **in a stable
 * order** (sort by id): the digest is computed from it, so an unstable order
 * would make every apply look stale.
 */
export async function runTwoStep<Plan>(input: {
  /** The `planDigest` the caller sent, if any. Absent means "dry run". */
  requestedDigest: string | undefined;
  buildPlan: () => Promise<Plan>;
  apply: (plan: Plan) => Promise<{ before: unknown; after: unknown }>;
}): Promise<WriteOutcome> {
  const plan = await input.buildPlan();
  const digest = planDigest(plan);

  if (!input.requestedDigest) {
    return { applied: false, plan, planDigest: digest };
  }

  if (input.requestedDigest !== digest) {
    // Naming the fresh digest is not a convenience, it is the recovery path: the
    // caller re-reads the plan below it and applies again, rather than retrying
    // the same stale digest forever.
    throw new StalePlanError(
      `Le plan a changé depuis la simulation : il ne correspond plus à l'empreinte « ${input.requestedDigest} ». ` +
        `Relancez la simulation, vérifiez ce qui a bougé, puis appliquez avec la nouvelle empreinte « ${digest} ».`,
    );
  }

  return { applied: true, ...(await input.apply(plan)) };
}
