import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { classifySfStatus } from '$lib/domain/sfMemberStatus';
import {
  memberStatusCatalogue,
  shownStatusesByEvent,
} from '$lib/server/services/devSpaceVisibility';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (locals.staffProfile?.staffRole !== 'admin') {
    return new Response('Unauthorized', { status: 401 });
  }

  const eventId = params.id;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, titre: true, publicName: true, externalId: true },
  });

  if (!event) {
    return new Response('Event not found', { status: 404 });
  }

  const [participations, catalogue, shownByEvent] = await Promise.all([
    prisma.participation.findMany({
      where: { eventId },
      select: {
        id: true,
        sfMemberStatus: true,
        shownInDevSpace: true,
        createdAt: true,
        updatedAt: true,
        talent: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            phone: true,
            user: { select: { email: true } },
            school: { select: { name: true } },
          },
        },
      },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    memberStatusCatalogue(),
    shownStatusesByEvent([eventId]),
  ]);
  const vocabulary = {
    known: new Set(catalogue.map((row) => row.status)),
    shown: shownByEvent.get(eventId) ?? new Set<string>(),
  };

  const rows = participations.map((p) => {
    // Classified here, not in the dialog: it renders what this says and
    // restates no part of the rule. Visibility is the stored projection, the
    // very column every dev screen filters on.
    const statusClass = classifySfStatus(p.sfMemberStatus, vocabulary);
    return {
      id: p.id,
      talentId: p.talent.id,
      nom: p.talent.nom,
      prenom: p.talent.prenom,
      email: p.talent.user?.email ?? null,
      phone: p.talent.phone ?? null,
      schoolName: p.talent.school?.name ?? null,
      sfMemberStatus: p.sfMemberStatus,
      statusClass,
      isVisibleInDevSpace: p.shownInDevSpace,
      updatedAt: p.updatedAt,
    };
  });

  const totalVisible = rows.filter((r) => r.isVisibleInDevSpace).length;
  const totalUnrecognised = rows.filter(
    (r) => r.statusClass === 'unrecognised',
  ).length;

  return json({
    event: {
      id: event.id,
      displayName: event.publicName || event.titre,
      externalId: event.externalId,
    },
    total: rows.length,
    totalVisible,
    totalHidden: rows.length - totalVisible,
    totalUnrecognised,
    participations: rows,
  });
};
