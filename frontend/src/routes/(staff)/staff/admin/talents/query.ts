import type { Prisma } from '@prisma/client';
import { computeLevel } from '$lib/domain/xp';
import {
  EVENT_TYPES,
  EVENT_TYPE_VALUES,
  type EventType,
} from '$lib/domain/event';
import {
  deriveOnboardingStatus,
  describeOnboardingProgress,
  ONBOARDING_STEP_LABELS,
  type OnboardingStepFields,
  type TalentOnboardingFields,
} from '$lib/domain/talentOnboarding';
import {
  parentBlockedWhere,
  parentCompleteWhere,
} from '$lib/server/db/stageCompliance';
import type { TalentAccountStatus, ParentCompletionStatus } from './labels';

/**
 * Single source of truth for the admin talents directory query. Both the page
 * `load` and the XLSX `export/+server.ts` parse the same URL params, build the
 * same `where`, select the same columns and project the same row shape through
 * this module — so the on-screen badges and the exported file can never drift,
 * and a filter added in one place is honoured in both.
 */

// ---- filter parsing -------------------------------------------------------

// Mirrors the three onboarding states shown in the table's Statut column:
// `active` = onboarding complete, `onboarding` = account exists but mid-flow,
// `never` = no login account. `all` clears the filter.
export type StatusFilter = 'all' | 'active' | 'onboarding' | 'never';
// Parent completion: "complete" once the guardian co-signed the règlement AND
// settled the image-rights decision; "pending" = still blocked on one. `all`
// clears it. Both buckets presuppose a parent on file (see buildTalentWhere).
export type ParentStatusFilter = 'all' | 'pending' | 'complete';
export type TalentSortKey = 'nom' | 'niveau' | 'xp' | 'activite';

export type TalentFilters = {
  q: string;
  niveau: string;
  status: StatusFilter;
  /** Multi-select: every campus the admin scoped the directory to (empty = all). */
  campusIds: string[];
  parentStatus: ParentStatusFilter;
  type: EventType | '';
  sort: TalentSortKey | '';
  dir: 'asc' | 'desc';
  page: number;
};

const STATUS_VALUES: StatusFilter[] = ['all', 'active', 'onboarding', 'never'];
const PARENT_STATUS_VALUES: ParentStatusFilter[] = [
  'all',
  'pending',
  'complete',
];
const SORT_VALUES: TalentSortKey[] = ['nom', 'niveau', 'xp', 'activite'];

/**
 * Parse the directory filters off the URL. Every enum-ish param degrades to its
 * default on junk input (so a hand-edited `?status=foo` never matches zero rows
 * by surprise), and `campus` is a comma-separated id list (`'all'`/blank → none).
 */
export function parseTalentFilters(
  searchParams: URLSearchParams,
): TalentFilters {
  const statusParam = (searchParams.get('status') || 'all') as StatusFilter;
  const parentParam = (searchParams.get('parentStatus') ||
    'all') as ParentStatusFilter;
  const typeParam = searchParams.get('type') || '';
  const sortParam = (searchParams.get('sort') || '') as TalentSortKey;
  const campusIds = (searchParams.get('campus') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'all');

  return {
    q: searchParams.get('q') || '',
    niveau: searchParams.get('niveau') || '',
    status: STATUS_VALUES.includes(statusParam) ? statusParam : 'all',
    campusIds,
    parentStatus: PARENT_STATUS_VALUES.includes(parentParam)
      ? parentParam
      : 'all',
    type: (EVENT_TYPE_VALUES as string[]).includes(typeParam)
      ? (typeParam as EventType)
      : '',
    sort: SORT_VALUES.includes(sortParam) ? sortParam : '',
    dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number(searchParams.get('page')) || 1),
  };
}

// ---- where building -------------------------------------------------------

/**
 * "Stagiaire" = this year's cohort, not anyone who ever attended a stage. The
 * stage de seconde runs once a year, so the population the admin tracks —
 * arriving for the upcoming stage, currently in it, or recently finished — is
 * exactly the stage-seconde events dated in the current calendar year. A bare
 * "≥1 stage participation ever" kept every past cohort in the count forever.
 *
 * Calendar-year bounds in UTC are exact enough: a stage never starts on Jan 1,
 * so no event sits on the boundary where the campus timezone could shift it
 * into the adjacent year.
 */
export function stageSecondeThisYearEventFilter(): Prisma.EventWhereInput {
  const year = new Date().getUTCFullYear();
  return {
    eventType: EVENT_TYPES.STAGE_SECONDE,
    date: {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    },
  };
}

/**
 * Prisma predicate for a talent who has fully cleared platform onboarding —
 * every step gate set AND the charter accepted. The Prisma mirror of
 * `deriveOnboardingStatus(...) === 'done'`; the three-way Statut filter splits
 * accounts into done (`active`) vs not-done (`onboarding`) by negating this, so
 * a new gate added to the ladder has to land here too.
 */
export const ONBOARDING_DONE_WHERE: Prisma.TalentWhereInput = {
  infoValidatedAt: { not: null },
  highSchoolValidatedAt: { not: null },
  parentsValidatedAt: { not: null },
  techInterestsValidatedAt: { not: null },
  generalInterestsValidatedAt: { not: null },
  equipmentValidatedAt: { not: null },
  processingCompletedAt: { not: null },
  rulesSignedAt: { not: null },
  charterAcceptedAt: { not: null },
};

/**
 * Builds the directory `where` and the KPI `scopeWhere` from one filter set.
 *
 * `scopeWhere` is the population the KPI tiles measure: search + niveau + the
 * campus/type participation match. The breakdown axes (`status`, `parentStatus`)
 * are deliberately excluded so a tile reads "how many of the scoped cohort are
 * onboarded", not "how many of the already-onboarded are onboarded".
 *
 * `where` layers the status + parentStatus narrowing on top. Everything is
 * accumulated into a single `AND` array (search included, as an `AND[].OR`
 * entry) so the clauses compose instead of clobbering each other — the old code
 * assigned `where.AND` twice, which silently dropped the status filter whenever
 * a parent filter was also set, making "onboardé + en attente parent"
 * inexpressible.
 */
export function buildTalentWhere(f: TalentFilters): {
  where: Prisma.TalentWhereInput;
  scopeWhere: Prisma.TalentWhereInput;
} {
  const scope: Prisma.TalentWhereInput[] = [];

  const sanitized = f.q.replace(/[^a-zA-ZÀ-ÿ0-9\s'@.\-]/g, '').trim();
  if (sanitized) {
    scope.push({
      OR: [
        { nom: { contains: sanitized, mode: 'insensitive' } },
        { prenom: { contains: sanitized, mode: 'insensitive' } },
        { email: { contains: sanitized, mode: 'insensitive' } },
      ],
    });
  }
  if (f.niveau) scope.push({ niveau: f.niveau });

  // Campus and type narrow the same relation, so one `some` carries both:
  // "a stagiaire *at* campus X" is one participation that is both, not two
  // separate matches. A talent's campus isn't a column — `some` matches any
  // campus they've attended, the useful net for "anyone tied to campus X". The
  // stage-seconde filter is scoped to this year's cohort; coding-club, being
  // year-round, is not.
  if (f.campusIds.length || f.type) {
    const participation: Prisma.ParticipationWhereInput = {};
    if (f.campusIds.length) participation.campusId = { in: f.campusIds };
    if (f.type === EVENT_TYPES.STAGE_SECONDE) {
      participation.event = stageSecondeThisYearEventFilter();
    } else if (f.type) {
      participation.event = { eventType: f.type };
    }
    scope.push({ participations: { some: participation } });
  }

  const scopeWhere: Prisma.TalentWhereInput = scope.length
    ? { AND: scope }
    : {};

  const narrow: Prisma.TalentWhereInput[] = [...scope];
  // active/onboarding both require an account, then split on whether onboarding
  // is fully cleared; never is the no-account set.
  if (f.status === 'never') narrow.push({ userId: null });
  else if (f.status === 'active')
    narrow.push({ userId: { not: null } }, ONBOARDING_DONE_WHERE);
  else if (f.status === 'onboarding')
    narrow.push({ userId: { not: null }, NOT: ONBOARDING_DONE_WHERE });

  // Both parent buckets presuppose a parent on file (a parentEmail to relance).
  if (f.parentStatus === 'pending')
    narrow.push({ parentEmail: { not: null } }, parentBlockedWhere);
  else if (f.parentStatus === 'complete')
    narrow.push({ parentEmail: { not: null } }, parentCompleteWhere);

  const where: Prisma.TalentWhereInput = narrow.length ? { AND: narrow } : {};
  return { where, scopeWhere };
}

/**
 * Clickable column sort → Prisma orderBy. Unknown/empty `sort` falls back to the
 * baseline ordering (most-recently-active first), so a junk param never breaks
 * the page and the export sorts identically to the table.
 */
export function buildOrderBy(
  sort: TalentFilters['sort'],
  dir: 'asc' | 'desc',
): Prisma.TalentOrderByWithRelationInput[] {
  switch (sort) {
    case 'nom':
      return [{ nom: dir }, { prenom: dir }];
    case 'niveau':
      return [{ niveau: { sort: dir, nulls: 'last' } }, { nom: 'asc' }];
    case 'xp':
      return [{ xp: dir }, { nom: 'asc' }];
    case 'activite':
      return [{ lastActiveAt: { sort: dir, nulls: 'last' } }, { nom: 'asc' }];
    default:
      return [
        { lastActiveAt: { sort: 'desc', nulls: 'last' } },
        { nom: 'asc' },
      ];
  }
}

// ---- row selection + projection -------------------------------------------

/** Columns the directory list and the export both read. Shared so they can't drift. */
export const TALENT_ROW_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  email: true,
  niveau: true,
  userId: true,
  xp: true,
  eventsCount: true,
  lastActiveAt: true,
  // Talent's own coordinates (gender + phone) for the contact card / export.
  civilite: true,
  phone: true,
  charterAcceptedAt: true,
  infoValidatedAt: true,
  highSchoolValidatedAt: true,
  parentsValidatedAt: true,
  techInterestsValidatedAt: true,
  generalInterestsValidatedAt: true,
  equipmentValidatedAt: true,
  processingCompletedAt: true,
  rulesSignedAt: true,
  // Guardian contacts (up to two, in priority order) + parent-1 compliance
  // fields the parentStatus chip / export read.
  parentEmail: true,
  parentNom: true,
  parentPrenom: true,
  parentPhone: true,
  parentCivilite: true,
  parent2Email: true,
  parent2Nom: true,
  parent2Prenom: true,
  parent2Phone: true,
  parent2Civilite: true,
  imageRightsDecision: true,
  imageRightsDecidedAt: true,
  parentRulesSignedAt: true,
  // Effective campus = most-recent participation's campus, matching the
  // resolution in hooks.server.ts that scopes `locals.featureFlags`.
  participations: {
    take: 1,
    orderBy: { event: { date: 'desc' } },
    select: { campus: { select: { name: true } } },
  },
} satisfies Prisma.TalentSelect;

export type TalentRow = Prisma.TalentGetPayload<{
  select: typeof TALENT_ROW_SELECT;
}>;

/**
 * An impersonated talent lands wherever the talent route-guards send them, so
 * surfacing onboarding state up front tells the admin what they'll walk into:
 * a `pending` talent gets funnelled through onboarding/charter. Mirrors the
 * guard's checks in `guards.ts`.
 */
function onboardingStatus(
  t: TalentOnboardingFields & { userId: string | null },
): TalentAccountStatus {
  if (!t.userId) return 'never';
  return deriveOnboardingStatus(t) === 'done' ? 'active' : 'pending';
}

/**
 * Human label for where a `pending` talent will resume — what the admin walks
 * into on impersonation. "Non démarré" when the account exists but no step is
 * done; "N/total · <étape>" mid-flow. `null` for `never`/`active`.
 */
function onboardingStepLabel(t: OnboardingStepFields): string | null {
  const { step, completed, total, phase } = describeOnboardingProgress(t);
  if (phase === 'complete') return null;
  if (phase === 'not-started') return 'Non démarré';
  return `${completed + 1}/${total} · ${ONBOARDING_STEP_LABELS[step!]}`;
}

/**
 * Project a selected row into the shape the table and export consume. The
 * derived status / parentStatus / onboardingStep live here so both surfaces
 * read the exact same verdict.
 */
export function projectTalentRow(row: TalentRow) {
  const { charterAcceptedAt, participations, ...t } = row;
  const status = onboardingStatus({ ...t, charterAcceptedAt });
  // Both guardians in priority order; drop any with no identity or contact at
  // all so the contact dialog only ever lists reachable responsables.
  const guardians = [
    {
      civilite: t.parentCivilite,
      prenom: t.parentPrenom,
      nom: t.parentNom,
      email: t.parentEmail,
      phone: t.parentPhone,
    },
    {
      civilite: t.parent2Civilite,
      prenom: t.parent2Prenom,
      nom: t.parent2Nom,
      email: t.parent2Email,
      phone: t.parent2Phone,
    },
  ].filter((g) => g.prenom || g.nom || g.email || g.phone);
  // Parent status, gated on a parentEmail (the relance contact). null = no
  // parent to chase. Mirror of the parentStatus where-filter above.
  const parentStatus: ParentCompletionStatus | null = !t.parentEmail
    ? null
    : t.parentRulesSignedAt && t.imageRightsDecidedAt
      ? 'complete'
      : 'pending';
  return {
    id: t.id,
    nom: t.nom,
    prenom: t.prenom,
    email: t.email,
    phone: t.phone,
    civilite: t.civilite,
    niveau: t.niveau,
    userId: t.userId,
    level: computeLevel(t.xp),
    xp: t.xp,
    eventsCount: t.eventsCount,
    lastActiveAt: t.lastActiveAt,
    imageRightsDecision: t.imageRightsDecision,
    // Parent-1 identity, surfaced so the admin can edit the login email the
    // parent connects with (see the updateParentEmail action).
    parentEmail: t.parentEmail,
    parentPrenom: t.parentPrenom,
    parentNom: t.parentNom,
    campus: participations[0]?.campus?.name ?? null,
    status,
    // Only meaningful mid-journey: shown next to the "Onboarding" badge so the
    // admin sees where impersonation will drop them.
    onboardingStep: status === 'pending' ? onboardingStepLabel(t) : null,
    guardians,
    parentStatus,
  };
}

/** One projected directory row, as the table + dialogs consume it. */
export type TalentDirectoryRow = ReturnType<typeof projectTalentRow>;

/**
 * The streamed directory payload: the page chrome (heading) paints immediately
 * while the current page of rows, the total count and the six scoped KPI counts
 * resolve behind the shell skeleton. Shared by the page `load` and
 * `TalentsResults` so the streamed shape and the consuming component can't drift
 * — the admin sibling of the dev `InscritsCohort`.
 */
export type TalentsCohort = {
  talents: TalentDirectoryRow[];
  campuses: { id: string; name: string }[];
  totalItems: number;
  totalPages: number;
  stats: {
    scopedTotal: number;
    onboarded: number;
    withParent: number;
    parentsComplete: number;
    neverConnected: number;
  };
};
