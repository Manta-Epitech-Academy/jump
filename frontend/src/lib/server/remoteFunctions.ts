import { error } from '@sveltejs/kit';
import { command, getRequestEvent, query } from '$app/server';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  admitCaller,
  type RemoteCaller,
  type RemoteGate,
} from '#lib/server/auth/guards.ts';

/**
 * The only way a `*.remote.ts` file declares a remote function in Jump.
 *
 * A remote function is an HTTP endpoint SvelteKit mounts under `/_app/remote/`,
 * and none of the route guards reaches it (`RemoteGate` says why). So each one
 * names its gate where it is declared, and the gate runs before its body, ahead
 * of anything the body reads. Kit's own `query` and `command` are not imported
 * anywhere else, which `remoteFunctions.test.ts` holds.
 *
 * Every argument goes through a schema (Zod, in Jump): the caller is a browser,
 * and what it sends is input like a form's. The gate runs first and the schema
 * second, so a caller the gate refuses learns nothing about the argument's
 * shape. Kit's own schema slot would validate before the body, hence before the
 * gate, and answer the issues to whoever asked.
 *
 * `form` is left out on purpose. Jump's forms are superforms (`AGENTS.md`), and
 * a second form system beside it is a decision for the whole codebase, not one
 * screen's.
 */

type MaybePromise<T> = T | Promise<T>;

async function parse<Schema extends StandardSchemaV1>(
  schema: Schema,
  raw: unknown,
): Promise<StandardSchemaV1.InferOutput<Schema>> {
  const result = await schema['~standard'].validate(raw);
  // The first issue's own message, which is French where a person reads it
  // (`La note est vide`): a schema a person's input reaches carries its copy.
  if (result.issues) {
    throw error(400, result.issues[0]?.message ?? 'Requête invalide.');
  }
  return result.value;
}

/** A `query`: a read, deduplicated per request and cached while in use. */
export function gatedQuery<
  G extends RemoteGate,
  Schema extends StandardSchemaV1,
  Output,
>(
  gate: G,
  schema: Schema,
  run: (
    arg: StandardSchemaV1.InferOutput<Schema>,
    caller: RemoteCaller<G>,
  ) => MaybePromise<Output>,
) {
  return query<StandardSchemaV1.InferInput<Schema>, Output>(
    'unchecked',
    async (raw) => {
      const caller = admitCaller(gate, getRequestEvent().locals);
      return run(await parse(schema, raw), caller);
    },
  );
}

/** A `command`: a write the page calls, never during render. */
export function gatedCommand<
  G extends RemoteGate,
  Schema extends StandardSchemaV1,
  Output,
>(
  gate: G,
  schema: Schema,
  run: (
    arg: StandardSchemaV1.InferOutput<Schema>,
    caller: RemoteCaller<G>,
  ) => MaybePromise<Output>,
) {
  return command<StandardSchemaV1.InferInput<Schema>, Output>(
    'unchecked',
    async (raw) => {
      const caller = admitCaller(gate, getRequestEvent().locals);
      return run(await parse(schema, raw), caller);
    },
  );
}
