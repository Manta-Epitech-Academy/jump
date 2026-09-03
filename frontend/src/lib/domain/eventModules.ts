import { z } from 'zod';

/**
 * Per-event "modules" = the dev-workspace surfaces a single event exposes.
 *
 * A module answers "what does THIS event expose" (per-event, resolved at route
 * level, part of the event's identity). Two events on the same campus can expose
 * different modules, which is why this is per-event and not a campus-wide toggle.
 *
 * Membership: a module is enabled for an event iff an `EventConfig_Module` row
 * exists (presence = enabled). Keys stay plain strings (validated here, not a
 * DB enum) so adding a module needs no migration.
 */
// NOTE: planning is deliberately NOT a module. It is a read-only window onto
// pedago/admin-owned schedule data, so a dev toggle would be hollow (the dev
// can't produce the data). Its visibility is data-driven instead: the dev view
// and the talent calendar appear wherever an event actually has time slots. See
// the planning page load + resolveWorkspaceEvents `hasPlanning`.
export const EVENT_MODULES = {
  INSCRITS: 'inscrits',
  EMARGEMENT: 'emargement',
  BILAN: 'bilan',
  CLOSINGS: 'closings',
} as const;

export type EventModuleKey = (typeof EVENT_MODULES)[keyof typeof EVENT_MODULES];

/** Sidebar / config display order. */
export const EVENT_MODULE_KEYS = Object.values(
  EVENT_MODULES,
) as EventModuleKey[];

export interface EventModuleDef {
  key: EventModuleKey;
  /** Nav + config label (FR, staff-facing → vous). */
  label: string;
  /** Help text shown in the event-config dialog. */
  description: string;
  /** URL sub-path under `/staff/dev/events/[id]/` (a module's route folder name). */
  segment: EventModuleKey;
}

const def = (d: EventModuleDef): EventModuleDef => d;

export const EVENT_MODULE_DEFS: Record<EventModuleKey, EventModuleDef> = {
  [EVENT_MODULES.INSCRITS]: def({
    key: EVENT_MODULES.INSCRITS,
    label: 'Inscrits',
    description:
      "La liste des jeunes inscrits : d'où ils viennent et si leur dossier est complet.",
    segment: 'inscrits',
  }),
  [EVENT_MODULES.EMARGEMENT]: def({
    key: EVENT_MODULES.EMARGEMENT,
    label: 'Émargement',
    description:
      "La feuille de présence : pointer qui est là, le matin et l'après-midi.",
    segment: 'emargement',
  }),
  [EVENT_MODULES.BILAN]: def({
    key: EVENT_MODULES.BILAN,
    label: 'Feedback',
    description:
      'Les réponses des jeunes au questionnaire de fin, leurs statistiques, et un QR code à partager pour le remplir.',
    segment: 'bilan',
  }),
  [EVENT_MODULES.CLOSINGS]: def({
    key: EVENT_MODULES.CLOSINGS,
    label: 'Closings',
    description:
      'Le closing de fin, un par jeune : noter le ressenti, le projet et la suite du parcours. Les questions posées dépendent de la grille choisie pour cet événement.',
    segment: 'closings',
  }),
};

/**
 * Modules seeded onto a new event at creation. The event type is only a starting
 * point: after creation the per-event module rows are the truth and are edited
 * independently. Every event (stage, coding club, anything the worker imports)
 * starts with all four surfaces on; admins trim per event from the admin
 * event-config page. There is no per-kind table because no default actually
 * differs today - take a parameter and branch here the day one does.
 */
export function defaultEventModules(): EventModuleKey[] {
  return [...EVENT_MODULE_KEYS];
}

export function isEventModuleKey(value: string): value is EventModuleKey {
  return (EVENT_MODULE_KEYS as string[]).includes(value);
}

/**
 * Per-module sub-options, persisted as the `settings` Json on each
 * `EventConfig_Module` row (and mirrored on `EventConfig_TemplateModule`). Each
 * schema parses an unknown Json bag into a fully-defaulted typed object, so
 * callers never branch on missing keys. Extra keys are stripped (Zod object
 * default), so a settings shape can grow without breaking old rows. A module
 * with no sub-options uses the empty schema. FKs (the bilan feedback form) stay
 * typed columns on `Event`, never in here.
 */
const inscritsModuleSettingsSchema = z.object({
  // Show the dossier/statut funnel column (connexion, règlement, droit à l'image)
  // on the Inscrits table for this event. Opt-in: defaults off, an admin turns it
  // on per event from the config wizard (onboarding campuses want it; others, e.g.
  // Paris with closings + public bilan only, leave it off). Gates ONLY that
  // column, never the talent fiche.
  showStatutColumn: z.boolean().default(false),
});

const emptyModuleSettingsSchema = z.object({});

const EVENT_MODULE_SETTINGS_SCHEMAS = {
  [EVENT_MODULES.INSCRITS]: inscritsModuleSettingsSchema,
  [EVENT_MODULES.EMARGEMENT]: emptyModuleSettingsSchema,
  [EVENT_MODULES.BILAN]: emptyModuleSettingsSchema,
  [EVENT_MODULES.CLOSINGS]: emptyModuleSettingsSchema,
} as const;

export type EventModuleSettings = {
  [K in EventModuleKey]: z.infer<(typeof EVENT_MODULE_SETTINGS_SCHEMAS)[K]>;
};

/**
 * Parse a raw `settings` Json (DB column or posted form value) into the typed,
 * fully-defaulted settings for `key`. Falls back to all-defaults on any malformed
 * input, so a hand-edited or legacy row can never crash a read.
 */
export function parseModuleSettings<K extends EventModuleKey>(
  key: K,
  raw: unknown,
): EventModuleSettings[K] {
  const schema = EVENT_MODULE_SETTINGS_SCHEMAS[key] as unknown as z.ZodType<
    EventModuleSettings[K]
  >;
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

/** The all-defaults settings for a module (used when a module is freshly enabled). */
export function defaultModuleSettings<K extends EventModuleKey>(
  key: K,
): EventModuleSettings[K] {
  return parseModuleSettings(key, {});
}

/** Whether a module is enabled, given a resolved set/list of an event's modules. */
export function eventHasModule(
  modules: ReadonlySet<string> | readonly string[],
  key: EventModuleKey,
): boolean {
  // Keep the Set's O(1) lookup the callers built (loadEventOr404 returns a
  // Set precisely for membership tests); only the array case pays a scan.
  // (`instanceof Set` narrows cleanly where `Array.isArray` can't, because TS
  // won't remove `readonly string[]` from the union for the array guard.)
  return modules instanceof Set ? modules.has(key) : [...modules].includes(key);
}

/**
 * A dev-workspace "surface" is a sidebar entry / landable page. Most surfaces
 * are modules (a row's presence = enabled), but three carry a second,
 * data-driven gate beyond the module row, so "which page can a dev actually
 * reach" is not the raw module set:
 *  - `planning` is not a module at all (read-only pedago/admin schedule data): it
 *    is reachable only when the event has a real schedule.
 *  - `bilan` is a module but also needs a resolvable live feedback form, or its
 *    page 404s.
 *  - `exports` is not a module either, and is reachable exactly when the event
 *    exposes at least one producer (see `availableProducers`).
 * This projection folds those gates in one place so the sidebar nav, the event
 * switcher and the dev landing all agree on the reachable set. Routing off the
 * raw module set instead (the old `firstEnabledModule`) sent the switcher and the
 * landing into a 404 for a bilan-without-form event the nav had already hidden.
 */
export type EventSurfaceKey = EventModuleKey | 'planning' | 'exports';

/**
 * Sidebar / landing order. Modules keep their `EVENT_MODULE_KEYS` order; the
 * `planning` pseudo-surface is interleaved where the nav shows it (between
 * émargement and bilan).
 *
 * `exports` is LAST, and that placement is load-bearing rather than aesthetic.
 * `landingSurface` hands back the first reachable surface, and landing a dev on
 * the page that produces files rather than on the one that shows the cohort
 * would be wrong on every event. Being last, and being reachable only when
 * another surface is (see `availableProducers`), makes that impossible instead
 * of unlikely.
 */
const EVENT_SURFACE_ORDER: EventSurfaceKey[] = [
  EVENT_MODULES.INSCRITS,
  EVENT_MODULES.EMARGEMENT,
  'planning',
  EVENT_MODULES.BILAN,
  EVENT_MODULES.CLOSINGS,
  'exports',
];

interface EventSurfaceMeta {
  /** Sidebar label (FR, staff-facing → vous). */
  label: string;
  /** URL sub-path under `/staff/dev/events/[id]/`. */
  segment: EventSurfaceKey;
}

const moduleSurface = (key: EventModuleKey): EventSurfaceMeta => ({
  label: EVENT_MODULE_DEFS[key].label,
  segment: EVENT_MODULE_DEFS[key].segment,
});

/**
 * Label and segment per surface, in one table.
 *
 * A module surface takes both off its `EventModuleDef`; a module-less surface
 * declares them here. `surfaceSegment` and `surfaceLabel` used to special-case
 * `planning` with a ternary each, which reads fine while exactly one surface
 * carries no module and stops reading fine the moment a second one does: the
 * same per-surface fact would then be spelled as a two-branch switch on the key,
 * in two functions, neither of which the compiler can tell you is incomplete.
 * As a `Record` over the union it cannot be incomplete.
 */
const EVENT_SURFACE_META: Record<EventSurfaceKey, EventSurfaceMeta> = {
  [EVENT_MODULES.INSCRITS]: moduleSurface(EVENT_MODULES.INSCRITS),
  [EVENT_MODULES.EMARGEMENT]: moduleSurface(EVENT_MODULES.EMARGEMENT),
  [EVENT_MODULES.BILAN]: moduleSurface(EVENT_MODULES.BILAN),
  [EVENT_MODULES.CLOSINGS]: moduleSurface(EVENT_MODULES.CLOSINGS),
  planning: { label: 'Planning', segment: 'planning' },
  exports: { label: 'Exports', segment: 'exports' },
};

/** The per-event signals a surface's reachability folds in. */
export interface EventSurfaceGates {
  modules: ReadonlySet<string> | readonly string[];
  /** Event has a schedule (≥1 time slot): gates `planning`. */
  hasPlanning: boolean;
  /** Event resolves a live feedback form: gates `bilan` on top of its module. */
  hasFeedbackForm: boolean;
  /** Event names a closing grid: gates `closings` on top of its module. Same
   *  shape as `hasFeedbackForm`, and for the same reason - a surface whose
   *  content is a per-event FK is unreachable while that FK is null, so the nav
   *  must not offer a page that would 404. Cheaper than the bilan's, which has to
   *  check the form is published too: a grid is reachable as soon as it is
   *  named. */
  hasClosingTemplate: boolean;
  /** Event names a certificate template: gates the `diplomas` producer. Same
   *  "the null FK IS the gate" shape as the two above; `Event.diplomaTemplateId`
   *  being null means the event issues no document, which is why there is no
   *  companion boolean anywhere. */
  hasDiplomaTemplate: boolean;
}

/**
 * Whether an event actually conducts closings: its section is on AND it names a
 * grid.
 *
 * Named because the pair is read twice and means the same thing both times. The
 * sidebar asks it to decide whether to offer a page that would otherwise 404;
 * the admin aggregates ask it to decide whose enrolments belong in the coverage
 * denominator, through `adminEventRunsClosings` in `services/events`, which is
 * where the admin view model's `""`-means-none is understood. That second reading
 * is why this is a function and not an inline `&&`: the denominator counted every
 * enrolment in scope, including the ones on events that run no closing at all, so
 * a national coverage of 78 % was reported as 18 % and read as an execution
 * problem rather than a configuration one. A rule spelled out at each site is a
 * rule that only some sites apply.
 */
export function eventRunsClosings(
  gates: Pick<EventSurfaceGates, 'modules' | 'hasClosingTemplate'>,
): boolean {
  return (
    eventHasModule(gates.modules, EVENT_MODULES.CLOSINGS) &&
    gates.hasClosingTemplate
  );
}

/**
 * What an event lets a dev-team member produce and take away: printable sheets,
 * spreadsheets, an archive of documents.
 *
 * One list, from which BOTH the `exports` surface's gate and the page's contents
 * are derived. Written twice they would drift, and the drift has a shape: a nav
 * entry that opens an empty page, on the 235 events out of 292 that carry no
 * module at all.
 *
 * What is NOT here is the other half of the rule, and it is the half that keeps
 * the page honest. A producer moves to the Exports page only if it does not
 * consume what is on screen. Three deliberately stay where they are: the
 * inscrits export POSTs the talent ids the filters and the sort currently show,
 * a QR code is the one for the créneau you are standing in, and a closing's
 * synthesis PDF is addressed by talent. Said as a sentence: a file you take away
 * moves, a QR code you show in the room stays, an export that follows your
 * filters stays.
 */
export const EVENT_PRODUCERS = {
  BADGES: 'badges',
  EMARGEMENT_XLSX: 'emargement_xlsx',
  BILAN_XLSX: 'bilan_xlsx',
  CLOSINGS_XLSX: 'closings_xlsx',
  CLOSINGS_PDFS: 'closings_pdfs',
  DIPLOMAS: 'diplomas',
} as const;

export type EventProducerKey =
  (typeof EVENT_PRODUCERS)[keyof typeof EVENT_PRODUCERS];

/**
 * What a producer acts on, so a card can say what it is about to produce and a
 * button over an empty set can be disabled rather than dead.
 *
 * Named per base rather than per producer, because two producers over the same
 * base must not count it in two different ways.
 */
export type EventProducerBase = 'roster' | 'closingsDone' | 'submissions';

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** FR, staff-facing. Quoted on the producer's card next to its button. */
export const EVENT_PRODUCER_BASE_LABELS: Record<
  EventProducerBase,
  (n: number) => string
> = {
  roster: (n) => plural(n, 'inscrit', 'inscrits'),
  closingsDone: (n) => plural(n, 'closing finalisé', 'closings finalisés'),
  submissions: (n) => plural(n, 'réponse', 'réponses'),
};

/**
 * Every producer's sub-path, as a literal union rather than `string`, so
 * `resolve()` verifies the built `/staff/dev/events/[id]/<segment>` against the
 * real route tree - the same guarantee `surfaceSegment` gives the sidebar.
 */
export type EventProducerSegment =
  | 'badges.pdf'
  | 'diplomes.pdf'
  | 'emargement/export'
  | 'bilan/export'
  | 'closings/export'
  | 'closings/archive';

export interface EventProducerDef {
  key: EventProducerKey;
  /** FR, staff-facing → vous. */
  label: string;
  /** ONE line, the fact that changes the decision at the moment it is taken. */
  description: string;
  /**
   * Everything else the reader may want and must not be made to read: what the
   * file contains, how long it takes, what it does NOT follow. Rendered behind
   * an `InfoTooltip`, per the copy-density rule.
   */
  help: string;
  format: 'pdf' | 'xlsx' | 'zip';
  segment: EventProducerSegment;
  base: EventProducerBase;
  /**
   * Whether the event exposes it. Each one repeats the gate its own endpoint
   * already applies, so the card and the download agree: offering a producer
   * whose endpoint 404s is the same failure as hiding one that works.
   */
  available(gates: EventSurfaceGates): boolean;
}

const producer = (d: EventProducerDef): EventProducerDef => d;

/**
 * Display order: the moment of the event, not the file format. Badges are
 * printed before anyone arrives, the attendance sheet and the questionnaire come
 * out of the days themselves, the closings close them, and the certificates are
 * handed over at the end.
 */
export const EVENT_PRODUCER_DEFS: Record<EventProducerKey, EventProducerDef> = {
  [EVENT_PRODUCERS.BADGES]: producer({
    key: EVENT_PRODUCERS.BADGES,
    label: 'Badges',
    description: 'La planche de badges à imprimer pour tout l’événement.',
    format: 'pdf',
    help: 'Un badge par inscrit, dans l’ordre alphabétique. Les jeunes dont l’image ne peut pas être diffusée y sont signalés. Deux mises en page au choix.',
    segment: 'badges.pdf',
    base: 'roster',
    // Gated on the Inscrits section, like the endpoint: the sheet prints the
    // cohort, so it must not be reachable when the cohort is not.
    available: (gates) => eventHasModule(gates.modules, EVENT_MODULES.INSCRITS),
  }),
  [EVENT_PRODUCERS.EMARGEMENT_XLSX]: producer({
    key: EVENT_PRODUCERS.EMARGEMENT_XLSX,
    label: 'Émargement',
    description: 'La feuille de présence complète, tous les créneaux.',
    format: 'xlsx',
    help: 'Une ligne par inscrit et une colonne par créneau, sur toute la durée de l’événement. Ce fichier ne suit pas le créneau affiché à l’écran.',
    segment: 'emargement/export',
    base: 'roster',
    available: (gates) =>
      eventHasModule(gates.modules, EVENT_MODULES.EMARGEMENT),
  }),
  [EVENT_PRODUCERS.BILAN_XLSX]: producer({
    key: EVENT_PRODUCERS.BILAN_XLSX,
    label: 'Questionnaire de fin',
    description: 'Les réponses au questionnaire, une ligne par jeune.',
    format: 'xlsx',
    help: 'Une colonne par question du questionnaire attaché à cet événement, avec les réponses telles qu’elles ont été saisies.',
    segment: 'bilan/export',
    base: 'submissions',
    available: (gates) =>
      eventHasModule(gates.modules, EVENT_MODULES.BILAN) &&
      gates.hasFeedbackForm,
  }),
  [EVENT_PRODUCERS.CLOSINGS_XLSX]: producer({
    key: EVENT_PRODUCERS.CLOSINGS_XLSX,
    label: 'Closings',
    description: 'Verdicts et réponses, une ligne par inscrit.',
    format: 'xlsx',
    help: 'Une ligne par inscrit, son statut, son verdict et ses réponses. Les closings conduits dont l’inscription a été retirée depuis y figurent aussi. Ce fichier ne suit aucun filtre.',
    segment: 'closings/export',
    base: 'roster',
    available: eventRunsClosings,
  }),
  [EVENT_PRODUCERS.CLOSINGS_PDFS]: producer({
    key: EVENT_PRODUCERS.CLOSINGS_PDFS,
    label: 'Synthèses de closing',
    description: 'Une synthèse PDF par closing finalisé, dans une archive.',
    format: 'zip',
    help: 'Une synthèse PDF par closing finalisé. Les documents sont produits à la demande, donc le téléchargement peut prendre quelques instants.',
    segment: 'closings/archive',
    base: 'closingsDone',
    available: eventRunsClosings,
  }),
  [EVENT_PRODUCERS.DIPLOMAS]: producer({
    key: EVENT_PRODUCERS.DIPLOMAS,
    label: 'Certificats',
    description: 'Le certificat de cet événement, un par inscrit.',
    format: 'pdf',
    help: 'Une page par inscrit, avec les signataires du campus. Le document est reconstruit à chaque fois, donc il reflète toujours les signatures en vigueur.',
    segment: 'diplomes.pdf',
    base: 'roster',
    // Two gates, the pair the endpoint applies: the module guards the cohort it
    // prints, the template answers whether this event issues a document at all.
    available: (gates) =>
      eventHasModule(gates.modules, EVENT_MODULES.INSCRITS) &&
      gates.hasDiplomaTemplate,
  }),
};

const EVENT_PRODUCER_ORDER = Object.values(EVENT_PRODUCERS);

/** What this event can produce, in display order. */
export function availableProducers(
  gates: EventSurfaceGates,
): EventProducerKey[] {
  return EVENT_PRODUCER_ORDER.filter((key) =>
    EVENT_PRODUCER_DEFS[key].available(gates),
  );
}

/** Whether a dev can actually reach a surface, module presence + data gates. */
function isSurfaceReachable(
  key: EventSurfaceKey,
  gates: EventSurfaceGates,
): boolean {
  if (key === 'planning') return gates.hasPlanning;
  // Derived, never configured. Every producer requires another surface's module,
  // so this can only ever be reachable alongside at least one other surface -
  // which is what keeps it out of `landingSurface`'s answer and keeps
  // `isNavigable` (`domain/devWorkspace`) counting exactly the events it did
  // before this surface existed.
  if (key === 'exports') return availableProducers(gates).length > 0;
  if (key === EVENT_MODULES.CLOSINGS) return eventRunsClosings(gates);
  if (!eventHasModule(gates.modules, key)) return false;
  if (key === EVENT_MODULES.BILAN) return gates.hasFeedbackForm;
  return true;
}

/** Reachable surfaces in sidebar order. */
export function reachableSurfaces(gates: EventSurfaceGates): EventSurfaceKey[] {
  return EVENT_SURFACE_ORDER.filter((key) => isSurfaceReachable(key, gates));
}

/**
 * The surface to open for an event: `preferred` when the event actually reaches
 * it, else its first reachable one in display order, else null (the event
 * exposes nothing).
 *
 * One function rather than two, because every caller asks the same question with
 * a different amount of context. The dev landing has no surface open and passes
 * nothing; the event switcher and the header's year menu pass the surface in
 * view, so changing context keeps you on the page you were reading. Splitting
 * the two is how the year menu ended up dropping devs on `inscrits` while the
 * switcher, one click away, preserved their surface.
 */
export function landingSurface(
  gates: EventSurfaceGates,
  preferred?: EventSurfaceKey | null,
): EventSurfaceKey | null {
  const reachable = reachableSurfaces(gates);
  if (preferred && reachable.includes(preferred)) return preferred;
  return reachable[0] ?? null;
}

/**
 * URL sub-path under `/staff/dev/events/[id]/` for a surface. Returns the literal
 * segment union (not a bare `string`) so `resolve()` at the call sites can verify
 * the built `/staff/dev/events/[id]/<segment>` path against the real route tree.
 */
export function surfaceSegment(key: EventSurfaceKey): EventSurfaceKey {
  return EVENT_SURFACE_META[key].segment;
}

/**
 * Reverse of `surfaceSegment`, keyed off the same source so the two cannot drift.
 */
const SURFACE_BY_SEGMENT: ReadonlyMap<string, EventSurfaceKey> = new Map(
  EVENT_SURFACE_ORDER.map((key) => [surfaceSegment(key) as string, key]),
);

/**
 * The surface a dev-workspace pathname is on, or null when it is not an event
 * surface (the dev landing, a talent fiche, a PDF endpoint).
 *
 * Validated against the surface union rather than handed back raw, so a caller
 * gets a key it can pass straight to `landingSurface` instead of a string it has
 * to match against a segment list itself.
 *
 * Deliberately unanchored, for two reasons that both matter: the app can be
 * served under a base path, and a page nested under a surface must report the
 * surface carrying it rather than null, or switching event from there would
 * silently drop you back onto the first one.
 */
export function surfaceFromPath(pathname: string): EventSurfaceKey | null {
  const segment = pathname.match(/\/staff\/dev\/events\/[^/]+\/([^/?]+)/)?.[1];
  return (segment && SURFACE_BY_SEGMENT.get(segment)) || null;
}

/** Sidebar label for a surface (FR, staff-facing → vous). */
export function surfaceLabel(key: EventSurfaceKey): string {
  return EVENT_SURFACE_META[key].label;
}
