import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import {
  resetTalentToImport,
  TalentAlreadyErased,
} from '$lib/server/services/talentAccount';
import {
  changeParentEmail,
  type ChangeParentEmailResult,
} from '$lib/server/services/parentAccount';
import { parentCompleteWhere } from '$lib/server/db/dossierCompliance';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  buildTalentWhere,
  buildOrderBy,
  HAS_PARENT,
  TALENT_ROW_SELECT,
  projectTalentRow,
  onboardingDoneWhere,
  type TalentsCohort,
} from './query';
import { resolveTalentFilters } from './facets';

const PER_PAGE = 50;

/** Why `changeParentEmail` refused an address, as the admin reads it. */
const PARENT_EMAIL_REFUSALS: Record<
  Extract<ChangeParentEmailResult, { ok: false }>['reason'],
  string
> = {
  same_as_student:
    "L'adresse du parent doit être différente de celle de l'élève.",
  email_taken: 'Cette adresse est déjà utilisée par un autre compte.',
  staff_address:
    "Une adresse @epitech.eu est réservée à l'équipe : elle ne peut pas servir de compte parent.",
};

// Admin is campus-agnostic (no staffProfile.campusId), so the talent directory
// here is intentionally global, unlike the campus-scoped dev students list.
// The KPI tiles, however, report the *scoped* population (campus + niveau +
// search) so the admin can read onboarding progress for a chosen set of
// campuses; the breakdown filters (statut, parent) narrow the table but not the
// tiles. Filter resolution / where building / row projection all live beside
// this file (./facets, ./query) so the page and the XLSX export can't drift.
export const load: PageServerLoad = async ({ url }) => {
  // Stream the cohort: the heading paints immediately while the column
  // filters' counts, then the row page and the scoped KPI counts (count() over
  // the cumulative campus population, the page's measured ~300-400ms blocking
  // cost), resolve behind the shell skeleton. The counts come first because
  // they decide which ticked values still exist, and so what the rows match.
  const cohort: Promise<TalentsCohort> = (async () => {
    const { filters, facetCounts } = await resolveTalentFilters(
      url.searchParams,
    );
    const { where, scopeWhere } = buildTalentWhere(filters);
    const orderBy = buildOrderBy(filters.sort, filters.dir);

    const [
      rows,
      totalItems,
      scopedTotal,
      onboarded,
      withParent,
      parentsComplete,
      neverConnected,
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
      prisma.talent.count({ where: { AND: [scopeWhere, HAS_PARENT] } }),
      prisma.talent.count({
        where: { AND: [scopeWhere, HAS_PARENT, parentCompleteWhere] },
      }),
      // Talents imported without ever creating a login account, the far end of
      // the funnel (parents still owing = `withParent - parentsComplete`).
      prisma.talent.count({ where: { AND: [scopeWhere, { userId: null }] } }),
    ]);

    return {
      talents: rows.map(projectTalentRow),
      facetCounts,
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
    // Un-awaited on purpose: SvelteKit streams it so the heading paints first.
    cohort,
  };
};

export const actions: Actions = {
  // Impersonation now goes through the shared POST /staff/admin/impersonate
  // endpoint (see $lib/server/auth/impersonate), so the talents directory and
  // the users page drive one mechanism instead of two.

  // Factory reset: wipe everything a talent accrued after the Salesforce worker
  // import (XP, minigames, files, onboarding, parents, the login history, event
  // verdicts) so they're left exactly as the worker leaves a fresh import. The
  // heavy cleanup affordance for after testing the talent experience in prod.
  // An erased talent is refused (`TalentAlreadyErased`).
  resetToImport: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_TALENT_RESET_TO_IMPORT, { locals });
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);

    const data = await request.formData();
    const talentId = data.get('talentId');
    if (typeof talentId !== 'string' || !talentId) return fail(400);

    try {
      await resetTalentToImport(talentId);
    } catch (err) {
      if (err instanceof TalentAlreadyErased) {
        return fail(409, { message: err.message });
      }
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
          message: PARENT_EMAIL_REFUSALS[result.reason],
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
