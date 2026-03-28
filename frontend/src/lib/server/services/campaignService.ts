import { parseEventImportCsv, type CsvStudent } from '$lib/domain/csv';
import { suggestBestSubject } from '$lib/domain/recommender';
import { createScoped } from '$lib/pocketbase';
import { generatePin } from '$lib/utils';
import {
  type TypedPocketBase,
  StudentsNiveauOptions,
  StudentsLevelOptions,
} from '$lib/pocketbase-types';

export type ImportAction = {
  id: string;
  csvData: CsvStudent;
  suggestedStatus: 'NEW' | 'MERGE' | 'CONFLICT' | 'SIBLING';
  decision: 'CREATE_NEW' | 'LINK_EXISTING';
  existingStudent?: Record<string, unknown>;
  matchReason?: string;
  bring_pc: boolean;
};

export async function analyzeCampaignFile(pb: TypedPocketBase, file: File) {
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
      let existing: any = null;
      let status: ImportAction['suggestedStatus'] = 'NEW';
      let decision: ImportAction['decision'] = 'CREATE_NEW';
      let reason = '';

      const escape = (s: string) => s.replace(/["\\]/g, '\\$&');
      const safeNom = escape(csvS.nom);
      const safePrenom = escape(csvS.prenom);
      const safeEmail = escape(csvS.email);

      try {
        existing = await pb
          .collection('students')
          .getFirstListItem(
            `nom = "${safeNom}" && prenom = "${safePrenom}" && email = "${safeEmail}"`,
            { requestKey: null },
          );
        status = 'MERGE';
        decision = 'LINK_EXISTING';
        reason = 'Profil identique trouvé (Nom + Email)';
      } catch (_) {
        if (csvS.email) {
          try {
            const siblingMatch = await pb
              .collection('students')
              .getFirstListItem(`email = "${safeEmail}"`, {
                requestKey: null,
              });

            status = 'SIBLING';
            decision = 'CREATE_NEW';
            existing = siblingMatch;
            reason = `Fratrie détectée : Email identique à ${siblingMatch.prenom} ${siblingMatch.nom}`;
          } catch (__) {
            /* Truly new email */
          }
        }

        if (status === 'NEW') {
          try {
            const nameMatch = await pb
              .collection('students')
              .getFirstListItem(
                `nom = "${safeNom}" && prenom = "${safePrenom}"`,
                {
                  requestKey: null,
                },
              );

            status = 'CONFLICT';
            decision = 'CREATE_NEW';
            existing = nameMatch;
            reason = 'Nom identique mais email différent (Homonyme possible)';
          } catch (___) {
            /* Truly new person */
          }
        }
      }

      return {
        id: `row-${index}`,
        csvData: csvS,
        suggestedStatus: status,
        decision: decision,
        existingStudent: existing,
        matchReason: reason,
        bring_pc: true,
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
  pb: TypedPocketBase,
  importList: ImportAction[],
  eventName: string,
  eventDateStr: string,
  mantas: string[],
  notes: string,
) {
  // 1. Create Event
  const eventRecord = await createScoped(pb, 'events', {
    titre: eventName,
    date: new Date(eventDateStr).toISOString(),
    mantas: mantas,
    notes: notes,
    pin: generatePin(),
  });
  const newEventId = eventRecord.id;

  const subjects = await pb.collection('subjects').getFullList();

  // 2. Process Students in Parallel
  await Promise.all(
    importList.map(async (item) => {
      let studentId: string | undefined;

      if (item.decision === 'LINK_EXISTING' && item.existingStudent) {
        studentId = item.existingStudent.id;
      } else {
        // CREATE NEW STUDENT
        const tempPassword = crypto.randomUUID() + Math.random().toString(36);
        const studentData = {
          prenom: item.csvData.prenom,
          nom: item.csvData.nom,
          email: item.csvData.email,
          phone: item.csvData.phone,
          niveau: item.csvData.niveau as StudentsNiveauOptions,
          xp: 0,
          events_count: 0,
          parent_email: item.csvData.parentEmail,
          parent_phone: item.csvData.parentPhone,
          emailVisibility: true,
          password: tempPassword,
          passwordConfirm: tempPassword,
          verified: false,
          level: StudentsLevelOptions.Novice,
          badges: [],
        };

        try {
          const newS = await createScoped(pb, 'students', studentData);
          studentId = newS.id;
        } catch (err) {
          console.error(`Creation failed for ${item.csvData.nom}`, err);
        }
      }

      if (studentId) {
        try {
          const check = await pb.collection('participations').getList(1, 1, {
            filter: `student = "${studentId}" && event = "${newEventId}"`,
            requestKey: null,
          });

          if (check.totalItems === 0) {
            const subjectId = await suggestBestSubject(
              pb,
              studentId,
              subjects,
              null,
            );
            await createScoped(pb, 'participations', {
              student: studentId,
              event: newEventId,
              subjects: subjectId ? [subjectId] : [],
              is_present: false,
              bring_pc: item.bring_pc,
            });
          }
        } catch (err) {
          console.error(`Failed to assign student ${studentId}`, err);
        }
      }
    }),
  );

  return newEventId;
}
