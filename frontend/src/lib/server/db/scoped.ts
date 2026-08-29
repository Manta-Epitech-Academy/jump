import type { Cookies } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { prisma } from '../db';

/**
 * Extracts the campus ID from the authenticated user's profile.
 */
export function getCampusId(locals: App.Locals): string {
  const campusId = locals.staffProfile?.campusId;
  if (!campusId) {
    throw new Error(
      "Impossible de créer des données : Aucun campus associé à l'utilisateur connecté.",
    );
  }
  return campusId;
}

/**
 * Extracts the IANA timezone from the user's campus.
 */
export function getCampusTimezone(locals: App.Locals): string {
  return locals.staffProfile?.campus?.timezone ?? 'Europe/Paris';
}

/**
 * Reads the browser timezone from the `tz` cookie (set client-side).
 * Validates against the IANA database to prevent RangeError from invalid values.
 */
export function getBrowserTimezone(cookies: Cookies): string {
  const tz = cookies.get('tz');
  if (!tz) return 'Europe/Paris';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return 'Europe/Paris';
  }
}

/**
 * Returns a Prisma client extension that auto-injects campusId filters.
 *
 * Strict campusId match:
 *   Event, Participation, Talent, StaffProfile
 *
 * Scoped through ownership chain (→ Event.campusId):
 *   Planning_Slot, EventPresence, EventPresenceClosure (event → campusId)
 *
 * For findUnique/findUniqueOrThrow/update/delete (which only accept unique
 * fields in `where`), we use a post-query check pattern.
 */
export function scopedPrisma(campusId: string) {
  function accessDenied(model: string): never {
    throw error(
      403,
      `Accès refusé : cette ressource (${model}) appartient à un autre campus.`,
    );
  }

  return prisma.$extends({
    query: {
      // ── Event (campusId required) ──
      event: {
        async findMany({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.event.findUnique({
            where: args.where,
            select: { campusId: true },
          });
          if (existing && existing.campusId !== campusId) accessDenied('Event');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.event.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Event');
          return query(args);
        },
        async create({ args, query }) {
          args.data = { ...args.data, campusId } as any;
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.event.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Event');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.event.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Event');
          return query(args);
        },
      },

      // ── Participation (campusId required) ──
      participation: {
        async findMany({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.participation.findUnique({
            where: args.where as any,
            select: { campusId: true },
          });
          if (existing && existing.campusId !== campusId)
            accessDenied('Participation');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.participation.findUniqueOrThrow({
            where: args.where as any,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Participation');
          return query(args);
        },
        async create({ args, query }) {
          args.data = { ...args.data, campusId } as any;
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.participation.findUniqueOrThrow({
            where: args.where as any,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Participation');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.participation.findUniqueOrThrow({
            where: args.where as any,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Participation');
          return query(args);
        },
      },

      // ── Talent (scoped through participations → campusId) ──
      talent: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            participations: { some: { campusId } },
          };
          return query(args);
        },
        async count({ args, query }) {
          args.where = {
            ...args.where,
            participations: { some: { campusId } },
          };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = {
            ...args.where,
            participations: { some: { campusId } },
          };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.talent.findUnique({
            where: args.where,
            select: {
              participations: {
                where: { campusId },
                select: { id: true },
                take: 1,
              },
            },
          });
          if (existing && existing.participations.length === 0)
            accessDenied('Talent');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.talent.findUniqueOrThrow({
            where: args.where,
            select: {
              participations: {
                where: { campusId },
                select: { id: true },
                take: 1,
              },
            },
          });
          if (existing.participations.length === 0) accessDenied('Talent');
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.talent.findUniqueOrThrow({
            where: args.where,
            select: {
              participations: {
                where: { campusId },
                select: { id: true },
                take: 1,
              },
            },
          });
          if (existing.participations.length === 0) accessDenied('Talent');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.talent.findUniqueOrThrow({
            where: args.where,
            select: {
              participations: {
                where: { campusId },
                select: { id: true },
                take: 1,
              },
            },
          });
          if (existing.participations.length === 0) accessDenied('Talent');
          return query(args);
        },
      },

      // ── StaffProfile (campusId optional) ──
      staffProfile: {
        async findMany({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.staffProfile.findUnique({
            where: args.where,
            select: { campusId: true },
          });
          if (existing && existing.campusId !== campusId)
            accessDenied('StaffProfile');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.staffProfile.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('StaffProfile');
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.staffProfile.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('StaffProfile');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.staffProfile.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('StaffProfile');
          return query(args);
        },
      },

      // ── EventPresence (scoped through event.campusId) ──
      // Only the operations the émargement feature actually performs are scoped:
      // findMany (page load + export), upsert and deleteMany (the staff
      // setPresence action). `upsert` keys on the unique (talentId, eventId, day,
      // slot), whose `where` can't carry a relation filter, so its campus check
      // runs pre-query on the create payload's eventId, like create/update/delete
      // elsewhere in this file. The talent self-check-in writes intentionally use
      // the raw client: a scan has no staff campus, and is gated by the signed
      // token + a participation check instead (see (talent)/presence/[token]).
      eventPresence: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            event: { ...((args.where as any)?.event ?? {}), campusId },
          };
          return query(args);
        },
        async upsert({ args, query }) {
          const event = await prisma.event.findUniqueOrThrow({
            where: { id: (args.create as any).eventId as string },
            select: { campusId: true },
          });
          if (event.campusId !== campusId) accessDenied('EventPresence');
          return query(args);
        },
        async deleteMany({ args, query }) {
          args.where = {
            ...args.where,
            event: { ...((args.where as any)?.event ?? {}), campusId },
          };
          return query(args);
        },
      },

      // ── EventPresenceClosure (scoped through event.campusId) ──
      // findMany (page load + export) plus the upsert/deleteMany that close and
      // reopen a créneau (see presenceService). `upsert` keys on the unique
      // (eventId, day, slot), so its campus check runs pre-query on the create
      // payload's eventId, the same shape as EventPresence above.
      eventPresenceClosure: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            event: { ...((args.where as any)?.event ?? {}), campusId },
          };
          return query(args);
        },
        async upsert({ args, query }) {
          const event = await prisma.event.findUniqueOrThrow({
            where: { id: (args.create as any).eventId as string },
            select: { campusId: true },
          });
          if (event.campusId !== campusId) accessDenied('EventPresenceClosure');
          return query(args);
        },
        async deleteMany({ args, query }) {
          args.where = {
            ...args.where,
            event: { ...((args.where as any)?.event ?? {}), campusId },
          };
          return query(args);
        },
      },

      // ── Planning_Slot (scoped through event.campusId) ──
      // One hop, like EventPresence above. It used to be three delegates -
      // Planning, TimeSlot, Activity - each walking one level further back to
      // reach the campus, which took roughly 288 of this file's lines. Only
      // reads are handled: nothing in the app writes a slot (the seed scripts
      // do), so a create/update/delete guard here would protect a path that
      // does not exist, and this file is short enough to read only while every
      // delegate in it is load-bearing.
      planning_Slot: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            event: { ...((args.where as any)?.event ?? {}), campusId },
          };
          return query(args);
        },
      },

      closing_Record: {
        async findMany({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async groupBy({ args, query }) {
          args.where = { ...args.where, campusId };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.closing_Record.findUnique({
            where: args.where,
            select: { campusId: true },
          });
          if (existing && existing.campusId !== campusId)
            accessDenied('Closing_Record');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.closing_Record.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Closing_Record');
          return query(args);
        },
        async create({ args, query }) {
          args.data = { ...args.data, campusId } as any;
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.closing_Record.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Closing_Record');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.closing_Record.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('Closing_Record');
          return query(args);
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof scopedPrisma>;
