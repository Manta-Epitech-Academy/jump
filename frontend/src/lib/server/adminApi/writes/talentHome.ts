/**
 * The class A writes that fill a campus's talent home: « le mot du campus »
 * and what the campus puts forward (an event of its own to sign up for, and a
 * generic invitation, the standing fallback).
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
 * The one thing a write fetches is a picture (the invitation's, those the note
 * names), from the https address it is given, before anything is stored, and
 * only when the campus does not already hold a copy of that address: a picture
 * that cannot be copied refuses the whole write, and the class does not move,
 * since that read sends nothing to anybody and lands only on the named campus.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { lockEvent } from '$lib/server/services/events';
import {
  authoredImageSources,
  authoredMarkdownProblems,
  authoredTextLength,
} from '$lib/markdown';
import { toDateKey } from '$lib/domain/planningTime';
import { eventDisplayName, eventPublicName } from '$lib/domain/event';
import { isEventShown } from '$lib/domain/eventReadiness';
import {
  HERO_BUTTON_MAX,
  HERO_TEXT_MAX,
  HERO_TITLE_MAX,
} from '$lib/domain/eventHero';
import {
  isInvitationOpen,
  TALENT_HOME_NOTE_MAX,
  TALENT_HOME_NOTE_MAX_IMAGES,
  highlightImageKey,
  noteImageKey,
} from '$lib/domain/talentHome';
import {
  replacePictures,
  swapStoredImages,
  type StoredPicture,
} from '$lib/server/images/remote';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import type { WriteOutcome } from '../plan';
import { resolveScope, UnknownScopeError, type ResolvedCampus } from '../scope';

async function namedCampus(name: string): Promise<ResolvedCampus> {
  const { campus } = await resolveScope({ campus: name });
  // `resolveScope` throws on an unknown name, so a campus asked for is a campus
  // returned; the guard only narrows the type.
  if (!campus) throw new OperationRefusedError(`Campus « ${name} » inconnu.`);
  return campus;
}

/**
 * Lock the campus row, which exists even before its note or highlight does, so
 * a second write on this campus waits here and then reads what this one wrote
 * (`replacePictures`, `swapStoredImages`).
 */
async function lockCampus(
  tx: Prisma.TransactionClient,
  campus: ResolvedCampus,
) {
  await tx.$executeRaw`SELECT 1 FROM "Campus" WHERE id = ${campus.id} FOR NO KEY UPDATE`;
}

// ─── Le mot du campus ───

async function noteState(campus: ResolvedCampus) {
  const row = await prisma.talentHome_Note.findUnique({
    where: { campusId: campus.id },
    select: { markdown: true },
  });
  return row && { campus: campus.name, markdown: row.markdown };
}

/** Longest stored edge of a note's picture: the card's width, the dialog's. */
const NOTE_IMAGE_MAX_EDGE = 1600;

async function storedNotePictures(
  db: Prisma.TransactionClient,
  campus: ResolvedCampus,
): Promise<StoredPicture[]> {
  const images = await db.talentHome_NoteImage.findMany({
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
  // A note names each address once at most as a picture to hold, so the
  // address is the slot.
  return images.map((image) => ({ slot: image.sourceUrl, ...image }));
}

/**
 * Set or clear one campus's note, and the copies of the pictures it names.
 *
 * Safe to repeat: the same text leaves the same row, its pictures are not
 * downloaded again (`replacePictures`), and clearing a campus that has no note
 * changes nothing.
 */
export async function writeTalentHomeNote(params: {
  campus: string;
  markdown: string | null;
}): Promise<WriteOutcome> {
  const campus = await namedCampus(params.campus);
  const { markdown } = params;

  const sources = markdown === null ? [] : authoredImageSources(markdown);
  if (markdown !== null) {
    if (markdown.trim() === '')
      throw new OperationRefusedError(
        'Le mot du campus est vide. Pour le retirer, passez markdown à null.',
      );
    const length = authoredTextLength(markdown);
    if (length > TALENT_HOME_NOTE_MAX)
      throw new OperationRefusedError(
        `Le mot du campus fait ${length} caractères (sans compter les adresses des images), la limite est ${TALENT_HOME_NOTE_MAX}.`,
      );
    if (sources.length > TALENT_HOME_NOTE_MAX_IMAGES)
      throw new OperationRefusedError(
        `Le mot du campus contient ${sources.length} images, la limite est ${TALENT_HOME_NOTE_MAX_IMAGES}.`,
      );
    const problems = authoredMarkdownProblems(markdown);
    if (problems.length > 0)
      throw new OperationRefusedError(
        `Le mot du campus n'a pas été enregistré. ${problems.join(' ')}`,
      );
  }

  const before = await replacePictures({
    requests: sources.map((sourceUrl) => ({
      slot: sourceUrl,
      sourceUrl,
      maxEdge: NOTE_IMAGE_MAX_EDGE,
    })),
    keyFor: (request, writeId, extension) =>
      noteImageKey(
        campus.id,
        writeId,
        sources.indexOf(request.sourceUrl),
        extension,
      ),
    refusal: (request, why) =>
      new OperationRefusedError(
        `L'image n°${sources.indexOf(request.sourceUrl) + 1} (${request.sourceUrl}) ${why}. Le mot du campus n'a pas changé.`,
      ),
    readStored: (db) => storedNotePictures(db, campus),
    lock: (tx) => lockCampus(tx, campus),
    commit: async (tx, pictures) => {
      const before = await tx.talentHome_Note.findUnique({
        where: { campusId: campus.id },
        select: { markdown: true },
      });
      if (markdown === null) {
        // The pictures' rows go with the note (cascade); their bytes after.
        await tx.talentHome_Note.deleteMany({ where: { campusId: campus.id } });
      } else {
        await tx.talentHome_Note.upsert({
          where: { campusId: campus.id },
          create: { campusId: campus.id, markdown },
          update: { markdown },
        });
        await tx.talentHome_NoteImage.deleteMany({
          where: { campusId: campus.id },
        });
        await tx.talentHome_NoteImage.createMany({
          data: pictures.map(({ slot: _slot, ...picture }) => ({
            campusId: campus.id,
            ...picture,
          })),
        });
      }
      return before && { campus: campus.name, markdown: before.markdown };
    },
  });
  return { applied: true, before, after: await noteState(campus) };
}

// ─── Ce que le campus met en avant ───

const HIGHLIGHT_SELECT = {
  eventId: true,
  title: true,
  text: true,
  url: true,
  buttonLabel: true,
  image: { select: { sourceUrl: true, key: true, stillKey: true } },
} as const;

type HighlightRow = {
  eventId: string | null;
  title: string | null;
  text: string | null;
  url: string | null;
  buttonLabel: string | null;
  image: { sourceUrl: string; key: string; stillKey: string | null } | null;
};

/**
 * What the write reports, before and after, in the shape it takes: the event
 * pointed at, and the generic invitation with the address its picture was
 * copied from.
 */
function presentHighlight(campus: ResolvedCampus, row: HighlightRow | null) {
  if (!row) return null;
  return {
    campus: campus.name,
    eventId: row.eventId,
    invitation:
      row.title !== null && row.text !== null && row.url !== null
        ? {
            title: row.title,
            text: row.text,
            url: row.url,
            buttonLabel: row.buttonLabel,
            imageUrl: row.image?.sourceUrl ?? null,
          }
        : null,
  };
}

async function highlightState(campus: ResolvedCampus) {
  return presentHighlight(
    campus,
    await prisma.talentHome_Highlight.findUnique({
      where: { campusId: campus.id },
      select: HIGHLIGHT_SELECT,
    }),
  );
}

/** The invitation's picture as `replacePictures` reads it, in its one slot. */
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
 * Longest stored edge of an invitation's picture: the hero's picture slot. Any
 * proportion and any format Jump can show are taken, an animation included;
 * the hero lays out whatever it is given.
 */
const HIGHLIGHT_IMAGE_MAX_EDGE = 1280;

/**
 * A sign-up link a talent is sent to: a whole address, over https. Shared by
 * the campus's invitation and an event's own sign-up form
 * (`write_event_config`), so both refuse the same thing in the same words.
 */
export function checkSignupUrl(url: string): void {
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
 * The event a campus may put forward: one of its own, activated (a talent is
 * shown no other event, #516), still inviting (until the end of its first day
 * on the campus clock), named, and with a sign-up form for the hero's button
 * to open: what `pointedEventShown` reads back on the talent's home. Checked
 * inside the write's transaction, under the event's lock, which a save of its
 * configuration takes too before it clears the sign-up form
 * (`EventService.updateEventConfig`).
 */
async function checkHighlightedEvent(
  tx: Prisma.TransactionClient,
  campus: ResolvedCampus,
  eventId: string,
  now: Date,
): Promise<void> {
  await lockEvent(tx, eventId);
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: {
      titre: true,
      publicName: true,
      date: true,
      signupUrl: true,
      devActivatedAt: true,
      modules: { select: { moduleKey: true } },
      campus: { select: { id: true, name: true, timezone: true } },
    },
  });
  if (!event)
    throw new UnknownScopeError(
      `Événement « ${eventId} » introuvable. ${handleProvenanceFr('eventId')}`,
    );
  const name = eventDisplayName(event);
  if (event.campus.id !== campus.id)
    throw new OperationRefusedError(
      `« ${name} » est un événement de ${event.campus.name}, pas de ${campus.name} : un campus ne met en avant que ses propres événements.`,
    );
  if (!isEventShown(event))
    throw new OperationRefusedError(
      `« ${name} » n'est pas activé, et un talent ne voit que les événements activés. Rendez-le d'abord visible avec write_event_config (visible).`,
    );
  if (!isInvitationOpen(event, event.campus.timezone, now))
    throw new OperationRefusedError(
      `« ${name} » a commencé le ${toDateKey(event.date, event.campus.timezone)} : l'accueil n'invite plus à s'y inscrire. Mettez en avant un événement à venir, ou retirez-le avec eventId à null.`,
    );
  if (!eventPublicName(event))
    throw new OperationRefusedError(
      `« ${name} » n'a pas de nom public, et l'accueil n'annonce jamais un événement sous son titre Salesforce. Donnez-lui d'abord son publicName avec write_event_config.`,
    );
  if (!event.signupUrl)
    throw new OperationRefusedError(
      `« ${name} » n'a pas de formulaire d'inscription, et le bouton de l'accueil n'aurait nulle part où mener. Donnez-lui d'abord son signupUrl avec write_event_config.`,
    );
}

type InvitationParams = {
  title: string;
  text: string;
  url: string;
  buttonLabel?: string | null;
  imageUrl?: string;
};

function checkInvitation(invitation: InvitationParams): void {
  const { title, text, url, buttonLabel } = invitation;
  if (title.trim() === '' || title.length > HERO_TITLE_MAX)
    throw new OperationRefusedError(
      `Le titre de l'invitation doit faire entre 1 et ${HERO_TITLE_MAX} caractères (reçu : ${title.length}).`,
    );
  if (text.trim() === '' || text.length > HERO_TEXT_MAX)
    throw new OperationRefusedError(
      `Le texte de l'invitation doit faire entre 1 et ${HERO_TEXT_MAX} caractères (reçu : ${text.length}).`,
    );
  if (
    buttonLabel != null &&
    (buttonLabel.trim() === '' || buttonLabel.length > HERO_BUTTON_MAX)
  )
    throw new OperationRefusedError(
      `Le libellé du bouton doit faire entre 1 et ${HERO_BUTTON_MAX} caractères (reçu : ${buttonLabel.length}). Passez null pour garder « Je m’inscris ».`,
    );
  checkSignupUrl(url);
}

/**
 * Set or clear what one campus puts forward: the event it points at, its
 * generic invitation, or both, with patch semantics (an omitted half is left
 * as it is, `null` clears it).
 *
 * The event must be one of the campus's own, not past its first day, named and
 * with a sign-up form; its words and picture are its own (`write_event_config`).
 * It is checked only when it changes: the one the campus already points at is
 * accepted again as it is, even past its first day, so a call repeated or a
 * read sent back is never refused for an event the write did not move; the read
 * (`config_talent_home`) says why it no longer shows.
 * The invitation is whole or absent (title, text and link), with an optional
 * button label and picture; omitting the picture removes it, and clearing the
 * invitation removes it too. A row left with neither half is deleted.
 *
 * Safe to repeat: the same values leave the same row, and a picture whose
 * address has not changed keeps the copy already stored (`replacePictures`).
 */
export async function writeTalentHomeHighlight(
  params: {
    campus: string;
    eventId?: string | null;
    invitation?: InvitationParams | null;
  },
  now: Date = new Date(),
): Promise<WriteOutcome> {
  const campus = await namedCampus(params.campus);
  const { eventId, invitation } = params;

  if (eventId === undefined && invitation === undefined)
    throw new OperationRefusedError(
      "Rien à changer : passez eventId (l'événement mis en avant, null pour le retirer), invitation (l'invitation générique, null pour la retirer), ou les deux.",
    );
  if (invitation) checkInvitation(invitation);

  /**
   * Write the row as this call leaves it, inside the caller's transaction, and
   * delete it when it holds neither half. Answers the row as it was.
   */
  const commitRow = async (tx: Prisma.TransactionClient) => {
    const before = await tx.talentHome_Highlight.findUnique({
      where: { campusId: campus.id },
      select: HIGHLIGHT_SELECT,
    });
    if (typeof eventId === 'string' && eventId !== before?.eventId)
      await checkHighlightedEvent(tx, campus, eventId, now);
    const nextEventId =
      eventId === undefined ? (before?.eventId ?? null) : eventId;
    const words =
      invitation === undefined
        ? before && {
            title: before.title,
            text: before.text,
            url: before.url,
            buttonLabel: before.buttonLabel,
          }
        : invitation && {
            title: invitation.title,
            text: invitation.text,
            url: invitation.url,
            buttonLabel: invitation.buttonLabel ?? null,
          };
    const values = {
      eventId: nextEventId,
      title: words?.title ?? null,
      text: words?.text ?? null,
      url: words?.url ?? null,
      buttonLabel: words?.buttonLabel ?? null,
    };
    if (values.eventId === null && values.title === null) {
      // Its picture's row goes with it (cascade); the bytes after the commit.
      await tx.talentHome_Highlight.deleteMany({
        where: { campusId: campus.id },
      });
    } else {
      await tx.talentHome_Highlight.upsert({
        where: { campusId: campus.id },
        create: { campusId: campus.id, ...values },
        update: values,
      });
    }
    return before;
  };

  if (invitation === undefined) {
    // Only the event moves: the invitation and its picture stay as they are,
    // unless the row ends up empty, whose picture then goes with it.
    const before = await swapStoredImages({
      next: [],
      commit: async (tx) => {
        await lockCampus(tx, campus);
        const before = await commitRow(tx);
        const after = await tx.talentHome_Highlight.findUnique({
          where: { campusId: campus.id },
          select: { campusId: true },
        });
        return {
          replaced: after
            ? []
            : [before?.image?.key, before?.image?.stillKey].filter(
                (key): key is string => !!key,
              ),
          result: presentHighlight(campus, before),
        };
      },
    });
    return { applied: true, before, after: await highlightState(campus) };
  }

  const before = await replacePictures({
    requests: invitation?.imageUrl
      ? [
          {
            slot: HIGHLIGHT_SLOT,
            sourceUrl: invitation.imageUrl,
            maxEdge: HIGHLIGHT_IMAGE_MAX_EDGE,
          },
        ]
      : [],
    keyFor: (_request, writeId, extension) =>
      highlightImageKey(campus.id, writeId, extension),
    refusal: (request, why) =>
      new OperationRefusedError(
        `L'image (${request.sourceUrl}) ${why}. La mise en avant n'a pas changé.`,
      ),
    readStored: (db) => storedHighlightPicture(db, campus),
    lock: (tx) => lockCampus(tx, campus),
    commit: async (tx, pictures) => {
      const before = await commitRow(tx);
      await tx.talentHome_HighlightImage.deleteMany({
        where: { campusId: campus.id },
      });
      if (invitation) {
        for (const { slot: _slot, ...picture } of pictures) {
          await tx.talentHome_HighlightImage.create({
            data: { campusId: campus.id, ...picture },
          });
        }
      }
      return presentHighlight(campus, before);
    },
  });
  return { applied: true, before, after: await highlightState(campus) };
}
