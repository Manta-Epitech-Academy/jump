/**
 * Dev seed: give the multi-closing feature something to look at.
 *
 * The restored prod dump holds 1412 closings and not one talent with two of
 * them, under a single grid, with no answer sitting outside its grid. Which
 * means the three closing PRs that just landed are all untestable on it:
 *
 *   - #262 (a grid composed per event over a shared bank): one grid exists, so
 *     nothing shows the bank being composed twice, and no fiche shows the
 *     successive verdicts "Son parcours" was built for.
 *   - #266 (the comparisons): a distribution can only span two grids if two
 *     grids ask the same bank question. And a coverage rate is only interesting
 *     when some configured events are under 100% and some events are not
 *     configured at all.
 *   - #268 ("Questions retirées"): needs a record answering a question its own
 *     grid no longer asks.
 *
 * So this script composes a second grid, turns closings on for a handful of
 * past events, and conducts closings across them.
 *
 * Three things it does NOT do, on purpose:
 *   - it never touches an event that already runs closings, nor the records on
 *     it: the stage de seconde cohorts in the dump are real shape, and the
 *     script owns only what it switched on;
 *   - it composes the club grid through `writeClosingTemplate`, the same
 *     two-step authoring write the API exposes, rather than writing the
 *     composition rows itself ("a grid is composed over the API, never in a
 *     migration");
 *   - it answers the BANK question, never the composition row, which is what
 *     lets the dropped-question record below still resolve.
 *
 * Idempotent: it owns the events it enables and every closing on them, and
 * clears them before re-seeding. LOCAL DEV ONLY - it writes fabricated verdicts
 * and fabricated student words about real minors in a restored dump.
 *
 *   bun scripts/seed-closings-multi.ts
 */
import { PrismaClient, type ClosingRecommendation } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { writeClosingTemplate } from '../src/lib/server/adminApi/writes/closings';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Stamped into the `closings` module settings of every event this script enables,
 * so a re-run can tell its own events from an admin's. */
const SEED_MARKER = 'seed-closings-multi';

const CLUB_GRID_KEY = 'coding_club';
const STAGE_GRID_KEY = 'stage_seconde';

/**
 * Which campus events to switch on, and with which grids.
 *
 * `grids` is cycled over the chosen events rather than fixed, and that is the
 * point of the whole seed: a talent who came to four Montpellier events ends up
 * with closings under BOTH compositions, so his fiche shows the bank asked two
 * different ways and `stats_closing_question` has a question whose distribution
 * genuinely spans two grids.
 *
 * Montpellier takes every eligible past event, because the shape the model was
 * designed for is eight to ten closings a year for a regular, and four events
 * only ever produced pairs. `conductedShare` is how much of each cohort actually
 * got one, so a coverage rate reads like a real campaign instead of 0 or 100
 * everywhere.
 */
const PLAN: {
  campus: string;
  take: number;
  grids: string[];
  conductedShare: number;
}[] = [
  {
    campus: 'Montpellier',
    take: 8,
    grids: [CLUB_GRID_KEY, STAGE_GRID_KEY],
    conductedShare: 0.75,
  },
  {
    campus: 'Strasbourg',
    take: 4,
    grids: [CLUB_GRID_KEY, STAGE_GRID_KEY],
    conductedShare: 0.55,
  },
];

/**
 * The club composition, over the SAME bank the stage grid reads.
 *
 * Six of its seven questions are also asked at the stage, which is the point:
 * that is what lets `stats_closing_question` put a stage and a Coding Club side
 * by side on one question. `labelOverride` carries the wording that does not
 * travel ("Satisfaction globale du stage" cannot be read at a club), and the
 * figure keeps the bank's label either way.
 *
 * It deliberately does not ask `wants_more`, `specialties`, `orientation_talk`,
 * `passionate_teacher` or `other_jobs`: a club closing runs five minutes.
 */
const CLUB_SECTIONS = [
  {
    title: 'Découverte',
    questions: [
      {
        questionKey: 'discovery_channel',
        labelOverride: 'Comment as-tu connu le Coding Club ?',
        withNote: true,
      },
      {
        questionKey: 'motivation',
        labelOverride: "Qu'est-ce qui t'a donné envie de venir ?",
      },
    ],
  },
  {
    title: 'Orientation',
    questions: [
      { questionKey: 'tech_projection' },
      { questionKey: 'info_sources' },
    ],
  },
  {
    title: 'Retour sur la séance',
    synthesisPosition: 0,
    questions: [
      {
        questionKey: 'satisfaction',
        labelOverride: 'Satisfaction globale de la séance',
        withNote: true,
      },
      { questionKey: 'one_sentence' },
      { questionKey: 'next_year_events' },
    ],
  },
];

// ── Deterministic pseudo-randomness ──────────────────────────────────────────
// Seeded off the row's own ids so a re-run produces the same answers: a diff
// between two runs should mean the script changed, not that it rolled again.

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pickOne = <T>(arr: readonly T[], seed: string): T =>
  arr[hash(seed) % arr.length];
const chance = (seed: string, pct: number): boolean => hash(seed) % 100 < pct;

/** 1..n distinct picks, for a `multi` question. */
function pickSome<T>(arr: readonly T[], seed: string, max: number): T[] {
  const n = 1 + (hash(seed) % Math.min(max, arr.length));
  const out: T[] = [];
  for (let i = 0; out.length < n && i < arr.length * 3; i++) {
    const c = arr[hash(`${seed}:${i}`) % arr.length];
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

// ── Fabricated prose ─────────────────────────────────────────────────────────

/** The talent's own words, on the one question a grid flags `testimonial`. */
const TESTIMONIALS = [
  "J'ai compris que coder c'était plus créatif que ce que je pensais.",
  "Ça m'a rassuré, je me sens capable d'en faire mon métier.",
  "J'hésitais avec le droit, là je penche vraiment pour l'informatique.",
  'Le projet en binôme était la meilleure partie, on a vraiment construit un truc.',
  "Je ne savais pas qu'on pouvait faire de la cybersécurité après le bac.",
  "J'ai bien aimé mais je ne me projette pas encore sur cinq ans d'études.",
  'Franchement au début je venais pour accompagner un ami, et finalement ça me plaît.',
  "Ce que je retiens c'est qu'on apprend en se trompant, ça m'a décomplexé.",
];

/** The team's prose ABOUT the student. Never leaves the dev space. */
const VERDICT_NOTES: Record<ClosingRecommendation, string[]> = {
  tres_compatible: [
    'Profil très solide, autonome et curieux. À relancer en priorité pour la JPO.',
    "Sait déjà ce qu'il veut faire et pourquoi. Dossier à suivre de près.",
  ],
  bon_profil: [
    'Bonne dynamique, un peu jeune dans sa réflexion mais la motivation est là.',
    "Sérieux et régulier sur la séance. À revoir l'an prochain pour confirmer.",
  ],
  indecis: [
    'Hésite encore entre plusieurs voies, rien de tranché à ce stade.',
    "Vient surtout par curiosité, la projection sur des études n'est pas faite.",
  ],
  pas_interesse: [
    'Est venu accompagner un camarade, ne se projette pas dans la filière.',
    'Le format lui a plu mais le secteur ne correspond pas à son projet.',
  ],
};

/** The team's note under one question, where the grid offers one. */
const QUESTION_NOTES = [
  'Ne connaissait pas du tout Epitech avant, découverte par le lycée.',
  "A insisté sur l'aspect projet plutôt que sur les cours magistraux.",
  'Réponse hésitante, à recreuser au prochain point.',
  'Très clair là-dessus, sans hésitation.',
];

/**
 * How a verdict moves over a talent's successive closings. Not random: the
 * whole reason "Son parcours" lists them is that the movement is readable, so
 * the seed makes some profiles firm up, some cool off, and some stay put.
 */
const ARCS: ClosingRecommendation[][] = [
  ['indecis', 'bon_profil', 'tres_compatible'],
  ['bon_profil', 'bon_profil', 'tres_compatible'],
  ['tres_compatible', 'tres_compatible'],
  ['indecis', 'indecis', 'bon_profil'],
  ['bon_profil', 'indecis', 'pas_interesse'],
  ['pas_interesse', 'indecis'],
];

type Bank = {
  id: string;
  key: string;
  kind: string;
  max: number | null;
  options: { id: string; value: string }[];
};

async function composeClubGrid(): Promise<void> {
  const args = {
    templateKey: CLUB_GRID_KEY,
    label: 'Closing Coding Club',
    sections: CLUB_SECTIONS,
  };
  // Two-step, like any caller: the dry run returns the digest, the apply echoes
  // it back. Recomputed rather than stored, so this is the contract, not a
  // formality to work around.
  const dry = await writeClosingTemplate(args);
  if (dry.applied)
    throw new Error('write_closing_template a appliqué sans plan');
  await writeClosingTemplate({ ...args, planDigest: dry.planDigest });
}

/**
 * Undo everything this script owns, in the order the FK restrictions allow:
 * the closings first (a template with records cannot be deleted), then the
 * event configuration it changed, then the club grid itself.
 *
 * Two ways an event is recognised as ours: the marker in its module settings,
 * and - for the events enabled before the marker existed - the club grid, which
 * this script is the only thing that has ever created.
 */
async function reset(): Promise<void> {
  const club = await prisma.closing_Template.findUnique({
    where: { key: CLUB_GRID_KEY },
    select: { id: true },
  });

  const owned = await prisma.event.findMany({
    where: {
      OR: [
        {
          modules: {
            some: {
              moduleKey: 'closings',
              settings: { path: ['seededBy'], equals: SEED_MARKER },
            },
          },
        },
        ...(club ? [{ closingTemplateId: club.id }] : []),
      ],
    },
    select: {
      id: true,
      date: true,
      campus: { select: { name: true } },
      modules: {
        where: { moduleKey: 'closings' },
        select: { settings: true },
      },
    },
  });

  let removed = 0;
  for (const event of owned) {
    const gone = await prisma.closing_Record.deleteMany({
      where: { eventId: event.id },
    });
    removed += gone.count;

    const snapshot = (
      event.modules[0]?.settings as {
        restore?: {
          devActivatedAt: string | null;
          closingTemplateId: string | null;
          endDate: string | null;
        };
      } | null
    )?.restore;
    await prisma.event.update({
      where: { id: event.id },
      data: {
        closingTemplateId: snapshot?.closingTemplateId ?? null,
        ...(snapshot
          ? { endDate: snapshot.endDate ? new Date(snapshot.endDate) : null }
          : {}),
        // No snapshot means the event predates the marker, so the honest move is
        // to leave its visibility alone rather than invent a previous value.
        ...(snapshot
          ? {
              devActivatedAt: snapshot.devActivatedAt
                ? new Date(snapshot.devActivatedAt)
                : null,
            }
          : {}),
      },
    });
    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: event.id, moduleKey: 'closings' },
    });
    console.log(
      `  rendu ${event.campus.name} ${event.date.toISOString().slice(0, 10)}${snapshot ? '' : ' (sans instantané, visibilité laissée telle quelle)'}`,
    );
  }

  if (club) {
    const left = await prisma.closing_Record.count({
      where: { templateId: club.id },
    });
    if (left > 0) {
      console.log(
        `  grille ${CLUB_GRID_KEY} conservée : ${left} closings y pointent encore`,
      );
    } else {
      await prisma.closing_Template.delete({ where: { id: club.id } });
      console.log(`  grille ${CLUB_GRID_KEY} supprimée`);
    }
  }
  console.log(
    `Réinitialisation : ${owned.length} événements, ${removed} closings supprimés.`,
  );
}

async function main() {
  if (process.argv.includes('--reset')) {
    await reset();
    return;
  }

  console.log('Composition de la grille Coding Club…');
  await composeClubGrid();

  const grids = await prisma.closing_Template.findMany({
    where: { key: { in: [CLUB_GRID_KEY, STAGE_GRID_KEY] } },
    select: {
      id: true,
      key: true,
      questions: {
        select: {
          withNote: true,
          question: {
            select: {
              id: true,
              key: true,
              kind: true,
              max: true,
              options: { select: { id: true, value: true } },
            },
          },
        },
      },
    },
  });
  const gridByKey = new Map(grids.map((g) => [g.key, g]));

  // The one question the club grid does NOT ask, kept aside so a slice of club
  // records can answer it anyway: that is a closing conducted under an earlier
  // composition, and it is what renders under "Questions retirées".
  const dropped = await prisma.closing_Question.findFirstOrThrow({
    where: { key: 'wants_more' },
    select: {
      id: true,
      key: true,
      kind: true,
      max: true,
      options: { select: { id: true, value: true } },
    },
  });

  const summary: string[] = [];
  let createdTotal = 0;
  let clearedTotal = 0;
  const ownedEventIds: string[] = [];

  for (const step of PLAN) {
    const campus = await prisma.campus.findFirst({
      where: { name: step.campus },
      select: { id: true, name: true },
    });
    if (!campus) throw new Error(`Campus "${step.campus}" introuvable.`);

    const staff = await prisma.staffProfile.findMany({
      where: { campusId: campus.id },
      select: { id: true },
      take: 6,
    });
    if (staff.length === 0)
      throw new Error(`Aucun StaffProfile sur ${campus.name}.`);

    // Past events with a cohort that this script may take: either closings are
    // off (nothing to disturb) or they are on because a previous run of this
    // very script turned them on, which is what `seededBy` in the module's
    // settings records. Never an event configured by a human, and never one
    // carrying the dump's own closings: those are real shape and not ours to
    // move. Without the marker a second run would skip everything it had
    // already enabled and go enable eight more.
    const candidates = await prisma.event.findMany({
      where: {
        campusId: campus.id,
        date: { lt: new Date() },
        participations: { some: {} },
        // Only an event that can legitimately be made visible: the closings
        // surface is unreachable while the event is hidden, and activating one
        // with no public name is the exact state `activationBlockerKeys`
        // refuses - it would sit in the dev switcher under its raw Salesforce
        // title. A missing end date the script fills in (a past single-day club
        // ends the day it runs); a missing public name it will not invent, so
        // run `set-<campus>-event-public-names.ts` first.
        publicName: { not: null },
        OR: [
          { closingTemplateId: null },
          {
            modules: {
              some: {
                moduleKey: 'closings',
                settings: { path: ['seededBy'], equals: SEED_MARKER },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        date: true,
        endDate: true,
        devActivatedAt: true,
        closingTemplateId: true,
        _count: { select: { participations: true } },
      },
      orderBy: { date: 'asc' },
    });
    const chosen = candidates
      .filter((e) => e._count.participations >= 20)
      .slice(0, step.take);
    const skipped = candidates.length - chosen.length;
    if (chosen.length === 0) {
      console.log(
        `  ${campus.name}: aucun événement éligible (nom public manquant ?), ignoré.`,
      );
      continue;
    }

    if (skipped > 0) {
      console.log(
        `  ${campus.name}: ${skipped} événement(s) éligible(s) non retenus (take=${step.take}).`,
      );
    }

    for (const [idx, event] of chosen.entries()) {
      ownedEventIds.push(event.id);

      const gridKey = step.grids[idx % step.grids.length];
      const grid = gridByKey.get(gridKey);
      if (!grid) throw new Error(`Grille "${gridKey}" introuvable.`);

      // Configure it the way the wizard would: the section on, and a grid named.
      // `eventRunsClosings` is that pair, and nothing counts as a closing event
      // without both.
      // The marker carries what the event looked like before, because switching
      // closings on also means making the event visible in the dev space - the
      // surface is unreachable otherwise - and that is a state an admin may have
      // deliberately left off. `--reset` puts both back rather than guessing.
      const existing = await prisma.eventConfig_Module.findUnique({
        where: {
          eventId_moduleKey: { eventId: event.id, moduleKey: 'closings' },
        },
        select: { settings: true },
      });
      const settings =
        (existing?.settings as { seededBy?: string } | null)?.seededBy ===
        SEED_MARKER
          ? (existing!.settings as object) // keep the first run's snapshot
          : {
              seededBy: SEED_MARKER,
              restore: {
                devActivatedAt: event.devActivatedAt?.toISOString() ?? null,
                closingTemplateId: event.closingTemplateId,
                endDate: event.endDate?.toISOString() ?? null,
              },
            };
      await prisma.eventConfig_Module.upsert({
        where: {
          eventId_moduleKey: { eventId: event.id, moduleKey: 'closings' },
        },
        create: { eventId: event.id, moduleKey: 'closings', settings },
        update: { settings },
      });
      await prisma.event.update({
        where: { id: event.id },
        data: {
          closingTemplateId: grid.id,
          // A single-day club carries no end date, which the activation rule
          // requires. Set it to the day it ran, which is what an admin filling
          // the wizard would put there.
          endDate: event.endDate ?? event.date,
          devActivatedAt: event.devActivatedAt ?? new Date(),
        },
      });

      const cleared = await prisma.closing_Record.deleteMany({
        where: { eventId: event.id },
      });
      clearedTotal += cleared.count;

      // The last event of the plan stays configured and empty on purpose: an
      // event that runs closings and has conducted none is a coverage hole, and
      // #266 exists to report it rather than to hide it in the denominator.
      const share = idx === chosen.length - 1 ? null : step.conductedShare;
      if (share === null) {
        summary.push(
          `  ${campus.name} ${event.date.toISOString().slice(0, 10)} [${grid.key}] configuré, 0 mené (trou de couverture)`,
        );
        continue;
      }

      const participations = await prisma.participation.findMany({
        where: { eventId: event.id },
        select: { id: true, talentId: true },
        orderBy: { id: 'asc' },
      });
      const conducted = participations.filter((p) =>
        chance(`conduct:${p.id}`, Math.round(share * 100)),
      );

      const endOfEvent = event.endDate ?? event.date;
      let created = 0;

      for (const p of conducted) {
        // Where this talent is in his own arc: the count of closings he already
        // has decides the verdict, so a fiche reads as a progression rather than
        // as noise.
        const already = await prisma.closing_Record.count({
          where: { talentId: p.talentId },
        });
        const arc = pickOne(ARCS, `arc:${p.talentId}`);
        const recommendation = arc[Math.min(already, arc.length - 1)];

        // A few are left mid-conversation, which is a real state the roster and
        // the admin archive both have to render.
        const inProgress = chance(`wip:${p.id}`, 6);

        // Finalised a day or two after the event closes, at a plausible hour.
        const conductedAt = new Date(endOfEvent);
        conductedAt.setDate(conductedAt.getDate() + (hash(`d:${p.id}`) % 3));
        conductedAt.setHours(
          9 + (hash(`h:${p.id}`) % 8),
          (hash(`m:${p.id}`) % 12) * 5,
          0,
          0,
        );

        const record = await prisma.closing_Record.create({
          data: {
            talentId: p.talentId,
            staffId: pickOne(staff, `staff:${p.id}`).id,
            campusId: campus.id,
            eventId: event.id,
            templateId: grid.id,
            status: inProgress ? 'in_progress' : 'done',
            conductedAt,
            createdAt: conductedAt,
            recommendation: inProgress ? null : recommendation,
            verdictNote: inProgress
              ? null
              : pickOne(VERDICT_NOTES[recommendation], `vn:${p.id}`),
          },
          select: { id: true },
        });

        const asked: { bank: Bank; withNote: boolean }[] = grid.questions.map(
          (q) => ({ bank: q.question as Bank, withNote: q.withNote }),
        );
        // One club record in six also answers the question the grid dropped.
        if (chance(`drop:${p.id}`, 16) && grid.key === CLUB_GRID_KEY) {
          asked.push({ bank: dropped as Bank, withNote: false });
        }

        for (const { bank, withNote } of asked) {
          // An in-progress closing is answered part-way, which is what makes it
          // in progress.
          if (inProgress && chance(`skip:${p.id}:${bank.key}`, 55)) continue;

          // Seeded on the participation, never on the freshly-minted record id:
          // the record is a new cuid on every run, so seeding on it would make
          // a re-run answer a different subset and the diff would look like the
          // script changed when only the clock did.
          const seed = `${p.id}:${bank.key}`;
          const data: {
            recordId: string;
            questionId: string;
            ratingValue?: number;
            freeText?: string;
            note?: string;
          } = { recordId: record.id, questionId: bank.id };

          if (bank.kind === 'rating') {
            // Skewed high: a student who came back on a Saturday rarely rates it
            // a 1, and a flat distribution would make the averages meaningless.
            data.ratingValue = 3 + (hash(seed) % 3);
          } else if (bank.kind === 'text') {
            data.freeText = pickOne(TESTIMONIALS, seed);
          }
          if (withNote && chance(`note:${seed}`, 35)) {
            data.note = pickOne(QUESTION_NOTES, seed);
          }

          const answer = await prisma.closing_Answer.create({
            data,
            select: { id: true },
          });

          if (bank.kind === 'single' || bank.kind === 'multi') {
            const picks =
              bank.kind === 'single'
                ? [pickOne(bank.options, seed)]
                : pickSome(bank.options, seed, 3);
            await prisma.closing_AnswerOption.createMany({
              data: picks.map((o) => ({
                answerId: answer.id,
                optionId: o.id,
              })),
              skipDuplicates: true,
            });
          }
        }
        created++;
      }

      createdTotal += created;
      summary.push(
        `  ${campus.name} ${event.date.toISOString().slice(0, 10)} [${grid.key}] ${created}/${participations.length} menés`,
      );
    }
  }

  console.log(`\nGrilles: ${grids.map((g) => g.key).join(', ')}`);
  console.log(`Closings supprimés (re-run): ${clearedTotal}`);
  console.log(`Closings créés: ${createdTotal}`);
  for (const line of summary) console.log(line);

  const multi = (
    await prisma.closing_Record.groupBy({
      by: ['talentId'],
      _count: { _all: true },
    })
  ).filter((t) => t._count._all > 1);
  const spread = multi.reduce<Record<number, number>>((a, t) => {
    a[t._count._all] = (a[t._count._all] ?? 0) + 1;
    return a;
  }, {});
  console.log(
    `\nTalents multi-closing: ${multi.length} ${JSON.stringify(spread)}`,
  );

  const retired = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT COUNT(*)::bigint AS n FROM "Closing_Answer" a
    JOIN "Closing_Record" r ON r.id = a."recordId"
    LEFT JOIN "Closing_TemplateQuestion" tq
      ON tq."templateId" = r."templateId" AND tq."questionId" = a."questionId"
    WHERE tq.id IS NULL`);
  console.log(
    `Réponses hors grille ("Questions retirées") : ${Number(retired[0].n)}`,
  );
  console.log(`\nÉvénements pilotés par ce script : ${ownedEventIds.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
