import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { EVENT_TYPES } from '$lib/domain/event';
import { resolveEffectiveFlags } from '$lib/domain/featureFlags';
import DOMPurify from 'isomorphic-dompurify';

const SLUG = 'welcome';
const WELCOME_FLAG = 'staff_welcome_page' as const;
const STAGE_DEFAULT_DURATION_DAYS = 14;

type StageStatus = 'ongoing' | 'upcoming' | 'past';

function endOf(date: Date, endDate: Date | null): Date {
  if (endDate) return endDate;
  const out = new Date(date);
  out.setDate(out.getDate() + STAGE_DEFAULT_DURATION_DAYS);
  return out;
}

function statusOf(date: Date, endDate: Date | null, now: Date): StageStatus {
  if (date.getTime() > now.getTime()) return 'upcoming';
  if (endOf(date, endDate).getTime() < now.getTime()) return 'past';
  return 'ongoing';
}

// Order used both to pick the default-selected stage and to sort the picker:
// an ongoing stage is what staff care about first, then the next upcoming one,
// then archived stages that still carry content.
const STATUS_RANK: Record<StageStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  past: 2,
};

export const load: PageServerLoad = async ({ url }) => {
  const now = new Date();

  const [campuses, events] = await Promise.all([
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      include: { featureFlags: { select: { flagKey: true, enabled: true } } },
    }),
    prisma.event.findMany({
      where: { eventType: EVENT_TYPES.STAGE_SECONDE },
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
    const flagEnabled = resolveEffectiveFlags(c.featureFlags).has(WELCOME_FLAG);
    const rows = (eventsByCampus.get(c.id) ?? [])
      .map((ev) => {
        const status = statusOf(ev.date, ev.endDate, now);
        const page = ev.cmsPages[0];
        const hasContent = !!page?.content?.trim();
        return {
          id: ev.id,
          titre: ev.titre,
          date: ev.date.toISOString(),
          endDate: (ev.endDate ?? endOf(ev.date, ev.endDate)).toISOString(),
          status,
          hasContent,
          updatedAt: page?.updatedAt.toISOString() ?? null,
          updatedByName: page?.user.name ?? page?.user.email ?? null,
        };
      })
      // Keep current/upcoming stages plus any archived stage that still has a
      // welcome page worth reviewing — drop empty past stages to cut clutter.
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
      flagEnabled,
      events: rows,
    };
  });

  // Resolve the selected stage: explicit `?event=` if valid, else the most
  // relevant stage overall (first ongoing, then upcoming, then a content-bearing
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
      select: { eventType: true },
    });
    if (!event || event.eventType !== EVENT_TYPES.STAGE_SECONDE) {
      return fail(404, { error: 'Stage introuvable.' });
    }

    const content = DOMPurify.sanitize(rawContent);

    await prisma.cmsPage.upsert({
      where: { slug_eventId: { slug: SLUG, eventId } },
      update: { content, updatedBy: userId },
      create: { slug: SLUG, eventId, content, updatedBy: userId },
    });

    return { success: true };
  },
};
