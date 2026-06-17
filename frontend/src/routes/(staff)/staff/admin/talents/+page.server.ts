import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import {
  ensureTalentUser,
  resetTalentToImport,
} from '$lib/server/services/talentAccount';
import { changeParentEmail } from '$lib/server/services/parentAccount';
import { parentCompleteWhere } from '$lib/server/db/stageCompliance';
import {
  parseTalentFilters,
  buildTalentWhere,
  buildOrderBy,
  TALENT_ROW_SELECT,
  projectTalentRow,
  ONBOARDING_DONE_WHERE,
} from './query';

const PER_PAGE = 50;

// Admin is campus-agnostic (no staffProfile.campusId), so the talent directory
// here is intentionally global — unlike the campus-scoped dev students list.
// The KPI tiles, however, report the *scoped* population (campus multiselect +
// type + niveau + search) so the admin can read onboarding progress for a
// chosen set of campuses; the breakdown filters (status, parentStatus) narrow
// the table but not the tiles. Filter parsing / where building / row projection
// all live in ./query so the page and the XLSX export can't drift.
export const load: PageServerLoad = async ({ url }) => {
  const filters = parseTalentFilters(url.searchParams);
  const { where, scopeWhere } = buildTalentWhere(filters);
  const orderBy = buildOrderBy(filters.sort, filters.dir);

  // "Has a parent on file" is the denominator for the parent-completion tile
  // and the gate both parent buckets share (no parentEmail = no one to chase).
  const hasParent = { parentEmail: { not: null } } as const;

  const [
    rows,
    totalItems,
    scopedTotal,
    onboarded,
    withParent,
    parentsComplete,
    neverConnected,
    campuses,
  ] = await Promise.all([
    prisma.talent.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: TALENT_ROW_SELECT,
    }),
    prisma.talent.count({ where }),
    // KPI counts, all over `scopeWhere` (status/parentStatus excluded).
    prisma.talent.count({ where: scopeWhere }),
    prisma.talent.count({
      where: { AND: [scopeWhere, ONBOARDING_DONE_WHERE] },
    }),
    prisma.talent.count({ where: { AND: [scopeWhere, hasParent] } }),
    prisma.talent.count({
      where: { AND: [scopeWhere, hasParent, parentCompleteWhere] },
    }),
    // Talents imported without ever creating a login account — the far end of
    // the funnel (parents still owing is read off `withParent - parentsComplete`).
    prisma.talent.count({ where: { AND: [scopeWhere, { userId: null }] } }),
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return {
    talents: rows.map(projectTalentRow),
    campuses,
    totalPages: Math.ceil(totalItems / PER_PAGE),
    totalItems,
    currentPage: filters.page,
    filters,
    stats: {
      scopedTotal,
      onboarded,
      withParent,
      parentsComplete,
      neverConnected,
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

  // Factory reset: wipe everything a talent accrued after the Salesforce worker
  // import (XP, minigames, files, onboarding, parents, login account, event
  // verdicts) so they're left exactly as the worker leaves a fresh import. The
  // heavy cleanup affordance for after testing the talent experience in prod.
  resetToImport: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);

    const data = await request.formData();
    const talentId = data.get('talentId');
    if (typeof talentId !== 'string' || !talentId) return fail(400);

    try {
      await resetTalentToImport(talentId);
    } catch (err) {
      console.error('[resetToImport] failed', err);
      return fail(500, { message: 'Échec de la réinitialisation complète.' });
    }
    return { success: true };
  },

  // Fix the email a parent-1 signs in with (e.g. a typo entered at onboarding
  // that locked the parent out). Moves Talent.parentEmail and the parent's
  // bauth_user.email together, with the hijack/sibling guards in
  // changeParentEmail; optionally re-sends the connection link to the new
  // address.
  updateParentEmail: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);

    const data = await request.formData();
    const talentId = data.get('talentId');
    const resendWelcome = data.get('resendWelcome') === 'on';
    if (typeof talentId !== 'string' || !talentId) return fail(400);

    const parsed = z
      .email('Adresse email invalide.')
      .safeParse(String(data.get('email') ?? '').trim());
    if (!parsed.success) {
      return fail(400, { message: parsed.error.issues[0]?.message });
    }

    try {
      const result = await changeParentEmail(talentId, parsed.data, {
        resendWelcome,
      });
      if (!result.ok) {
        return fail(400, {
          message:
            result.reason === 'same_as_student'
              ? "L'adresse du parent doit être différente de celle de l'élève."
              : 'Cette adresse est déjà utilisée par un autre compte.',
        });
      }
      const message = !result.changed
        ? result.welcomeSent
          ? 'Lien de connexion renvoyé.'
          : 'Adresse inchangée.'
        : result.welcomeSent
          ? 'Email du parent mis à jour, lien de connexion envoyé.'
          : 'Email du parent mis à jour.';
      return { success: true, message };
    } catch (err) {
      console.error('[updateParentEmail] failed', err);
      return fail(500, { message: "Échec de la mise à jour de l'email." });
    }
  },
};
