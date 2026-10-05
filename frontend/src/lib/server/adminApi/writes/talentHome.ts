/**
 * The class A writes that fill a campus's talent home: « le mot du campus »
 * and the one event it invites its talents to sign up for.
 *
 * Each is bounded to the one row of one named campus, reversible by writing the
 * previous value back (the audit row keeps it), and sends nothing to anybody:
 * the content waits for a talent to open their home. Neither has a screen, on
 * purpose. The person who fills them works campus by campus from their own list
 * of campaigns, and a named operation is what fits that; a form would be one
 * more page to keep in step with the database.
 *
 * Content is refused rather than repaired: what is stored is what was written,
 * so the author never discovers on a talent's screen that part of it vanished.
 */

import { prisma } from '$lib/server/db';
import { authoredMarkdownProblems } from '$lib/markdown';
import { isCalendarDay, toDateKey } from '$lib/domain/planningTime';
import { dateKeyToDbDate, dbDateToKey } from '$lib/domain/eventPresence';
import {
  HIGHLIGHT_SUMMARY_MAX,
  HIGHLIGHT_TITLE_MAX,
  TALENT_HOME_NOTE_MAX,
} from '$lib/domain/talentHome';
import { OperationRefusedError } from '../errors';
import type { WriteOutcome } from '../plan';
import { resolveScope, type ResolvedCampus } from '../scope';

async function namedCampus(name: string): Promise<ResolvedCampus> {
  const { campus } = await resolveScope({ campus: name });
  // `resolveScope` throws on an unknown name, so a campus asked for is a campus
  // returned; the guard only narrows the type.
  if (!campus) throw new OperationRefusedError(`Campus « ${name} » inconnu.`);
  return campus;
}

// ─── Le mot du campus ───

async function noteState(campus: ResolvedCampus) {
  const row = await prisma.talentHome_Note.findUnique({
    where: { campusId: campus.id },
    select: { markdown: true },
  });
  return row && { campus: campus.name, markdown: row.markdown };
}

/**
 * Set or clear one campus's note.
 *
 * Safe to repeat: the same text leaves the same row, and clearing a campus that
 * has no note changes nothing.
 */
export async function writeTalentHomeNote(params: {
  campus: string;
  markdown: string | null;
}): Promise<WriteOutcome> {
  const campus = await namedCampus(params.campus);
  const { markdown } = params;

  if (markdown !== null) {
    if (markdown.trim() === '')
      throw new OperationRefusedError(
        'Le mot du campus est vide. Pour le retirer, passez markdown à null.',
      );
    if (markdown.length > TALENT_HOME_NOTE_MAX)
      throw new OperationRefusedError(
        `Le mot du campus fait ${markdown.length} caractères, la limite est ${TALENT_HOME_NOTE_MAX}.`,
      );
    const problems = authoredMarkdownProblems(markdown);
    if (problems.length > 0)
      throw new OperationRefusedError(
        `Le mot du campus n'a pas été enregistré. ${problems.join(' ')}`,
      );
  }

  const before = await noteState(campus);
  if (markdown === null) {
    await prisma.talentHome_Note.deleteMany({ where: { campusId: campus.id } });
  } else {
    await prisma.talentHome_Note.upsert({
      where: { campusId: campus.id },
      create: { campusId: campus.id, markdown },
      update: { markdown },
    });
  }
  return { applied: true, before, after: await noteState(campus) };
}

// ─── L'événement mis en avant ───

async function highlightState(campus: ResolvedCampus) {
  const row = await prisma.talentHome_Highlight.findUnique({
    where: { campusId: campus.id },
    select: { title: true, summary: true, date: true, url: true },
  });
  return row && { campus: campus.name, ...row, date: dbDateToKey(row.date) };
}

function checkSignupUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OperationRefusedError(
      `« ${url} » n'est pas une adresse valide. Attendu : l'adresse complète du formulaire, par exemple https://www.epitech.eu/inscription-atelier-programmation-informatique/?CampaignId=…`,
    );
  }
  if (parsed.protocol !== 'https:')
    throw new OperationRefusedError(
      `Le lien d'inscription doit commencer par https:// (reçu : ${parsed.protocol}).`,
    );
}

/**
 * Set or clear the event one campus puts forward.
 *
 * All four fields together set it, all four null clear it, and anything in
 * between is refused: a highlight with no link or no day would invite talents
 * to nothing. A day already past is refused too, since the home would never
 * show it.
 *
 * Safe to repeat: the same values leave the same row.
 */
export async function writeTalentHomeHighlight(
  params: {
    campus: string;
    title: string | null;
    summary: string | null;
    date: string | null;
    url: string | null;
  },
  now: Date = new Date(),
): Promise<WriteOutcome> {
  const campus = await namedCampus(params.campus);
  const { title, summary, date, url } = params;
  const given = [title, summary, date, url].filter((v) => v !== null).length;

  if (given !== 0 && given !== 4)
    throw new OperationRefusedError(
      "L'événement mis en avant demande ses quatre champs (title, summary, date, url). Pour le retirer, passez les quatre à null.",
    );

  const before = await highlightState(campus);

  if (title === null || summary === null || date === null || url === null) {
    await prisma.talentHome_Highlight.deleteMany({
      where: { campusId: campus.id },
    });
    return { applied: true, before, after: await highlightState(campus) };
  }

  if (title.trim() === '' || title.length > HIGHLIGHT_TITLE_MAX)
    throw new OperationRefusedError(
      `Le titre doit faire entre 1 et ${HIGHLIGHT_TITLE_MAX} caractères (reçu : ${title.length}).`,
    );
  if (summary.trim() === '' || summary.length > HIGHLIGHT_SUMMARY_MAX)
    throw new OperationRefusedError(
      `Le texte doit faire entre 1 et ${HIGHLIGHT_SUMMARY_MAX} caractères (reçu : ${summary.length}).`,
    );
  if (!isCalendarDay(date))
    throw new OperationRefusedError(
      `« ${date} » n'est pas un jour du calendrier. Format attendu : AAAA-MM-JJ.`,
    );
  checkSignupUrl(url);

  const { timezone } = await prisma.campus.findUniqueOrThrow({
    where: { id: campus.id },
    select: { timezone: true },
  });
  const today = toDateKey(now, timezone);
  if (date < today)
    throw new OperationRefusedError(
      `Le ${date} est déjà passé à ${campus.name} (nous sommes le ${today}) : l'accueil ne l'afficherait jamais.`,
    );

  const values = { title, summary, date: dateKeyToDbDate(date), url };
  await prisma.talentHome_Highlight.upsert({
    where: { campusId: campus.id },
    create: { campusId: campus.id, ...values },
    update: values,
  });
  return { applied: true, before, after: await highlightState(campus) };
}
