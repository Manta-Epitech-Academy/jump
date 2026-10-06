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
 * The one thing a write fetches is a highlight's picture, from the https
 * address it is given, before anything is stored: a picture that cannot be
 * copied refuses the whole write, and the class does not move, since that read
 * sends nothing to anybody and lands only on the named campus.
 */

import { prisma } from '$lib/server/db';
import { authoredMarkdownProblems } from '$lib/markdown';
import { isCalendarDay, toDateKey } from '$lib/domain/planningTime';
import { dateKeyToDbDate, dbDateToKey } from '$lib/domain/eventPresence';
import {
  HIGHLIGHT_SUMMARY_MAX,
  HIGHLIGHT_TITLE_MAX,
  TALENT_HOME_NOTE_MAX,
  highlightImageKey,
} from '$lib/domain/talentHome';
import {
  copyRemoteImage,
  HERO_PICTURE_FRAME,
  RemoteImageRefusal,
  swapStoredImages,
  type CopiedImage,
} from '$lib/server/images/remote';
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

async function highlightRow(campus: ResolvedCampus) {
  return prisma.talentHome_Highlight.findUnique({
    where: { campusId: campus.id },
    select: {
      title: true,
      summary: true,
      date: true,
      url: true,
      image: { select: { sourceUrl: true, key: true } },
    },
  });
}

async function highlightState(campus: ResolvedCampus) {
  const row = await highlightRow(campus);
  if (!row) return null;
  const { image, ...fields } = row;
  return {
    campus: campus.name,
    ...fields,
    date: dbDateToKey(row.date),
    imageUrl: image?.sourceUrl ?? null,
  };
}

/** Longest stored edge of a highlight's picture: the hero's picture slot. */
const HIGHLIGHT_IMAGE_MAX_EDGE = 1280;

/** Download the picture, or refuse the whole write saying why. */
async function copyHighlightImage(url: string): Promise<CopiedImage> {
  try {
    return await copyRemoteImage(new URL(url), {
      maxEdge: HIGHLIGHT_IMAGE_MAX_EDGE,
      animated: false,
      frame: HERO_PICTURE_FRAME,
    });
  } catch (err) {
    if (!(err instanceof RemoteImageRefusal)) throw err;
    throw new OperationRefusedError(
      `L'image (${url}) ${err.message}. L'événement mis en avant n'a pas changé.`,
    );
  }
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
 * show it. The picture is optional and goes with the highlight: omitted, the
 * highlight has none, and clearing the highlight removes it.
 *
 * Safe to repeat: the same values leave the same row, and the same picture
 * comes back under the same content-addressed key.
 */
export async function writeTalentHomeHighlight(
  params: {
    campus: string;
    title: string | null;
    summary: string | null;
    date: string | null;
    url: string | null;
    imageUrl?: string;
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

  const previous = await highlightRow(campus);
  const before = await highlightState(campus);
  const previousKeys = previous?.image ? [previous.image.key] : [];

  if (title === null || summary === null || date === null || url === null) {
    if (params.imageUrl)
      throw new OperationRefusedError(
        "Une image ne peut pas être donnée sans l'événement qu'elle illustre. Pour retirer l'événement mis en avant, passez les quatre champs à null sans image.",
      );
    // The picture row goes with the highlight (cascade); its bytes go after.
    await swapStoredImages({
      next: [],
      previousKeys,
      commit: () =>
        prisma.talentHome_Highlight.deleteMany({
          where: { campusId: campus.id },
        }),
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

  const image = params.imageUrl
    ? await copyHighlightImage(params.imageUrl)
    : null;
  const imageRow = image && {
    campusId: campus.id,
    sourceUrl: params.imageUrl!,
    key: highlightImageKey(campus.id, image.digest, image.extension),
    contentType: image.contentType,
    width: image.width,
    height: image.height,
  };

  const values = { title, summary, date: dateKeyToDbDate(date), url };
  await swapStoredImages({
    next: image && imageRow ? [{ ...imageRow, bytes: image.bytes }] : [],
    previousKeys,
    commit: () =>
      prisma.$transaction([
        prisma.talentHome_Highlight.upsert({
          where: { campusId: campus.id },
          create: { campusId: campus.id, ...values },
          update: values,
        }),
        prisma.talentHome_HighlightImage.deleteMany({
          where: { campusId: campus.id },
        }),
        ...(imageRow
          ? [prisma.talentHome_HighlightImage.create({ data: imageRow })]
          : []),
      ]),
  });
  return { applied: true, before, after: await highlightState(campus) };
}
