/**
 * The class A write on the centres d'intérêt a talent picks at onboarding.
 *
 * Created, renamed, re-emojied, archived; never deleted. Deleting one cascaded
 * it off every talent who had picked it, so the answer a talent gave changed
 * under them with nothing to say so. Archived, it is no longer offered and the
 * talents who picked it keep it. Its kind (tech or general) is the question it
 * answers, so it is chosen once, at creation: moving one would move answers
 * from one question to the other.
 *
 * Safe to repeat: it sets values rather than adjusting them, and a new interest
 * takes the next position of its kind only when it is created.
 */

import { prisma } from '$lib/server/db';
import { INTEREST_KINDS, type InterestKind } from '$lib/domain/interests';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import type { WriteOutcome } from '../plan';
import { archivedAtFor, refusingRaces } from './catalogue';

type InterestState = {
  interestId: string;
  kind: string;
  label: string;
  emoji: string | null;
  order: number;
  archived: boolean;
};

async function stateOf(id: string): Promise<InterestState | null> {
  const row = await prisma.interest.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      nom: true,
      emoji: true,
      order: true,
      archivedAt: true,
    },
  });
  return row
    ? {
        interestId: row.id,
        kind: row.kind,
        label: row.nom,
        emoji: row.emoji,
        order: row.order,
        archived: row.archivedAt !== null,
      }
    : null;
}

/** Refuses a label another interest holds, naming it. */
async function refuseTakenLabel(label: string, ownId: string | null) {
  const holder = await prisma.interest.findUnique({
    where: { nom: label },
    select: { id: true },
  });
  if (holder && holder.id !== ownId) {
    throw new OperationRefusedError(
      `Un centre d'intérêt s'appelle déjà « ${label} » (${holder.id}). Modifiez celui-là, ou choisissez un autre nom.`,
    );
  }
}

export async function writeInterest(params: {
  interestId?: string;
  kind?: InterestKind;
  label?: string;
  emoji?: string | null;
  archived?: boolean;
}): Promise<WriteOutcome> {
  const emoji =
    params.emoji === undefined ? undefined : params.emoji?.trim() || null;

  if (!params.interestId) {
    if (!params.kind || !params.label) {
      throw new OperationRefusedError(
        `Pour créer un centre d'intérêt, donnez sa nature (kind : ${INTEREST_KINDS.join(' ou ')}) et son nom (label). Pour en modifier un, donnez son interestId. ${handleProvenanceFr('interestId')}`,
      );
    }
    const { kind, label } = params;
    await refuseTakenLabel(label, null);
    let id = '';
    await refusingRaces(
      `Un centre d'intérêt s'appelle déjà « ${label} ».`,
      async () => {
        const last = await prisma.interest.aggregate({
          where: { kind },
          _max: { order: true },
        });
        const created = await prisma.interest.create({
          data: {
            kind,
            nom: label,
            emoji: emoji ?? null,
            order: (last._max.order ?? 0) + 1,
            archivedAt: params.archived ? new Date() : null,
          },
          select: { id: true },
        });
        id = created.id;
      },
    );
    return { applied: true, before: null, after: await stateOf(id) };
  }

  const before = await stateOf(params.interestId);
  if (!before) {
    throw new OperationRefusedError(
      `Centre d'intérêt « ${params.interestId} » introuvable. ${handleProvenanceFr('interestId')}`,
    );
  }
  if (params.kind && params.kind !== before.kind) {
    throw new OperationRefusedError(
      `La nature d'un centre d'intérêt se choisit à sa création : « ${before.label} » reste ${before.kind}, sinon les réponses déjà données changeraient de question. Créez-en un autre de l'autre nature, puis archivez celui-ci.`,
    );
  }
  if (params.label) await refuseTakenLabel(params.label, before.interestId);

  await refusingRaces(
    `Un centre d'intérêt s'appelle déjà « ${params.label} ».`,
    () =>
      prisma.interest.update({
        where: { id: before.interestId },
        data: {
          nom: params.label,
          emoji,
          archivedAt: archivedAtFor(params.archived, before.archived),
        },
      }),
  );
  return {
    applied: true,
    before,
    after: await stateOf(before.interestId),
  };
}
