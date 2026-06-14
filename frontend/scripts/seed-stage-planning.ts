/**
 * Provision the "stage de seconde" planning for one or more campuses from a
 * bare schedule: per day, a list of slots carrying only a start/end wall-clock
 * time and a title. That is all a campus hands us — no description, no body
 * content, no difficulty. The app is built to degrade cleanly to this (a
 * title-only activity shows as an info card on the talent calendar and is not
 * openable; see src/lib/domain/activity.ts), so we deliberately seed nothing
 * we do not actually have.
 *
 * What it does, per campus:
 *   - finds the campus by name and its single `stage_seconde` Event,
 *   - get-or-creates the Event's Planning,
 *   - wipes that Planning's existing TimeSlots (cascades to their Activities)
 *     and rebuilds them from the schedule below.
 *
 * Idempotent: the schedule data here is the source of truth — every run is a
 * full rebuild, so re-running converges and editing a title + re-running fixes
 * it. (Re-running a partial schedule therefore drops days not in it.)
 *
 * Timezone: slot instants are built from the campus's OWN IANA timezone
 * (`Campus.timezone`), so 10:00 means 10:00 there — correct for La Réunion
 * (UTC+4) as well as metropolitan campuses (UTC+2 in June). The wall-clock to
 * instant conversion is inlined from src/lib/domain/planningTime.ts because
 * this script must run against the production image, where `$lib` does not
 * resolve (no Vite) — same reason scripts/backfill-xp-ledger.ts inlines its
 * domain constants. `@internationalized/date` is a plain npm dep, so importing
 * it directly is fine. Keep the conversion in sync with planningTime.ts.
 *
 * Safety: refuses a non-local DATABASE_URL unless `--force` is passed, so a
 * stray run can't rewrite a prod planning by accident.
 *
 * Run:
 *   bun scripts/seed-stage-planning.ts                 # all campuses defined below (local only)
 *   bun scripts/seed-stage-planning.ts Lille           # just one campus
 *   bun scripts/seed-stage-planning.ts Lille --force   # target a non-local DB (prod)
 */
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient, type ActivityType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { CalendarDateTime, parseDate } from '@internationalized/date';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EVENT_TYPE = 'stage_seconde';

// ─── Wall-clock → UTC instant ────────────────────────────────────────────────
// Inlined from src/lib/domain/planningTime.ts (`fromWallClock`). Resolves a
// campus-local `YYYY-MM-DD` + `HH:MM` to the absolute instant stored in the DB,
// DST-aware, via the campus's IANA timezone. Keep in sync with the upstream.
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const WALL_CLOCK_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function fromWallClock(dateKey: string, time: string, tz: string): Date {
  if (!DATE_KEY_REGEX.test(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey} (expected YYYY-MM-DD)`);
  }
  if (!WALL_CLOCK_REGEX.test(time)) {
    throw new Error(`Invalid wall clock: ${time} (expected HH:MM)`);
  }
  const date = parseDate(dateKey);
  const [h, m] = time.split(':').map(Number);
  return new CalendarDateTime(date.year, date.month, date.day, h, m).toDate(tz);
}

// ─── Title → activity type inference ─────────────────────────────────────────
// We only get a title, but the type drives the calendar's colour/label and,
// crucially, visibility: the talent calendar hides `orga` slots (staff
// logistics). Ordered keyword rules give a sensible default; any slot can pin
// its own `type` to override (e.g. an info banner that must stay visible).
function inferActivityType(nom: string): ActivityType {
  const s = nom.toLowerCase();
  if (/pause|repas|déjeuner|dejeuner|méridienne|meridienne/.test(s))
    return 'break';
  if (/accueil|émargement|emargement/.test(s)) return 'orga';
  if (/keynote|conférence|conference/.test(s)) return 'conference';
  if (/quiz/.test(s)) return 'quiz';
  return 'atelier';
}

// ─── Schedule shape ──────────────────────────────────────────────────────────
type SlotInput = {
  start: string; // "HH:MM" campus wall-clock
  end: string; // "HH:MM"
  nom: string;
  /** Override the inferred type (see inferActivityType). */
  type?: ActivityType;
};
type DayInput = { date: string; slots: SlotInput[] };
type CampusPlanning = { campus: string; days: DayInput[] };

// ─── Campus schedules ────────────────────────────────────────────────────────
// Source of truth. Add a campus by appending a CampusPlanning entry.
const SCHEDULES: CampusPlanning[] = [
  {
    campus: 'Lille',
    days: [
      {
        date: '2026-06-15',
        slots: [
          { start: '09:45', end: '10:00', nom: 'Accueil & émargement' },
          {
            start: '10:00',
            end: '11:15',
            nom: 'Keynote ouverture stage & Icebreaker',
          },
          { start: '11:15', end: '12:30', nom: 'Installation PC' },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier surprise “Web Portfolio”',
          },
        ],
      },
      {
        date: '2026-06-16',
        slots: [
          { start: '09:45', end: '10:00', nom: 'Accueil & émargement' },
          {
            start: '10:00',
            end: '12:30',
            nom: 'Conférence “Expert Cybersécurité” & suite Atelier “Web Portfolio”',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier “Vis ma vie d’Expert Cybersécurité”',
          },
        ],
      },
      {
        date: '2026-06-17',
        slots: [
          { start: '09:45', end: '10:00', nom: 'Accueil & émargement' },
          {
            start: '10:00',
            end: '12:30',
            nom: 'Conférence “Transformation de l’IA” & Atelier “Poké Poireau”',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier “Vis ma vie de développeur”',
          },
        ],
      },
      {
        date: '2026-06-18',
        slots: [
          { start: '09:45', end: '10:00', nom: 'Accueil & émargement' },
          {
            start: '10:00',
            end: '12:30',
            nom: 'Conférence “Apprendre à apprendre” & Atelier “Canard”',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          { start: '13:30', end: '17:00', nom: 'Atelier “Arduino”' },
        ],
      },
      {
        date: '2026-06-19',
        slots: [
          // Remote day: this 9h45 slot is an info banner, not the campus
          // check-in, so it must stay visible to talents — pin it to `special`
          // (inference would default it to `atelier`).
          {
            start: '09:45',
            end: '10:00',
            nom: 'Journée à distance depuis chez vous',
            type: 'special',
          },
          {
            start: '10:00',
            end: '12:30',
            nom: 'Ateliers “Découverte et exploration IA” à distance',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Suite atelier “Web Portfolio” à distance',
          },
        ],
      },
    ],
  },
  {
    campus: 'Nantes',
    days: [
      {
        date: '2026-06-15',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Keynote d’ouverture du stage' },
          { start: '11:00', end: '12:30', nom: 'Activité Ludique' },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier Surprise “Gens de confiance”',
          },
        ],
      },
      {
        date: '2026-06-16',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Expert Cybersécurité”',
          },
          { start: '11:00', end: '12:30', nom: 'Activité Ludique' },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier “Vis ma vie d’Expert Cybersécurité”',
          },
        ],
      },
      {
        date: '2026-06-17',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence “Développeur”' },
          { start: '11:00', end: '12:30', nom: 'Activité Ludique' },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier “Vis ma vie de Développeur”',
          },
        ],
      },
      {
        date: '2026-06-18',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Ingénieur DevOps & Opensource”',
          },
          { start: '11:00', end: '12:30', nom: 'Activité Ludique' },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier “Vis ma vie d’Ingénieur DevOps”',
          },
        ],
      },
      {
        date: '2026-06-19',
        slots: [
          {
            start: '10:00',
            end: '12:30',
            nom: 'Ateliers “Découverte et exploration” à distance',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Ateliers “Découverte et exploration” à distance',
          },
        ],
      },
    ],
  },
];

// ─── Seeding ─────────────────────────────────────────────────────────────────
async function seedCampus(plan: CampusPlanning): Promise<void> {
  const campus = await prisma.campus.findFirst({
    where: { name: plan.campus },
  });
  if (!campus) throw new Error(`Campus "${plan.campus}" not found.`);

  const event = await prisma.event.findFirst({
    where: { campusId: campus.id, eventType: EVENT_TYPE },
    orderBy: { date: 'asc' },
    include: { planning: true },
  });
  if (!event) {
    throw new Error(
      `No ${EVENT_TYPE} event for ${plan.campus}. Create the stage event first.`,
    );
  }

  const planning =
    event.planning ??
    (await prisma.planning.create({ data: { eventId: event.id } }));

  const tz = campus.timezone;
  const creates = plan.days.flatMap((day) =>
    day.slots.map((s) => {
      const startTime = fromWallClock(day.date, s.start, tz);
      const endTime = fromWallClock(day.date, s.end, tz);
      if (endTime <= startTime) {
        throw new Error(
          `Slot ends at or before it starts: ${plan.campus} ${day.date} ${s.start}-${s.end} (${s.nom})`,
        );
      }
      return prisma.timeSlot.create({
        data: {
          planningId: planning.id,
          startTime,
          endTime,
          activity: {
            create: {
              nom: s.nom,
              activityType: s.type ?? inferActivityType(s.nom),
              isDynamic: false,
            },
          },
        },
      });
    }),
  );

  await prisma.$transaction([
    // Full rebuild (cascades to activities) so the script is idempotent.
    prisma.timeSlot.deleteMany({ where: { planningId: planning.id } }),
    ...creates,
  ]);

  console.log(
    `✓ ${plan.campus.padEnd(14)} ${creates.length} slots across ${plan.days.length} days (tz ${tz}) → "${event.titre}"`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const wanted = argv.filter((a) => !a.startsWith('--'));

  const url = process.env.DATABASE_URL ?? '';
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal && !force) {
    throw new Error(
      `Refusing to seed: DATABASE_URL is not local.\n` +
        `Re-run with --force to target this database (e.g. prod).`,
    );
  }

  const selected = wanted.length
    ? SCHEDULES.filter((s) => wanted.includes(s.campus))
    : SCHEDULES;

  if (wanted.length) {
    const known = new Set(SCHEDULES.map((s) => s.campus));
    const unknown = wanted.filter((n) => !known.has(n));
    if (unknown.length) {
      throw new Error(
        `No schedule defined for: ${unknown.join(', ')}. ` +
          `Defined: ${[...known].join(', ')}.`,
      );
    }
  }

  console.log(
    `Seeding ${selected.length} campus planning(s)${force ? ' [--force]' : ''}\n`,
  );
  for (const plan of selected) {
    await seedCampus(plan);
  }
  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
