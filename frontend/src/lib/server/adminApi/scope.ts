/**
 * Resolving the scope a curated operation was asked for, and refusing a scope
 * that does not exist.
 *
 * Why this layer exists at all: the filters used to be raw ids (`campusId`), and
 * `Campus.id` is a cuid that no operation ever returns, so the one consumer this
 * tier is built for (a language model) had no way to obtain one and no way to get
 * it wrong loudly. `campusId: "Lille"` satisfied `z.string().min(1)`, matched no
 * event, and came back as `{ campus: "Lille", events: 0 }`: a confident zero that
 * reads exactly like a fact, with the echoed filter confirming it. That is the
 * failure "the LLM formats, it never computes" is meant to rule out, so the fix
 * belongs here rather than in each aggregate.
 *
 * Two rules follow from it:
 *
 *   - **Name what has a name.** `Campus.name` is `@unique` in the schema, so the
 *     name IS the identifier; asking a model for a cuid instead was inventing an
 *     obstacle. Campus names are already what every answer prints, so a follow-up
 *     question round-trips with no extra lookup operation.
 *   - **An unknown scope is a refusal, never an empty answer.** And the refusal
 *     carries the values that would have worked, because a model that is told
 *     "Campus disponibles : ..." asks again correctly instead of reporting zero.
 *
 * Events keep an id: `titre` is a Salesforce campaign name and `publicName` is
 * free text, so neither is unique and there is no natural key to promote. The id
 * is verified to exist, which is what stops the confident zero there too.
 */

import { prisma } from '$lib/server/db';
import { eventDisplayName } from '$lib/domain/event';

/**
 * The caller named a campus, event or school year that does not exist. Carried
 * as an exception rather than a `ServiceResult` because every operation would
 * otherwise have to widen its return type for a case that is never a normal
 * outcome; both consumers (`route.ts`, `mcpServer.ts`) translate it to a 400 with
 * this message, so the model reads the list of valid values.
 */
export class UnknownScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownScopeError';
  }
}

export type ResolvedCampus = { id: string; name: string };
/** `label` is what the answer prints back, so a human recognises the event. */
export type ResolvedEvent = { id: string; label: string };

/** A scope that has been checked to exist. Aggregates only ever see this. */
export type Scope = {
  schoolYear?: string;
  campus?: ResolvedCampus;
  event?: ResolvedEvent;
};

/** What the catalogue accepts, in the vocabulary the model is given. */
export type ScopeParams = {
  schoolYear?: string;
  /** Campus name, e.g. "Lille". Matched case-insensitively on `Campus.name`. */
  campus?: string;
  eventId?: string;
};

const list = (values: string[]) => values.join(', ');

async function resolveCampus(name: string): Promise<ResolvedCampus> {
  const found = await prisma.campus.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (found) return found;

  // The refusal names every campus rather than saying "inconnu": the caller
  // cannot list them itself, and a bare rejection would only invite a second
  // guess.
  const all = await prisma.campus.findMany({
    orderBy: { name: 'asc' },
    select: { name: true },
  });
  throw new UnknownScopeError(
    `Campus « ${name} » inconnu. Campus disponibles : ${list(all.map((c) => c.name))}.`,
  );
}

async function resolveEvent(id: string): Promise<ResolvedEvent> {
  const found = await prisma.event.findUnique({
    where: { id },
    select: { id: true, titre: true, publicName: true },
  });
  if (!found) {
    throw new UnknownScopeError(
      `Événement « ${id} » introuvable. Les identifiants d'événement sont ` +
        `renvoyés par l'opération config_unconfigured_events.`,
    );
  }
  return { id: found.id, label: eventDisplayName(found) };
}

/**
 * Turn the params a caller sent into a scope that is known to exist. Throws
 * {@link UnknownScopeError} on the first thing that does not.
 */
export async function resolveScope(params: ScopeParams = {}): Promise<Scope> {
  const [campus, event] = await Promise.all([
    params.campus ? resolveCampus(params.campus) : undefined,
    params.eventId ? resolveEvent(params.eventId) : undefined,
  ]);
  return { schoolYear: params.schoolYear, campus, event };
}

/**
 * Refuse a well-formed school year that no event falls in ("2099-2100" passes
 * the format check and would otherwise report zeros everywhere).
 *
 * Checked by the aggregates rather than by `resolveScope`, because the set of
 * years is derived from the events they already loaded; resolving it here would
 * mean querying every event twice to answer one question.
 */
export function assertKnownSchoolYear(
  label: string | undefined,
  available: string[],
): void {
  if (!label || available.includes(label)) return;
  throw new UnknownScopeError(
    `Année scolaire « ${label} » sans événement enregistré. ` +
      `Années disponibles : ${list(available)}.`,
  );
}
