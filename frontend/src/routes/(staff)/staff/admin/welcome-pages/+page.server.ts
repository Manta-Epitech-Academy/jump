import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { eventWindowEnd } from '$lib/domain/event';
import { sanitizeWelcomeHtml } from '$lib/server/cms/sanitize';

const SLUG = 'welcome';

type EventStatus = 'ongoing' | 'upcoming' | 'past';

function statusOf(date: Date, endDate: Date | null, now: Date): EventStatus {
  if (date.getTime() > now.getTime()) return 'upcoming';
  if (eventWindowEnd(date, endDate).getTime() < now.getTime()) return 'past';
  return 'ongoing';
}

// Order used both to pick the default-selected event and to sort the picker:
// an ongoing event is what staff care about first, then the next upcoming one,
// then archived events that still carry content.
const STATUS_RANK: Record<EventStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  past: 2,
};

export const load: PageServerLoad = async ({ url }) => {
  const now = new Date();

  const [campuses, events] = await Promise.all([
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
    }),
    prisma.event.findMany({
      orderBy: { date: 'desc' },
      select: {
        id: true,
        titre: true,
        date: true,
        endDate: true,
        campusId: true,
        cmsPages: {
          where: { slug: SLUG },
          select: {
            content: true,
            updatedAt: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    }),
  ]);

  const eventsByCampus = new Map<string, typeof events>();
  for (const ev of events) {
    const list = eventsByCampus.get(ev.campusId) ?? [];
    list.push(ev);
    eventsByCampus.set(ev.campusId, list);
  }

  const campusTree = campuses.map((c) => {
    const rows = (eventsByCampus.get(c.id) ?? [])
      .map((ev) => {
        const status = statusOf(ev.date, ev.endDate, now);
        const page = ev.cmsPages[0];
        const hasContent = !!page?.content?.trim();
        return {
          id: ev.id,
          titre: ev.titre,
          date: ev.date.toISOString(),
          endDate: eventWindowEnd(ev.date, ev.endDate).toISOString(),
          status,
          hasContent,
          updatedAt: page?.updatedAt.toISOString() ?? null,
          updatedByName: page?.user.name ?? page?.user.email ?? null,
        };
      })
      // Keep current/upcoming events plus any archived event that still has a
      // welcome page worth reviewing — drop empty past events to cut clutter.
      .filter((r) => r.status !== 'past' || r.hasContent)
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          b.date.localeCompare(a.date),
      );

    return {
      id: c.id,
      name: c.name,
      externalName: c.externalName,
      contactEmail: c.contactEmail,
      events: rows,
    };
  });

  // Resolve the selected event: explicit `?event=` if valid, else the most
  // relevant event overall (first ongoing, then upcoming, then a content-bearing
  // archive), so the editor always opens on something useful.
  const requested = url.searchParams.get('event');
  const flat = campusTree.flatMap((c) =>
    c.events.map((e) => ({
      ...e,
      campusId: c.id,
      campusName: c.name,
      campusContactEmail: c.contactEmail,
    })),
  );
  const ranked = [...flat].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );
  const selectedRow = flat.find((e) => e.id === requested) ?? ranked[0] ?? null;

  const selectedContent = selectedRow
    ? (events.find((e) => e.id === selectedRow.id)?.cmsPages[0]?.content ?? '')
    : '';

  return {
    campuses: campusTree,
    selectedEventId: selectedRow?.id ?? null,
    selectedContent,
    selected: selectedRow,
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const userId = locals.user!.id;
    const formData = await request.formData();
    const eventId = formData.get('eventId');
    const rawContent = formData.get('content');

    if (typeof eventId !== 'string' || typeof rawContent !== 'string') {
      return fail(400, { error: 'Requête invalide.' });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      return fail(404, { error: 'Événement introuvable.' });
    }

    const content = sanitizeWelcomeHtml(rawContent);

    await prisma.cmsPage.upsert({
      where: { slug_eventId: { slug: SLUG, eventId } },
      update: { content, updatedBy: userId },
      create: { slug: SLUG, eventId, content, updatedBy: userId },
    });

    return { success: true };
  },
};
