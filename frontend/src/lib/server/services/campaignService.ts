import { parseEventImportCsv, type CsvStudent } from '$lib/domain/csv';
import { generatePin } from '$lib/utils';
import { prisma } from '$lib/server/db';

export type ImportAction = {
  id: string;
  csvData: CsvStudent;
  suggestedStatus: 'NEW' | 'MERGE' | 'CONFLICT' | 'SIBLING';
  decision: 'CREATE_NEW' | 'LINK_EXISTING';
  existingStudent?: Record<string, unknown>;
  matchReason?: string;
  bringPc: boolean;
};

export async function analyzeCampaignFile(file: File) {
  let text = await file.text();
  if (text.includes('\ufffd')) {
    const buffer = await file.arrayBuffer();
    const decoder = new TextDecoder('windows-1252');
    text = decoder.decode(buffer);
  }

  const { eventName, eventDate, students } = await parseEventImportCsv(text);

  const analysis = await Promise.all(
    students.map(async (csvS, i) => {
      const index = i + 1;
      let existing: Record<string, unknown> | null = null;
      let status: ImportAction['suggestedStatus'] = 'NEW';
      let decision: ImportAction['decision'] = 'CREATE_NEW';
      let reason = '';

      // Try exact match (nom + prenom + email) — global search to avoid duplicates
      const exactMatch = await prisma.talent.findFirst({
        where: {
          nom: csvS.nom,
          prenom: csvS.prenom,
          user: { email: csvS.email },
        },
        include: { user: true },
      });

      if (exactMatch) {
        status = 'MERGE';
        decision = 'LINK_EXISTING';
        reason = 'Profil identique trouvé (Nom + Email)';
        existing = { ...exactMatch };
      } else {
        // Check for sibling (same email)
        if (csvS.email) {
          const siblingMatch = await prisma.talent.findFirst({
            where: { user: { email: csvS.email } },
            include: { user: true },
          });

          if (siblingMatch) {
            status = 'SIBLING';
            decision = 'CREATE_NEW';
            existing = { ...siblingMatch };
            reason = `Fratrie détectée : Email identique à ${siblingMatch.prenom} ${siblingMatch.nom}`;
          }
        }

        // Check for homonym (same name, different email)
        if (status === 'NEW') {
          const nameMatch = await prisma.talent.findFirst({
            where: { nom: csvS.nom, prenom: csvS.prenom },
            include: { user: true },
          });

          if (nameMatch) {
            status = 'CONFLICT';
            decision = 'CREATE_NEW';
            existing = { ...nameMatch };
            reason = 'Nom identique mais email différent (Homonyme possible)';
          }
        }
      }

      return {
        id: `row-${index}`,
        csvData: csvS,
        suggestedStatus: status,
        decision,
        existingStudent: existing ?? undefined,
        matchReason: reason,
        bringPc: true,
      } as ImportAction;
    }),
  );

  return {
    analysisSuccess: true,
    eventName,
    eventDate: eventDate.toISOString(),
    analysisData: analysis,
  };
}

export async function importCampaignData(
  importList: ImportAction[],
  eventName: string,
  eventDateStr: string,
  mantas: string[],
  notes: string,
  campusId: string,
) {
  // 1. Create Event
  const newEvent = await prisma.event.create({
    data: {
      titre: eventName,
      date: new Date(eventDateStr),
      campusId,
      pin: generatePin(),
      notes,
      mantas: {
        create: mantas.map((staffProfileId) => ({ staffProfileId })),
      },
    },
  });

  // 2. Process Students
  await Promise.all(
    importList.map(async (item) => {
      let talentId: string | undefined;

      if (item.decision === 'LINK_EXISTING' && item.existingStudent) {
        talentId = item.existingStudent.id as string;
      } else {
        // CREATE NEW USER + STUDENT PROFILE
        try {
          const user = await prisma.bauth_user.create({
            data: {
              email: item.csvData.email,
              role: 'student',
              name: `${item.csvData.prenom} ${item.csvData.nom}`,
              talent: {
                create: {
                  prenom: item.csvData.prenom,
                  nom: item.csvData.nom,
                  email: item.csvData.email,
                  niveau: item.csvData.niveau || null,
                  xp: 0,
                  eventsCount: 0,
                  parentEmail: item.csvData.parentEmail,
                  parentPhone: item.csvData.parentPhone,
                  phone: item.csvData.phone,
                },
              },
            },
            include: { talent: true },
          });
          talentId = user.talent!.id;
        } catch (err) {
          console.error(`Creation failed for ${item.csvData.nom}`, err);
        }
      }

      if (talentId) {
        try {
          // Check if participation already exists
          const existing = await prisma.participation.findUnique({
            where: {
              talentId_eventId: {
                talentId,
                eventId: newEvent.id,
              },
            },
          });

          if (!existing) {
            await prisma.participation.create({
              data: {
                talentId,
                eventId: newEvent.id,
                campusId,
                bringPc: item.bringPc,
                isPresent: false,
              },
            });
          }
        } catch (err) {
          console.error(`Failed to assign student ${talentId}`, err);
        }
      }
    }),
  );

  return newEvent.id;
}
