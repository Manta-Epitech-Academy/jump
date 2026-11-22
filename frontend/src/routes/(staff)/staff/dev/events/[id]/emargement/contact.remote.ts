import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getCampusId, scopedPrisma } from '#lib/server/db/scoped.ts';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';
import { loadEventOr404 } from '#lib/server/services/stageContext.ts';
import { EVENT_MODULES } from '#lib/domain/eventModules.ts';
import { visibleParticipationWhere } from '#lib/domain/sfMemberStatus.ts';
import { guardiansOf, type ContactPerson } from '#lib/domain/contact.ts';
import { recordUsage } from '#lib/server/usage/record.ts';
import { USAGE_FEATURES } from '#lib/domain/usage.ts';

/**
 * One roster row's coordinates, for `ContactDialog`: asked on open rather than
 * carried by the cohort, since the roster streams ~200 rows and none of them
 * needs to hold a phone number until somebody asks for one.
 *
 * `ContactPerson` on both sides, so the dialog renders through the same
 * `StudentContactDetails` as the admin directory and the student dossier. It
 * used to flatten the pair into one `fullName`, which cost the given-name /
 * surname split that display treatment is built on.
 */
export const emargementContact = gatedQuery(
  { staff: 'devMember' },
  z.object({ eventId: z.string().min(1), talentId: z.string().min(1) }),
  async ({ eventId, talentId }, { locals }) => {
    const campusId = getCampusId(locals);
    const event = await loadEventOr404(
      eventId,
      campusId,
      EVENT_MODULES.EMARGEMENT,
    );
    const db = scopedPrisma(campusId);

    const participation = await db.participation.findFirst({
      where: { eventId: event.id, talentId, ...visibleParticipationWhere },
      select: {
        talent: {
          select: {
            civilite: true,
            prenom: true,
            nom: true,
            phone: true,
            user: { select: { email: true } },
            parentCivilite: true,
            parentPrenom: true,
            parentNom: true,
            parentEmail: true,
            parentPhone: true,
            parent2Civilite: true,
            parent2Prenom: true,
            parent2Nom: true,
            parent2Email: true,
            parent2Phone: true,
          },
        },
      },
    });
    if (!participation) error(404, 'Introuvable.');

    const t = participation.talent;
    recordUsage(USAGE_FEATURES.DEV_EMARGEMENT_CONTACT_OPEN, {
      locals,
      eventId,
    });

    return {
      student: {
        civilite: t.civilite,
        prenom: t.prenom,
        nom: t.nom,
        phone: t.phone,
        email: t.user?.email ?? null,
      } satisfies ContactPerson,
      guardians: guardiansOf(t),
    };
  },
);
