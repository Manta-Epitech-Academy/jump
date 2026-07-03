import { parseEventImportCsv, type CsvStudent } from '$lib/domain/csv';
import { prisma } from '$lib/server/db';

export type ImportAction = {
  id: string;
  csvData: CsvStudent;
  suggestedStatus: 'NEW' | 'MERGE' | 'CONFLICT' | 'SIBLING' | 'BLOCKED';
  decision: 'CREATE_NEW' | 'LINK_EXISTING' | 'SKIP';
  existingStudent?: Record<string, unknown>;
  matchReason?: string;
  bringPc: boolean;
};

/**
 * French label for the kind of account already squatting an email, used in the
 * BLOCKED reason shown to the dev. Staff roles map to bauth roles `admin`/
 * `staff` (see `bauthRoleForStaffRole`); parents to `parent`.
 */
function accountKindLabel(role: string | null): string {
  switch (role) {
    case 'admin':
    case 'staff':
      return 'staff';
    case 'parent':
      return 'parent';
    default:
      return 'existant';
  }
}

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

      // The import lives in the `bauth_user.email` namespace, which students
      // share with staff and parents. Resolve who already owns this email
      // BEFORE classifying, so a row is never minted as a student onto a
      // non-student identity. (Reasoning over `Talent` alone is blind to
      // staff/parent rows: that is how a staff @epitech.eu address got
      // imported as a student "test test" and then blocked that person's
      // Microsoft login with `account_not_linked`.)
      const owner = csvS.email
        ? await prisma.bauth_user.findUnique({
            where: { email: csvS.email },
            select: {
              role: true,
              talent: {
                select: {
                  id: true,
                  nom: true,
                  prenom: true,
                  email: true,
                  niveau: true,
                },
              },
            },
          })
        : null;

      if (owner && !owner.talent) {
        // Email belongs to a staff/admin/parent account. Creating a student
        // here would both hit the unique-email constraint and conflate two
        // people, so this is a hard stop resolved by hand, never auto-imported.
        status = 'BLOCKED';
        decision = 'SKIP';
        reason = `Adresse déjà liée à un compte ${accountKindLabel(owner.role)} : à résoudre manuellement`;
      } else if (owner?.talent) {
        // Email already belongs to a student: same name is the same person
        // (link, do not duplicate); a different name is a sibling sharing the
        // family inbox (new dossier).
        existing = owner.talent;
        if (
          owner.talent.nom === csvS.nom &&
          owner.talent.prenom === csvS.prenom
        ) {
          status = 'MERGE';
          decision = 'LINK_EXISTING';
          reason = 'Profil identique trouvé (Nom + Email)';
        } else {
          status = 'SIBLING';
          decision = 'CREATE_NEW';
          reason = `Fratrie détectée : Email identique à ${owner.talent.prenom} ${owner.talent.nom}`;
        }
      } else {
        // Email is free. Flag a same-name student on a different email as a
        // possible homonym, but still allow the new dossier.
        const nameMatch = await prisma.talent.findFirst({
          where: { nom: csvS.nom, prenom: csvS.prenom },
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            niveau: true,
          },
        });

        if (nameMatch) {
          status = 'CONFLICT';
          decision = 'CREATE_NEW';
          existing = nameMatch;
          reason = 'Nom identique mais email différent (Homonyme possible)';
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
  campusId: string,
) {
  // 1. Create Event
  const newEvent = await prisma.event.create({
    data: {
      titre: eventName,
      date: new Date(eventDateStr),
      campusId,
      planning: { create: {} },
    },
  });

  // 2. Process Students
  await Promise.all(
    importList.map(async (item) => {
      // BLOCKED rows carry SKIP and must never be created, even if a tampered
      // client payload flipped the decision back to CREATE_NEW.
      if (item.decision === 'SKIP') return;

      let talentId: string | undefined;

      if (item.decision === 'LINK_EXISTING' && item.existingStudent) {
        talentId = item.existingStudent.id as string;
      } else {
        // CREATE NEW USER + STUDENT PROFILE.
        // `importList` is client-supplied, so the BLOCKED status from analysis
        // is only a preview: re-derive the guard here before writing. An email
        // owned by a non-student account (staff/parent) is never turned into a
        // student. (A talent owner is fine: that is the sibling/same-email case.)
        const owner = item.csvData.email
          ? await prisma.bauth_user.findUnique({
              where: { email: item.csvData.email },
              select: { talent: { select: { id: true } } },
            })
          : null;
        if (owner && !owner.talent) {
          console.warn(
            `Import skipped: ${item.csvData.email} is owned by a non-student account`,
          );
          return;
        }
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
          // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
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
              },
            });
          }
        } catch (err) {
          // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
          console.error(`Failed to assign student ${talentId}`, err);
        }
      }
    }),
  );

  return newEvent.id;
}
