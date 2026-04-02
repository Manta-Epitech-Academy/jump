import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCertificatePDF } from '$lib/server/services/diplomaGenerator';
import { pbUrl } from '$lib/pocketbase';
import {
  formatDateFr,
  tallyTopThemes,
  type ThemeExpandedParticipation,
} from '$lib/utils';
import type {
  EventsResponse,
  ParticipationsResponse,
  PortfolioItemsResponse,
  SubjectsResponse,
} from '$lib/pocketbase-types';

type CertificateParticipation = ParticipationsResponse<{
  event?: EventsResponse;
  subjects?: SubjectsResponse<unknown, never>[];
}>;

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.student) throw error(401, 'Non autorisé');

  try {
    // 1. Fetch completed participations with event + subject details for the certificate
    const participations = await locals.studentPb
      .collection('participations')
      .getFullList<
        ThemeExpandedParticipation & CertificateParticipation
      >({
        filter: `student = "${locals.student.id}" && is_present = true`,
        expand: 'event,subjects.themes',
      });

    if (participations.length === 0) {
      throw error(400, 'Aucun événement complété.');
    }

    // 2. Gather Portfolio Images (Max 4 for the A4 PDF)
    const portfolio = await locals.studentPb
      .collection('portfolio_items')
      .getList<PortfolioItemsResponse>(1, 4, {
        filter: `student = "${locals.student.id}" && file != ""`,
        sort: '-created',
      });

    // 3. Fetch campus name
    const campus = await locals.studentPb
      .collection('campuses')
      .getOne(locals.student.campus);

    // 4. Tally up themes (show up to 6 for the progress-bar view)
    const topThemes = tallyTopThemes(participations, 6);

    // 5. Build deduplicated subjects list with event date and difficulty
    const subjectMap = new Map<
      string,
      { name: string; eventDate: string; difficulty: string }
    >();
    for (const p of participations) {
      for (const subject of p.expand?.subjects ?? []) {
        if (!subjectMap.has(subject.id)) {
          subjectMap.set(subject.id, {
            name: subject.nom,
            eventDate: p.expand?.event
              ? formatDateFr(new Date(p.expand.event.date))
              : '',
            difficulty: subject.difficulte || '',
          });
        }
      }
    }
    const subjects = [...subjectMap.values()].slice(0, 10);

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
      studentName: `${locals.student.prenom} ${locals.student.nom}`,
      campus: campus.name,
      schoolLevel: locals.student.niveau
        ? niveauLabels[locals.student.niveau] || locals.student.niveau
        : '',
      xp: locals.student.xp || 0,
      hours: participations.length * 3,
      eventsAttended: participations.length,
      subjectsCompleted: subjectMap.size,
      level: locals.student.level || 'Novice',
      topThemes,
      subjects,
      todayDate: formatDateFr(new Date()),
      images: portfolio.items.map(
        (item) =>
          `${pbUrl}/api/files/${item.collectionId}/${item.id}/${item.file}`,
      ),
    };

    // 8. Generate PDF Buffer via Puppeteer
    const pdfBytes = await generateCertificatePDF(data);

    // 9. Sanitize filename
    const safeFirstName = locals.student.prenom.replace(/[^a-zA-Z0-9]/g, '');
    const safeLastName = locals.student.nom.replace(/[^a-zA-Z0-9]/g, '');

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
    throw error(500, "Erreur lors de la génération de l'attestation.");
  }
};
