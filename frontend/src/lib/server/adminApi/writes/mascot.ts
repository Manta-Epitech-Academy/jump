/**
 * The class A write on what EpiDuck says (#539): one line at a time.
 *
 * The code decides when the duck speaks (`MASCOT_MOMENTS`), an admin decides
 * what it says, so a seasonal line or a line about a camp needs no deploy.
 * Created, rewritten, re-dated, archived; never deleted, since a delete whose
 * target a read returns is class C, and an archived line comes back by
 * unarchiving it. Bounded to the one row it names and sends nothing.
 *
 * A line is checked against its moment's tokens before it is stored, the
 * certificate contract rather than the feedback form's: a token nobody fills
 * would print as `{jours}` in a bubble on a minor's screen. Its moment is
 * chosen at creation, because the tokens it may cite are the moment's: moving
 * it is creating another line and archiving this one.
 *
 * Not safe to repeat when it creates (each call adds a line); an update sets
 * values rather than adjusting them, so a retried one changes nothing more.
 */

import { prisma } from '#lib/server/db.ts';
import {
  MASCOT_LINE_MAX,
  MASCOT_MOMENTS,
  unknownMascotTokens,
  type MascotMomentKey,
} from '#lib/domain/mascot.ts';
import { dateKeyToDbDate, dbDateToKey } from '#lib/domain/eventPresence.ts';
import type { DateKey } from '#lib/domain/planningTime.ts';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import type { WriteOutcome } from '../plan';
import { archivedAtFor } from './catalogue';

/** A line in the exact shape `config_mascot_lines` returns and this write takes. */
export type MascotLineState = {
  mascotLineId: string;
  moment: string;
  text: string;
  startsOn: DateKey | null;
  endsOn: DateKey | null;
  archived: boolean;
};

export const MASCOT_LINE_SELECT = {
  id: true,
  momentKey: true,
  text: true,
  startsOn: true,
  endsOn: true,
  archivedAt: true,
} as const;

export function mascotLineState(row: {
  id: string;
  momentKey: string;
  text: string;
  startsOn: Date | null;
  endsOn: Date | null;
  archivedAt: Date | null;
}): MascotLineState {
  return {
    mascotLineId: row.id,
    moment: row.momentKey,
    text: row.text,
    startsOn: row.startsOn ? dbDateToKey(row.startsOn) : null,
    endsOn: row.endsOn ? dbDateToKey(row.endsOn) : null,
    archived: row.archivedAt !== null,
  };
}

async function stateOf(id: string): Promise<MascotLineState | null> {
  const row = await prisma.mascot_Line.findUnique({
    where: { id },
    select: MASCOT_LINE_SELECT,
  });
  return row ? mascotLineState(row) : null;
}

/** Refuses a text the bubble cannot carry or its moment cannot fill. */
function checkText(moment: MascotMomentKey, text: string): void {
  if (text.length > MASCOT_LINE_MAX) {
    throw new OperationRefusedError(
      `Une phrase du canard tient en ${MASCOT_LINE_MAX} caractères au plus, pour rester une bulle : celle-ci en fait ${text.length}. Raccourcissez-la.`,
    );
  }
  const unknown = unknownMascotTokens(moment, text);
  if (unknown.length > 0) {
    const allowed = MASCOT_MOMENTS[moment].tokens.map((t) => `{${t}}`);
    throw new OperationRefusedError(
      `Le moment « ${MASCOT_MOMENTS[moment].label} » ne connaît pas ${unknown
        .map((t) => `{${t}}`)
        .join(', ')}. Ses phrases peuvent citer ${allowed.join(', ')}.`,
    );
  }
}

/** Refuses a window that ends before it starts. */
function checkWindow(startsOn: DateKey | null, endsOn: DateKey | null): void {
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new OperationRefusedError(
      `La période d'une phrase finit après son début : ${endsOn} est avant ${startsOn}. Les deux jours sont compris.`,
    );
  }
}

export async function writeMascotLine(params: {
  mascotLineId?: string;
  moment?: MascotMomentKey;
  text?: string;
  startsOn?: DateKey | null;
  endsOn?: DateKey | null;
  archived?: boolean;
}): Promise<WriteOutcome> {
  if (!params.mascotLineId) {
    if (!params.moment || !params.text) {
      throw new OperationRefusedError(
        `Pour créer une phrase du canard, donnez son moment (moment) et son texte (text). Pour en modifier une, donnez son mascotLineId. ${handleProvenanceFr('mascotLineId')}`,
      );
    }
    checkText(params.moment, params.text);
    const startsOn = params.startsOn ?? null;
    const endsOn = params.endsOn ?? null;
    checkWindow(startsOn, endsOn);
    const created = await prisma.mascot_Line.create({
      data: {
        momentKey: params.moment,
        text: params.text,
        startsOn: startsOn ? dateKeyToDbDate(startsOn) : null,
        endsOn: endsOn ? dateKeyToDbDate(endsOn) : null,
        archivedAt: params.archived ? new Date() : null,
      },
      select: { id: true },
    });
    return { applied: true, before: null, after: await stateOf(created.id) };
  }

  const before = await stateOf(params.mascotLineId);
  if (!before) {
    throw new OperationRefusedError(
      `Phrase du canard « ${params.mascotLineId} » introuvable. ${handleProvenanceFr('mascotLineId')}`,
    );
  }
  if (params.moment && params.moment !== before.moment) {
    throw new OperationRefusedError(
      `Une phrase reste au moment où elle a été créée (« ${before.moment} ») : ses variables sont celles de ce moment. Créez-en une au moment « ${params.moment} », puis archivez celle-ci.`,
    );
  }
  // A line stored before its moment was retired is not checked against it:
  // nothing fires a retired moment, and its rows go in the migration retiring it.
  const moment = before.moment as MascotMomentKey;
  if (params.text !== undefined) checkText(moment, params.text);
  const startsOn =
    params.startsOn === undefined ? before.startsOn : params.startsOn;
  const endsOn = params.endsOn === undefined ? before.endsOn : params.endsOn;
  checkWindow(startsOn, endsOn);

  await prisma.mascot_Line.update({
    where: { id: before.mascotLineId },
    data: {
      text: params.text,
      startsOn:
        params.startsOn === undefined
          ? undefined
          : params.startsOn && dateKeyToDbDate(params.startsOn),
      endsOn:
        params.endsOn === undefined
          ? undefined
          : params.endsOn && dateKeyToDbDate(params.endsOn),
      archivedAt: archivedAtFor(params.archived, before.archived),
    },
  });
  return {
    applied: true,
    before,
    after: await stateOf(before.mascotLineId),
  };
}
