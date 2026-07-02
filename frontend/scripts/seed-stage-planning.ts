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
 *   - rebuilds that Planning: deletes ALL its existing TimeSlots (each cascades
 *     to its one Activity) and recreates them from the schedule below.
 *
 * Idempotent and authoritative: the schedule here is the planning's source of
 * truth. Every run is a full rebuild, so re-running converges and fixing a
 * title is an edit-and-rerun. The flip side is destructive: a re-run also wipes
 * any slot a staff member added or edited in the planning UI for this event,
 * and drops days the schedule no longer lists. So provision before staff touch
 * the stage planning, or knowingly overwrite. The run prints how many existing
 * slots it replaced, so a destructive re-run is never silent.
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
// logistics), so the daily `Accueil & émargement` slots infer to `orga` and
// stay off the student calendar by design (logistics, not learning content).
// Ordered keyword rules give a sensible default; any slot can pin its own
// `type` to override (e.g. the remote-day banner, which must stay visible).
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
  // From the planning screenshots. Two-week stage. Semaine 1 « découverte »
  // (lun-jeu locaux, vendredi remote « à la carte »); semaine 2 « projet »
  // (kick-off → design sprint → maquettage → pitchs/finale → remise des prix,
  // vendredi remote « à la carte »). Daily grid: conférence le matin, déjeuner
  // 12h30-13h30, ateliers l'après-midi.
  {
    campus: 'Nancy',
    days: [
      // ── Semaine 1 : découverte ──
      // J1 - Lundi 15 juin
      {
        date: '2026-06-15',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Accueil' },
          { start: '11:00', end: '12:30', nom: 'Setting up' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '17:00', nom: 'Atelier' },
        ],
      },
      // J2 - Mardi 16 juin
      {
        date: '2026-06-16',
        slots: [
          { start: '10:00', end: '12:30', nom: 'Conférence' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '17:00', nom: 'OSINT CTF' },
        ],
      },
      // J3 - Mercredi 17 juin
      {
        date: '2026-06-17',
        slots: [
          { start: '10:00', end: '12:30', nom: 'Conférence' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '15:00', nom: 'Shell RPG' },
          { start: '15:00', end: '17:00', nom: 'Shell CTF' },
        ],
      },
      // J4 - Jeudi 18 juin
      {
        date: '2026-06-18',
        slots: [
          { start: '10:00', end: '12:30', nom: 'Pitch projet' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '15:00', nom: 'PyPong' },
          { start: '15:00', end: '17:00', nom: 'SnakeJS' },
        ],
      },
      // J5 - Vendredi 19 juin : remote « à la carte »
      {
        date: '2026-06-19',
        slots: [
          {
            start: '10:00',
            end: '17:00',
            nom: 'A la carte !',
            type: 'special',
          },
        ],
      },
      // ── Semaine 2 : projet ──
      // J6 - Lundi 22 juin
      {
        date: '2026-06-22',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence' },
          { start: '11:00', end: '12:30', nom: 'Kick-off' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '17:00', nom: 'Design sprint' },
        ],
      },
      // J7 - Mardi 23 juin
      {
        date: '2026-06-23',
        slots: [
          { start: '10:00', end: '12:30', nom: 'Conférence' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '17:00', nom: 'Maquettage' },
        ],
      },
      // J8 - Mercredi 24 juin
      // Correction PO : prépa aux pitchs 13h30-16h, puis demi-finale 16h-17h
      // (l'écran montrait 13h30-15h / 15h-17h, à ne pas reprendre).
      {
        date: '2026-06-24',
        slots: [
          { start: '10:00', end: '12:30', nom: 'Conférence' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '16:00', nom: 'Préparation du pitch' },
          { start: '16:00', end: '17:00', nom: 'Demi-finale' },
        ],
      },
      // J9 - Jeudi 25 juin
      {
        date: '2026-06-25',
        slots: [
          { start: '10:00', end: '12:30', nom: 'Conférence' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          { start: '13:30', end: '14:30', nom: 'Préparation du pitch' },
          { start: '14:30', end: '15:30', nom: 'Finale' },
          { start: '15:30', end: '16:30', nom: 'Demo' },
          { start: '16:30', end: '17:00', nom: 'Remise des prix' },
        ],
      },
      // J10 - Vendredi 26 juin : remote « à la carte »
      {
        date: '2026-06-26',
        slots: [
          {
            start: '10:00',
            end: '17:00',
            nom: 'A la carte !',
            type: 'special',
          },
        ],
      },
    ],
  },
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
      // ── Semaine 1 : découverte ──
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
      // ── Semaine 2 : projet / hackathon ──
      // Journée type : conférence 10h-11h, créneau campus (travail RPG +
      // entretiens d’orientation) 11h-12h30, déjeuner 12h30-13h30, atelier
      // l’après-midi 13h30-17h. Conférences nommées par l’intervenant (Google,
      // Lucca, La Trace, Capgemini). Vendredi 26 : journée remote (le CSV ne
      // liste qu’une conférence et un atelier à distance, pas de créneau campus
      // ni de pause).
      // J6 — Lundi 22 juin : Build with IA / Fast Design Sprint
      {
        date: '2026-06-22',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence Google' },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Travail RPG (concours sur 2 semaines) & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          { start: '13:30', end: '17:00', nom: 'Kick-off Hackathon' },
        ],
      },
      // J7 — Mardi 23 juin : Product Design & Prompt Engineering
      {
        date: '2026-06-23',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence Lucca' },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Travail RPG (concours sur 2 semaines) & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier : App mobile (Figma) & Landing Page (Prompt Engineer)',
          },
        ],
      },
      // J8 — Mercredi 24 juin : Entrepreneuriat & Pitch
      {
        date: '2026-06-24',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence La Trace' },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Travail RPG (concours sur 2 semaines) & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier : vidéo de promotion, prise de parole, concours de pitch & demi-finales',
          },
        ],
      },
      // J9 — Jeudi 25 juin : IA, Soft Skills & Tech Responsable
      // Le CSV fixe « 17h : Présentation finale » ; fin estimée à 18h (durée non
      // précisée). Milestone visible → pin `special`.
      {
        date: '2026-06-25',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence Capgemini' },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Travail RPG (concours sur 2 semaines) & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          { start: '13:30', end: '17:00', nom: 'Préparation du portfolio' },
          {
            start: '17:00',
            end: '18:00',
            nom: 'Présentation finale',
            type: 'special',
          },
        ],
      },
      // J10 — Vendredi 26 juin : Restitution & Clôture (remote)
      // Journée à distance : Live Twitch / contenus à distance. Pin `special`
      // pour rester visible et marquer le distanciel (comme les autres remote).
      {
        date: '2026-06-26',
        slots: [
          {
            start: '10:00',
            end: '12:30',
            nom: 'Live Twitch & contenus à distance',
            type: 'special',
          },
          { start: '12:30', end: '13:30', nom: 'Pause repas' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Live Coding, Gaming, Live Orientation & méthode Epitech (à distance)',
            type: 'special',
          },
        ],
      },
    ],
  },
  {
    campus: 'Montpellier',
    days: [
      // ── Semaine 1 : « Vis ma vie de… » (découverte) ──
      // J1 — Lundi 15 juin
      {
        date: '2026-06-15',
        slots: [
          { start: '10:00', end: '10:30', nom: 'Accueil / Petit déj' },
          {
            start: '10:30',
            end: '12:30',
            nom: 'Kickoff & Keynote “Information à l’ère des Fake News” (Julien Lamoussière, CLAAP)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Workshop (piloté par le campus)',
          },
        ],
      },
      // J2 — Mardi 16 juin : Vis ma vie d’Expert Cybersécurité
      {
        date: '2026-06-16',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Cybersécurité” (Devensys)',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Activité ludique & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Workshop “OSINT” : Geoguessr & CTF',
          },
        ],
      },
      // J3 — Mercredi 17 juin : Vis ma vie de Développeur
      {
        date: '2026-06-17',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Creator Economy” (Pierr Cika)',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Activité ludique & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Workshop “Coding Club” : PyPong & Snake.js',
          },
        ],
      },
      // J4 — Jeudi 18 juin : Vis ma vie d’Ingénieur DevOps
      {
        date: '2026-06-18',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Créer une startup pour réussir” (Mehdi Fessiane, alumni MSc, app Kit Chef)',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Activité ludique & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Workshop “Linux” : discover-linux',
          },
        ],
      },
      // J5 — Vendredi 19 juin : journée remote
      {
        date: '2026-06-19',
        slots: [
          // Remote banner: must stay visible to talents (inference would hide
          // an “accueil” title as `orga`), so pin it to `special`.
          {
            start: '10:00',
            end: '10:30',
            nom: 'Journée à distance : accueil sur Discord',
            type: 'special',
          },
          {
            start: '10:30',
            end: '12:30',
            nom: 'Ateliers au choix en autonomie (à distance)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Ateliers au choix en autonomie (à distance)',
          },
        ],
      },
      // ── Semaine 2 : projet (TOOLS → PRODUCT → SUCCESS) ──
      // J6 — Lundi 22 juin : TOOLS, Lancement
      {
        date: '2026-06-22',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Cybersécurité opérationnelle” (Cyril Gauthier, officier adjoint Police Judiciaire, référent cybersécurité)',
          },
          // Project milestone, not a workshop: pin to `special`.
          {
            start: '11:00',
            end: '11:15',
            nom: 'Kick-off : Teaser, HOME & constitution des équipes',
            type: 'special',
          },
          {
            start: '11:15',
            end: '12:30',
            nom: 'Construction des groupes & première idée de projet',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Design Sprint speed run (5 étapes)',
          },
        ],
      },
      // J7 — Mardi 23 juin : PRODUCT, Design & Construction
      {
        date: '2026-06-23',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “L’open source pour changer le monde”',
          },
          // Two parallel tracks per team: two overlapping slots, as scheduled.
          {
            start: '11:00',
            end: '17:00',
            nom: 'Track A : Landing Page (Prompt Engineer)',
          },
          {
            start: '11:00',
            end: '17:00',
            nom: 'Track B : Application Mobile (Figma)',
          },
        ],
      },
      // J8 — Mercredi 24 juin : SUCCESS, Finalisation & Pitchs
      {
        date: '2026-06-24',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Robotique et médical” (Julien Welmant, ICM)',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Pitch deck & peaufinage + entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '15:00',
            nom: 'Préparation du pitch & prise de parole en public',
          },
          // Faction milestone: pin to `special`.
          {
            start: '15:00',
            end: '16:30',
            nom: 'Demi-finales par faction',
            type: 'special',
          },
        ],
      },
      // J9 — Jeudi 25 juin : Ingénieur IA + Demo Day
      {
        date: '2026-06-25',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “IA Tools”',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Activité ludique & entretiens d’orientation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '16:30',
            nom: 'Préparation Demo Day : finalisation & dry run',
          },
          // Closing event: pin to `special`.
          {
            start: '17:00',
            end: '19:00',
            nom: 'DEMO DAY & Cocktail',
            type: 'special',
          },
        ],
      },
      // J10 — Vendredi 26 juin : journée remote
      {
        date: '2026-06-26',
        slots: [
          {
            start: '10:00',
            end: '10:30',
            nom: 'Journée à distance depuis chez vous',
            type: 'special',
          },
          {
            start: '10:30',
            end: '17:00',
            nom: '« Z Event like » : live Twitch',
            type: 'special',
          },
        ],
      },
    ],
  },
  {
    // From Programme.xlsx. Daily grid: conférence 10h-11h, créneau fun (avec
    // entretiens d’orientation) 11h-12h, déjeuner 12h-13h30, atelier 13h30-17h.
    // Remote “à la carte” Fridays carry only morning/afternoon ateliers.
    campus: 'Strasbourg',
    days: [
      // J1 — Lundi 15 juin : 100% local
      {
        date: '2026-06-15',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Cyber” (Corps des armées)',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Kahoot & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier : Découverte OSINT & Capture the Flag',
          },
        ],
      },
      // J2 — Mardi 16 juin : Cybersécurité
      {
        date: '2026-06-16',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Cloud” (Ethan Husser)',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Olympiade loufoque & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          { start: '13:30', end: '17:00', nom: 'Atelier : Cloud' },
        ],
      },
      // J3 — Mercredi 17 juin : Dev & Code
      {
        date: '2026-06-17',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Coder, c’est créer” (Marc Bouvier)',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Jeux vidéo & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier Coding Club : Snake.js ou PyPong',
          },
        ],
      },
      // J4 — Jeudi 18 juin : DevOps
      {
        date: '2026-06-18',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “L’Open Source pour changer le monde” (Marion Labbé)',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Jeux de société & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          { start: '13:30', end: '17:00', nom: 'Atelier : Discover Linux' },
        ],
      },
      // J5 — Vendredi 19 juin : remote à la carte
      {
        date: '2026-06-19',
        slots: [
          {
            start: '10:00',
            end: '12:00',
            nom: 'Ateliers à la carte : Fake News, Prog avec IA, Test de personnalité, etc. (à distance)',
          },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Ateliers à la carte : Fake News, Prog avec IA, Test de personnalité, etc. (à distance)',
          },
        ],
      },
      // J6 — Lundi 22 juin : Tools (Hackathon)
      {
        date: '2026-06-22',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Build with IA” & Kick-off Hackathon',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Kahoot & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier : Fast Design Sprint, idéation',
          },
        ],
      },
      // J7 — Mardi 23 juin : Product
      {
        date: '2026-06-23',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Construire un produit grâce à la tech”',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Gartic Phone & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier : Figma (App Mobile) & Prompt Engineer (Landing Page)',
          },
        ],
      },
      // J8 — Mercredi 24 juin : Success
      {
        date: '2026-06-24',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Créer une startup pour réussir” (Louis Lecce)',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Course d’orientation dans le bâtiment & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier : vidéo de promotion, prise de parole & concours de pitch',
          },
        ],
      },
      // J9 — Jeudi 25 juin : AI
      {
        date: '2026-06-25',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Faut que ça claque”',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Blind test & entretiens d’orientation',
          },
          { start: '12:00', end: '13:30', nom: 'Déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Atelier : préparation Portfolio & Demo Day',
          },
        ],
      },
      // J10 — Vendredi 26 juin : remote à la carte
      {
        date: '2026-06-26',
        slots: [
          {
            start: '10:00',
            end: '12:00',
            nom: 'Live Twitch : actualité, gaming, orientation (à distance)',
            type: 'special',
          },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Live Twitch : actualité, gaming, orientation (à distance)',
            type: 'special',
          },
        ],
      },
    ],
  },
  {
    // From Organisation_stages_de_2nd.xlsx (Lyon). Two weeks: découverte
    // (15-19/06) puis projet (22-26/06). Group-rotating slots (Jeux vidéo /
    // Entretiens / Chasse à l'œuf / Jeux de société) are folded into one title,
    // matching how the other campuses model parallel tracks.
    campus: 'Lyon',
    days: [
      // J1 - Lundi 15 juin : Ice Breaker
      {
        date: '2026-06-15',
        slots: [
          {
            start: '09:00',
            end: '09:30',
            nom: 'Accueil & brief de la journée',
          },
          {
            start: '10:00',
            end: '11:00',
            nom: 'Accueil : welcome, petit déj & mot de bienvenue',
          },
          {
            start: '11:00',
            end: '12:00',
            nom: 'Décathlon Digital (amphi) : mes métiers de la tech',
          },
          { start: '12:00', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '14:00',
            nom: 'Brief des jeux & pitch de l’après-midi',
          },
          {
            start: '14:00',
            end: '15:00',
            nom: 'Pitch d’idées & jeux d’adresse / de force',
          },
          { start: '15:00', end: '15:30', nom: 'Pause & changement de salles' },
          {
            start: '15:30',
            end: '16:30',
            nom: 'Jeux d’adresse, jeux de force & pitch d’idées',
          },
          { start: '16:30', end: '17:00', nom: 'Debrief (amphi)' },
        ],
      },
      // J2 - Mardi 16 juin : Cyber
      {
        date: '2026-06-16',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence Moontech (amphi)' },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Entretiens d’orientation, décrypt binaire & activités ludiques (jeux de société, chasse à l’œuf, jeux vidéo)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '14:00',
            nom: 'GeoGuessr : Let’s explore the world!',
          },
          {
            start: '14:00',
            end: '17:00',
            nom: 'CTF : lab.epitech.academy',
          },
        ],
      },
      // J3 - Mercredi 17 juin : Programmation
      {
        date: '2026-06-17',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence Randstad Digital : coder c’est créer (amphi)',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Activités ludiques & entretiens d’orientation (jeux vidéo, décrypt binaire, jeux de société, chasse à l’œuf)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Workshop “Coding Club” : PyPong & Snake.js',
          },
        ],
      },
      // J4 - Jeudi 18 juin : Linux
      {
        date: '2026-06-18',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Open Source” (Mathieu Lempereur, amphi)',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Activités ludiques & entretiens d’orientation (chasse à l’œuf, jeux vidéo, décrypt binaire, jeux de société)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Workshop “Linux” : discover-linux',
          },
        ],
      },
      // J5 - Vendredi 19 juin : remote (Deep Fakes & Vibe Coding)
      {
        date: '2026-06-19',
        slots: [
          {
            start: '10:00',
            end: '10:30',
            nom: 'Présentation de la journée en distanciel',
            type: 'special',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Fake Ads & Fake News (à distance)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '14:00',
            nom: 'Lancement de l’après-midi à distance',
            type: 'special',
          },
          {
            start: '14:00',
            end: '16:00',
            nom: 'Programming with IA (à distance)',
          },
        ],
      },
      // J6 - Lundi 22 juin : Design Sprint
      {
        date: '2026-06-22',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence Google (amphi)' },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Kick-off, construction des groupes & idéation',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '17:00',
            nom: 'Design Sprint speed run (5 étapes)',
          },
        ],
      },
      // J7 - Mardi 23 juin : Design Product
      {
        date: '2026-06-23',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence “Product Owner”',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Landing page ou maquette App Mobile (Figma)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '14:00',
            end: '16:30',
            nom: 'Landing page ou maquette App Mobile (Figma)',
          },
          { start: '16:30', end: '17:00', nom: 'Debrief' },
        ],
      },
      // J8 - Mercredi 24 juin : Préparation au pitch & demi-finales
      {
        date: '2026-06-24',
        slots: [
          {
            start: '10:00',
            end: '11:00',
            nom: 'Conférence Jimmy (Go2Innov, amphi)',
          },
          { start: '11:00', end: '12:30', nom: 'Pitch Deck' },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '15:00',
            nom: 'Préparation du pitch & prise de parole en public',
          },
          {
            start: '15:00',
            end: '16:30',
            nom: 'Pitch : demi-finale',
            type: 'special',
          },
        ],
      },
      // J9 - Jeudi 25 juin : Pitch Day & Demo Day
      {
        date: '2026-06-25',
        slots: [
          { start: '10:00', end: '11:00', nom: 'Conférence Schifters (amphi)' },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Activités ludiques & entretiens d’orientation (jeux de société, chasse à l’œuf, jeux vidéo)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '14:00',
            end: '17:00',
            nom: 'Demo Day (amphi) & goûter',
            type: 'special',
          },
        ],
      },
      // J10 - Vendredi 26 juin : remote (Deep Fakes & Vibe Coding)
      {
        date: '2026-06-26',
        slots: [
          {
            start: '10:00',
            end: '10:30',
            nom: 'Présentation de la journée en distanciel',
            type: 'special',
          },
          {
            start: '11:00',
            end: '12:30',
            nom: 'Fake Ads & Fake News (à distance)',
          },
          { start: '12:30', end: '13:30', nom: 'Pause déjeuner' },
          {
            start: '13:30',
            end: '14:00',
            nom: 'Lancement de l’après-midi à distance',
            type: 'special',
          },
          {
            start: '14:00',
            end: '16:00',
            nom: 'Programming with IA (à distance)',
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
  const slotData = plan.days.flatMap((day) =>
    day.slots.map((s) => {
      const startTime = fromWallClock(day.date, s.start, tz);
      const endTime = fromWallClock(day.date, s.end, tz);
      if (endTime <= startTime) {
        throw new Error(
          `Slot ends at or before it starts: ${plan.campus} ${day.date} ${s.start}-${s.end} (${s.nom})`,
        );
      }
      return {
        planningId: planning.id,
        startTime,
        endTime,
        activity: {
          create: {
            nom: s.nom,
            activityType: s.type ?? inferActivityType(s.nom),
          },
        },
      };
    }),
  );

  // Count what the rebuild is about to destroy, so a re-run over an existing
  // (possibly staff-edited) planning is never silent. See the header note.
  const replaced = await prisma.timeSlot.count({
    where: { planningId: planning.id },
  });

  // Full rebuild (cascades to activities) so the script is idempotent. Use an
  // interactive transaction with a generous timeout: against a remote DB the
  // per-slot round-trips blow past the default 5s interactive limit (the batch
  // array form gives no way to raise it).
  await prisma.$transaction(
    async (tx) => {
      await tx.timeSlot.deleteMany({ where: { planningId: planning.id } });
      await Promise.all(slotData.map((data) => tx.timeSlot.create({ data })));
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  console.log(
    `✓ ${plan.campus.padEnd(14)} ${slotData.length} slots across ${plan.days.length} days (tz ${tz}) → "${event.titre}"` +
      (replaced > 0 ? `  [replaced ${replaced} existing]` : ''),
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
