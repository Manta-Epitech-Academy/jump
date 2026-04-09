import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateDiplomaPDF } from '$lib/server/services/diplomaGenerator';
import { formatDate } from '$lib/utils';
import { prisma } from '$lib/server/db';
import { m } from '$lib/paraglide/messages.js';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user || (locals.user.role !== 'staff' && locals.user.role !== 'admin')) {
    throw error(401, m.server_error_unauthorized());
  }

  const participationId = url.searchParams.get('participationId');

  if (!participationId) {
    throw error(400, m.diploma_participation_id_missing());
  }

  try {
    // 1. Fetch data from Prisma
    const participation = await prisma.participation.findUnique({
      where: { id: participationId },
      include: {
        studentProfile: true,
        event: true,
        subjects: {
          include: { subject: true },
        },
      },
    });

    if (!participation) {
      throw error(404, m.diploma_not_found());
    }

    const student = participation.studentProfile;
    const event = participation.event;
    const subject = participation.subjects[0]?.subject;

    if (!student || !event) {
      throw error(400, m.diploma_incomplete_data());
    }

    // 2. Prepare data for EJS template
    const data = {
      studentName: `${student.prenom} ${student.nom}`,
      subjectName: subject?.nom || 'Atelier Programmation',
      eventTitle: event.titre,
      eventDate: formatDate(event.date),
      todayDate: formatDate(new Date()),
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
    throw error(500, m.diploma_generation_error());
  }
};
