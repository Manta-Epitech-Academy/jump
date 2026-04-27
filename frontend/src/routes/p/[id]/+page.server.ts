import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { tallyTopThemesFromActivities } from '$lib/utils';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
  try {
    // Select only safe fields to ensure NO PII is leaked.
    const student = await prisma.talent.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        prenom: true,
        nom: true,
        niveau: true,
        xp: true,
        level: true,
        badges: true,
        eventsCount: true,
      },
    });

    if (!student) {
      throw error(404, 'Profil introuvable');
    }

    setHeaders({ 'Cache-Control': 'public, s-maxage=300, max-age=60' });

    const portfolioItems = await prisma.portfolioItem.findMany({
      where: { talentId: student.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        file: true,
        url: true,
        caption: true,
        event: {
          select: { titre: true },
        },
      },
    });

    // Fetch completed participations to build the RPG Skill Radar
    const allCompleted = await prisma.participation.findMany({
      where: {
        talentId: student.id,
        isPresent: true,
      },
      include: {
        event: true,
        activities: {
          include: {
            activity: {
              include: {
                activityThemes: { include: { theme: true } },
              },
            },
          },
        },
      },
    });

    const topThemes = tallyTopThemesFromActivities(allCompleted, 5);

    return {
      student: {
        id: student.id,
        prenom: student.prenom,
        nomInitial: student.nom
          ? `${student.nom.charAt(0).toUpperCase()}.`
          : '',
        niveau: student.niveau,
        xp: student.xp,
        level: student.level,
        badges: student.badges,
        eventsCount: student.eventsCount,
      },
      portfolioItems: portfolioItems.map((item) => ({
        id: item.id,
        // TODO: implement S3 file storage
        file: item.file,
        url: item.url,
        caption: item.caption,
        eventName: item.event?.titre || 'Jump',
      })),
      topThemes,
    };
  } catch (err) {
    console.error('Public showcase fetch error:', err);
    if (typeof err === 'object' && err !== null && 'status' in err) {
      throw err;
    }
    throw error(404, 'Profil introuvable');
  }
};
