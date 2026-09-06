import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { resetTalentToImport } from '$lib/server/services/talentAccount';
import { changeParentEmail } from '$lib/server/services/parentAccount';
import { parentCompleteWhere } from '$lib/server/db/dossierCompliance';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  parseTalentFilters,
  buildTalentWhere,
  buildOrderBy,
  TALENT_ROW_SELECT,
  projectTalentRow,
  onboardingDoneWhere,
  type TalentsCohort,
} from './query';

const PER_PAGE = 50;

// Admin is campus-agnostic (no staffProfile.campusId), so the talent directory
// here is intentionally global, unlike the campus-scoped dev students list.
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

  // Stream the cohort: the heading paints immediately while the row page and the
  // six scoped KPI counts (count() over the cumulative campus population, the
  // page's measured ~300-400ms blocking cost) resolve behind the shell skeleton.
  // Campuses (filter multiselect) rides the same payload: its only consumer, the
  // toolbar, lives inside the streamed results region.
  const cohort: Promise<TalentsCohort> = (async () => {
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
        where: { AND: [scopeWhere, onboardingDoneWhere()] },
      }),
      prisma.talent.count({ where: { AND: [scopeWhere, hasParent] } }),
      prisma.talent.count({
        where: { AND: [scopeWhere, hasParent, parentCompleteWhere] },
      }),
      // Talents imported without ever creating a login account, the far end of
      // the funnel (parents still owing = `withParent - parentsComplete`).
      prisma.talent.count({ where: { AND: [scopeWhere, { userId: null }] } }),
      prisma.campus.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    return {
      talents: rows.map(projectTalentRow),
      campuses,
      totalItems,
      totalPages: Math.ceil(totalItems / PER_PAGE),
      stats: {
        scopedTotal,
        onboarded,
        withParent,
        parentsComplete,
        neverConnected,
      },
    };
  })();

  return {
    filters,
    // Un-awaited on purpose: SvelteKit streams it so the heading paints first.
    cohort,
  };
};

export const actions: Actions = {
  // Impersonation now goes through the shared POST /staff/admin/impersonate
  // endpoint (see $lib/server/auth/impersonate), so the talents directory and
  // the users page drive one mechanism instead of two.

  // Factory reset: wipe everything a talent accrued after the Salesforce worker
  // import (XP, minigames, files, onboarding, parents, login account, event
  // verdicts) so they're left exactly as the worker leaves a fresh import. The
  // heavy cleanup affordance for after testing the talent experience in prod.
  resetToImport: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_TALENT_RESET_TO_IMPORT, { locals });
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
    recordUsage(USAGE_FEATURES.ADMIN_TALENT_PARENT_EMAIL_UPDATE, { locals });
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
