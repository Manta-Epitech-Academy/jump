import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateDiplomaPDF } from '$lib/server/diplomaGenerator';
import { formatDateFr } from '$lib/utils';
import type {
  EventsResponse,
  ParticipationsResponse,
  StudentsResponse,
  SubjectsResponse,
} from '$lib/pocketbase-types';

type ParticipationExpand = {
  student: StudentsResponse;
  event: EventsResponse;
  subjects: SubjectsResponse[];
};

export const GET: RequestHandler = async ({ url, locals }) => {
  const participationId = url.searchParams.get('participationId');

  if (!participationId) {
    throw error(400, 'ID de participation manquant.');
  }

  try {
    // 1. Fetch data from PocketBase
    const participation = await locals.pb
      .collection('participations')
      .getOne<ParticipationsResponse<ParticipationExpand>>(participationId, {
        expand: 'student,event,subjects',
      });

    const student = participation.expand?.student;
    const event = participation.expand?.event;
    const subject = participation.expand?.subjects?.[0];

    if (!student || !event) {
      throw error(400, 'Données incomplètes pour générer le diplôme.');
    }

    // 2. Prepare data for EJS template
    const data = {
      studentName: `${student.prenom} ${student.nom}`,
      subjectName: subject?.nom || 'Atelier Programmation',
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
    throw error(500, 'Erreur lors de la génération du PDF.');
  }
};
