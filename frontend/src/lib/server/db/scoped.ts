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
 * Strict campusId match:
 *   Event, Participation, StudentProfile, StaffProfile
 *
 * Scoped through ownership chain (→ Event.campusId):
 *   Planning (event → campusId)
 *   TimeSlot (planning → event → campusId)
 *   Activity (timeSlot → planning → event → campusId)
 *   ParticipationActivity (participation → campusId)
 *
 * OR pattern (campus-specific + global where campusId is null):
 *   Theme, ActivityTemplate
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

  async function getPlanningCampusId(planningId: string): Promise<string> {
    const p = await prisma.planning.findUniqueOrThrow({
      where: { id: planningId },
      select: { event: { select: { campusId: true } } },
    });
    return p.event.campusId;
  }

  async function getTimeSlotCampusId(timeSlotId: string): Promise<string> {
    const s = await prisma.timeSlot.findUniqueOrThrow({
      where: { id: timeSlotId },
      select: {
        planning: { select: { event: { select: { campusId: true } } } },
      },
    });
    return s.planning.event.campusId;
  }

  async function getActivityCampusId(activityId: string): Promise<string> {
    const a = await prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
      select: {
        timeSlot: {
          select: {
            planning: { select: { event: { select: { campusId: true } } } },
          },
        },
      },
    });
    return a.timeSlot.planning.event.campusId;
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

      // ── Planning (scoped through event.campusId) ──
      planning: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            event: { ...((args.where as any)?.event ?? {}), campusId },
          };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = {
            ...args.where,
            event: { ...((args.where as any)?.event ?? {}), campusId },
          };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.planning.findUnique({
            where: args.where,
            select: { event: { select: { campusId: true } } },
          });
          if (existing && existing.event.campusId !== campusId)
            accessDenied('Planning');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.planning.findUniqueOrThrow({
            where: args.where,
            select: { event: { select: { campusId: true } } },
          });
          if (existing.event.campusId !== campusId) accessDenied('Planning');
          return query(args);
        },
        async create({ args, query }) {
          const event = await prisma.event.findUniqueOrThrow({
            where: { id: args.data.eventId as string },
            select: { campusId: true },
          });
          if (event.campusId !== campusId) accessDenied('Planning');
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.planning.findUniqueOrThrow({
            where: args.where,
            select: { event: { select: { campusId: true } } },
          });
          if (existing.event.campusId !== campusId) accessDenied('Planning');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.planning.findUniqueOrThrow({
            where: args.where,
            select: { event: { select: { campusId: true } } },
          });
          if (existing.event.campusId !== campusId) accessDenied('Planning');
          return query(args);
        },
      },

      // ── TimeSlot (scoped through planning → event.campusId) ──
      timeSlot: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            planning: {
              ...((args.where as any)?.planning ?? {}),
              event: {
                ...((args.where as any)?.planning?.event ?? {}),
                campusId,
              },
            },
          };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = {
            ...args.where,
            planning: {
              ...((args.where as any)?.planning ?? {}),
              event: {
                ...((args.where as any)?.planning?.event ?? {}),
                campusId,
              },
            },
          };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.timeSlot.findUnique({
            where: args.where,
            select: {
              planning: { select: { event: { select: { campusId: true } } } },
            },
          });
          if (existing && existing.planning.event.campusId !== campusId)
            accessDenied('TimeSlot');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.timeSlot.findUniqueOrThrow({
            where: args.where,
            select: {
              planning: { select: { event: { select: { campusId: true } } } },
            },
          });
          if (existing.planning.event.campusId !== campusId)
            accessDenied('TimeSlot');
          return query(args);
        },
        async create({ args, query }) {
          const ownerCampusId = await getPlanningCampusId(
            args.data.planningId as string,
          );
          if (ownerCampusId !== campusId) accessDenied('TimeSlot');
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.timeSlot.findUniqueOrThrow({
            where: args.where,
            select: {
              planning: { select: { event: { select: { campusId: true } } } },
            },
          });
          if (existing.planning.event.campusId !== campusId)
            accessDenied('TimeSlot');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.timeSlot.findUniqueOrThrow({
            where: args.where,
            select: {
              planning: { select: { event: { select: { campusId: true } } } },
            },
          });
          if (existing.planning.event.campusId !== campusId)
            accessDenied('TimeSlot');
          return query(args);
        },
      },

      // ── Activity (scoped through timeSlot → planning → event.campusId) ──
      activity: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            timeSlot: {
              ...((args.where as any)?.timeSlot ?? {}),
              planning: {
                ...((args.where as any)?.timeSlot?.planning ?? {}),
                event: {
                  ...((args.where as any)?.timeSlot?.planning?.event ?? {}),
                  campusId,
                },
              },
            },
          };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = {
            ...args.where,
            timeSlot: {
              ...((args.where as any)?.timeSlot ?? {}),
              planning: {
                ...((args.where as any)?.timeSlot?.planning ?? {}),
                event: {
                  ...((args.where as any)?.timeSlot?.planning?.event ?? {}),
                  campusId,
                },
              },
            },
          };
          return query(args);
        },
        async findUnique({ args, query }) {
          const existing = await prisma.activity.findUnique({
            where: args.where,
            select: {
              timeSlot: {
                select: {
                  planning: {
                    select: { event: { select: { campusId: true } } },
                  },
                },
              },
            },
          });
          if (
            existing &&
            existing.timeSlot.planning.event.campusId !== campusId
          )
            accessDenied('Activity');
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          const existing = await prisma.activity.findUniqueOrThrow({
            where: args.where,
            select: {
              timeSlot: {
                select: {
                  planning: {
                    select: { event: { select: { campusId: true } } },
                  },
                },
              },
            },
          });
          if (existing.timeSlot.planning.event.campusId !== campusId)
            accessDenied('Activity');
          return query(args);
        },
        async create({ args, query }) {
          const ownerCampusId = await getTimeSlotCampusId(
            args.data.timeSlotId as string,
          );
          if (ownerCampusId !== campusId) accessDenied('Activity');
          return query(args);
        },
        async update({ args, query }) {
          const existing = await prisma.activity.findUniqueOrThrow({
            where: args.where,
            select: {
              timeSlot: {
                select: {
                  planning: {
                    select: { event: { select: { campusId: true } } },
                  },
                },
              },
            },
          });
          if (existing.timeSlot.planning.event.campusId !== campusId)
            accessDenied('Activity');
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.activity.findUniqueOrThrow({
            where: args.where,
            select: {
              timeSlot: {
                select: {
                  planning: {
                    select: { event: { select: { campusId: true } } },
                  },
                },
              },
            },
          });
          if (existing.timeSlot.planning.event.campusId !== campusId)
            accessDenied('Activity');
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
