/**
 * Mirrors the `Manta-Epitech-Academy/ref_comp` repository into Jump's database.
 *
 * Each call resolves the current HEAD of the configured branch. If the SHA is
 * unchanged from the latest persisted snapshot, it's a no-op. Otherwise a new
 * `RefCompSnapshot` is created and the competence/skill/observable rows are
 * fully reloaded under that snapshot. The snapshot becomes `isCurrent=true`
 * inside a single transaction; old snapshots are kept for audit and to anchor
 * past `SubjectVersion` rows.
 */

import { prisma } from '$lib/server/db';
import {
  parseRepoUrl,
  getCommitSha,
  getFileText,
  listDirectory,
} from './githubClient';
import { recordSync } from '$lib/server/infra/syncStatus';

const REF_COMP_REPO = 'Manta-Epitech-Academy/ref_comp';
const DEFAULT_REF = 'main';
const FRAMEWORK_PATH = 'competency_framework.json';
const OBSERVABLE_DIR = 'observable';

type FrameworkSkillLevel = { name: string; desc: string };

type FrameworkSkill = {
  id: number;
  short_name: string;
  A1?: FrameworkSkillLevel;
  A2?: FrameworkSkillLevel;
  B1?: FrameworkSkillLevel;
  B2?: FrameworkSkillLevel;
  C1?: FrameworkSkillLevel;
  C2?: FrameworkSkillLevel;
};

type FrameworkDomain = {
  domain: string;
  desc: string;
  skills: FrameworkSkill[];
};

type ObservableFile = {
  schema_version: string;
  project: string;
  observables: { id: number; desc: string }[];
};

const LEVEL_KEYS: (keyof FrameworkSkill)[] = [
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2',
];

export type SyncResult =
  | { status: 'noop'; commitSha: string }
  | {
      status: 'synced';
      commitSha: string;
      snapshotId: string;
      counts: {
        competences: number;
        skills: number;
        skillLevels: number;
        observables: number;
      };
    };

export async function syncRefComp(ref = DEFAULT_REF): Promise<SyncResult> {
  const coords = parseRepoUrl(REF_COMP_REPO);
  const headSha = await getCommitSha(coords, ref);

  const current = await prisma.refCompSnapshot.findFirst({
    where: { isCurrent: true },
  });
  if (current?.commitSha === headSha) {
    return { status: 'noop', commitSha: headSha };
  }

  // Reuse a previously imported snapshot for this SHA if it exists (e.g.
  // revert). The two-step (clear current → set current) needs to happen
  // atomically to avoid violating the partial unique index on isCurrent.
  const existing = await prisma.refCompSnapshot.findUnique({
    where: { commitSha: headSha },
  });
  if (existing) {
    await prisma.$transaction([
      prisma.refCompSnapshot.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      }),
      prisma.refCompSnapshot.update({
        where: { id: existing.id },
        data: { isCurrent: true },
      }),
    ]);
    await recordSync({ type: 'ref_comp', commitSha: headSha });
    return {
      status: 'synced',
      commitSha: headSha,
      snapshotId: existing.id,
      counts: { competences: 0, skills: 0, skillLevels: 0, observables: 0 },
    };
  }

  const frameworkRaw = await getFileText(coords, FRAMEWORK_PATH, headSha);
  const framework = JSON.parse(frameworkRaw) as FrameworkDomain[];

  const observableEntries = await listDirectory(
    coords,
    OBSERVABLE_DIR,
    headSha,
  );
  const projectSlugs = observableEntries
    .filter((e) => e.type === 'dir')
    .map((e) => e.name);

  const observableFiles = await Promise.all(
    projectSlugs.map(async (slug) => {
      const raw = await getFileText(
        coords,
        `${OBSERVABLE_DIR}/${slug}/observables.json`,
        headSha,
      );
      return { slug, parsed: JSON.parse(raw) as ObservableFile };
    }),
  );

  const counts = await prisma.$transaction(async (tx) => {
    await tx.refCompSnapshot.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });

    const snapshot = await tx.refCompSnapshot.create({
      data: { commitSha: headSha, isCurrent: true },
    });

    // Tier 1: Competence (one row per domain) — need ids returned to FK
    // skills / observable later.
    const competences = await tx.competence.createManyAndReturn({
      data: framework.map((d) => ({
        snapshotId: snapshot.id,
        domain: d.domain,
        desc: d.desc,
      })),
      select: { id: true, domain: true },
    });
    const competenceIdByDomain = new Map(
      competences.map((c) => [c.domain, c.id]),
    );

    // Tier 2: Skill — bulk create with ids back.
    const skills = await tx.skill.createManyAndReturn({
      data: framework.flatMap((d) =>
        d.skills.map((s) => ({
          snapshotId: snapshot.id,
          competenceId: competenceIdByDomain.get(d.domain)!,
          numericId: s.id,
          shortName: s.short_name,
        })),
      ),
      select: { id: true, competenceId: true, numericId: true },
    });
    const skillIdByKey = new Map(
      skills.map((s) => [`${s.competenceId}:${s.numericId}`, s.id]),
    );

    // Tier 3: SkillLevel — leaf, no need to return ids.
    const skillLevelsData = framework.flatMap((d) =>
      d.skills.flatMap((s) => {
        const skillId = skillIdByKey.get(
          `${competenceIdByDomain.get(d.domain)}:${s.id}`,
        )!;
        return LEVEL_KEYS.flatMap((k) => {
          const level = s[k] as FrameworkSkillLevel | undefined;
          if (!level) return [];
          return [
            {
              snapshotId: snapshot.id,
              skillId,
              level: k as string,
              name: level.name,
              desc: level.desc,
            },
          ];
        });
      }),
    );
    const skillLevels = await tx.skillLevel.createMany({
      data: skillLevelsData,
    });

    // Observables — flat under (snapshot, projectSlug, externalId).
    const observablesData = observableFiles.flatMap(({ slug, parsed }) =>
      parsed.observables.map((obs) => ({
        snapshotId: snapshot.id,
        projectSlug: slug,
        externalId: obs.id,
        desc: obs.desc,
      })),
    );
    const observables = await tx.observable.createMany({
      data: observablesData,
    });

    return {
      snapshotId: snapshot.id,
      competences: competences.length,
      skills: skills.length,
      skillLevels: skillLevels.count,
      observables: observables.count,
    };
  });

  await recordSync({ type: 'ref_comp', commitSha: headSha });

  return {
    status: 'synced',
    commitSha: headSha,
    snapshotId: counts.snapshotId,
    counts: {
      competences: counts.competences,
      skills: counts.skills,
      skillLevels: counts.skillLevels,
      observables: counts.observables,
    },
  };
}

// ─── Snapshot resolver ──────────────────────────────────────────────────────
// Subject imports do hundreds of `(skill_path, observable_id)` lookups against
// a single snapshot. Doing them as individual `findUnique` calls would mean
// 4 round-trips per observable ref. Pre-load the snapshot's competences /
// skills / skillLevels / observables once and resolve in memory.

export type SnapshotResolver = {
  snapshotId: string;
  commitSha: string;
  resolveSkillPath: (skillPath: string) => { skillLevelId: string } | null;
  resolveObservable: (
    projectSlug: string,
    externalId: number,
  ) => { observableId: string } | null;
};

export async function loadSnapshotResolver(
  snapshotId: string,
): Promise<SnapshotResolver> {
  const snapshot = await prisma.refCompSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    select: { id: true, commitSha: true },
  });
  const [competences, skills, skillLevels, observables] = await Promise.all([
    prisma.competence.findMany({
      where: { snapshotId },
      select: { id: true, domain: true },
    }),
    prisma.skill.findMany({
      where: { snapshotId },
      select: {
        id: true,
        competenceId: true,
        numericId: true,
        shortName: true,
      },
    }),
    prisma.skillLevel.findMany({
      where: { snapshotId },
      select: { id: true, skillId: true, level: true },
    }),
    prisma.observable.findMany({
      where: { snapshotId },
      select: { id: true, projectSlug: true, externalId: true },
    }),
  ]);

  const competenceIdByDomain = new Map(
    competences.map((c) => [c.domain, c.id]),
  );
  // Two indexes on Skill: by `(competenceId, numericId)` for digit lookups
  // (`/PROG/04/A1`) and by `(competenceId, shortName)` for word lookups
  // (`/PROG/algorithmics/A1`). Path notation is 1-indexed; numericId is
  // 0-indexed, so we shift on read in `resolveSkillPath`.
  const skillIdByDigit = new Map(
    skills.map((s) => [`${s.competenceId}:${s.numericId}`, s.id]),
  );
  const skillIdByName = new Map(
    skills.map((s) => [`${s.competenceId}:${s.shortName}`, s.id]),
  );
  const skillLevelIdByKey = new Map(
    skillLevels.map((sl) => [`${sl.skillId}:${sl.level}`, sl.id]),
  );
  const observableIdByKey = new Map(
    observables.map((o) => [`${o.projectSlug}:${o.externalId}`, o.id]),
  );

  return {
    snapshotId: snapshot.id,
    commitSha: snapshot.commitSha,
    resolveSkillPath(skillPath) {
      const segments = skillPath.split('/').filter(Boolean);
      if (segments.length !== 3) return null;
      const [domainName, skillRef, levelKey] = segments;
      const competenceId = competenceIdByDomain.get(domainName);
      if (!competenceId) return null;

      const isDigit = /^\d+$/.test(skillRef);
      const skillId = isDigit
        ? skillIdByDigit.get(`${competenceId}:${Number(skillRef) - 1}`)
        : skillIdByName.get(`${competenceId}:${skillRef}`);
      if (!skillId) return null;

      const skillLevelId = skillLevelIdByKey.get(`${skillId}:${levelKey}`);
      return skillLevelId ? { skillLevelId } : null;
    },
    resolveObservable(projectSlug, externalId) {
      const id = observableIdByKey.get(`${projectSlug}:${externalId}`);
      return id ? { observableId: id } : null;
    },
  };
}
