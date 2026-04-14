import { prisma } from '$lib/server/db';

export async function listCampuses() {
  return prisma.campus.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function syncEvents(
  campusExternalName: string,
  events: { external_id: string; title: string }[],
) {
  const campus = await prisma.campus.findUnique({
    where: { external_name: campusExternalName },
  });
  if (!campus) return { error: 'Campus not found' as const };

  let created = 0;
  let updated = 0;

  for (const e of events) {
    if (!e.external_id || !e.title)
      return { error: 'Each event must have external_id and title' as const };

    const existing = await prisma.event.findUnique({
      where: { external_id: e.external_id },
    });

    if (!existing) {
      await prisma.event.create({
        data: {
          external_id: e.external_id,
          date: new Date(),
          titre: e.title,
          campusId: campus.id,
        },
      });
      created++;
    } else if (existing.titre !== e.title || existing.campusId !== campus.id) {
      await prisma.event.update({
        where: { external_id: e.external_id },
        data: { titre: e.title, campusId: campus.id },
      });
      updated++;
    }
  }

  return { created, updated };
}

export async function syncTalents(
  eventExternalId: string,
  talents: {
    external_id: string;
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
  }[],
) {
  const event = await prisma.event.findUnique({
    where: { external_id: eventExternalId },
  });
  if (!event) return { error: 'Event not found' as const };

  let created = 0;
  let updated = 0;
  const syncedTalentIds: string[] = [];

  for (const t of talents) {
    const email = t.email?.toLowerCase().trim() || null;
    const phone = t.phone || null;

    if (!t.external_id || !t.first_name || !t.last_name)
      return {
        error:
          'Each talent must have external_id, first_name and last_name' as const,
      };

    const existing = await prisma.talent.findUnique({
      where: { externalId: t.external_id },
    });

    let talentId: string;

    if (!existing) {
      const talent = await prisma.talent.create({
        data: {
          externalId: t.external_id,
          campusId: event.campusId,
          prenom: t.first_name,
          nom: t.last_name,
          email,
          phone,
          xp: 0,
          eventsCount: 0,
        },
      });
      talentId = talent.id;
      created++;
    } else {
      talentId = existing.id;
      if (
        existing.prenom !== t.first_name ||
        existing.nom !== t.last_name ||
        existing.email !== email ||
        existing.phone !== phone
      ) {
        await prisma.talent.update({
          where: { externalId: t.external_id },
          data: {
            prenom: t.first_name,
            nom: t.last_name,
            email,
            phone,
          },
        });
        updated++;
      }
    }

    await prisma.participation.upsert({
      where: { talentId_eventId: { talentId, eventId: event.id } },
      create: { talentId, eventId: event.id, campusId: event.campusId! },
      update: {},
    });
    syncedTalentIds.push(talentId);
  }

  const { count: removed } = await prisma.participation.deleteMany({
    where: {
      eventId: event.id,
      talentId: { notIn: syncedTalentIds },
    },
  });

  return { created, updated, removed };
}
