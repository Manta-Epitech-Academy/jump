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
 * address it is given, before anything is stored (and only when the highlight
 * does not already hold a copy of that address): a picture that cannot be
 * copied refuses the whole write, and the class does not move, since that read
 * sends nothing to anybody and lands only on the named campus.
 */

import type { Prisma } from '@prisma/client';
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
  replacePictures,
  swapStoredImages,
  type StoredPicture,
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

const HIGHLIGHT_SELECT = {
  title: true,
  summary: true,
  date: true,
  url: true,
  image: { select: { sourceUrl: true, key: true, stillKey: true } },
} as const;

async function highlightRow(campus: ResolvedCampus) {
  return prisma.talentHome_Highlight.findUnique({
    where: { campusId: campus.id },
    select: HIGHLIGHT_SELECT,
  });
}

type HighlightRow = NonNullable<Awaited<ReturnType<typeof highlightRow>>>;

function presentHighlight(campus: ResolvedCampus, row: HighlightRow | null) {
  if (!row) return null;
  const { image, ...fields } = row;
  return {
    campus: campus.name,
    ...fields,
    date: dbDateToKey(row.date),
    imageUrl: image?.sourceUrl ?? null,
  };
}

async function highlightState(campus: ResolvedCampus) {
  return presentHighlight(campus, await highlightRow(campus));
}

/**
 * Lock the campus row, which exists even before its first highlight does, so a
 * second write on this campus waits here and then reads what this one wrote.
 */
async function lockCampus(
  tx: Prisma.TransactionClient,
  campus: ResolvedCampus,
) {
  await tx.$executeRaw`SELECT 1 FROM "Campus" WHERE id = ${campus.id} FOR NO KEY UPDATE`;
}

/** The highlight's picture as `replacePictures` reads it, in its one slot. */
const HIGHLIGHT_SLOT = 'highlight';

async function storedHighlightPicture(
  db: Prisma.TransactionClient,
  campus: ResolvedCampus,
): Promise<StoredPicture[]> {
  const image = await db.talentHome_HighlightImage.findUnique({
    where: { campusId: campus.id },
    select: {
      sourceUrl: true,
      key: true,
      stillKey: true,
      contentType: true,
      width: true,
      height: true,
    },
  });
  return image ? [{ slot: HIGHLIGHT_SLOT, ...image }] : [];
}

/**
 * Longest stored edge of a highlight's picture: the hero's picture slot. Any
 * proportion and any format Jump can show are taken, an animation included;
 * the hero lays out whatever it is given.
 */
const HIGHLIGHT_IMAGE_MAX_EDGE = 1280;

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
 * Safe to repeat: the same values leave the same row, and a picture whose
 * address has not changed keeps the copy already stored (`replacePictures`).
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

  if (title === null || summary === null || date === null || url === null) {
    if (params.imageUrl)
      throw new OperationRefusedError(
        "Une image ne peut pas être donnée sans l'événement qu'elle illustre. Pour retirer l'événement mis en avant, passez les quatre champs à null sans image.",
      );
    // The picture row goes with the highlight (cascade); its bytes go after.
    const { before } = await swapStoredImages({
      next: [],
      commit: async (tx) => {
        await lockCampus(tx, campus);
        const before = await tx.talentHome_Highlight.findUnique({
          where: { campusId: campus.id },
          select: HIGHLIGHT_SELECT,
        });
        await tx.talentHome_Highlight.deleteMany({
          where: { campusId: campus.id },
        });
        return {
          replaced: [before?.image?.key, before?.image?.stillKey].filter(
            (key): key is string => !!key,
          ),
          result: { before: presentHighlight(campus, before) },
        };
      },
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
  const before = await replacePictures({
    requests: params.imageUrl
      ? [
          {
            slot: HIGHLIGHT_SLOT,
            sourceUrl: params.imageUrl,
            maxEdge: HIGHLIGHT_IMAGE_MAX_EDGE,
          },
        ]
      : [],
    keyFor: (_request, writeId, extension) =>
      highlightImageKey(campus.id, writeId, extension),
    refusal: (request, why) =>
      new OperationRefusedError(
        `L'image (${request.sourceUrl}) ${why}. L'événement mis en avant n'a pas changé.`,
      ),
    readStored: (db) => storedHighlightPicture(db, campus),
    lock: (tx) => lockCampus(tx, campus),
    commit: async (tx, pictures) => {
      const before = await tx.talentHome_Highlight.findUnique({
        where: { campusId: campus.id },
        select: HIGHLIGHT_SELECT,
      });
      await tx.talentHome_Highlight.upsert({
        where: { campusId: campus.id },
        create: { campusId: campus.id, ...values },
        update: values,
      });
      await tx.talentHome_HighlightImage.deleteMany({
        where: { campusId: campus.id },
      });
      for (const { slot: _slot, ...picture } of pictures) {
        await tx.talentHome_HighlightImage.create({
          data: { campusId: campus.id, ...picture },
        });
      }
      return presentHighlight(campus, before);
    },
  });
  return { applied: true, before, after: await highlightState(campus) };
}
