import { error } from '@sveltejs/kit';
import { prisma } from '../db';

/**
 * Extracts the campus ID from the authenticated user's profile.
 */
export function getCampusId(locals: App.Locals): string {
  const campusId =
    locals.staffProfile?.campusId ?? locals.studentProfile?.campusId;
  if (!campusId) {
    throw new Error(
      "Impossible de créer des données : Aucun campus associé à l'utilisateur connecté.",
    );
  }
  return campusId;
}

/**
 * Returns a Prisma client extension that auto-injects campusId filters.
 *
 * - Event, Participation, StudentProfile, StaffProfile: strict campusId match
 * - Theme, ActivityTemplate: OR pattern (campus-specific + global where campusId is null)
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

      // ── StudentProfile (campusId optional) ──
      studentProfile: {
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
          const existing = await prisma.studentProfile.findUnique({
            where: args.where,
            select: { campusId: true },
          });
          if (existing && existing.campusId !== campusId)
            accessDenied('StudentProfile');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.studentProfile.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('StudentProfile');
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.studentProfile.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('StudentProfile');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.studentProfile.findUniqueOrThrow({
            where: args.where,
            select: { campusId: true },
          });
          if (existing.campusId !== campusId) accessDenied('StudentProfile');
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

      // ── ParticipationActivity (scoped through participation.campusId) ──
      participationActivity: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            participation: {
              ...((args.where as any)?.participation ?? {}),
              campusId,
            },
          };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = {
            ...args.where,
            participation: {
              ...((args.where as any)?.participation ?? {}),
              campusId,
            },
          };
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const result = await query(args);
          const participation = await prisma.participation.findUniqueOrThrow({
            where: { id: result.participationId },
            select: { campusId: true },
          });
          if (participation.campusId !== campusId)
            accessDenied('ParticipationActivity');
          return result;
        },
        async createMany({ args, query }) {
          return query(args);
        },
        async update({ args, query }) {
          const where = args.where as any;
          if (where.participationId_activityId) {
            const participation = await prisma.participation.findUniqueOrThrow({
              where: { id: where.participationId_activityId.participationId },
              select: { campusId: true },
            });
            if (participation.campusId !== campusId)
              accessDenied('ParticipationActivity');
          }
          return query(args);
        },
        async delete({ args, query }) {
          const where = args.where as any;
          if (where.participationId_activityId) {
            const participation = await prisma.participation.findUniqueOrThrow({
              where: { id: where.participationId_activityId.participationId },
              select: { campusId: true },
            });
            if (participation.campusId !== campusId)
              accessDenied('ParticipationActivity');
          }
          return query(args);
        },
      },

      // ── Theme (campusId nullable — null means global/official) ──
      theme: {
        async findMany({ args, query }) {
          if (!args.where?.campusId) {
            args.where = {
              ...args.where,
              OR: [{ campusId }, { campusId: null }],
            };
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (!args.where?.campusId) {
            args.where = {
              ...args.where,
              OR: [{ campusId }, { campusId: null }],
            };
          }
          return query(args);
        },
        async create({ args, query }) {
          args.data = { ...args.data, campusId } as any;
          return query(args);
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof scopedPrisma>;
