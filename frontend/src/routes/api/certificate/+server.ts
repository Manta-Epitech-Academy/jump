import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCertificatePDF } from '$lib/server/services/diplomaGenerator';
import { prisma } from '$lib/server/db';
import { formatDateFr, tallyTopThemesFromActivities } from '$lib/utils';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.studentProfile) throw error(401, 'Non autorise');

  const studentProfileId = locals.studentProfile.id;

  try {
    // 1. Fetch completed participations with event + activity + theme details
    const participations = await prisma.participation.findMany({
      where: {
        studentProfileId,
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

    if (participations.length === 0) {
      throw error(400, 'Aucun evenement complete.');
    }

    // 2. Gather Portfolio Images (Max 4 for the A4 PDF)
    const portfolioItems = await prisma.portfolioItem.findMany({
      where: {
        studentProfileId,
        file: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });

    // 3. Fetch campus name
    const student = await prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentProfileId },
      include: { campus: true },
    });

    // 4. Tally up themes (show up to 6 for the progress-bar view)
    const topThemes = tallyTopThemesFromActivities(participations, 6);

    // 5. Build deduplicated activity list with event date and difficulty
    const activityMap = new Map<
      string,
      { name: string; eventDate: string; difficulty: string }
    >();
    for (const p of participations) {
      for (const pa of p.activities) {
        const activity = pa.activity;
        if (activity.activityType === 'orga') continue;
        if (!activityMap.has(activity.id)) {
          activityMap.set(activity.id, {
            name: activity.nom,
            eventDate: p.event ? formatDateFr(new Date(p.event.date)) : '',
            difficulty: activity.difficulte || '',
          });
        }
      }
    }
    const activities = [...activityMap.values()].slice(0, 10);

    // 6. Map school level to readable label
    const niveauLabels: Record<string, string> = {
      '6eme': '6ème',
      '5eme': '5ème',
      '4eme': '4ème',
      '3eme': '3ème',
      '2nde': '2nde',
      '1ere': '1ère',
      Terminale: 'Terminale',
      Sup: 'Sup',
    };

    // 7. Assemble Data
    const data = {
      studentName: `${locals.studentProfile.prenom} ${locals.studentProfile.nom}`,
      campus: student.campus?.name || '',
      schoolLevel: locals.studentProfile.niveau
        ? niveauLabels[locals.studentProfile.niveau] ||
          locals.studentProfile.niveau
        : '',
      xp: locals.studentProfile.xp || 0,
      hours: participations.length * 3,
      eventsAttended: participations.length,
      activitiesCompleted: activityMap.size,
      level: locals.studentProfile.level || 'Novice',
      topThemes,
      activities,
      todayDate: formatDateFr(new Date()),
      // TODO: implement S3 file storage
      images: [] as string[],
    };

    // 8. Generate PDF Buffer via Puppeteer
    const pdfBytes = await generateCertificatePDF(data);

    // 9. Sanitize filename
    const safeFirstName = locals.studentProfile.prenom.replace(
      /[^a-zA-Z0-9]/g,
      '',
    );
    const safeLastName = locals.studentProfile.nom.replace(/[^a-zA-Z0-9]/g, '');

    return new Response(new Blob([pdfBytes], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="Attestation_${safeLastName}_${safeFirstName}.pdf"`,
      },
    });
  } catch (err: unknown) {
    console.error('Erreur API Certificate :', err);
    if (typeof err === 'object' && err !== null && 'status' in err) {
      throw err;
    }
    throw error(500, "Erreur lors de la generation de l'attestation.");
  }
};
