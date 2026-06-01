import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { computeLevel } from '$lib/domain/xp';
import {
  EVENT_TYPES,
  EVENT_TYPE_VALUES,
  type EventType,
} from '$lib/domain/event';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import {
  ensureTalentUser,
  resetTalentOnboarding,
} from '$lib/server/services/talentAccount';
import {
  deriveOnboardingStatus,
  describeOnboardingProgress,
  ONBOARDING_STEP_LABELS,
  type OnboardingStepFields,
  type TalentOnboardingFields,
} from '$lib/domain/talentOnboarding';

const PER_PAGE = 50;

type AccountFilter = 'all' | 'active' | 'pending';

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
function stageSecondeThisYearEventFilter(): import('@prisma/client').Prisma.EventWhereInput {
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
 * An impersonated talent lands wherever the talent route-guards send them, so
 * surfacing onboarding state up front tells the admin what they'll walk into:
 * a `pending` talent will be funnelled through onboarding/charter (and any
 * action there mutates the real profile). Mirrors the guard's checks in
 * `guards.ts`.
 */
function onboardingStatus(
  t: TalentOnboardingFields & { userId: string | null },
): 'never' | 'pending' | 'active' {
  if (!t.userId) return 'never';
  // Complete = the whole step ladder cleared AND charter accepted (the charter
  // is signed alongside the rules step, but kept explicit to mirror guards.ts).
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
  // in-progress: step is the one they're currently on (completed + 1 of total).
  return `${completed + 1}/${total} · ${ONBOARDING_STEP_LABELS[step!]}`;
}

// Admin is campus-agnostic (no staffProfile.campusId), so the talent directory
// here is intentionally global — unlike the campus-scoped dev students list.
export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const search = url.searchParams.get('q') || '';
  const niveau = url.searchParams.get('niveau') || '';
  const account = (url.searchParams.get('account') || 'all') as AccountFilter;
  const campus = url.searchParams.get('campus') || '';
  // Talents have no "type" column — they're a stagiaire/coding-clubber by virtue
  // of the events they attended. Validate against the canonical list so a junk
  // ?type= silently degrades to "all" rather than matching zero rows.
  const typeParam = url.searchParams.get('type') || '';
  const type = (EVENT_TYPE_VALUES as string[]).includes(typeParam)
    ? (typeParam as EventType)
    : '';

  const where: import('@prisma/client').Prisma.TalentWhereInput = {};
  if (search) {
    const sanitized = search.replace(/[^a-zA-ZÀ-ÿ0-9\s'@.\-]/g, '').trim();
    if (sanitized) {
      where.OR = [
        { nom: { contains: sanitized, mode: 'insensitive' } },
        { prenom: { contains: sanitized, mode: 'insensitive' } },
        { email: { contains: sanitized, mode: 'insensitive' } },
      ];
    }
  }
  if (niveau) where.niveau = niveau;
  if (account === 'active') where.userId = { not: null };
  else if (account === 'pending') where.userId = null;
  // Campus and type both narrow the same relation, so build one `some` filter
  // and let them AND together — "a stagiaire *at* campus X" means one
  // participation that is both, not two separate matches. A talent's campus
  // isn't a column: `some` matches any campus they've attended, the useful net
  // for "find me someone tied to campus X" even if their effective campus
  // differs. The stage-seconde filter is scoped to this year's cohort (see
  // stageSecondeThisYearEventFilter); coding-club, being year-round, is not.
  if (campus || type) {
    const participation: import('@prisma/client').Prisma.ParticipationWhereInput =
      {};
    if (campus) participation.campusId = campus;
    if (type === EVENT_TYPES.STAGE_SECONDE) {
      participation.event = stageSecondeThisYearEventFilter();
    } else if (type) {
      participation.event = { eventType: type };
    }
    where.participations = { some: participation };
  }

  const [rows, totalItems, totalAll, activeAll, stagiairesAll, campuses] =
    await Promise.all([
      prisma.talent.findMany({
        where,
        orderBy: [
          { lastActiveAt: { sort: 'desc', nulls: 'last' } },
          { nom: 'asc' },
        ],
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          niveau: true,
          userId: true,
          xp: true,
          eventsCount: true,
          lastActiveAt: true,
          charterAcceptedAt: true,
          infoValidatedAt: true,
          highSchoolValidatedAt: true,
          parentsValidatedAt: true,
          techInterestsValidatedAt: true,
          generalInterestsValidatedAt: true,
          equipmentValidatedAt: true,
          processingCompletedAt: true,
          rulesSignedAt: true,
          // Effective campus = most-recent participation's campus, matching the
          // resolution in hooks.server.ts that scopes `locals.featureFlags`.
          participations: {
            take: 1,
            orderBy: { event: { date: 'desc' } },
            select: { campus: { select: { name: true } } },
          },
        },
      }),
      prisma.talent.count({ where }),
      prisma.talent.count(),
      prisma.talent.count({ where: { userId: { not: null } } }),
      // Headline metric: how many talents are in this year's stage cohort.
      // Unfiltered (ignores the active `where`) so the tile always shows the
      // full population, like `totalAll`/`activeAll`.
      prisma.talent.count({
        where: {
          participations: {
            some: { event: stageSecondeThisYearEventFilter() },
          },
        },
      }),
      prisma.campus.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

  const talents = rows.map(({ charterAcceptedAt, participations, ...t }) => {
    const status = onboardingStatus({ ...t, charterAcceptedAt });
    return {
      id: t.id,
      nom: t.nom,
      prenom: t.prenom,
      email: t.email,
      niveau: t.niveau,
      userId: t.userId,
      level: computeLevel(t.xp),
      xp: t.xp,
      eventsCount: t.eventsCount,
      lastActiveAt: t.lastActiveAt,
      campus: participations[0]?.campus?.name ?? null,
      status,
      // Only meaningful mid-journey: shown next to the "Onboarding" badge so the
      // admin sees where impersonation will drop them.
      onboardingStep: status === 'pending' ? onboardingStepLabel(t) : null,
    };
  });

  return {
    talents,
    campuses,
    totalPages: Math.ceil(totalItems / PER_PAGE),
    totalItems,
    currentPage: page,
    filters: { q: search, niveau, account, campus, type },
    stats: {
      total: totalAll,
      active: activeAll,
      pending: totalAll - activeAll,
      stagiaires: stagiairesAll,
    },
  };
};

export const actions: Actions = {
  // Impersonate a talent: swap the admin's session for a BetterAuth
  // impersonation session (stamps `session.impersonatedBy` so the talent-side
  // banner can offer "return to admin"). Seeded talents get a bauth_user
  // bootstrapped on the fly via ensureTalentUser.
  impersonate: async ({ request, cookies, locals }) => {
    // Belt-and-braces: the /staff/admin/* route guard already enforces admin,
    // and BetterAuth re-checks the actor's role, but assert it here too since
    // this action mints a session as someone else.
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);

    const data = await request.formData();
    const talentId = data.get('talentId');
    if (typeof talentId !== 'string' || !talentId) return fail(400);

    let userId: string;
    try {
      userId = await ensureTalentUser(talentId);
    } catch (err) {
      console.error('[impersonate] ensureTalentUser failed', err);
      return fail(400, {
        message:
          "Ce talent n'a pas d'email — impossible de créer un compte de connexion.",
      });
    }

    const res = await auth.api.impersonateUser({
      body: { userId },
      headers: request.headers,
      asResponse: true,
    });
    if (!res.ok) {
      console.error('[impersonate] BetterAuth refused', res.status);
      return fail(500, { message: 'Impersonation refusée.' });
    }

    forwardAuthCookies(res, cookies);
    throw redirect(303, resolve('/'));
  },

  // Dev/QA affordance: send a talent back through the full onboarding + arrival
  // flow so it can be re-tested (typically right before impersonating them).
  resetOnboarding: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);

    const data = await request.formData();
    const talentId = data.get('talentId');
    if (typeof talentId !== 'string' || !talentId) return fail(400);

    try {
      await resetTalentOnboarding(talentId);
    } catch (err) {
      console.error('[resetOnboarding] failed', err);
      return fail(500, { message: 'Échec de la réinitialisation.' });
    }
    return { success: true };
  },
};
