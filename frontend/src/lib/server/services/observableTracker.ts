/**
 * Talent state for observable / competence tracking on GitHub-backed subjects.
 *
 * - When a talent clicks "Section suivante", every observable attached to the
 *   completed H1 section (and its nested H2/H3 sections) is upserted as
 *   `pending` for that talent in the event. Their parent SkillLevel gains a
 *   `mobilisee` row (unless it's already `certifiee`).
 * - When a manta validates an observable, it flips to `observed`. We then
 *   recompute the parent SkillLevel: if the talent now has at least
 *   `CERTIFICATION_THRESHOLD` distinct `observed` observables across all
 *   events for that SkillLevel, the competence state flips to `certifiee`.
 */

import { prisma } from '$lib/server/db';

/**
 * Number of distinct observed observables required to certify a SkillLevel.
 * Default of 5 per Kevin's recall of cognitive-research literature; tune via
 * a future `AppSetting` row when we have data.
 */
export const CERTIFICATION_THRESHOLD = 5;

/**
 * Find the H2/H3 sections nested inside an H1 (or H2 within an H1's range).
 * Sections share a `documentId` and the nested ones live in the
 * sortOrder range `[h1.sortOrder, nextH1.sortOrder)`.
 */
async function expandSectionRange(rootSectionId: string): Promise<{
  rootSubjectVersionId: string;
  sectionIds: string[];
} | null> {
  const root = await prisma.section.findUnique({
    where: { id: rootSectionId },
    select: {
      id: true,
      level: true,
      documentId: true,
      sortOrder: true,
      subjectVersionId: true,
    },
  });
  if (!root) return null;
  if (root.level === 3) {
    return {
      rootSubjectVersionId: root.subjectVersionId,
      sectionIds: [root.id],
    };
  }

  const nextSibling = await prisma.section.findFirst({
    where: {
      subjectVersionId: root.subjectVersionId,
      documentId: root.documentId,
      level: root.level,
      sortOrder: { gt: root.sortOrder },
    },
    orderBy: { sortOrder: 'asc' },
    select: { sortOrder: true },
  });

  const range = await prisma.section.findMany({
    where: {
      subjectVersionId: root.subjectVersionId,
      documentId: root.documentId,
      sortOrder: nextSibling
        ? { gte: root.sortOrder, lt: nextSibling.sortOrder }
        : { gte: root.sortOrder },
    },
    select: { id: true },
  });
  return {
    rootSubjectVersionId: root.subjectVersionId,
    sectionIds: range.map((s) => s.id),
  };
}

export type MarkSectionSeenResult = {
  observablesPended: number;
  competencesMobilized: number;
};

export async function markSectionSeen(params: {
  talentId: string;
  eventId: string;
  sectionId: string;
}): Promise<MarkSectionSeenResult> {
  const range = await expandSectionRange(params.sectionId);
  if (!range || range.sectionIds.length === 0) {
    return { observablesPended: 0, competencesMobilized: 0 };
  }

  const links = await prisma.subjectObservable.findMany({
    where: { sectionId: { in: range.sectionIds } },
    select: { observableId: true, skillLevelId: true },
  });
  if (links.length === 0) {
    return { observablesPended: 0, competencesMobilized: 0 };
  }

  const observableIds = Array.from(new Set(links.map((l) => l.observableId)));
  const skillLevelIds = Array.from(new Set(links.map((l) => l.skillLevelId)));

  return await prisma.$transaction(async (tx) => {
    // Observables: insert only the ones that don't already have a state row
    // for this (talent, event). Diff-based count avoids the racy
    // "createdAt within 2s" heuristic the previous implementation used.
    const existingObs = await tx.talentObservableState.findMany({
      where: {
        talentId: params.talentId,
        eventId: params.eventId,
        observableId: { in: observableIds },
      },
      select: { observableId: true },
    });
    const existingObsIds = new Set(existingObs.map((r) => r.observableId));
    const newObsIds = observableIds.filter((id) => !existingObsIds.has(id));

    if (newObsIds.length > 0) {
      await tx.talentObservableState.createMany({
        data: newObsIds.map((observableId) => ({
          talentId: params.talentId,
          eventId: params.eventId,
          observableId,
          // Pin the H1 the talent was on so the manta validation page can
          // deep-link without arbitrary picks across SubjectObservable rows.
          sourceSectionId: params.sectionId,
          state: 'pending',
        })),
        skipDuplicates: true,
      });
    }

    // Competences: only create if no row exists. We never overwrite
    // (an existing `certifiee` must not regress to `mobilisee`, and an
    // existing `mobilisee` is already what we'd have written).
    const existingComp = await tx.talentCompetenceState.findMany({
      where: {
        talentId: params.talentId,
        skillLevelId: { in: skillLevelIds },
      },
      select: { skillLevelId: true },
    });
    const existingCompIds = new Set(existingComp.map((r) => r.skillLevelId));
    const newSkillLevelIds = skillLevelIds.filter(
      (id) => !existingCompIds.has(id),
    );

    if (newSkillLevelIds.length > 0) {
      await tx.talentCompetenceState.createMany({
        data: newSkillLevelIds.map((skillLevelId) => ({
          talentId: params.talentId,
          skillLevelId,
          state: 'mobilisee',
        })),
        skipDuplicates: true,
      });
    }

    return {
      observablesPended: newObsIds.length,
      competencesMobilized: newSkillLevelIds.length,
    };
  });
}

export type MarkObservableObservedResult = {
  newlyCertifiedSkillLevelIds: string[];
};

export async function markObservableObserved(params: {
  talentId: string;
  eventId: string;
  observableId: string;
  observedByStaffProfileId: string;
}): Promise<MarkObservableObservedResult> {
  const newlyCertified: string[] = [];

  await prisma.$transaction(async (tx) => {
    const updated = await tx.talentObservableState.update({
      where: {
        talentId_eventId_observableId: {
          talentId: params.talentId,
          eventId: params.eventId,
          observableId: params.observableId,
        },
      },
      data: {
        state: 'observed',
        observedById: params.observedByStaffProfileId,
        observedAt: new Date(),
      },
      select: { observableId: true },
    });

    // Find every SkillLevel this observable is mapped to (across subjects).
    const links = await tx.subjectObservable.findMany({
      where: { observableId: updated.observableId },
      select: { skillLevelId: true },
      distinct: ['skillLevelId'],
    });

    for (const { skillLevelId } of links) {
      // Count distinct observed observables for this talent under this SkillLevel.
      const observedRows = await tx.subjectObservable.findMany({
        where: {
          skillLevelId,
          observable: {
            states: {
              some: {
                talentId: params.talentId,
                state: 'observed',
              },
            },
          },
        },
        select: { observableId: true },
        distinct: ['observableId'],
      });
      if (observedRows.length < CERTIFICATION_THRESHOLD) continue;

      const current = await tx.talentCompetenceState.findUnique({
        where: {
          talentId_skillLevelId: { talentId: params.talentId, skillLevelId },
        },
        select: { state: true },
      });
      if (current?.state === 'certifiee') continue;

      await tx.talentCompetenceState.upsert({
        where: {
          talentId_skillLevelId: { talentId: params.talentId, skillLevelId },
        },
        create: {
          talentId: params.talentId,
          skillLevelId,
          state: 'certifiee',
          certifiedAt: new Date(),
        },
        update: {
          state: 'certifiee',
          certifiedAt: new Date(),
        },
      });
      newlyCertified.push(skillLevelId);
    }
  });

  return { newlyCertifiedSkillLevelIds: newlyCertified };
}

export type PendingObservable = {
  observableId: string;
  observableDesc: string;
  externalId: number;
  projectSlug: string;
  skillName: string;
  level: string;
  subjectVersionId: string | null;
  documentPath: string | null;
  sectionAnchor: string | null;
  sectionTitle: string | null;
};

/**
 * List pending observables for a manta-facing validation view. Joins the
 * pending state with the section the talent was on when the row was
 * created (sourceSection), falling back to the first SubjectObservable
 * link only for legacy rows that predate sourceSectionId.
 */
export async function getPendingObservables(
  talentId: string,
  eventId: string,
): Promise<PendingObservable[]> {
  const rows = await prisma.talentObservableState.findMany({
    where: { talentId, eventId, state: 'pending' },
    include: {
      observable: true,
      sourceSection: {
        include: {
          document: true,
          observableLinks: {
            include: {
              skillLevel: { include: { skill: true } },
            },
          },
        },
      },
    },
  });

  const out: PendingObservable[] = [];
  for (const row of rows) {
    const skillLink = row.sourceSection?.observableLinks.find(
      (l) => l.observableId === row.observableId,
    );

    out.push({
      observableId: row.observableId,
      observableDesc: row.observable.desc,
      externalId: row.observable.externalId,
      projectSlug: row.observable.projectSlug,
      skillName: skillLink?.skillLevel.skill.shortName ?? '',
      level: skillLink?.skillLevel.level ?? '',
      subjectVersionId: row.sourceSection?.subjectVersionId ?? null,
      documentPath: row.sourceSection?.document.path ?? null,
      sectionAnchor: row.sourceSection?.anchor ?? null,
      sectionTitle: row.sourceSection?.title ?? null,
    });
  }
  return out;
}
