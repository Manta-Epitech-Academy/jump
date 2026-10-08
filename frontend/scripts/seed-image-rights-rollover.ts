/**
 * Dev seed: roll a slice of talents into the current school year so the annual
 * droit à l'image (#261) has all four of its states on screen at once.
 *
 * The restored dump holds 832 decisions and 869 dossiers, every one of them
 * filed under 2025-2026. The clock is past the 31 July cutover, so on that data
 * the platform only ever shows two of the four states - a lapsed authorization
 * and a standing interdiction, both over a blank current year. The two that
 * actually exercise the ledger are missing entirely: nobody has decided for the
 * year in progress, so nothing shows a guardian CHANGING their mind, which is
 * the whole reason the decision is an append-only record rather than a column.
 *
 * What it creates, on Montpellier talents who already decided last year:
 *
 *   - `reversal_to_refused`  accepted last year, refuses this year
 *                            -> stance `forbidden`, and the year reads Refusé
 *   - `reversal_to_accepted` refused last year, accepts this year
 *                            -> stance `authorized`. The one that proves the
 *                               stance follows the LATEST record and not "any
 *                               refusal ever recorded"
 *   - `confirmed`            accepted last year, accepts again this year
 *
 * The two states that need no seeding are left exactly as they are, because the
 * dump already holds them and fabricating more would only blur the counts: a
 * lapsed authorization (accepted last year, silent this year -> `unknown`) and
 * a standing interdiction nobody revisited (refused last year, silent this year
 * -> `forbidden` while the year's dossier reads En attente). The summary counts
 * both so you can see they are there.
 *
 * It writes through `upsertOnboardingYearRecord`, never straight to the flat
 * columns: those are a projection of the most recent dossier, and a decision
 * written past them would show the right ledger and the wrong chip.
 *
 * Idempotent: it owns the `staff_correction` rows it stamps with its own note,
 * and the current-year dossiers of the talents it picks. LOCAL DEV ONLY.
 *
 *   bun scripts/seed-image-rights-rollover.ts
 *   bun scripts/seed-image-rights-rollover.ts --reset
 */
import { PrismaClient, type ImageRightsDecision } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { upsertOnboardingYearRecord } from '../src/lib/server/services/onboardingYearService';
import { currentSchoolYearLabel } from '../src/lib/domain/schoolYear';
import { CURRENT_DROIT_IMAGE_VERSION } from '../src/lib/content/droit-image';
import { CURRENT_REGLEMENT_VERSION } from '../src/lib/content/reglement';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CAMPUS_NAME = 'Montpellier';
/** Stamped on every row this script writes, so `--reset` can find them again. */
const SEED_NOTE = '[seed] bascule annuelle droit à l’image';
const PER_BUCKET = 6;

type Bucket = {
  key: string;
  from: ImageRightsDecision;
  to: ImageRightsDecision;
};

const BUCKETS: Bucket[] = [
  { key: 'reversal_to_refused', from: 'accepted', to: 'refused' },
  { key: 'reversal_to_accepted', from: 'refused', to: 'accepted' },
  { key: 'confirmed', from: 'accepted', to: 'accepted' },
];

async function reset(): Promise<void> {
  const owned = await prisma.imageRightsDecisionRecord.findMany({
    where: { note: SEED_NOTE },
    select: { id: true, talentId: true, schoolYear: true },
  });
  const talentIds = [...new Set(owned.map((r) => r.talentId))];
  const years = [...new Set(owned.map((r) => r.schoolYear))];

  await prisma.imageRightsDecisionRecord.deleteMany({
    where: { id: { in: owned.map((r) => r.id) } },
  });
  // The dossier rows go too: this script is the only thing that opened a
  // current-year dossier for these talents, and leaving one behind would keep
  // the projection pointing at a year with no decision in it.
  const dossiers = await prisma.onboarding_Record.deleteMany({
    where: { talentId: { in: talentIds }, schoolYear: { in: years } },
  });
  // Only the ones still queued: a job that actually rendered wrote a real file,
  // and dropping its row would orphan the object rather than tidy anything.
  const jobs = await prisma.onboardingPdfJob.deleteMany({
    where: {
      talentId: { in: talentIds },
      schoolYear: { in: years },
      status: { not: 'success' },
    },
  });

  // Re-point the projection at whatever dossier is now the most recent.
  for (const talentId of talentIds) {
    const latest = await prisma.onboarding_Record.findFirst({
      where: { talentId },
      orderBy: { schoolYear: 'desc' },
      select: { id: true, schoolYear: true },
    });
    if (!latest) continue;
    await prisma.$transaction((tx) =>
      upsertOnboardingYearRecord(tx, {
        talentId,
        schoolYear: latest.schoolYear,
        patch: {},
      }),
    );
  }
  console.log(
    `Réinitialisation : ${owned.length} décisions, ${dossiers.count} dossiers, ${jobs.count} jobs PDF, ${talentIds.length} talents reprojetés.`,
  );
}

async function main() {
  if (process.argv.includes('--reset')) {
    await reset();
    return;
  }

  const year = currentSchoolYearLabel();
  const campus = await prisma.campus.findFirstOrThrow({
    where: { name: CAMPUS_NAME },
    select: { id: true, name: true },
  });
  const staff = await prisma.staffProfile.findFirstOrThrow({
    where: { campusId: campus.id },
    select: { id: true },
  });

  console.log(`Année en cours : ${year} (campus ${campus.name})`);

  const used = new Set<string>();
  const summary: string[] = [];

  for (const bucket of BUCKETS) {
    // Talents whose LAST decision is `from`, and who have not yet decided for
    // the year in progress: those are the ones a real campaign would be chasing.
    // Scoped through participations, because a talent carries no campus of its
    // own - that link is the one `db/scoped.ts` uses too.
    const candidates = await prisma.talent.findMany({
      where: {
        participations: { some: { campusId: campus.id } },
        imageRightsRecords: {
          some: { decision: bucket.from },
          none: { schoolYear: year },
        },
      },
      select: {
        id: true,
        imageRightsRecords: {
          select: { decision: true },
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
      take: PER_BUCKET * 20,
    });
    // Filtered on the LEDGER's latest row, not on `Talent.imageRightsDecision`.
    // The two disagree on part of the dump - the projection describes the most
    // recent DOSSIER, and some dossiers carry a decision column that no record
    // backs - and picking by the projection produced buckets whose arcs were not
    // the ones they are named after (a "refused -> accepted" talent whose ledger
    // read accepted all along). The stance reads the ledger, so the ledger is
    // what has to say `from`.
    const chosen = candidates
      .filter(
        (t) =>
          !used.has(t.id) && t.imageRightsRecords[0]?.decision === bucket.from,
      )
      .slice(0, PER_BUCKET);
    for (const t of chosen) used.add(t.id);

    for (const [i, talent] of chosen.entries()) {
      // Spread over the weeks since the cutover so the archive and the relance
      // have something to window on.
      const decidedAt = new Date();
      decidedAt.setDate(decidedAt.getDate() - (3 + i * 5));

      await prisma.$transaction(async (tx) => {
        // The fact first: append-only, one row per decision, never an update of
        // the previous one. Reversing a choice is a new row, which is what lets
        // the fiche show that it moved.
        await tx.imageRightsDecisionRecord.create({
          data: {
            talentId: talent.id,
            decision: bucket.to,
            schoolYear: year,
            version: CURRENT_DROIT_IMAGE_VERSION,
            decidedAt,
            signerPrenom: 'Responsable',
            signerNom: 'Légal',
            relationship: 'parent',
            city: 'Montpellier',
            source: 'staff_correction',
            recordedByStaffId: staff.id,
            note: SEED_NOTE,
          },
        });

        // The WHOLE dossier, not just the image-rights block.
        //
        // A guardian is only ever asked this question for a school year because
        // the child reopened that year's dossier - `guardianActSchoolYear` files
        // the act against the dossier the talent actually has, never against the
        // year on the clock. So a current-year decision with no current-year
        // dossier behind it is a state the real flow cannot produce.
        //
        // Writing only the image block did produce it, and the damage was not
        // confined to the image chip: the flat columns on `Talent` are a
        // projection of the MOST RECENT dossier, so an otherwise-empty
        // 2026-2027 row shadowed a completed 2025-2026 ladder and every one of
        // these talents read "en cours d'onboarding" on their fiche. The
        // projection was right; the dossier was a fiction.
        //
        // A returning talent re-walks the wizard, so the gates are re-stamped
        // rather than copied, and the règlement is re-signed under the current
        // wording.
        const walked = new Date(decidedAt);
        walked.setDate(walked.getDate() - 2);
        await upsertOnboardingYearRecord(tx, {
          talentId: talent.id,
          schoolYear: year,
          patch: {
            infoValidatedAt: walked,
            highSchoolValidatedAt: walked,
            parentsValidatedAt: walked,
            techInterestsValidatedAt: walked,
            generalInterestsValidatedAt: walked,
            interestsRecapSeenAt: walked,
            equipmentValidatedAt: walked,
            processingCompletedAt: walked,
            rulesSignedAt: walked,
            rulesSignedCity: 'Montpellier',
            reglementVersion: CURRENT_REGLEMENT_VERSION,
            parentRulesSignedAt: decidedAt,
            parentRulesSignerPrenom: 'Responsable',
            parentRulesSignerNom: 'Légal',
            parentRulesRelationship: 'parent',
            parentRulesSignedCity: 'Montpellier',
            imageRightsDecision: bucket.to,
            imageRightsDecidedAt: decidedAt,
            imageRightsVersion: CURRENT_DROIT_IMAGE_VERSION,
            imageRightsSignerPrenom: 'Responsable',
            imageRightsSignerNom: 'Légal',
            imageRightsRelationship: 'parent',
            imageRightsSignedCity: 'Montpellier',
          },
        });

        // The two documents this dossier owes, queued and left `pending`.
        //
        // The renderer cannot run from a plain script - it reaches
        // `$env/dynamic/private` through the storage client, which only
        // resolves inside the SvelteKit build - so the honest state to leave
        // behind is a queued job, not a fabricated `filePath`. Pointing the new
        // dossier at last year's PDF would be worse than leaving it empty: the
        // per-year key exists precisely so a second year cannot reference a
        // document signed for the first.
        //
        // Run them from /staff/admin/onboarding-pdfs ("relancer"), which claims
        // any not-yet-succeeded row. Until then they are real backlog for the
        // ops queue.
        for (const documentType of ['rules', 'image-rights'] as const) {
          await tx.onboardingPdfJob.create({
            data: { talentId: talent.id, documentType, schoolYear: year },
          });
        }
      });
    }
    summary.push(
      `  ${bucket.key.padEnd(22)} ${bucket.from} -> ${bucket.to} : ${chosen.length}`,
    );
  }

  console.log('\nDécisions écrites pour l’année en cours :');
  for (const line of summary) console.log(line);

  // The two states that were already there, counted rather than created.
  const lapsed = await prisma.talent.count({
    where: {
      participations: { some: { campusId: campus.id } },
      imageRightsRecords: {
        some: { decision: 'accepted' },
        none: { schoolYear: year },
      },
    },
  });
  const standing = await prisma.talent.count({
    where: {
      participations: { some: { campusId: campus.id } },
      imageRightsRecords: { none: { schoolYear: year } },
      imageRightsDecision: 'refused',
    },
  });
  console.log('\nÉtats déjà présents dans le dump (non touchés) :');
  console.log(`  autorisation périmée (stance « unknown »)      : ${lapsed}`);
  console.log(`  interdiction debout (stance « forbidden »)     : ${standing}`);

  const byYear = await prisma.imageRightsDecisionRecord.groupBy({
    by: ['schoolYear', 'decision'],
    _count: { _all: true },
  });
  console.log('\nLedger complet :', JSON.stringify(byYear));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
