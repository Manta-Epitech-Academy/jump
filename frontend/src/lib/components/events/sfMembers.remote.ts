import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { prisma } from '#lib/server/db.ts';
import { classifySfStatus } from '#lib/domain/sfMemberStatus.ts';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';
import {
  memberStatusCatalogue,
  shownStatusesByEvent,
} from '#lib/server/services/devSpaceVisibility.ts';

/**
 * Every enrolment Salesforce sent for one event, shown or masked in the dev
 * space, for `AdminSfStatusInspectorDialog` on `/staff/admin/events`. An admin
 * screen's read, not an operation: it names talents, which no answer handed to
 * a token holder does.
 */
export const sfMembers = gatedQuery(
  { admin: true },
  z.string().min(1),
  async (eventId) => {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, titre: true, publicName: true, externalId: true },
    });

    if (!event) error(404, 'Événement introuvable.');

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

    return {
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
    };
  },
);
