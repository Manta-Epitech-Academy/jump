import type { Prisma } from '@prisma/client';
import { computeLevel } from '$lib/domain/xp';
import {
  deriveOnboardingStatus,
  describeOnboardingProgress,
  ONBOARDING_STEP_LABELS,
  onboardingFieldsForYear,
  type OnboardingStepFields,
  type TalentOnboardingFields,
} from '$lib/domain/talentOnboarding';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import {
  parentBlockedWhere,
  parentCompleteWhere,
} from '$lib/server/db/dossierCompliance';
import {
  onboardingEligibleWhere,
  onboardingNotApplicableWhere,
} from '$lib/server/db/onboardingEligibility';
import { isOnboardingEligible } from '$lib/domain/niveau';
import { isParentDossierComplete } from '$lib/domain/dossierCompliance';
import type { TalentAccountStatus, ParentCompletionStatus } from './labels';
import { guardiansOf } from '$lib/domain/contact';

/**
 * Single source of truth for the admin talents directory query. Both the page
 * `load` and the XLSX `export/+server.ts` parse the same URL params, build the
 * same `where`, select the same columns and project the same row shape through
 * this module — so the on-screen badges and the exported file can never drift,
 * and a filter added in one place is honoured in both.
 */

// ---- filter parsing -------------------------------------------------------

// Mirrors the four onboarding states shown in the table's Statut column:
// `active` = onboarding complete, `onboarding` = account exists but mid-flow,
// `never` = no login account, `no_dossier` = a collégien, who has no onboarding
// to do at all. `all` clears the filter.
export type StatusFilter =
  | 'all'
  | 'active'
  | 'onboarding'
  | 'never'
  | 'no_dossier';
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
  sort: TalentSortKey | '';
  dir: 'asc' | 'desc';
  page: number;
};

const STATUS_VALUES: StatusFilter[] = [
  'all',
  'active',
  'onboarding',
  'never',
  'no_dossier',
];
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
    sort: SORT_VALUES.includes(sortParam) ? sortParam : '',
    dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number(searchParams.get('page')) || 1),
  };
}

// ---- where building -------------------------------------------------------

/**
 * Prisma predicate for a talent who has fully cleared platform onboarding —
 * every step gate set AND the charter accepted. The Prisma mirror of
 * `deriveOnboardingStatus(...) === 'done'`; the Statut filter splits accounts
 * into done (`active`) vs not-done (`onboarding`) by negating this, so a new
 * gate added to the ladder has to land here too.
 *
 * Eligibility is folded in for the same reason as in `adminStats/cohort.ts`:
 * the negation is what `onboarding` filters on, and without it every collégien
 * would answer to "mid-flow" despite having no flow.
 */
export function onboardingDoneWhere(): Prisma.TalentWhereInput {
  return {
    ...onboardingEligibleWhere,
    // This year's dossier, not any dossier. The directory answers "what will I
    // walk into if I impersonate this account", and the talent guards send a
    // returning talent back through the wizard, so a completed 2025-2026 dossier
    // is not "onboardé" once 2026-2027 has opened. Resolved per call: a constant
    // would freeze the year at import and a pod alive across the 31 July cutoff
    // would keep answering about the year that just ended.
    onboardingSchoolYear: currentSchoolYearLabel(),
    infoValidatedAt: { not: null },
    highSchoolValidatedAt: { not: null },
    parentsValidatedAt: { not: null },
    techInterestsValidatedAt: { not: null },
    generalInterestsValidatedAt: { not: null },
    equipmentValidatedAt: { not: null },
    processingCompletedAt: { not: null },
    rulesSignedAt: { not: null },
    // Once per account, never re-asked, so it is not narrowed to the year.
    charterAcceptedAt: { not: null },
  };
}

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
        { user: { email: { contains: sanitized, mode: 'insensitive' } } },
      ],
    });
  }
  if (f.niveau) scope.push({ niveau: f.niveau });

  // A talent's campus isn't a column — `some` matches any campus they've
  // attended, the useful net for "anyone tied to campus X".
  if (f.campusIds.length) {
    scope.push({
      participations: { some: { campusId: { in: f.campusIds } } },
    });
  }

  const scopeWhere: Prisma.TalentWhereInput = scope.length
    ? { AND: scope }
    : {};

  const narrow: Prisma.TalentWhereInput[] = [...scope];
  // no_dossier is checked first and stands alone: a collégien has no ladder, so
  // asking whether they cleared it is meaningless. The other three keep their
  // meaning within the population that does have one.
  if (f.status === 'no_dossier') narrow.push(onboardingNotApplicableWhere);
  else if (f.status === 'never')
    narrow.push({ userId: null }, onboardingEligibleWhere);
  else if (f.status === 'active')
    narrow.push({ userId: { not: null } }, onboardingDoneWhere());
  else if (f.status === 'onboarding')
    narrow.push(
      { userId: { not: null }, NOT: onboardingDoneWhere() },
      onboardingEligibleWhere,
    );

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
      // Never active sorts to the FAR END of the axis, not to the bottom in both
      // directions, which is what every other nullable column here does. The
      // absence is the value: `lastActiveLabel` prints "Jamais" rather than a
      // dash for exactly that reason, and a talent nobody has ever seen log in is
      // the least recently active there is. So one click groups them at the top,
      // matching the members directory, where the same ordering replaced a filter
      // tile. The account-status filter still reaches them directly; the sort is
      // what makes the column mean what its header says.
      return [
        {
          lastActiveAt: { sort: dir, nulls: dir === 'asc' ? 'first' : 'last' },
        },
        { nom: 'asc' },
      ];
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
  user: { select: { email: true } },
  niveau: true,
  userId: true,
  xp: true,
  eventsCount: true,
  lastActiveAt: true,
  // Talent's own coordinates (gender + phone) for the contact card / export.
  civilite: true,
  phone: true,
  charterAcceptedAt: true,
  onboardingSchoolYear: true,
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
  // resolution in hooks.server.ts (talentCampusName).
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
  t: TalentOnboardingFields & { userId: string | null; niveau: string | null },
): TalentAccountStatus {
  // Checked before the account: a collégien without a login is still "no
  // dossier", not "never connected". The latter reads as something to chase.
  if (!isOnboardingEligible(t.niveau)) return 'no_dossier';
  if (!t.userId) return 'never';
  return deriveOnboardingStatus(t) === 'done' ? 'active' : 'pending';
}

/**
 * Human label for where a `pending` talent will resume — what the admin walks
 * into on impersonation. "Non démarré" when the account exists but no step is
 * done; "N/total · <étape>" mid-flow. `null` for `never`/`active`, and unused
 * for `no_dossier`, which has no rung to name.
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
  // Two readings of one row, kept as two named values rather than one narrowed
  // row, because a single blanket transform silently converts every read below
  // into a year question and only some of them are (see `DatedOnboardingFields`).
  //
  // `dossier` is the ladder, which IS a year question: the flat columns hold the
  // most recent dossier, so a talent returning after the summer carries last
  // year's, and unnarrowed the directory would call them onboardé while the
  // guards send them straight back through the wizard.
  //
  // `t` is the row as it stands, for everything that asks "ever / most recent" -
  // the guardian's outstanding acts below, and the identity and activity columns.
  const { participations, ...t } = row;
  const dossier = onboardingFieldsForYear(row, currentSchoolYearLabel());
  const status = onboardingStatus(dossier);
  const guardians = guardiansOf(t);
  // Parent status, gated on a parentEmail (the relance contact). null = no
  // parent to chase. Mirror of the parentStatus where-filter above, through the
  // predicate those fragments are the SQL twins of - and on `t`, not `dossier`:
  // what a guardian still owes is not a question about a school year, and
  // narrowing it here is what made this chip read "En attente" for every talent
  // whose dossier predates the cutover while the filter and the KPI tile above
  // counted them complete.
  const parentStatus: ParentCompletionStatus | null = !t.parentEmail
    ? null
    : isParentDossierComplete(t)
      ? 'complete'
      : 'pending';
  return {
    id: t.id,
    nom: t.nom,
    prenom: t.prenom,
    email: t.user?.email ?? null,
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
    // admin sees where impersonation will drop them, so it reads the year's
    // dossier like the badge it annotates.
    onboardingStep: status === 'pending' ? onboardingStepLabel(dossier) : null,
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
