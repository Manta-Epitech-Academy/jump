import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateDiplomaPDF } from '$lib/server/services/diplomaGenerator';
import { formatDateFr } from '$lib/utils';
import { prisma } from '$lib/server/db';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (
    !locals.user ||
    (locals.user.role !== 'staff' && locals.user.role !== 'admin')
  ) {
    throw error(401, 'Non autorise');
  }

  const participationId = url.searchParams.get('participationId');

  if (!participationId) {
    throw error(400, 'ID de participation manquant.');
  }

  try {
    // 1. Fetch data from Prisma
    const participation = await prisma.participation.findUnique({
      where: { id: participationId },
      include: {
        talent: true,
        event: true,
        activities: {
          include: { activity: true },
        },
      },
    });

    if (!participation) {
      throw error(404, 'Participation introuvable.');
    }

    const student = participation.talent;
    const event = participation.event;
    const activity = participation.activities?.find(
      (pa) => pa.activity.activityType !== 'orga',
    )?.activity;

    if (!student || !event) {
      throw error(400, 'Donnees incompletes pour generer le diplome.');
    }

    // 2. Prepare data for EJS template
    const data = {
      studentName: `${student.prenom} ${student.nom}`,
      activityName: activity?.nom || 'Atelier Programmation',
      eventTitle: event.titre,
      eventDate: formatDateFr(event.date),
      todayDate: formatDateFr(new Date()),
    };

    // 3. Generate PDF Buffer via Puppeteer
    const pdfBytes = await generateDiplomaPDF(data);

    const safeFirstName = student.prenom.replace(/[^a-zA-Z0-9]/g, '');
    const safeLastName = student.nom.replace(/[^a-zA-Z0-9]/g, '');

    // 4. Return as downloadable file
    return new Response(new Blob([pdfBytes], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="Diplome_${safeLastName}_${safeFirstName}.pdf"`,
      },
    });
  } catch (err: unknown) {
    console.error('Erreur API Diploma :', err);
    if (typeof err === 'object' && err !== null && 'status' in err) {
      throw err;
    }
    throw error(500, 'Erreur lors de la generation du PDF.');
  }
};
