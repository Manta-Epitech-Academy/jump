/**
 * "Since when?", asked of the figures that change from one week to the next.
 *
 * Several reads take an optional `since` instant and, when it is given, add the
 * part of a figure that appeared after it: the events that arrived, the sync
 * errors whose cause is new, the generations that failed. The weekly admin
 * digest marks those as new by asking exactly this, with the moment the
 * previous delivered digest read its figures. `config_admin_digest` reports the
 * instant the last digest asked with as `lastSend.newSince`, so a chat that
 * passes it reads the same numbers as that inbox.
 *
 * A read called without `since` answers as it always did: the added figures are
 * absent, not zero, and the types say so.
 */

/** The optional filter every such read takes. */
export type SinceFilter = { since?: Date };

/**
 * `Base` plus the figures `Extra` names when `since` is given, `Base` alone
 * otherwise. A caller that always passes an instant (the digest) is typed with
 * the added figures; one that forwards an optional parameter is not, and reads
 * them as absent.
 */
export type WithSince<Base, Extra, F extends SinceFilter> = F extends {
  since: Date;
}
  ? Base & Extra
  : Base & Partial<Extra>;

/**
 * Answers `base`, plus what `extra` counts when `filters.since` is set. The one
 * place the conditional type is asserted, so no read casts its own answer.
 */
export async function withSince<Base, Extra, F extends SinceFilter>(
  base: Base,
  filters: F | undefined,
  extra: (since: Date) => Extra | Promise<Extra>,
): Promise<WithSince<Base, Extra, F>> {
  const since = filters?.since;
  if (!since) return base as WithSince<Base, Extra, F>;
  return { ...base, ...(await extra(since)) } as WithSince<Base, Extra, F>;
}

const PARIS = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * The instant as a definition quotes it, e.g. « le 2 novembre 2026 à 08:00
 * (heure de Paris) », so a figure carries the window it was counted over.
 */
export function sinceLabelFr(since: Date): string {
  return `le ${PARIS.format(since)} (heure de Paris)`;
}
