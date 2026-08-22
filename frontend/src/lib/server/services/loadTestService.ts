import { error } from '@sveltejs/kit';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { can } from '$lib/domain/permissions';
import { prisma } from '$lib/server/db';

/**
 * Server-side load-test plumbing. The whole point is that a load-test driver
 * (k6 on a laptop) only ever speaks HTTP to Jump with the bearer token — it
 * NEVER touches the database directly. So seeding throwaway accounts, building
 * the k6 manifest and cleaning up all run HERE, on the target environment,
 * against that environment's own DB. The `/api/test/*` endpoints are thin
 * wrappers over these functions.
 *
 * Throwaway accounts live under @loadtest.invalid so they can never collide
 * with real users and are purgeable in one cascade delete.
 */
const DOMAIN = '@loadtest.invalid';

/**
 * Constant-time string compare so the bearer check can't be turned into a
 * timing oracle that recovers the secret byte by byte. Length is allowed to
 * leak (standard for this primitive) since the secret is a fixed-length random
 * token; only the content compare is hidden.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * The single hard gate shared by every /api/test/* handler (login-as included):
 *   - 404 unless LOAD_TEST_SECRET is set server-side (invisible in prod).
 *   - 401 unless the bearer token matches it.
 * Call first in every handler so the gate lives in exactly one place.
 */
export function assertLoadTestAuth(request: Request): void {
  const secret = env.LOAD_TEST_SECRET;
  if (!secret) throw error(404, 'Not Found');
  const token =
    request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  if (!safeEqual(token, secret)) throw error(401, 'Unauthorized');
}

export type SeededTalent = { id: string; email: string };

/**
 * Idempotently seed talents `load-test-<start..start+count-1>@loadtest.invalid`,
 * each with every onboarding gate set EXCEPT rulesSignedAt/charterAcceptedAt/
 * welcomeSeenAt (left null so signRules can fire under load). Re-seeding resets
 * those three + drops any leftover OnboardingPdfJob, so a prior run's signed
 * state never blocks the next burst.
 *
 * `start` lets the HTTP client chunk a big pool across several requests so no
 * single request has to do thousands of round-trips (gateway-timeout risk).
 *
 * Counts returned: `created` = brand-new rows, `updated` = pre-existing rows
 * refreshed (every existing row IS rewritten, so none are "unchanged"), and
 * `resetSigned` = the subset of `updated` that had a prior signature wiped.
 */
export async function seedLoadTalents(
  count: number,
  start = 1,
): Promise<{
  created: number;
  updated: number;
  resetSigned: number;
  talents: SeededTalent[];
}> {
  const campus = await prisma.campus.findFirst({ select: { id: true } });
  if (!campus) throw error(500, 'No campus in DB — cannot seed');

  const now = new Date();
  const schoolYear = currentSchoolYearLabel();
  let created = 0;
  let reset = 0;
  const talents: SeededTalent[] = [];

  for (let i = start; i < start + count; i++) {
    const email = `load-test-${String(i).padStart(4, '0')}${DOMAIN}`;

    const user = await prisma.bauth_user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        emailVerified: true,
        role: 'student',
        name: `Load Test ${i}`,
      },
      select: { id: true },
    });

    const existing = await prisma.talent.findUnique({
      where: { userId: user.id },
      select: { id: true, rulesSignedAt: true },
    });

    // The dossier of the year in progress, spread into the talent as its cached
    // projection and written as the backing row below. Seeding the flat columns
    // alone would be a state the runtime can't reach: the signRules call this
    // pool exists to exercise upserts the dossier, and with no row to patch it
    // would create one holding that single field, wiping every gate off the
    // projection mid-burst.
    const dossier = {
      infoValidatedAt: now,
      highSchoolValidatedAt: now,
      parentsValidatedAt: now,
      techInterestsValidatedAt: now,
      generalInterestsValidatedAt: now,
      interestsRecapSeenAt: now,
      equipmentValidatedAt: now,
      processingCompletedAt: now,
      rulesSignedAt: null,
      rulesSignedCity: null,
      reglementVersion: null,
      parentRulesSignedAt: null,
      parentRulesSignerPrenom: null,
      parentRulesSignerNom: null,
      parentRulesRelationship: null,
      parentRulesSignedCity: null,
    };

    const fields = {
      ...dossier,
      onboardingSchoolYear: schoolYear,
      userId: user.id,
      nom: `LoadTest${i}`,
      prenom: 'Test',
      civilite: 'Mr' as const,
      phone: '0600000000',
      parentType: 'parent1',
      parentCivilite: 'Mme',
      parentNom: `LoadTestParent${i}`,
      parentPrenom: 'P',
      parentEmail: `load-test-parent-${i}@loadtest.invalid`,
      parentPhone: '0600000001',
      highSchoolNameManual: 'Lycée Load Test',
      charterAcceptedAt: null,
      welcomeSeenAt: null,
    };

    let talentId: string;
    if (existing) {
      const t = await prisma.talent.update({
        where: { id: existing.id },
        data: fields,
        select: { id: true },
      });
      talentId = t.id;
      if (existing.rulesSignedAt) reset++;
      await prisma.onboardingPdfJob.deleteMany({
        where: { talentId: existing.id },
      });
    } else {
      const t = await prisma.talent.create({
        data: fields,
        select: { id: true },
      });
      talentId = t.id;
      created++;
    }

    // Rewritten on every pass, like `fields`: a prior burst's signature must not
    // survive into the next one.
    await prisma.onboarding_Record.upsert({
      where: { talentId_schoolYear: { talentId, schoolYear } },
      create: { talentId, schoolYear, ...dossier },
      update: dossier,
    });

    talents.push({ id: talentId, email });
  }

  const updated = count - created;
  return { created, updated, resetSigned: reset, talents };
}

/**
 * Build the k6 manifest server-side and return it as a plain object. Same shape
 * the old scripts/load-test/manifest.ts wrote to load/data.json; the HTTP client
 * now just persists this response verbatim.
 */
export async function buildLoadManifest(sample = 50) {
  const [talents, staff, events, publications] = await Promise.all([
    prisma.talent.findMany({
      select: { id: true, user: { select: { email: true } } },
      take: sample * 4,
      orderBy: { lastActiveAt: 'desc' },
    }),
    prisma.staffProfile.findMany({
      select: {
        staffRole: true,
        campusId: true,
        user: { select: { email: true } },
      },
      take: sample * 4,
    }),
    prisma.event.findMany({
      select: {
        id: true,
        titre: true,
        date: true,
        campus: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    prisma.minigamePublication.findMany({
      select: { id: true, game: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    }),
  ]);

  const recentEventIds = events.slice(0, 5).map((e) => e.id);
  const activities = await prisma.activity.findMany({
    where: {
      activityType: 'orga',
      timeSlot: { planning: { eventId: { in: recentEventIds } } },
    },
    select: {
      id: true,
      nom: true,
      timeSlot: { select: { planning: { select: { eventId: true } } } },
    },
    take: sample,
  });

  const participations = await prisma.participation.findMany({
    where: { eventId: { in: recentEventIds } },
    select: {
      id: true,
      eventId: true,
      talent: { select: { user: { select: { email: true } } } },
    },
    take: sample * 4,
  });

  const loadTestRows = await prisma.talent.findMany({
    where: { user: { email: { endsWith: DOMAIN } } },
    select: { id: true, user: { select: { email: true } } },
    orderBy: { user: { email: 'asc' } },
  });

  const usableTalents = talents
    .filter((t) => t.user?.email && !t.user.email.endsWith(DOMAIN))
    .slice(0, sample);
  const usableStaff = staff.filter((s) => s.staffRole && s.user?.email);

  return {
    generatedAt: new Date().toISOString(),
    talents: usableTalents.map((t) => ({ id: t.id, email: t.user!.email })),
    staffAdmin: usableStaff
      .filter((s) => s.staffRole === 'admin')
      .map((s) => ({ email: s.user!.email!, campusId: s.campusId })),
    staffDev: usableStaff
      .filter((s) => can('devMember', s.staffRole))
      .map((s) => ({ email: s.user!.email!, campusId: s.campusId })),
    events: events.map((e) => ({
      id: e.id,
      title: e.titre,
      date: e.date.toISOString(),
      campusName: e.campus?.name ?? null,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      eventId: a.timeSlot.planning.eventId,
      title: a.nom,
    })),
    participations: participations
      .filter((p) => p.talent.user?.email)
      .map((p) => ({
        id: p.id,
        eventId: p.eventId,
        talentEmail: p.talent.user!.email!,
      })),
    publications: publications.map((p) => ({
      id: p.id,
      game: p.game,
      publishedAt: p.publishedAt.toISOString(),
    })),
    loadTestTalents: loadTestRows.map((r) => ({
      id: r.id,
      email: r.user!.email,
    })),
  };
}

/**
 * Delete every @loadtest.invalid record. Idempotent.
 *
 * Order matters: Talent -> bauth_user is `onDelete: SetNull` (NOT Cascade), so
 * deleting the user only nulls Talent.userId and leaves an orphan Talent row.
 * Delete Talents by their linked account's email FIRST -- that cascades to their
 * children (XpGrant, OnboardingPdfJob, participations, etc., all `onDelete:
 * Cascade`) -- then delete the users.
 */
export async function cleanupLoadTest(): Promise<{
  deletedTalents: number;
  deletedUsers: number;
}> {
  const talents = await prisma.talent.deleteMany({
    where: { user: { email: { endsWith: DOMAIN } } },
  });
  const users = await prisma.bauth_user.deleteMany({
    where: { email: { endsWith: DOMAIN } },
  });
  return { deletedTalents: talents.count, deletedUsers: users.count };
}
