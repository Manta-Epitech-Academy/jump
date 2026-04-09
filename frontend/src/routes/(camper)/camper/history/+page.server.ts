import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getParisStartOfDay } from '$lib/utils';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.studentProfile) {
    throw error(401, m.server_error_unauthorized());
  }

  const filterDateStart = new Date(getParisStartOfDay());

  const pastParticipations = await prisma.participation.findMany({
    where: {
      studentProfileId: locals.studentProfile.id,
      event: { date: { lt: filterDateStart } },
      isPresent: true,
    },
    include: {
      event: true,
      subjects: { include: { subject: true } },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return {
    student: locals.studentProfile,
    pastParticipations,
  };
};
