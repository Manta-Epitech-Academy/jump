import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { computeLevel } from '$lib/domain/xp';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import {
  ensureTalentUser,
  resetTalentOnboarding,
} from '$lib/server/services/talentAccount';

const PER_PAGE = 50;

type AccountFilter = 'all' | 'active' | 'pending';

/**
 * An impersonated talent lands wherever the talent route-guards send them, so
 * surfacing onboarding state up front tells the admin what they'll walk into:
 * a `pending` talent will be funnelled through onboarding/charter (and any
 * action there mutates the real profile). Mirrors the guard's checks in
 * `guards.ts`.
 */
function onboardingStatus(t: {
  userId: string | null;
  charterAcceptedAt: Date | null;
  rulesSignedAt: Date | null;
  infoValidatedAt: Date | null;
  highSchoolValidatedAt: Date | null;
  techInterestsValidatedAt: Date | null;
  generalInterestsValidatedAt: Date | null;
  interestsRecapSeenAt: Date | null;
}): 'never' | 'pending' | 'active' {
  if (!t.userId) return 'never';
  const complete =
    t.infoValidatedAt &&
    t.highSchoolValidatedAt &&
    t.techInterestsValidatedAt &&
    t.generalInterestsValidatedAt &&
    t.interestsRecapSeenAt &&
    t.rulesSignedAt &&
    t.charterAcceptedAt;
  return complete ? 'active' : 'pending';
}

// Admin is campus-agnostic (no staffProfile.campusId), so the talent directory
// here is intentionally global — unlike the campus-scoped dev students list.
export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const search = url.searchParams.get('q') || '';
  const niveau = url.searchParams.get('niveau') || '';
  const account = (url.searchParams.get('account') || 'all') as AccountFilter;
  const campus = url.searchParams.get('campus') || '';

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
  // A talent's campus isn't a column — it's wherever they last participated.
  // `some` matches any campus they've attended, which is the useful net for
  // "find me someone tied to campus X" even if their most-recent (effective)
  // campus differs.
  if (campus) where.participations = { some: { campusId: campus } };

  const [rows, totalItems, totalAll, activeAll, campuses] = await Promise.all([
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
        rulesSignedAt: true,
        infoValidatedAt: true,
        highSchoolValidatedAt: true,
        techInterestsValidatedAt: true,
        generalInterestsValidatedAt: true,
        interestsRecapSeenAt: true,
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
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const talents = rows.map(({ charterAcceptedAt, participations, ...t }) => ({
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
    status: onboardingStatus({ ...t, charterAcceptedAt }),
  }));

  return {
    talents,
    campuses,
    totalPages: Math.ceil(totalItems / PER_PAGE),
    totalItems,
    currentPage: page,
    filters: { q: search, niveau, account, campus },
    stats: {
      total: totalAll,
      active: activeAll,
      pending: totalAll - activeAll,
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
