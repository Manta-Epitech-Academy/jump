import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { guardiansOf, type ContactPerson } from '$lib/domain/contact';

export const GET: RequestHandler = async ({ locals, params }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.EMARGEMENT);
  const db = scopedPrisma(campusId);

  const participation = await db.participation.findFirst({
    where: {
      eventId: event.id,
      talentId: params.talentId,
      ...visibleParticipationWhere,
    },
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

  // `ContactPerson` on both sides, so the dialog renders through the same
  // `StudentContactDetails` as the admin directory and the student dossier. It
  // used to flatten the pair into one `fullName`, which cost the given-name /
  // surname split that display treatment is built on.
  return json({
    student: {
      civilite: t.civilite,
      prenom: t.prenom,
      nom: t.nom,
      phone: t.phone,
      email: t.user?.email ?? null,
    } satisfies ContactPerson,
    guardians: guardiansOf(t),
  });
};
