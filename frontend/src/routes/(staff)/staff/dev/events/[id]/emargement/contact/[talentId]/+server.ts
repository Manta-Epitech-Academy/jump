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
  const guardians = [
    {
      civilite: t.parentCivilite,
      name: [t.parentPrenom, t.parentNom].filter(Boolean).join(' ') || null,
      email: t.parentEmail,
      phone: t.parentPhone,
    },
    {
      civilite: t.parent2Civilite,
      name: [t.parent2Prenom, t.parent2Nom].filter(Boolean).join(' ') || null,
      email: t.parent2Email,
      phone: t.parent2Phone,
    },
  ].filter((g) => g.name || g.phone || g.email);

  return json({
    civilite: t.civilite,
    fullName: `${t.prenom} ${t.nom}`,
    phone: t.phone,
    email: t.user?.email ?? null,
    guardians,
  });
};
