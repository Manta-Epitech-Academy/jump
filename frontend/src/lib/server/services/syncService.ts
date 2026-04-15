import { prisma } from '$lib/server/db';
import { Prisma } from '@prisma/client';

export async function listCampuses() {
  return prisma.campus.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function syncEvents(
  campusExternalName: string,
  events: { external_id: string; title: string; date?: string }[],
) {
  const campus = await prisma.campus.findUnique({
    where: { externalName: campusExternalName },
  });
  if (!campus) return { error: 'Campus not found' as const };

  let created = 0;
  let updated = 0;

  for (const e of events) {
    if (!e.external_id || !e.title)
      return { error: 'Each event must have external_id and title' as const };

    const existing = await prisma.event.findUnique({
      where: { externalId: e.external_id },
    });

    if (!existing) {
      await prisma.event.create({
        data: {
          externalId: e.external_id,
          date: e.date ? new Date(e.date) : new Date(),
          titre: e.title,
          campusId: campus.id,
        },
      });
      created++;
    } else if (
      existing.titre !== e.title ||
      existing.campusId !== campus.id ||
      (e.date && existing.date.getTime() !== new Date(e.date).getTime())
    ) {
      await prisma.event.update({
        where: { externalId: e.external_id },
        data: {
          titre: e.title,
          campusId: campus.id,
          date: e.date ? new Date(e.date) : existing.date,
        },
      });
      updated++;
    }
  }

  return { created, updated };
}

async function logSyncError(params: {
  email: string;
  attemptedExtId: string;
  existingExtId: string | null;
  talentName: string;
  eventExtId: string | null;
  message: string;
}) {
  await prisma.syncError.upsert({
    where: {
      email_attemptedExtId: {
        email: params.email,
        attemptedExtId: params.attemptedExtId,
      },
    },
    update: {
      occurrenceCount: { increment: 1 },
      lastOccurredAt: new Date(),
      existingExtId: params.existingExtId,
      message: params.message,
      resolved: false,
      resolvedAt: null,
    },
    create: {
      errorType: 'DUPLICATE_EMAIL',
      email: params.email,
      attemptedExtId: params.attemptedExtId,
      existingExtId: params.existingExtId,
      talentName: params.talentName,
      eventExtId: params.eventExtId,
      message: params.message,
    },
  });
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
    where: { externalId: eventExternalId },
  });
  if (!event) return { error: 'Event not found' as const };

  let created = 0;
  let updated = 0;
  let skipped = 0;
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
      try {
        console.log(
          `Creating new talent: Name: ${t.first_name} ${t.last_name}, Email: ${email}, Phone: ${phone} ExId: ${t.external_id}`,
        );
        const talent = await prisma.talent.create({
          data: {
            externalId: t.external_id,
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
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const conflicting = email
            ? await prisma.talent.findUnique({
                where: { email },
                select: { id: true, externalId: true },
              })
            : null;
          await logSyncError({
            email: email ?? 'unknown',
            attemptedExtId: t.external_id,
            existingExtId: conflicting?.externalId ?? null,
            talentName: `${t.first_name} ${t.last_name}`,
            eventExtId: eventExternalId,
            message: `Création impossible : l'email "${email}" est déjà utilisé par le talent externalId="${conflicting?.externalId ?? '?'}"`,
          });
          if (conflicting) syncedTalentIds.push(conflicting.id);
          skipped++;
          continue;
        }
        throw err;
      }
    } else {
      talentId = existing.id;
      if (
        existing.prenom !== t.first_name ||
        existing.nom !== t.last_name ||
        existing.email !== email ||
        existing.phone !== phone
      ) {
        try {
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
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            const conflicting = email
              ? await prisma.talent.findUnique({
                  where: { email },
                  select: { externalId: true },
                })
              : null;
            await logSyncError({
              email: email ?? 'unknown',
              attemptedExtId: t.external_id,
              existingExtId: conflicting?.externalId ?? null,
              talentName: `${t.first_name} ${t.last_name}`,
              eventExtId: eventExternalId,
              message: `Mise à jour impossible : l'email "${email}" est déjà utilisé par le talent externalId="${conflicting?.externalId ?? '?'}"`,
            });
            skipped++;
            continue;
          }
          throw err;
        }
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

  return { created, updated, removed, skipped };
}
