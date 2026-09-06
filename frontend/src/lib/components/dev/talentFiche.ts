import { resolve } from '$app/paths';

/**
 * Link to a talent's fiche from inside an event surface.
 *
 * The `?event=` is load-bearing, not decoration. `/staff/dev/students/[id]`
 * carries the TALENT id, so the dev layout has no event to read off the route:
 * it falls back to the client-side `lastEventId`, then to the workspace default.
 * A fresh tab (the rosters open the fiche with `target="_blank"`), a reload and
 * a shared link have neither, so without the parameter the sidebar nav and the
 * header's school year silently move off the event the roster belongs to.
 *
 * Every fiche link inside an event surface builds its URL here rather than by
 * hand. The four rosters each held their own copy of the same line, and that is
 * how the two links inside an Inscrits row (the XP pill and the statut chip,
 * which sit above the stretched row link on purpose, so they take the click)
 * ended up without the parameter while the row around them carried it.
 *
 * There used to be an `interviewMode` option here, opening the fiche straight
 * into the closing form. A closing is an event-scoped act and has its own page
 * under its event now, so the roster links there instead and this builder only
 * ever points at the fiche.
 */
export function talentFicheHref(talentId: string, eventId: string): string {
  const params = new URLSearchParams();
  params.set('event', eventId);
  return `${resolve(`/staff/dev/students/${talentId}`)}?${params}`;
}
