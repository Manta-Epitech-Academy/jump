/**
 * Builds load/data.json — a snapshot of preprod data that k6 scenarios
 * sample from at runtime. Run this once before a campaign of tests.
 *
 *   bun scripts/load-test/manifest.ts        (from frontend/)
 *
 * Output keys:
 *   - talents          — pool to log in as (excludes load-test seeded ones)
 *   - staff{Admin,Dev,Peda} — staff per role with a campusId for scoping
 *   - events           — recent events with phase + campus
 *   - activities       — sample of orga activities (for cockpit toggle target)
 *   - participations   — sample of (participationId, activityId, talentEmail) tuples
 *   - publications     — minigame publications usable for the play scenario
 *   - loadTestTalents  — talents seeded by seed-load-talents.ts (empty until seeded)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SAMPLE = Number(process.env.SAMPLE ?? 50);
// Repo-root load/data.json so k6 scenarios at load/k6/scenarios/* can open
// it via the manifest helper without knowing about frontend/.
const OUT_PATH = resolve(import.meta.dir, '../../../load/data.json');

async function main() {
  const [talents, staff, events, publications] = await Promise.all([
    prisma.talent.findMany({
      select: { id: true, email: true, userId: true },
      take: SAMPLE * 4,
      orderBy: { lastActiveAt: 'desc' },
    }),
    prisma.staffProfile.findMany({
      select: {
        staffRole: true,
        campusId: true,
        user: { select: { email: true } },
      },
      take: SAMPLE * 4,
    }),
    prisma.event.findMany({
      select: {
        id: true,
        titre: true,
        eventType: true,
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

  // Sample orga activities + their participations for cockpit-presence tests.
  // We pick activities from recent events so the test targets data that's
  // plausibly being looked at in the UI.
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
    take: SAMPLE,
  });

  const participations = await prisma.participation.findMany({
    where: { eventId: { in: recentEventIds } },
    select: {
      id: true,
      eventId: true,
      talent: { select: { user: { select: { email: true } } } },
    },
    take: SAMPLE * 4,
  });

  const loadTestRows = await prisma.talent.findMany({
    where: { email: { endsWith: '@loadtest.invalid' } },
    select: { id: true, email: true },
  });

  const usableTalents = talents
    .filter(
      (t) => t.email && t.userId && !t.email.endsWith('@loadtest.invalid'),
    )
    .slice(0, SAMPLE);
  const usableStaff = staff.filter((s) => s.staffRole && s.user?.email);

  const data = {
    generatedAt: new Date().toISOString(),
    talents: usableTalents.map((t) => ({ id: t.id, email: t.email! })),
    staffAdmin: usableStaff
      .filter((s) => s.staffRole === 'admin')
      .map((s) => ({ email: s.user!.email!, campusId: s.campusId })),
    staffDev: usableStaff
      .filter((s) => s.staffRole === 'dev' || s.staffRole === 'superdev')
      .map((s) => ({ email: s.user!.email!, campusId: s.campusId })),
    staffPeda: usableStaff
      .filter((s) => s.staffRole === 'peda' || s.staffRole === 'manta')
      .map((s) => ({ email: s.user!.email!, campusId: s.campusId })),
    events: events.map((e) => ({
      id: e.id,
      title: e.titre,
      type: e.eventType,
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
    loadTestTalents: loadTestRows.map((r) => ({ id: r.id, email: r.email! })),
  };

  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
  console.log(`✓ wrote ${OUT_PATH}`);
  console.log(`  talents:           ${data.talents.length}`);
  console.log(`  staffAdmin:        ${data.staffAdmin.length}`);
  console.log(`  staffDev:          ${data.staffDev.length}`);
  console.log(`  staffPeda:         ${data.staffPeda.length}`);
  console.log(`  events:            ${data.events.length}`);
  console.log(`  activities:        ${data.activities.length}`);
  console.log(`  participations:    ${data.participations.length}`);
  console.log(`  publications:      ${data.publications.length}`);
  console.log(`  loadTestTalents:   ${data.loadTestTalents.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
