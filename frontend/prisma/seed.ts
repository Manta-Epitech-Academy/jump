/**
 * Database seed.
 *
 * STANDALONE RULE: this file must depend only on `node:*`, npm packages,
 * `@prisma/client`, and `prisma/`-local siblings (e.g. `./catalogs`), never on
 * `$lib`/`src`. `prisma db seed` runs in deploy and migration environments where
 * the SvelteKit `src/` tree isn't packaged (and the `$lib` alias doesn't resolve
 * outside Vite), but the whole `prisma/` dir ships, so relative sibling imports
 * are safe. Any domain logic needed here is re-stated locally and tagged
 * "mirrors src/lib/domain/…" so it stays in sync by inspection (see
 * `WELCOME_XP_BONUS`, `toStoredPhone` below).
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import {
  PrismaClient,
  Prisma,
  type ActivityType,
  type ImageRightsDecision,
  type PresenceStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import {
  seedInterests,
  seedEmailTemplates,
  seedBroadcastTemplates,
} from './catalogs';

// Mirrors normalizePhoneToE164 in src/lib/domain/phone.ts (see STANDALONE RULE).
// Phones are written below in a readable spaced form ("+33 6 12 34 56 01"), but
// runtime never stores that shape: onboarding submits canonical E.164 and the SF
// sync normalizes on ingest. Collapse the seed values to the same canonical form
// so the seeded data matches what prod persists (and the reconciliation demo
// compares like with like). Falls back to the raw string if a literal ever fails
// to parse, so a typo surfaces rather than silently becoming null.
const toStoredPhone = (raw: string): string => {
  const parsed =
    parsePhoneNumberFromString(raw) ?? parsePhoneNumberFromString(raw, 'FR');
  return parsed?.isValid() ? parsed.number : raw;
};

const EVENT_TYPES = {
  CODING_CLUB: 'coding_club',
  STAGE_SECONDE: 'stage_seconde',
} as const;
type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// Dev-workspace modules a seeded event exposes (EventConfig_Module rows). Kept
// in sync with src/lib/domain/eventModules.ts by hand (the seed stays free of
// $lib imports). Stage events get the full set so every validated surface is
// testable locally; coding-club events get the registration + attendance
// surfaces so their émargement history is reachable. `planning` is not a module
// (it is data-driven from the event's time slots), so it is not listed here.
const STAGE_MODULE_KEYS = ['inscrits', 'emargement', 'bilan', 'entretiens'];
const CODING_CLUB_MODULE_KEYS = ['inscrits', 'emargement'];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Onboarding arrival bonus — mirrors WELCOME_XP_BONUS in src/lib/domain/xp.ts.
const WELCOME_XP_BONUS = 200;

// ─── Time helpers (anchored to run-time `today`) ───

const now = new Date();
const startOfToday = new Date(now);
startOfToday.setHours(0, 0, 0, 0);

function dayAt(offsetDays: number, hour: number, minute = 0): Date {
  const d = new Date(startOfToday);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Real stage de seconde campaigns are named after their kickoff date so
// admissions can spot the cohort at a glance — e.g. `STAGE - Marseille -
// 2026/06/15 - stage seconde`. Build the title from the seed's relative
// offset so the format stays stable whenever the seed is replayed.
function formatStageSecondeTitle(
  campus: 'Paris' | 'Lyon',
  daysOffset: number,
): string {
  const start = dayAt(daysOffset, 0, 0);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `STAGE - ${campus} - ${y}/${m}/${d} - stage seconde`;
}

// Mirrors `schoolYearOf` in src/lib/domain/schoolYear.ts: the Epitech school
// year opens on 31 July, so 30 Jul 2026 still belongs to 2025-2026 while
// 31 Jul 2026 opens 2026-2027. Resolved in the campus timezone, like the app.
function currentSchoolYearLabel(): string {
  // `en-CA` renders as YYYY-MM-DD, the same key shape `toDateKey` produces.
  const key = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const afterCutoff = month > 7 || (month === 7 && day >= 31);
  const startYear = afterCutoff ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

// Fake 18-char Salesforce Lead id (`00Q…`). Real prefix for Lead is `00Q`;
// the trailing 3 chars are normally a checksum we don't bother computing.
function mockSalesforceLeadId(seed: number): string {
  const tail = (seed + 1_000_000).toString(36).toUpperCase().padStart(13, '0');
  return `00Q5j${tail}`;
}

// ─── Activity template blueprints ───

type ActivityDef = {
  nom: string;
  activityType: ActivityType;
  defaultDuration: number;
  campus?: 'Paris' | 'Lyon' | 'Marseille';
};

const activityDefs: ActivityDef[] = [
  {
    nom: 'Ma première page HTML',
    activityType: 'atelier',
    defaultDuration: 120,
  },
  {
    nom: 'CSS : Styliser sa page',
    activityType: 'atelier',
    defaultDuration: 120,
  },
  {
    nom: 'JavaScript : Premiers pas',
    activityType: 'atelier',
    defaultDuration: 150,
  },
  {
    nom: 'Construis ton robot',
    activityType: 'atelier',
    defaultDuration: 180,
  },
  {
    nom: 'Capteurs et actionneurs',
    activityType: 'atelier',
    defaultDuration: 150,
  },
  {
    nom: 'Crée ton jeu Scratch',
    activityType: 'atelier',
    defaultDuration: 120,
  },
  {
    nom: 'Game Design avancé',
    activityType: 'atelier',
    defaultDuration: 180,
  },
  {
    nom: 'Initiation à la cybersécurité',
    activityType: 'atelier',
    defaultDuration: 120,
  },
  {
    nom: 'Cryptographie : les secrets du code',
    activityType: 'atelier',
    defaultDuration: 120,
  },
  {
    nom: "L'IA et moi",
    activityType: 'atelier',
    defaultDuration: 90,
  },
  {
    nom: 'Entraîne ton modèle',
    activityType: 'atelier',
    defaultDuration: 150,
  },
  {
    nom: 'Poster numérique',
    activityType: 'atelier',
    defaultDuration: 120,
  },
  // ─── Static templates: official (campus-less) ───
  {
    nom: 'Conférence : Les métiers de la tech',
    activityType: 'conference',
    defaultDuration: 90,
  },
  {
    nom: 'Pause déjeuner',
    activityType: 'orga',
    defaultDuration: 60,
  },
  {
    nom: 'Restitution finale',
    activityType: 'conference',
    defaultDuration: 120,
  },
  // ─── Static templates: local (campus-scoped) ───
  {
    nom: 'Visite du campus Epitech Paris',
    activityType: 'conference',
    defaultDuration: 60,
    campus: 'Paris',
  },
  {
    nom: 'Rencontre alumni Lyon',
    activityType: 'conference',
    defaultDuration: 90,
    campus: 'Lyon',
  },
  {
    nom: 'Atelier partenaires Marseille',
    activityType: 'atelier',
    defaultDuration: 150,
    campus: 'Marseille',
  },
];

// ─── Static data: staff, students ───

const STAFF_MEMBERS = [
  {
    key: 'pauline.marchand',
    email: 'pauline.marchand@epitech.eu',
    name: 'Pauline Marchand',
    campus: 'Paris',
    role: 'superdev' as const,
    image: 'https://i.pravatar.cc/96?u=pauline.marchand@epitech.eu',
  },
  {
    key: 'marie.manta',
    email: 'marie.manta@epitech.eu',
    name: 'Marie Manta',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=marie.manta@epitech.eu',
  },
  {
    key: 'sophie.bernard',
    email: 'sophie.bernard@epitech.eu',
    name: 'Sophie Bernard',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=sophie.bernard@epitech.eu',
  },
  {
    key: 'jules.dupont',
    email: 'jules.dupont@epitech.eu',
    name: 'Jules Dupont',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=jules.dupont@epitech.eu',
  },
  {
    key: 'laura.garcia',
    email: 'laura.garcia@epitech.eu',
    name: 'Laura Garcia',
    campus: 'Paris',
    role: 'dev' as const,
    image: null,
  },
  {
    key: 'nathan.blanc',
    email: 'nathan.blanc@epitech.eu',
    name: 'Nathan Blanc',
    campus: 'Lyon',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=nathan.blanc@epitech.eu',
  },
  {
    key: 'pierre.leblanc',
    email: 'pierre.leblanc@epitech.eu',
    name: 'Pierre Leblanc',
    campus: 'Lyon',
    role: 'dev' as const,
    image: null,
  },
  {
    key: 'camille.reader',
    email: 'camille.reader@epitech.eu',
    name: 'Camille Reader',
    campus: 'Paris',
    role: null, // Unassigned — tests the "contact admin" guard
    image: null,
  },
  // ── Extra staff for grid density ──
  {
    key: 'hugo.lefebvre',
    email: 'hugo.lefebvre@epitech.eu',
    name: 'Hugo Lefebvre',
    campus: 'Lyon',
    role: 'superdev' as const,
    image: 'https://i.pravatar.cc/96?u=hugo.lefebvre@epitech.eu',
  },
  {
    key: 'sarah.moreau',
    email: 'sarah.moreau@epitech.eu',
    name: 'Sarah Moreau',
    campus: 'Lyon',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=sarah.moreau@epitech.eu',
  },
  {
    key: 'antoine.roux',
    email: 'antoine.roux@epitech.eu',
    name: 'Antoine Roux',
    campus: 'Paris',
    role: 'dev' as const,
    image: null,
  },
  {
    key: 'clara.noel',
    email: 'clara.noel@epitech.eu',
    name: 'Clara Noël',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=clara.noel@epitech.eu',
  },
  {
    key: 'elise.dumas',
    email: 'elise.dumas@epitech.eu',
    name: 'Élise Dumas',
    campus: 'Lyon',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=elise.dumas@epitech.eu',
  },
  {
    key: 'maxime.girard',
    email: 'maxime.girard@epitech.eu',
    name: 'Maxime Girard',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=maxime.girard@epitech.eu',
  },
  {
    key: 'theo.vincent',
    email: 'theo.vincent@epitech.eu',
    name: 'Théo Vincent',
    campus: 'Paris',
    role: 'dev' as const,
    image: null,
  },
  {
    key: 'lena.faure',
    email: 'lena.faure@epitech.eu',
    name: 'Léna Faure',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=lena.faure@epitech.eu',
  },
  {
    key: 'jeanne.albert',
    email: 'jeanne.albert@epitech.eu',
    name: 'Jeanne Albert',
    campus: 'Lyon',
    role: 'dev' as const,
    image: null,
  },
  {
    key: 'romain.caron',
    email: 'romain.caron@epitech.eu',
    name: 'Romain Caron',
    campus: 'Lyon',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=romain.caron@epitech.eu',
  },
  {
    key: 'yacine.benali',
    email: 'yacine.benali@epitech.eu',
    name: 'Yacine Benali',
    campus: 'Paris',
    role: 'dev' as const,
    image: null,
  },
  {
    key: 'martin.ferrand',
    email: 'martin.ferrand@epitech.eu',
    name: 'Martin Ferrand',
    campus: 'Lyon',
    role: 'dev' as const,
    image: null,
  },
];

type StudentDef = {
  email: string;
  prenom: string;
  nom: string;
  phone: string;
  parentPhone: string;
  niveau: string;
  campus: 'Paris' | 'Lyon';
  charterSigned: boolean;
  lastActiveDaysAgo: number | null;
  skipOnboarding?: boolean;
};

const STUDENTS: StudentDef[] = [
  // ── Paris (20 students) ──
  {
    email: 'alice.martin@mail.com',
    prenom: 'Alice',
    nom: 'Martin',
    phone: '+33 6 12 34 56 01',
    parentPhone: '+33 6 98 76 54 01',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
    skipOnboarding: true,
  },
  {
    email: 'lucas.dupont@mail.com',
    prenom: 'Lucas',
    nom: 'Dupont',
    phone: '+33 6 12 34 56 02',
    parentPhone: '+33 6 98 76 54 02',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 2,
    skipOnboarding: false,
  },
  {
    email: 'emma.bernard@mail.com',
    prenom: 'Emma',
    nom: 'Bernard',
    phone: '+33 6 12 34 56 03',
    parentPhone: '+33 6 98 76 54 03',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 5,
  },
  {
    email: 'hugo.petit@mail.com',
    prenom: 'Hugo',
    nom: 'Petit',
    phone: '+33 6 12 34 56 04',
    parentPhone: '+33 6 98 76 54 04',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 3,
  },
  {
    email: 'lea.moreau@mail.com',
    prenom: 'Léa',
    nom: 'Moreau',
    phone: '+33 6 12 34 56 05',
    parentPhone: '+33 6 98 76 54 05',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 0,
  },
  {
    email: 'nathan.garcia@mail.com',
    prenom: 'Nathan',
    nom: 'Garcia',
    phone: '+33 6 12 34 56 06',
    parentPhone: '+33 6 98 76 54 06',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 8,
  },
  {
    email: 'chloe.roux@mail.com',
    prenom: 'Chloé',
    nom: 'Roux',
    phone: '+33 6 12 34 56 07',
    parentPhone: '+33 6 98 76 54 07',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 12,
  },
  {
    email: 'theo.fournier@mail.com',
    prenom: 'Théo',
    nom: 'Fournier',
    phone: '+33 6 12 34 56 08',
    parentPhone: '+33 6 98 76 54 08',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 4,
  },
  {
    email: 'jade.morel@mail.com',
    prenom: 'Jade',
    nom: 'Morel',
    phone: '+33 6 12 34 56 09',
    parentPhone: '+33 6 98 76 54 09',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 200,
  },
  {
    email: 'louis.simon@mail.com',
    prenom: 'Louis',
    nom: 'Simon',
    phone: '+33 6 12 34 56 10',
    parentPhone: '+33 6 98 76 54 10',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'sarah.lefevre@mail.com',
    prenom: 'Sarah',
    nom: 'Lefèvre',
    phone: '+33 6 12 34 56 11',
    parentPhone: '+33 6 98 76 54 11',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 6,
  },
  {
    email: 'maxime.durand@mail.com',
    prenom: 'Maxime',
    nom: 'Durand',
    phone: '+33 6 12 34 56 12',
    parentPhone: '+33 6 98 76 54 12',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 180,
  },
  {
    email: 'clara.leroy@mail.com',
    prenom: 'Clara',
    nom: 'Leroy',
    phone: '+33 6 12 34 56 13',
    parentPhone: '+33 6 98 76 54 13',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
  {
    email: 'tom.robert@mail.com',
    prenom: 'Tom',
    nom: 'Robert',
    phone: '+33 6 12 34 56 14',
    parentPhone: '+33 6 98 76 54 14',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 7,
  },
  {
    email: 'julie.richard@mail.com',
    prenom: 'Julie',
    nom: 'Richard',
    phone: '+33 6 12 34 56 15',
    parentPhone: '+33 6 98 76 54 15',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 0,
    skipOnboarding: true,
  },
  {
    email: 'antoine.michel@mail.com',
    prenom: 'Antoine',
    nom: 'Michel',
    phone: '+33 6 12 34 56 16',
    parentPhone: '+33 6 98 76 54 16',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 15,
  },
  {
    email: 'mila.laurent@mail.com',
    prenom: 'Mila',
    nom: 'Laurent',
    phone: '+33 6 12 34 56 17',
    parentPhone: '+33 6 98 76 54 17',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 3,
  },
  {
    email: 'nolan.chevalier@mail.com',
    prenom: 'Nolan',
    nom: 'Chevalier',
    phone: '+33 6 12 34 56 18',
    parentPhone: '+33 6 98 76 54 18',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: null, // Never active
  },
  {
    email: 'zoe.dubois@mail.com',
    prenom: 'Zoé',
    nom: 'Dubois',
    phone: '+33 6 12 34 56 19',
    parentPhone: '+33 6 98 76 54 19',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 9,
  },
  {
    email: 'ethan.bonnet@mail.com',
    prenom: 'Ethan',
    nom: 'Bonnet',
    phone: '+33 6 12 34 56 20',
    parentPhone: '+33 6 98 76 54 20',
    niveau: '1ere',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  // ── Paris extras (grid density) ──
  {
    email: 'mathis.perrin@mail.com',
    prenom: 'Mathis',
    nom: 'Perrin',
    phone: '+33 6 12 34 56 26',
    parentPhone: '+33 6 98 76 54 26',
    niveau: '5eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 4,
  },
  {
    email: 'eva.lambert@mail.com',
    prenom: 'Eva',
    nom: 'Lambert',
    phone: '+33 6 12 34 56 27',
    parentPhone: '+33 6 98 76 54 27',
    niveau: '3eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 11,
  },
  {
    email: 'raphael.mercier@mail.com',
    prenom: 'Raphaël',
    nom: 'Mercier',
    phone: '+33 6 12 34 56 28',
    parentPhone: '+33 6 98 76 54 28',
    niveau: '4eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
  {
    email: 'ines.renaud@mail.com',
    prenom: 'Inès',
    nom: 'Renaud',
    phone: '+33 6 12 34 56 29',
    parentPhone: '+33 6 98 76 54 29',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 0,
  },
  {
    email: 'noah.brun@mail.com',
    prenom: 'Noah',
    nom: 'Brun',
    phone: '+33 6 12 34 56 30',
    parentPhone: '+33 6 98 76 54 30',
    niveau: '6eme',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 90,
  },
  {
    email: 'camille.lopez@mail.com',
    prenom: 'Camille',
    nom: 'Lopez',
    phone: '+33 6 12 34 56 31',
    parentPhone: '+33 6 98 76 54 31',
    niveau: 'Terminale',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'elise.pierre@mail.com',
    prenom: 'Élise',
    nom: 'Pierre',
    phone: '+33 6 12 34 56 32',
    parentPhone: '+33 6 98 76 54 32',
    niveau: '3eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 6,
  },
  {
    email: 'tristan.roussel@mail.com',
    prenom: 'Tristan',
    nom: 'Roussel',
    phone: '+33 6 12 34 56 33',
    parentPhone: '+33 6 98 76 54 33',
    niveau: '4eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: null,
  },
  {
    email: 'leon.marin@mail.com',
    prenom: 'Léon',
    nom: 'Marin',
    phone: '+33 6 12 34 56 34',
    parentPhone: '+33 6 98 76 54 34',
    niveau: '1ere',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 14,
  },
  {
    email: 'anais.vasseur@mail.com',
    prenom: 'Anaïs',
    nom: 'Vasseur',
    phone: '+33 6 12 34 56 35',
    parentPhone: '+33 6 98 76 54 35',
    niveau: '5eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 3,
  },
  {
    email: 'sacha.picard@mail.com',
    prenom: 'Sacha',
    nom: 'Picard',
    phone: '+33 6 12 34 56 36',
    parentPhone: '+33 6 98 76 54 36',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 220,
  },
  {
    email: 'lou.carpentier@mail.com',
    prenom: 'Lou',
    nom: 'Carpentier',
    phone: '+33 6 12 34 56 37',
    parentPhone: '+33 6 98 76 54 37',
    niveau: '6eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 5,
  },
  // ── Lyon (5 students) ──
  {
    email: 'eliot.amanieu@epitech.eu',
    prenom: 'Eliot',
    nom: 'Amanieu',
    phone: '+33 7 12 34 56 20',
    parentPhone: '+33 7 98 76 54 20',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 0,
    skipOnboarding: true,
  },
  {
    email: 'ines.durand@mail.com',
    prenom: 'Inès',
    nom: 'Durand',
    phone: '+33 7 12 34 56 21',
    parentPhone: '+33 7 98 76 54 21',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
  {
    email: 'adam.leroy@mail.com',
    prenom: 'Adam',
    nom: 'Leroy',
    phone: '+33 7 12 34 56 22',
    parentPhone: '+33 7 98 76 54 22',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 5,
  },
  {
    email: 'manon.david@mail.com',
    prenom: 'Manon',
    nom: 'David',
    phone: '+33 7 12 34 56 23',
    parentPhone: '+33 7 98 76 54 23',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 10,
  },
  {
    email: 'enzo.girard@mail.com',
    prenom: 'Enzo',
    nom: 'Girard',
    phone: '+33 7 12 34 56 24',
    parentPhone: '+33 7 98 76 54 24',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'rose.henri@mail.com',
    prenom: 'Rose',
    nom: 'Henri',
    phone: '+33 7 12 34 56 25',
    parentPhone: '+33 7 98 76 54 25',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: false,
    lastActiveDaysAgo: 20,
  },
  // ── Lyon extras (grid density) ──
  {
    email: 'eliott.marchal@mail.com',
    prenom: 'Eliott',
    nom: 'Marchal',
    phone: '+33 7 12 34 56 26',
    parentPhone: '+33 7 98 76 54 26',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 4,
  },
  {
    email: 'romane.garnier@mail.com',
    prenom: 'Romane',
    nom: 'Garnier',
    phone: '+33 7 12 34 56 27',
    parentPhone: '+33 7 98 76 54 27',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'owen.pasquier@mail.com',
    prenom: 'Owen',
    nom: 'Pasquier',
    phone: '+33 7 12 34 56 28',
    parentPhone: '+33 7 98 76 54 28',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 8,
  },
  {
    email: 'maelys.olivier@mail.com',
    prenom: 'Maëlys',
    nom: 'Olivier',
    phone: '+33 7 12 34 56 29',
    parentPhone: '+33 7 98 76 54 29',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 0,
  },
  {
    email: 'jules.riviere@mail.com',
    prenom: 'Jules',
    nom: 'Rivière',
    phone: '+33 7 12 34 56 30',
    parentPhone: '+33 7 98 76 54 30',
    niveau: '1ere',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 13,
  },
  {
    email: 'lilou.renaud@mail.com',
    prenom: 'Lilou',
    nom: 'Renaud',
    phone: '+33 7 12 34 56 31',
    parentPhone: '+33 7 98 76 54 31',
    niveau: '6eme',
    campus: 'Lyon',
    charterSigned: false,
    lastActiveDaysAgo: 150,
  },
  {
    email: 'soan.brunet@mail.com',
    prenom: 'Soan',
    nom: 'Brunet',
    phone: '+33 7 12 34 56 32',
    parentPhone: '+33 7 98 76 54 32',
    niveau: '4eme',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: null,
  },
  {
    email: 'iris.lemaire@mail.com',
    prenom: 'Iris',
    nom: 'Lemaire',
    phone: '+33 7 12 34 56 33',
    parentPhone: '+33 7 98 76 54 33',
    niveau: 'Terminale',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
];

// ─── Event blueprints ───

type SlotBlueprint = {
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  label?: string;
  activities: { nom: string; activityType?: ActivityType }[];
};

type DayBlueprint = {
  dayOffset: number; // offset from event start day
  slots: SlotBlueprint[];
};

type EventBlueprint = {
  titre: string;
  eventType?: EventType;
  daysOffset: number; // event date offset from today
  durationDays?: number; // >1 for multi-day events
  campus: 'Paris' | 'Lyon';
  days?: DayBlueprint[]; // if multi-day
  slots?: SlotBlueprint[]; // if single day (dayOffset=0)
  // Participations
  studentEmails: string[];
  presentEmails?: string[]; // subset of studentEmails
  delays?: Record<string, number>; // email -> delay minutes
};

// Build a helper to keep event definitions readable
const parisStudents = STUDENTS.filter((s) => s.campus === 'Paris').map(
  (s) => s.email,
);
const lyonStudents = STUDENTS.filter((s) => s.campus === 'Lyon').map(
  (s) => s.email,
);

const standardOrgaSlot = (): SlotBlueprint => ({
  startHour: 13,
  endHour: 13,
  endMinute: 30,
  label: 'Accueil & appel',
  activities: [{ nom: 'Appel', activityType: 'orga' }],
});

// Stage de seconde anchors. One stage per talent per academic year, ~2
// weeks long, kickoff around mid-month. Past Paris edition is ~11 months
// back (previous cohort), the current Paris one straddles "today" so QA
// can exercise the En-cours phase, and the Lyon edition is the upcoming
// kickoff. Shared between EVENTS and the INTERVIEWS/BROADCASTS
// blueprints that point at those stages by titre/eventIndex.
const STAGE_DURATION_DAYS = 14;
const PAST_PARIS_STAGE_OFFSET = -338;
const ONGOING_PARIS_STAGE_OFFSET = -2;
const FUTURE_LYON_STAGE_OFFSET = 27;

const PAST_PARIS_STAGE_TITLE = formatStageSecondeTitle(
  'Paris',
  PAST_PARIS_STAGE_OFFSET,
);
const ONGOING_PARIS_STAGE_TITLE = formatStageSecondeTitle(
  'Paris',
  ONGOING_PARIS_STAGE_OFFSET,
);
const FUTURE_LYON_STAGE_TITLE = formatStageSecondeTitle(
  'Lyon',
  FUTURE_LYON_STAGE_OFFSET,
);

const EVENTS: EventBlueprint[] = [
  // 1. Past cyber workshop (2 weeks ago) — certificate-ready
  {
    titre: 'Atelier Cybersécurité',
    daysOffset: -14,
    campus: 'Paris',
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 15,
        endMinute: 45,
        label: 'Après-midi',
        activities: [
          { nom: 'Initiation à la cybersécurité' },
          { nom: 'Cryptographie : les secrets du code' },
        ],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 8),
      parisStudents[19], // ethan.bonnet — 1ere
      parisStudents[20], // mathis.perrin — 5eme
      parisStudents[21], // eva.lambert — 3eme
    ],
    presentEmails: [
      ...parisStudents.slice(0, 7),
      parisStudents[19],
      parisStudents[20],
      parisStudents[21],
    ], // 10/11 attended
    delays: { [parisStudents[3]]: 10 },
  },

  // 2. Past robotics workshop (1 week ago)
  {
    titre: 'Atelier Robotique Découverte',
    daysOffset: -7,
    campus: 'Paris',
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        endMinute: 30,
        label: 'Après-midi',
        activities: [{ nom: 'Construis ton robot' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 10),
      parisStudents[22], // raphael.mercier — 4eme
      parisStudents[24], // noah.brun — 6eme
      parisStudents[25], // camille.lopez — Terminale
    ],
    presentEmails: [
      ...parisStudents.slice(0, 9),
      parisStudents[22],
      parisStudents[24],
    ], // 11/13 attended
    delays: { [parisStudents[1]]: 10, [parisStudents[5]]: 5 },
  },

  // 3. Past STAGE DE SECONDE (promotion précédente — historique + portfolio)
  {
    titre: PAST_PARIS_STAGE_TITLE,
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: PAST_PARIS_STAGE_OFFSET,
    durationDays: STAGE_DURATION_DAYS,
    campus: 'Paris',
    days: [
      {
        dayOffset: 0,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 15,
            endMinute: 45,
            label: 'Web — Matin',
            activities: [
              { nom: 'Ma première page HTML' },
              { nom: 'CSS : Styliser sa page' },
            ],
          },
        ],
      },
      {
        dayOffset: 1,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 15,
            endMinute: 45,
            label: 'Robotique',
            activities: [{ nom: 'Construis ton robot' }],
          },
          {
            startHour: 16,
            endHour: 17,
            label: 'Capteurs (avancé)',
            activities: [{ nom: 'Capteurs et actionneurs' }],
          },
        ],
      },
      {
        dayOffset: 2,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 15,
            endMinute: 45,
            label: 'IA',
            activities: [
              { nom: "L'IA et moi" },
              { nom: 'Entraîne ton modèle' },
            ],
          },
        ],
      },
    ],
    studentEmails: parisStudents.slice(0, 6),
    presentEmails: parisStudents.slice(0, 6), // all attended
  },

  // 4. LIVE EVENT (today) — IA workshop
  {
    titre: "Atelier IA : L'intelligence artificielle",
    daysOffset: 0,
    campus: 'Paris',
    slots: [
      {
        startHour: 13,
        endHour: 14,
        label: 'Conférence',
        activities: [
          { nom: "Bienvenue à l'atelier IA", activityType: 'conference' },
        ],
      },
      {
        startHour: 14,
        endHour: 14,
        endMinute: 15,
        label: 'Appel',
        activities: [{ nom: 'Appel après-midi', activityType: 'orga' }],
      },
      {
        startHour: 14,
        startMinute: 15,
        endHour: 16,
        endMinute: 30,
        label: 'Ateliers',
        activities: [{ nom: "L'IA et moi" }, { nom: 'Entraîne ton modèle' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 8),
      parisStudents[27], // tristan.roussel — 4eme
      parisStudents[28], // leon.marin — 1ere
    ],
    presentEmails: parisStudents.slice(0, 6), // 6 already checked in
    delays: { [parisStudents[4]]: 15 },
  },

  // 5. Upcoming event in 2 days (planning built)
  {
    titre: 'Atelier Web Débutants',
    daysOffset: 2,
    campus: 'Paris',
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 15,
        endMinute: 45,
        label: 'Après-midi',
        activities: [
          { nom: 'Ma première page HTML' },
          { nom: 'CSS : Styliser sa page' },
        ],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(10, 16),
      parisStudents[26], // elise.pierre — 3eme
      parisStudents[29], // anais.vasseur — 5eme
    ],
  },

  // 6. Task queue trigger: event in 4 days WITHOUT PLANNING (no slots)
  {
    titre: 'Atelier Game Design',
    daysOffset: 4,
    campus: 'Paris',
    slots: [], // ← intentional (empty planning)
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(5, 12),
      parisStudents[19], // ethan.bonnet — 1ere
      parisStudents[31], // lou.carpentier — 6eme
    ],
  },

  // 7. Fully-prepared event in 7 days
  {
    titre: 'Atelier Scratch : Crée ton jeu',
    daysOffset: 7,
    campus: 'Paris',
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        label: 'Création',
        activities: [{ nom: 'Crée ton jeu Scratch' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 10),
      parisStudents[20], // mathis.perrin — 5eme
      parisStudents[22], // raphael.mercier — 4eme
      parisStudents[27], // tristan.roussel — 4eme
    ],
  },

  // 8. Ongoing STAGE DE SECONDE — En-cours phase QA (today = J3 of 14)
  {
    titre: ONGOING_PARIS_STAGE_TITLE,
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: ONGOING_PARIS_STAGE_OFFSET,
    durationDays: STAGE_DURATION_DAYS,
    campus: 'Paris',
    days: [
      // Day 0 — Lundi (déjà passé, J1)
      {
        dayOffset: 0,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J1', activityType: 'orga' }],
          },
          {
            startHour: 9,
            startMinute: 30,
            endHour: 12,
            label: 'Web — démarrage',
            activities: [{ nom: 'Ma première page HTML' }],
          },
          {
            startHour: 14,
            endHour: 17,
            label: 'CSS & créa',
            activities: [{ nom: 'CSS : Styliser sa page' }],
          },
        ],
      },
      // Day 1 — Mardi (déjà passé, J2)
      {
        dayOffset: 1,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J2', activityType: 'orga' }],
          },
          {
            startHour: 10,
            endHour: 12,
            label: 'IA — découverte',
            activities: [{ nom: "L'IA et moi" }],
          },
          {
            startHour: 14,
            endHour: 17,
            label: 'Visite du campus',
            activities: [{ nom: 'Visite du campus Epitech Paris' }],
          },
        ],
      },
      // Day 2 — Aujourd'hui (J3)
      {
        dayOffset: 2,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J3', activityType: 'orga' }],
          },
          {
            startHour: 10,
            endHour: 12,
            label: 'Métiers de la tech',
            activities: [{ nom: 'Conférence : Les métiers de la tech' }],
          },
          {
            startHour: 14,
            endHour: 16,
            label: 'Visite du campus',
            activities: [{ nom: 'Visite du campus Epitech Paris' }],
          },
        ],
      },
      // Day 3 — Jeudi (à venir, J4)
      {
        dayOffset: 3,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J4', activityType: 'orga' }],
          },
          {
            startHour: 10,
            endHour: 17,
            label: 'Game design',
            activities: [{ nom: 'Crée ton jeu Scratch' }],
          },
        ],
      },
      // Day 4 — Vendredi (à venir, J5 — Demo Day)
      {
        dayOffset: 4,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J5', activityType: 'orga' }],
          },
          {
            startHour: 14,
            endHour: 16,
            label: 'Demo Day',
            activities: [
              { nom: 'Demo Day — final', activityType: 'conference' },
            ],
          },
        ],
      },
    ],
    // parisStudents[0] (alice.martin) already did her stage de seconde with
    // the previous cohort — one stage per talent, ever — so the current
    // edition only registers the new cohort at indices 6..17.
    studentEmails: parisStudents.slice(6, 18),
    presentEmails: parisStudents.slice(6, 16), // 10/12 émargés
    delays: { [parisStudents[9]]: 10, [parisStudents[13]]: 5 },
  },

  // 9. Past Lyon event
  {
    titre: 'Atelier Web Lyon',
    daysOffset: -10,
    campus: 'Lyon',
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        label: 'Après-midi',
        activities: [{ nom: 'Ma première page HTML' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + Lyon extras from other class levels.
    studentEmails: [
      ...lyonStudents.slice(0, 4),
      lyonStudents[10], // jules.riviere — 1ere
      lyonStudents[11], // lilou.renaud — 6eme
    ],
    presentEmails: [
      ...lyonStudents.slice(0, 4),
      lyonStudents[10],
      lyonStudents[11],
    ],
  },

  // 10. Upcoming Lyon event
  {
    titre: 'Atelier Robotique Lyon',
    daysOffset: 10,
    campus: 'Lyon',
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        label: 'Robotique',
        activities: [{ nom: 'Construis ton robot' }],
      },
    ],
    studentEmails: lyonStudents,
  },

  // 11. Future STAGE DE SECONDE Lyon (compliance + cross-campus coverage)
  {
    titre: FUTURE_LYON_STAGE_TITLE,
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: FUTURE_LYON_STAGE_OFFSET,
    durationDays: STAGE_DURATION_DAYS,
    campus: 'Lyon',
    days: [
      {
        dayOffset: 0,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 16,
            label: 'Web',
            activities: [
              { nom: 'Ma première page HTML' },
              { nom: 'CSS : Styliser sa page' },
            ],
          },
        ],
      },
      {
        dayOffset: 1,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 16,
            label: 'Robotique',
            activities: [{ nom: 'Construis ton robot' }],
          },
        ],
      },
      {
        dayOffset: 2,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 16,
            label: 'IA',
            activities: [{ nom: "L'IA et moi" }],
          },
        ],
      },
    ],
    studentEmails: lyonStudents.slice(0, 10),
  },
];

// ─── Interview blueprints ───

// The questionnaire answers, typed straight off the Prisma create input so the
// enum/array values are checked at compile time.
type InterviewAnswers = Partial<
  Pick<
    Prisma.InterviewCreateManyInput,
    // Choice / rating answers.
    | 'discoveryChannel'
    | 'motivation'
    | 'orientationTalkAtSchool'
    | 'passionateTeacher'
    | 'techProjection'
    | 'specialties'
    | 'otherJobs'
    | 'infoSources'
    | 'wantsMore'
    | 'nextYearEvents'
    | 'satisfactionStars'
    | 'recommendation'
    // Free text: the per-question notes, plus the testimony and the verdict.
    | 'discoveryChannelNote'
    | 'motivationNote'
    | 'specialtiesNote'
    | 'orientationTalkNote'
    | 'passionateTeacherNote'
    | 'techProjectionNote'
    | 'otherJobsNote'
    | 'infoSourcesNote'
    | 'wantsMoreNote'
    | 'satisfactionNote'
    | 'nextYearEventsNote'
    | 'oneSentence'
    | 'verdictNote'
  >
>;

type InterviewBlueprint = {
  studentEmail: string;
  staffKey: string;
  status: 'in_progress' | 'done';
  // Required: the interview is 1:1 with the talent's participation in this stage.
  // A blueprint whose talent has no participation here is skipped (warn), so
  // only real stage participants ever get an interview row.
  forEventTitre: string;
  answers?: InterviewAnswers;
};

// Orientation interviews on the ongoing Paris stage. Conducted by the dev team
// (marie.manta = dev, pauline.marchand = superdev). A handful are finalized with
// full answers + a recommendation so the Entretiens list, the synthesis card and
// the recommendation breakdown all render; a couple stay in progress; the rest of
// the cohort has no row, i.e. "à faire".
const INTERVIEWS: InterviewBlueprint[] = [
  {
    studentEmail: parisStudents[6],
    staffKey: 'marie.manta',
    status: 'done',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'site_1e1s',
      motivation: 'passion',
      specialties: ['nsi', 'maths'],
      orientationTalkAtSchool: 'un_peu',
      passionateTeacher: 'oui',
      passionateTeacherNote:
        'M. Garnier (NSI), anime un club robotique au lycée.',
      techProjection: ['dev'],
      infoSources: ['youtube', 'tiktok', 'ia_chatgpt'],
      wantsMore: 'oui',
      satisfactionStars: 5,
      satisfactionNote: 'Niveau parfaitement adapté, repart très motivée.',
      oneSentence: 'Une semaine qui m’a donné envie de coder tous les jours.',
      nextYearEvents: ['coding_club', 'jpo'],
      recommendation: 'tres_compatible',
      verdictNote: 'Très motivée, projet clair. À inviter à la prochaine JPO.',
    },
  },
  {
    studentEmail: parisStudents[7],
    staffKey: 'marie.manta',
    status: 'done',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'entourage',
      motivation: 'metier',
      specialties: ['maths', 'physique_chimie'],
      orientationTalkAtSchool: 'pas_du_tout',
      passionateTeacher: 'pas_sur',
      techProjection: ['jeux_video'],
      techProjectionNote: 'Hésite entre le dev de jeux et le game design.',
      otherJobs: ['arts_design'],
      infoSources: ['instagram', 'youtube'],
      wantsMore: 'peut_etre',
      satisfactionStars: 4,
      oneSentence: 'J’ai compris comment un jeu est fabriqué.',
      nextYearEvents: ['camp', 'journee_decouverte'],
      recommendation: 'bon_profil',
      verdictNote: 'Hésite avec le game design, à relancer dans 6 mois.',
    },
  },
  {
    studentEmail: parisStudents[8],
    staffKey: 'pauline.marchand',
    status: 'done',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'google',
      motivation: 'curiosite',
      specialties: ['indecis'],
      orientationTalkAtSchool: 'un_peu',
      passionateTeacher: 'pas_sur',
      techProjection: ['pas_idee'],
      otherJobs: ['sante', 'commerce_gestion'],
      infoSources: ['parcoursup_onisep', 'entourage'],
      wantsMore: 'peut_etre',
      satisfactionStars: 4,
      satisfactionNote: 'A trouvé la semaine un peu dense, mais intéressante.',
      oneSentence: 'Intéressant mais beaucoup d’informations d’un coup.',
      nextYearEvents: ['conference'],
      recommendation: 'indecis',
      verdictNote: 'Profil ouvert, encore en réflexion sur son orientation.',
    },
  },
  {
    studentEmail: parisStudents[9],
    staffKey: 'marie.manta',
    status: 'in_progress',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'epitech',
      motivation: 'cadre_stage',
      techProjection: ['cyber'],
      infoSources: ['tiktok'],
    },
  },
  {
    studentEmail: parisStudents[10],
    staffKey: 'pauline.marchand',
    status: 'in_progress',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'site_1e1s',
      specialties: ['nsi'],
      specialtiesNote: 'Vise une prépa, hésite encore sur la voie.',
    },
  },
];

// ─── Broadcast blueprints ───
//
// Mass campaigns (mail + SMS) targeting talents or their parents. Visible
// in the Communications timeline on the fiche talent, mixed with the 1:1
// onboarding reminders above. Covers every UI state we want devs to be
// able to eyeball: opened, sent-not-opened, failed (with error), pending
// (queued), SMS variant, parent-side recipient.

type BroadcastRecipientBlueprint = {
  studentEmail: string;
  /** Recipient is the parent (parentOfTalentId) rather than the talent. */
  parentSide?: boolean;
  status: 'pending' | 'sent' | 'failed';
  sentDaysOffset?: number;
  sentHour?: number;
  openedDaysOffset?: number;
  openedHour?: number;
  errorMessage?: string;
};

type BroadcastBlueprint = {
  name: string;
  channel: 'mail' | 'sms';
  audience: 'talent' | 'parent';
  campus: 'Paris' | 'Lyon';
  /** Index into the seeded eventIds list; null = campus-wide, no event link. */
  eventIndex: number | null;
  subject: string | null;
  body: string;
  createdByStaffKey: string;
  createdDaysOffset: number;
  createdHour: number;
  /** Final aggregate status of the broadcast itself (independent of each
   * recipient row). `queued` = nothing dispatched yet; `sent` = all done. */
  status: 'queued' | 'sent' | 'partial_failed';
  recipients: BroadcastRecipientBlueprint[];
};

const BROADCASTS: BroadcastBlueprint[] = [
  // Headline campaign sent at stage kickoff — drives the "opened" + "sent
  // not opened" variants in the fiche timeline. Event-scoped to the
  // ongoing Paris stage (eventIds[7]).
  {
    name: 'Bienvenue au stage de seconde',
    channel: 'mail',
    audience: 'talent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'pauline.marchand',
    createdDaysOffset: -8,
    createdHour: 8,
    status: 'sent',
    subject: 'À demain ! Tout ce qu’il faut savoir pour ton stage',
    body: `Salut {{prenom}},

Demain, c'est le grand jour : ton stage de seconde commence à Epitech Paris !

📍 Rendez-vous à 9h, 14-16 rue Voltaire, 94270 Le Kremlin-Bicêtre.
🎒 Apporte-toi de quoi noter et ta carte d'identité.
💻 Pas besoin d'ordinateur — tout est fourni sur place.

On se voit demain !
L'équipe Epitech Academy`,
    recipients: [
      {
        studentEmail: parisStudents[6],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        openedDaysOffset: -7,
        openedHour: 19,
      },
      {
        studentEmail: parisStudents[14],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        openedDaysOffset: -7,
        openedHour: 12,
      },
      {
        studentEmail: parisStudents[16],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        // No openedAt — surfaces the "Non ouvert" tooltip in the UI.
      },
      {
        studentEmail: parisStudents[7],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        openedDaysOffset: -6,
        openedHour: 9,
      },
    ],
  },
  // Parent-side reminder — exercises audience=parent + parentSide on the
  // recipient + the "Échec" delivery state.
  {
    name: 'Rappel — Signature de la convention',
    channel: 'mail',
    audience: 'parent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'pauline.marchand',
    createdDaysOffset: -5,
    createdHour: 10,
    status: 'partial_failed',
    subject: 'Convention de stage — à signer avant vendredi',
    body: `Bonjour,

Le stage de votre enfant approche et nous n'avons pas encore reçu la
convention signée. Pour pouvoir l'accueillir lundi, nous avons besoin
du document avant vendredi soir.

Vous le trouverez dans l'espace Jump de votre enfant (rubrique
Documents). N'hésitez pas à nous écrire en cas de besoin.

Bien cordialement,
Pauline Marchand — Epitech Academy Paris`,
    recipients: [
      {
        studentEmail: parisStudents[14],
        parentSide: true,
        status: 'sent',
        sentDaysOffset: -5,
        sentHour: 10,
        openedDaysOffset: -5,
        openedHour: 18,
      },
      {
        studentEmail: parisStudents[15],
        parentSide: true,
        status: 'sent',
        sentDaysOffset: -5,
        sentHour: 10,
      },
      {
        studentEmail: parisStudents[16],
        parentSide: true,
        status: 'failed',
        errorMessage: 'Adresse parent inconnue ou inactive',
      },
    ],
  },
  // SMS J-1 — exercises the channel switch (MessageSquare icon, no opened
  // state since SMS has no open tracking).
  {
    name: 'Démarrage demain — checklist & adresse',
    channel: 'sms',
    audience: 'talent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'marie.manta',
    createdDaysOffset: -1,
    createdHour: 17,
    status: 'sent',
    subject: null,
    body: `Salut {{prenom}}, RDV demain 9h au 14-16 rue Voltaire (Kremlin-Bicêtre). Apporte ta carte d'identité, on s'occupe du reste. — Epitech Academy`,
    recipients: [
      {
        studentEmail: parisStudents[6],
        status: 'sent',
        sentDaysOffset: -1,
        sentHour: 17,
      },
      {
        studentEmail: parisStudents[14],
        status: 'sent',
        sentDaysOffset: -1,
        sentHour: 17,
      },
      {
        studentEmail: parisStudents[16],
        status: 'sent',
        sentDaysOffset: -1,
        sentHour: 17,
      },
    ],
  },
  // Queued campaign — recipients are still pending (no sentAt yet), so the
  // timeline falls back to broadcast.createdAt for ordering. Demonstrates
  // the "En attente" pill.
  {
    name: 'Récap de stage — bravo et retours',
    channel: 'mail',
    audience: 'talent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'pauline.marchand',
    createdDaysOffset: 0,
    createdHour: 9,
    status: 'queued',
    subject: 'Ton stage est fini — un dernier message',
    body: `Bravo {{prenom}} !

Tu viens de boucler ton stage de seconde à Epitech. On a passé une
semaine super avec toi.

On t'enverra un récap personnalisé d'ici quelques jours, avec
quelques pistes pour la suite si la tech t'intéresse.

À très vite,
L'équipe Epitech Academy`,
    recipients: [
      { studentEmail: parisStudents[6], status: 'pending' },
      { studentEmail: parisStudents[14], status: 'pending' },
    ],
  },
];

// ─── Main ───

/**
 * A few staff notes across several authors — including one edited by a different
 * staff member than its author — so the fiche feed, the émargement note count and
 * the admin gallery all have multi-note, multi-author data to render. Author ids
 * are StaffProfile ids (note `authorId` / `editedById`).
 */
async function seedTalentNotes(
  staffByKey: Record<string, { id: string }>,
  talentByEmail: Record<string, { id: string }>,
): Promise<number> {
  const author1 = staffByKey['pauline.marchand']?.id;
  const author2 = staffByKey['marie.manta']?.id;
  const talents = Object.values(talentByEmail);
  if (!author1 || !author2 || talents.length < 3) return 0;

  const data = [
    {
      talentId: talents[0].id,
      authorId: author1,
      body: 'Très moteur en groupe, tire les autres vers le haut.',
    },
    {
      talentId: talents[0].id,
      authorId: author2,
      body: 'Arrivé avec 15 min de retard le premier matin.',
    },
    {
      talentId: talents[1].id,
      authorId: author2,
      body: 'À recontacter après le stage pour la suite.',
    },
    {
      talentId: talents[1].id,
      authorId: author1,
      editedById: author2,
      body: 'Profil très curieux, pose beaucoup de questions techniques.',
    },
    {
      talentId: talents[2].id,
      authorId: author1,
      body: 'Décharge image manquante, à relancer côté parents.',
    },
  ];

  await prisma.note_TalentNote.createMany({ data });
  return data.length;
}

async function main() {
  console.log('⟳  Wiping existing data…');
  await wipeAll();

  console.log('✓  Wipe complete. Seeding fresh data…\n');

  // 1. Campuses
  const campuses = await seedCampuses();
  console.log(`✓  Campuses (${Object.keys(campuses).length})`);

  // 2. Staff (no default admin — admins are provisioned via
  //    scripts/add-admin-user.ts and authenticate via Microsoft OAuth only)
  const staffByKey = await seedStaff(campuses);
  console.log(`✓  Users (${Object.keys(staffByKey).length} staff)`);

  // 2b. Intérêts catalogue (referenced by talents)
  const interestCount = await seedInterests(prisma);
  console.log(`✓  Intérêts (${interestCount})`);

  // 2c. Email templates + action mappings (OTP, parent welcome, relances).
  //     Without these, the transactional senders bail with `no_template` and
  //     local dev breaks the OTP login flow. Author defaults to the seeded
  //     superdev, falling back to any seeded staff.
  const createdById =
    staffByKey['pauline.marchand']?.userId ??
    Object.values(staffByKey)[0]?.userId;
  if (!createdById)
    throw new Error('No staff user available to author templates');
  const templateCount = await seedEmailTemplates(prisma, createdById);
  console.log(`✓  Email templates + action mappings (${templateCount})`);

  // 2d. Default broadcast templates (e.g. the inscription announcement staff
  //     send to all talents). Free-standing rows the broadcast composer lists;
  //     no action mapping, so nothing fires them automatically.
  const broadcastTemplateCount = await seedBroadcastTemplates(
    prisma,
    createdById,
  );
  console.log(`✓  Broadcast templates (${broadcastTemplateCount})`);

  // 3. Students
  const talentByEmail = await seedStudents();
  console.log(`✓  Students (${Object.keys(talentByEmail).length})`);

  // 3b. Parent accounts (one per distinct parentEmail; Alice→Sophie is the
  // human-recognisable test pair)
  const parentEmail = await seedParents(talentByEmail);
  console.log(`✓  Parent (${parentEmail})`);

  // 3c. Talent interest assignments
  await assignTalentInterests();
  console.log('✓  Talent interest assignments');

  // 4. Events + planning + participations + émargement + compliance
  const eventIds = await seedEvents(campuses, talentByEmail);
  console.log(`✓  Events (${eventIds.length})`);

  // 6. XP ledger + projections (onboarding grants + émargement eventsCount)
  const updated = await recomputeXp();
  console.log(`✓  XP (${updated} students updated)`);

  // 7. Interviews
  const interviewCount = await seedInterviews(
    staffByKey,
    talentByEmail,
    campuses,
  );
  console.log(`✓  Interviews (${interviewCount})`);

  // 8b. Broadcasts (mass mail / SMS campaigns) — feed the unified
  //      communications timeline on the fiche talent.
  const broadcastRecipientCount = await seedBroadcasts(
    staffByKey,
    talentByEmail,
    campuses,
    eventIds,
  );
  console.log(`✓  Broadcasts (${broadcastRecipientCount} recipient rows)`);

  // 8c. Staff notes on talents (multi-note feed)
  const talentNoteCount = await seedTalentNotes(staffByKey, talentByEmail);
  console.log(`✓  Notes talent (${talentNoteCount})`);

  // 9. CMS welcome pages for stage_seconde events
  await seedWelcomePages(eventIds, staffByKey);
  console.log('✓  CMS welcome pages');

  // ── Final summary ──
  await printSummary(parentEmail);
}

// ─── Welcome pages ───

async function seedWelcomePages(
  eventIds: string[],
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
) {
  // stage_seconde events are at indices 2 (past), 7 (ongoing), 10 (future Lyon)
  const stageEventIndices = [2, 7, 10];
  const updatedBy = Object.values(staffByKey)[0].userId;

  const content = `<h2>Bienvenue sur Jump ! 🙌</h2>
<p>Salut, et <strong>bienvenue dans l'aventure !</strong> Tu viens de rejoindre Jump, la plateforme de ton stage de seconde à Epitech. Pendant ces quelques jours, découvre l'univers du <strong>code</strong>, de la <strong>tech</strong> et de la <strong>création numérique</strong> en <em>construisant</em> tes propres projets.</p>
<h3>Ce qui t'attend</h3>
<ul>
  <li>🧩 <strong>Des ateliers concrets :</strong> tu vas coder, créer, recommencer — c'est comme ça qu'on apprend.</li>
  <li>🏆 <strong>Des XP et des niveaux :</strong> gagne de l'expérience à chaque activité pour grimper de Novice à <em>Expert</em> !</li>
  <li>🎮 <strong>Un mini-jeu par jour :</strong> un défi quotidien pour des XP bonus.</li>
</ul>
<img src="https://placehold.co/600x400/blue/white?text=Photo%20du%20campus" alt="Bannière bleue: Photo du campus à venir" />
<h3>Comment ça marche</h3>
<p>Chaque jour, retrouve tes <strong>activités</strong> sur ton tableau de bord. Participe et gagne tes XP. Si tu bloques, <strong>pas de panique</strong> — l'équipe est là pour t'aider.</p>
<blockquote><p>« Ne cherche pas à tout réussir du premier coup. Le code, c'est essayer, se tromper, et recommencer. »</p></blockquote>`;

  const rows = stageEventIndices.flatMap((idx) => {
    const eventId = eventIds[idx];
    if (!eventId) return [];
    return [{ slug: 'welcome', eventId, updatedBy, content }];
  });
  // cmsPage may not exist (renamed to NewsPost on feat/news-feed branch).
  // Skip silently when the table is gone.
  try {
    await (prisma as any).cmsPage.createMany({ data: rows });
  } catch {
    // table does not exist, skip
  }
}

// ─── Wipe ───

async function wipeAll() {
  // One transaction, children first, parents last. Order matters: each
  // deleteMany must run after the rows referencing it are gone, so the array
  // order is the FK dependency order — keep it.
  await prisma.$transaction([
    prisma.note_TalentNote.deleteMany(),
    // Broadcasts + email-action mappings — dropped before staff so the
    // `MessageTemplate.createdById` FK doesn't block.
    prisma.emailActionMapping.deleteMany(),
    prisma.broadcastRecipient.deleteMany(),
    prisma.broadcast.deleteMany(),
    prisma.messageTemplate.deleteMany(),
    prisma.participation.deleteMany(),
    prisma.interview.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.timeSlot.deleteMany(),
    prisma.planning.deleteMany(),
    prisma.event.deleteMany(),
    prisma.talentInterest.deleteMany(),
    prisma.interest.deleteMany(),
    prisma.talent.deleteMany(),
    prisma.staffProfile.deleteMany(),
    prisma.campus.deleteMany(),
    prisma.syncError.deleteMany(),
    prisma.bauth_session.deleteMany(),
    prisma.bauth_account.deleteMany(),
    prisma.bauth_verification.deleteMany(),
    prisma.bauth_user.deleteMany(),
  ]);
}

// ─── Interests ───

async function assignTalentInterests() {
  // TalentInterest rows are written by the (atomic) interests step, which
  // validates tech and general together — so any talent past that step has both
  // kinds, never tech alone. Gate on `techInterestsValidatedAt` and seed both.
  const talents = await prisma.talent.findMany({
    where: { techInterestsValidatedAt: { not: null } },
    select: { id: true },
  });

  const techIds = await prisma.interest.findMany({
    where: { kind: 'tech' },
    select: { id: true },
  });
  const generalIds = await prisma.interest.findMany({
    where: { kind: 'general' },
    select: { id: true },
  });

  const rows = talents.flatMap((talent) => {
    // 1-2 tech, 1-5 general — shuffle-and-slice per talent (validation schema:
    // tech 1-2, general 1-5).
    const techCount = 1 + Math.floor(Math.random() * 2);
    const selectedTech = [...techIds]
      .sort(() => Math.random() - 0.5)
      .slice(0, techCount);
    const selectedGen = [...generalIds]
      .sort(() => Math.random() - 0.5)
      .slice(0, 1 + Math.floor(Math.random() * 5));
    return [...selectedTech, ...selectedGen].map((interest) => ({
      talentId: talent.id,
      interestId: interest.id,
    }));
  });

  await prisma.talentInterest.createMany({ data: rows, skipDuplicates: true });
}

// ─── Seeders ───

async function seedCampuses(): Promise<
  Record<string, { id: string; name: string }>
> {
  const names = ['Paris', 'Lyon', 'Marseille'];
  const created = await prisma.campus.createManyAndReturn({
    // contactEmail feeds the {{EMAIL_CONTACT_CAMPUS}} broadcast variable; seed it
    // so dev broadcasts don't render an empty token.
    data: names.map((name) => ({
      name,
      contactEmail: `contact.${name.toLowerCase()}@epitech.eu`,
    })),
    select: { id: true, name: true },
  });
  const byName: Record<string, { id: string; name: string }> = {};
  for (const c of created) byName[c.name] = c;
  return byName;
}

async function seedStaff(
  campuses: Record<string, { id: string }>,
): Promise<Record<string, { id: string; userId: string; campusId: string }>> {
  // Users first, then profiles referencing them. createManyAndReturn doesn't
  // guarantee row order, so map back by the unique business key (email →
  // userId, then userId → profile) rather than by index.
  const users = await prisma.bauth_user.createManyAndReturn({
    data: STAFF_MEMBERS.map((s) => ({
      email: s.email,
      name: s.name,
      role: 'staff',
      emailVerified: true,
      image: s.image,
    })),
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));

  const profiles = await prisma.staffProfile.createManyAndReturn({
    data: STAFF_MEMBERS.map((s) => ({
      userId: userIdByEmail.get(s.email)!,
      campusId: campuses[s.campus].id,
      staffRole: s.role,
    })),
    select: { id: true, userId: true, campusId: true },
  });
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  const byKey: Record<
    string,
    { id: string; userId: string; campusId: string }
  > = {};
  for (const s of STAFF_MEMBERS) {
    const userId = userIdByEmail.get(s.email)!;
    const profile = profileByUserId.get(userId)!;
    byKey[s.key] = { id: profile.id, userId, campusId: profile.campusId! };
  }
  return byKey;
}

/**
 * The talent admissions/onboarding funnel, as a single per-student state.
 * Since eager mint, every emailful lead carries a `bauth_user` from import —
 * so the axis this drives is no longer whether an account exists, but whether
 * the talent ever logged in (`lastActiveAt`, email verification) and how far
 * onboarding got:
 *
 *   - `imported`    → SF lead, account eager-minted at import, never logged in
 *                     (`lastActiveAt = null`, email unverified), onboarding
 *                     untouched.
 *   - `fresh`       → logged in once, onboarding untouched (status `pending`,
 *                     "Non démarré").
 *   - `in-progress` → stalled mid-funnel at a varied step.
 *   - `onboarded`   → all 7 steps done (status `active`).
 *
 * Skewed early on purpose: a freshly-imported cohort is mostly leads that never
 * or barely logged in, which is also the most useful state to exercise
 * (impersonate → walk the full parcours). `skipOnboarding` fixtures pin the
 * extremes so there are always ready-to-test accounts. The admin "Jamais
 * connecté" filter (`userId = null`) is fed separately by the anchored
 * mint-conflict talent in `seedStudents` — the only accountless state eager
 * mint leaves behind.
 */
type StudentLifecycle = 'imported' | 'fresh' | 'in-progress' | 'onboarded';

function studentLifecycle(s: StudentDef, i: number): StudentLifecycle {
  if (s.skipOnboarding === true) return 'onboarded';
  if (s.skipOnboarding === false) return 'fresh';
  const bucket = i % 20;
  if (bucket < 7) return 'imported'; // ~35%
  if (bucket < 14) return 'fresh'; // ~35%
  if (bucket < 17) return 'in-progress'; // ~15%
  return 'onboarded'; // ~15%
}

// The canonical onboarding ladder has 7 gated steps (identity → school →
// parents → interests → equipment → processing → rules) — see
// ONBOARDING_STEP_ORDER in src/lib/domain/talentOnboarding.ts. Seeded onboarding
// is a monotonic prefix of that ladder, so a partial talent is byte-identical to
// a real one who stopped at the same point.
const ONBOARDING_FULL_STEPS = 7;

function onboardingStepsFor(lifecycle: StudentLifecycle, i: number): number {
  switch (lifecycle) {
    case 'onboarded':
      return ONBOARDING_FULL_STEPS;
    case 'in-progress':
      return 1 + (i % 6); // 1..6 — stalls spread across the funnel
    default:
      return 0; // imported & fresh — nothing done
  }
}

async function seedStudents(): Promise<
  Record<string, { id: string; nom: string; prenom: string }>
> {
  const byEmail: Record<string, { id: string; nom: string; prenom: string }> =
    {};

  // Students enrolled in the ongoing stage de seconde must NOT be pre-onboarded
  // (QA needs to walk the full parcours live), so default them to `fresh`
  // (account, nothing done) regardless of bucket. Matches event 8
  // (ONGOING_PARIS_STAGE): parisStudents.slice(6, 18). An explicit
  // `skipOnboarding: true` fixture is a deliberate pin that overrides this
  // default (a real stage student can already be fully onboarded), so those
  // still resolve through studentLifecycle.
  const ongoingStageEmails = new Set(parisStudents.slice(6, 18));

  // One talent whose SF-claimed email belongs to a staff account: the worker's
  // eager mint refuses to adopt it ("never hand a student login to a
  // parent/staff address", see ensureTalentUser), so the talent stays
  // accountless — the only way a lead lacks a `bauth_user` since eager mint.
  // Feeds the admin "Jamais connecté" filter and the impersonation conflict
  // path. Anchored on an event-free student so no émargement/compliance
  // fixture depends on her; the claimed address is a stable STAFF_MEMBERS
  // fixture. Accountless ⟹ never logged in ⟹ the lifecycle below is forced to
  // `imported` (any onboarding progress would be unreachable without a login).
  const mintConflictSfEmails = new Map([
    ['zoe.dubois@mail.com', 'nathan.blanc@epitech.eu'],
  ]);

  const lifecycles = STUDENTS.map(
    (s, i): StudentLifecycle =>
      mintConflictSfEmails.has(s.email)
        ? 'imported'
        : s.skipOnboarding !== true && ongoingStageEmails.has(s.email)
          ? 'fresh'
          : studentLifecycle(s, i),
  );

  // Talents deliberately routed to a different School than Salesforce claims, so
  // /staff/admin/sf-conflicts shows a real school *conflict* (not just a
  // "missing"). Anchored by email rather than a modulus: a divergence only
  // surfaces once the talent has confirmed the school step, so the anchor must
  // be a fully-onboarded talent (here, eliot via `skipOnboarding`). The other
  // half — SF must itself assert a school, else the row downgrades to *missing*
  // and the alternate School is left an orphan — is guaranteed below, where
  // these emails are forced to carry an `sfSchoolId`.
  const schoolConflictEmails = new Set(['eliot.amanieu@epitech.eu']);

  // Two talents whose SF-claimed emails are swapped — the classic Salesforce
  // inversion, the recurring root cause of auth-identity drift (see
  // authIdentityService). Each linked account still carries the talent's own
  // address while the mirror claims the other one's, which the sync refuses to
  // auto-force (the holder is another talent's login). Surfaces as a
  // SYMMETRIC_INVERSION pair in Divergences Salesforce › Connexion and lights
  // the admin badge, which would otherwise seed to zero.
  const authInversionSfEmails = new Map([
    ['leon.marin@mail.com', 'anais.vasseur@mail.com'],
    ['anais.vasseur@mail.com', 'leon.marin@mail.com'],
  ]);

  // Eager mint, as the worker does at import: every emailful lead gets a
  // `bauth_user` from day one — `imported` leads included (they simply never
  // logged in, so their email is still unverified). The one exception is the
  // anchored mint-conflict talent above. Users first, then talents referencing
  // them; both batched. Talent rows map back to their user by email
  // (createManyAndReturn order isn't guaranteed), which is also the account's
  // own unique key.
  const users = await prisma.bauth_user.createManyAndReturn({
    data: STUDENTS.flatMap((s, i) =>
      mintConflictSfEmails.has(s.email)
        ? []
        : [
            {
              email: s.email,
              name: `${s.prenom} ${s.nom}`,
              role: 'student',
              emailVerified: lifecycles[i] !== 'imported',
            },
          ],
    ),
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));

  // Canonical schools for seeded talents. Onboarded talents are linked to Victor
  // Hugo; the alt school + a few perturbed SF mirrors below produce realistic
  // reconciliation conflicts on /staff/admin/sf-conflicts.
  const victorHugo = await prisma.school.upsert({
    where: { uai: '0750001A' },
    update: {},
    create: {
      uai: '0750001A',
      name: 'Lycée général Victor Hugo',
      city: 'Paris',
      resolvedAt: new Date(),
    },
    select: { id: true },
  });
  const altSchool = await prisma.school.upsert({
    where: { uai: '0750002B' },
    update: {},
    create: {
      uai: '0750002B',
      name: 'Lycée Jean Moulin',
      city: 'Paris',
      resolvedAt: new Date(),
    },
    select: { id: true },
  });

  // Each seeded talent carries two independent axes, mirroring production:
  //  1. What Salesforce populated at lead creation (school, civilité) — present
  //     for most leads, absent for some. The worker seeds these onto Talent
  //     BEFORE onboarding, so even pending talents already carry SF data.
  //  2. How far the talent's own onboarding got (the monotonic step prefix),
  //     which may confirm — and possibly change — what SF sent.
  // The TalentSfImport mirror always holds the SF claim; a few confirmed talents
  // diverge from it (and some fill in what SF lacked) to populate the
  // reconciliation page realistically.
  // One resolution for both ledgers written below, so a seeded talent's
  // schooling record and onboarding dossier can never land on different years.
  const schoolYear = currentSchoolYearLabel();

  const seeded = STUDENTS.map((s, i) => {
    const lifecycle = lifecycles[i];
    const loggedIn = lifecycle !== 'imported';

    // Never logged in → no activity dates. Otherwise dated per StudentDef.
    const lastActiveAt =
      !loggedIn || s.lastActiveDaysAgo === null
        ? null
        : new Date(now.getTime() - s.lastActiveDaysAgo * 86400000);

    // Onboarding is a monotonic PREFIX of the canonical 7-step ladder, in the
    // wizard's own order: identity → school → parents → interests → equipment →
    // processing → rules. Each step posts its own timestamp(s); the interests
    // step is atomic (tech + general + recap land together, as the reworked
    // wizard writes them), so there is no tech-without-general state — exactly
    // what the real flow can produce. `charterAcceptedAt` lands with
    // `rulesSignedAt` at the final step.
    const onboardingSteps = onboardingStepsFor(lifecycle, i);
    const ts = new Date();
    const profileConfirmed = onboardingSteps >= 1; // identity
    const schoolConfirmed = onboardingSteps >= 2; // school
    const parentsConfirmed = onboardingSteps >= 3; // parents
    const interestsConfirmed = onboardingSteps >= 4; // interests (atomic)
    const equipmentConfirmed = onboardingSteps >= 5; // equipment
    const processingConfirmed = onboardingSteps >= 6; // processing (PDF gen)
    const fullyOnboarded = onboardingSteps >= 7; // rules + charter
    const hasParentInfo = parentsConfirmed;

    // ── Axis 1: what Salesforce sent (independent of onboarding) ──
    // ~90% of leads carry a gender, ~80% a school; the rest SF never populated.
    // Conflict anchors are forced to carry an SF school: a divergence is only a
    // *conflict* (not a downgraded *missing*) when SF asserts a school too, and
    // that side is otherwise index-derived — so pinning the talent by email
    // isn't enough on its own.
    const sfCivilite = i % 10 === 0 ? null : i % 2 === 0 ? 'homme' : 'femme';
    const sfSchoolId = schoolConflictEmails.has(s.email)
      ? victorHugo.id
      : i % 5 === 0
        ? null
        : victorHugo.id;

    // ── Demo divergences (only meaningful once the talent has confirmed) ──
    const schoolDiverges =
      schoolConfirmed &&
      sfSchoolId !== null &&
      schoolConflictEmails.has(s.email);
    const phoneDiverges = profileConfirmed && i % 12 === 7;

    // ── Talent (Jump truth) ──
    // Pending: keep the SF seed. Confirmed: the talent's own value — may differ
    // from SF (divergence) or fill in what SF lacked.
    const civilite =
      sfCivilite ??
      (profileConfirmed ? (i % 2 === 0 ? 'homme' : 'femme') : null);
    const schoolId = schoolConfirmed
      ? schoolDiverges
        ? altSchool.id
        : (sfSchoolId ?? victorHugo.id)
      : sfSchoolId;

    // ── Image-rights decision (parent-driven, strictly downstream of the
    // parents step) ──
    // The parent_welcome mail — the only path to a decision — is sent when the
    // talent completes the parents step (provisionParentAccount). So a decision
    // can exist ONLY once parentsConfirmed; before that the field stays null
    // ('undecided'), exactly as the real flow leaves it (and why an ongoing,
    // not-yet-onboarded cohort lands their parents on /parent/signature, not
    // straight to /parent/merci). Of the parents who were mailed, a
    // deterministic ~25% haven't answered yet — these feed the image-rights
    // relances ("dossiers en attente") — and of those who did, a minority
    // refuse, enough to exercise the refusal paths (staff badge, broadcast
    // filter, "ne pas photographier", PDF).
    const parentMailed = parentsConfirmed;
    const parentAnswered = parentMailed && i % 4 !== 0;
    const parentRefused = parentAnswered && i % 5 === 2;
    const imageRightsDecision: ImageRightsDecision | null = parentAnswered
      ? parentRefused
        ? 'refused'
        : 'accepted'
      : null;

    const parentType = hasParentInfo ? (i % 3 === 0 ? 'pere' : 'mere') : null;
    // "Agissant en qualité de": the exact option both signature forms offer.
    // Mirrors parentSignerRelationship in src/lib/domain/profile.ts (STANDALONE
    // RULE: no $lib import here). One value for the two guardian acts, the
    // règlement co-signature and the image-rights decision, because a single
    // parent cannot hold two qualités.
    const signerRelationship =
      parentType === 'pere'
        ? 'père'
        : parentType === 'mere'
          ? 'mère'
          : civilite === 'femme'
            ? 'tutrice légale'
            : 'tuteur légal';

    // The per-year onboarding dossier. Built once and spread into both the
    // talent (as its cached projection) and the Onboarding_Record created below:
    // a seeded talent carrying the flat columns with no backing row is a state
    // the runtime can't reach, and the first wizard step they took would upsert a
    // fresh dossier and wipe the projection down to that one field. Same
    // reasoning as the schooling ledger further down.
    const dossier = {
      infoValidatedAt: profileConfirmed ? ts : null,
      highSchoolValidatedAt: schoolConfirmed ? ts : null,
      parentsValidatedAt: parentsConfirmed ? ts : null,
      techInterestsValidatedAt: interestsConfirmed ? ts : null,
      generalInterestsValidatedAt: interestsConfirmed ? ts : null,
      interestsRecapSeenAt: interestsConfirmed ? ts : null,
      equipmentValidatedAt: equipmentConfirmed ? ts : null,
      processingCompletedAt: processingConfirmed ? ts : null,
      rulesSignedAt: fullyOnboarded ? ts : null,
      rulesSignedCity: fullyOnboarded ? s.campus : null,
      // Règlement intérieur precedes droit-à-l'image in the parent flow, so a
      // guardian who reached an image-rights decision necessarily co-signed the
      // règlement first (runtime invariant: image decided ⟹ règlement co-signed).
      parentRulesSignedAt: imageRightsDecision ? ts : null,
      parentRulesSignerPrenom: imageRightsDecision ? 'Sophie' : null,
      parentRulesSignerNom: imageRightsDecision ? 'Martin' : null,
      parentRulesRelationship: imageRightsDecision ? signerRelationship : null,
      parentRulesSignedCity: imageRightsDecision ? s.campus : null,
      // The version the signature commits to, always written with the signature
      // itself (`onboardingService` for the talent, `parentRulesService` for the
      // guardian), so a signed row with no version is a state the runtime cannot
      // reach - and it would make the regenerated PDF render the legacy text
      // under a current signature. Whichever signer got there first pins it, so
      // either one is enough. Mirrors CURRENT_REGLEMENT_VERSION in
      // src/lib/content/reglement (STANDALONE RULE: no $lib import here).
      reglementVersion:
        fullyOnboarded || imageRightsDecision ? '2026-2027' : null,
    };

    const talent = {
      ...dossier,
      // Which year the projection above describes. Null when the talent never
      // opened a dossier, matching the migration's backfill rule.
      onboardingSchoolYear: profileConfirmed ? schoolYear : null,
      // Eager mint: every emailful lead is linked from import. The map only
      // misses the mint-conflict anchor, whose account was never created.
      userId: userIdByEmail.get(s.email) ?? null,
      nom: s.nom,
      prenom: s.prenom,
      phone: toStoredPhone(s.phone),
      parentPhone: toStoredPhone(s.parentPhone),
      niveau: s.niveau,
      // Welcome strictly precedes onboarding: "On y va" stamps welcomeSeenAt
      // and hands off to step 1. So anyone who has cleared a single step has
      // necessarily passed the gate. Leaving it null on an onboarded talent is
      // a state the real flow can't produce — it would re-trap them on
      // /welcome at next login (seed bug, not a runtime one).
      welcomeSeenAt: profileConfirmed ? ts : null,
      charterAcceptedAt: fullyOnboarded ? ts : null,
      schoolId,
      parentNom: hasParentInfo ? 'Martin' : null,
      parentPrenom: hasParentInfo ? 'Sophie' : null,
      parentEmail: hasParentInfo ? `parent.${s.email}` : null,
      civilite,
      parentType,
      parentCivilite: hasParentInfo ? (i % 3 === 0 ? 'homme' : 'femme') : null,
      imageRightsDecision,
      imageRightsDecidedAt: imageRightsDecision ? ts : null,
      imageRightsSignerPrenom: imageRightsDecision ? 'Sophie' : null,
      imageRightsSignerNom: imageRightsDecision ? 'Martin' : null,
      parent2Type: null,
      parent2Civilite: null,
      parent2Nom: null,
      parent2Prenom: null,
      parent2Email: null,
      parent2Phone: null,
      setupDescription:
        equipmentConfirmed && i % 3 === 0
          ? 'PC gaming RTX 4070, double écran'
          : null,
      interestsFreeText: null,
      lastActiveAt,
      // The hooks stamp firstLoginAt on the first session; anyone with
      // activity necessarily has it (first ≤ last, collapsed to one date
      // here — the seed doesn't model a login history).
      firstLoginAt: lastActiveAt,
      externalId: mockSalesforceLeadId(i),
    };

    // ── Salesforce mirror (the SF claim, as the worker would have written it) ──
    const sf = {
      // SF's claimed login email — the student's own address, except for the
      // two anchored anomalies (mint conflict, inversion pair).
      sfEmail:
        mintConflictSfEmails.get(s.email) ??
        authInversionSfEmails.get(s.email) ??
        s.email,
      phone: toStoredPhone(phoneDiverges ? '+33 6 99 99 99 99' : s.phone),
      civilite: sfCivilite,
      schoolId: sfSchoolId,
    };

    return {
      talent,
      sf,
      dossier,
      signCity: s.campus,
      signerRelationship,
      email: s.email,
    };
  });

  const talentData = seeded.map((x) => x.talent);

  // createManyAndReturn doesn't guarantee row order (see seedStaff), and the
  // login email now lives only on the linked bauth_user - so map the returned
  // rows back to their source by each talent's unique SF externalId, not email.
  const talents = await prisma.talent.createManyAndReturn({
    data: talentData,
    select: { id: true, externalId: true },
  });
  const talentIdByExternalId = new Map(
    talents.map((t) => [t.externalId, t.id]),
  );
  for (const x of seeded) {
    const id = talentIdByExternalId.get(x.talent.externalId);
    if (id)
      byEmail[x.email] = { id, nom: x.talent.nom, prenom: x.talent.prenom };
  }

  // SF mirror per talent — every seeded talent is an SF lead, so each gets one.
  // It holds what SF sent (null where SF had nothing); a few confirmed talents'
  // values diverge from it, surfacing on the reconciliation page.
  const sfImportData = seeded
    .map((x) => {
      const talentId = talentIdByExternalId.get(x.talent.externalId);
      if (!talentId) return null;
      return {
        talentId,
        nom: x.talent.nom,
        prenom: x.talent.prenom,
        sfEmail: x.sf.sfEmail,
        phone: x.sf.phone,
        civilite: x.sf.civilite,
        niveau: x.talent.niveau,
        sfSchoolId: x.sf.schoolId,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  await prisma.talentSfImport.createMany({ data: sfImportData });

  // Image-rights ledger: every seeded talent that carries a decision in the
  // projection above gets the matching append-only fact, so seed data isn't a
  // projection without a history (which would read like a bug in the staff
  // history view). A real parent decision captures the signer, their qualité and
  // the town, so the seed fills all three (the same `signerRelationship` the
  // règlement co-signature carries, town from the campus city), otherwise a
  // staff correction would regenerate the
  // PDF with a blank "Fait à …" place, the gap real onboarding never produces.
  const imageRightsRecordData = seeded
    .map((x) => {
      const talentId = talentIdByExternalId.get(x.talent.externalId);
      if (
        !talentId ||
        !x.talent.imageRightsDecision ||
        !x.talent.imageRightsDecidedAt
      )
        return null;
      return {
        talentId,
        decision: x.talent.imageRightsDecision,
        decidedAt: x.talent.imageRightsDecidedAt,
        signerPrenom: x.talent.imageRightsSignerPrenom,
        signerNom: x.talent.imageRightsSignerNom,
        relationship: x.signerRelationship,
        city: x.signCity,
        source: 'parent_portal' as const,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  await prisma.imageRightsDecisionRecord.createMany({
    data: imageRightsRecordData,
  });

  // Schooling ledger: `Talent.niveau` / `Talent.schoolId` are projections of the
  // current school year's Schooling_YearRecord, so a seeded talent carrying
  // those columns with no backing row is a state the runtime can't reach: sync
  // writes the row on first sight, for every talent, nulls included. Same
  // reasoning as the image-rights ledger above and the XP one below. `source`
  // follows the write path each seeded state implies: a confirmed lycée came
  // from the talent at onboarding, everything else from the worker.
  const schoolingRecordData = seeded
    .map((x) => {
      const talentId = talentIdByExternalId.get(x.talent.externalId);
      if (!talentId) return null;
      return {
        talentId,
        schoolYear,
        niveau: x.talent.niveau,
        schoolId: x.talent.schoolId,
        source: x.talent.highSchoolValidatedAt ? 'onboarding' : 'sync',
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  await prisma.schooling_YearRecord.createMany({ data: schoolingRecordData });

  // Onboarding dossier: one row per talent who opened one, carrying exactly what
  // the projection on `Talent` shows. See the `dossier` object above.
  const onboardingRecordData = seeded
    .map((x) => {
      const talentId = talentIdByExternalId.get(x.talent.externalId);
      if (!talentId || x.talent.onboardingSchoolYear == null) return null;
      return { talentId, schoolYear, ...x.dossier };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  await prisma.onboarding_Record.createMany({ data: onboardingRecordData });

  return byEmail;
}

async function seedParents(
  talentByEmail: Record<string, { id: string; nom: string; prenom: string }>,
): Promise<string> {
  // Promote one seeded talent to a real, human-recognisable parent so the parent
  // flow has an obvious test pair (Alice → Sophie Martin).
  const realParentEmail = 'sophie.martin@mail.com';
  const child = talentByEmail['alice.martin@mail.com'];
  if (child) {
    await prisma.talent.update({
      where: { id: child.id },
      data: {
        parentEmail: realParentEmail,
        parentNom: 'Martin',
        parentPrenom: 'Sophie',
      },
    });
  }

  // In prod the parent's bauth_user is created in the SAME action that writes
  // Talent.parentEmail (provisionParentAccount, called from the onboarding
  // parents step). So a non-null parentEmail always implies a matching
  // role:'parent' account — without it /parent/login and /parent/fastlogin
  // reject the address ("Aucun compte parent trouvé") and the magic link in the
  // image-rights mail can never resolve. Mirror that here: provision an account
  // for every distinct parentEmail a talent carries, not just Sophie's.
  const withParent = await prisma.talent.findMany({
    where: { parentEmail: { not: null } },
    select: { parentEmail: true, parentNom: true, parentPrenom: true },
  });
  const nameByEmail = new Map<string, string>();
  for (const t of withParent) {
    if (!t.parentEmail) continue;
    const name = `${t.parentPrenom ?? ''} ${t.parentNom ?? ''}`.trim();
    nameByEmail.set(t.parentEmail, name || t.parentEmail);
  }
  await prisma.bauth_user.createMany({
    data: [...nameByEmail].map(([email, name]) => ({
      email,
      name,
      role: 'parent',
      emailVerified: true,
    })),
    skipDuplicates: true,
  });

  return realParentEmail;
}

// ── Émargement créneaux (mirrors $lib/domain/eventPresence) ────────────────
// seed.ts is self-contained (see header: $lib does not resolve under
// `prisma db seed`), so the presence-day shape is reproduced here. Keep in sync
// with `presenceDays`/`presenceSlots`: a stage de seconde covers two working
// weeks (10 workdays) from its start even with no endDate; every other type
// covers its own calendar days. Days are emitted as UTC-midnight Dates to match
// how the app stores `EventPresence.day` (a `@db.Date`) — building them from the
// event's local Y/M/D avoids a timezone off-by-one against the émargement grid.
const PRESENCE_SLOTS = ['morning', 'afternoon'] as const;
type PresenceSlotName = (typeof PRESENCE_SLOTS)[number];
const STAGE_PRESENCE_WORKDAYS = 10;
// Émargement closes a créneau on the clock: morning at 11h, afternoon at 15h.
const SLOT_CLOSE_HOUR: Record<PresenceSlotName, number> = {
  morning: 11,
  afternoon: 15,
};

function isWorkdayUTC(d: Date): boolean {
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  return dow !== 0 && dow !== 6;
}

function eventDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

function presenceDayDates(
  event: { date: Date; endDate: Date | null },
  isStage: boolean,
): Date[] {
  const start = eventDayUTC(event.date);
  const days: Date[] = [];
  // Stage with no endDate: the canonical two working weeks from the start.
  if (isStage && !event.endDate) {
    const cursor = new Date(start);
    while (days.length < STAGE_PRESENCE_WORKDAYS) {
      if (isWorkdayUTC(cursor)) days.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }
  const end = eventDayUTC(event.endDate ?? event.date);
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    if (!isStage || isWorkdayUTC(cursor)) days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// A créneau is "decided" once its clock-close has passed; future créneaux stay
// pending (no row), so an ongoing event is half-filled and a future one empty.
function slotDecided(dayUTC: Date, slot: PresenceSlotName, now: Date): boolean {
  const close = new Date(dayUTC);
  close.setUTCHours(SLOT_CLOSE_HOUR[slot], 0, 0, 0);
  return close.getTime() <= now.getTime();
}

async function seedEvents(
  campuses: Record<string, { id: string }>,
  talentByEmail: Record<string, { id: string; nom: string; prenom: string }>,
) {
  const eventIds: string[] = [];

  // Resolved by code rather than hardcoded: the migration owns the ids, and a
  // seed that guessed them would break the day one is regenerated.
  const diplomaTemplateIds = {
    stage: (
      await prisma.diploma_Template.findUniqueOrThrow({
        where: { code: 'stage' },
        select: { id: true },
      })
    ).id,
    codingClub: (
      await prisma.diploma_Template.findUniqueOrThrow({
        where: { code: 'coding-club' },
        select: { id: true },
      })
    ).id,
  };

  for (const blueprint of EVENTS) {
    const campusId = campuses[blueprint.campus].id;

    // The blueprint's `eventType` is a seed-time classification only (it is never
    // written to the DB - `Event.eventType` was retired). It materialises here as
    // concrete data: a stage carries an explicit ~2-week `endDate` (what the app
    // used to synthesise from the type), names its cohort "stagiaire", and gets
    // the full module set.
    const isStage =
      (blueprint.eventType ?? EVENT_TYPES.CODING_CLUB) ===
      EVENT_TYPES.STAGE_SECONDE;
    const eventStart = dayAt(blueprint.daysOffset, 13, 0);
    const eventEnd =
      blueprint.durationDays && blueprint.durationDays > 1
        ? dayAt(blueprint.daysOffset + blueprint.durationDays - 1, 23, 59)
        : isStage
          ? dayAt(blueprint.daysOffset + 14, 23, 59)
          : null;

    // Normalise single-day vs multi-day into a loop (empty when no slots/days)
    const dayList: DayBlueprint[] =
      blueprint.days ??
      (blueprint.slots ? [{ dayOffset: 0, slots: blueprint.slots }] : []);

    // Whole planning skeleton (timeSlots -> activity), built as nested-create
    // input so the entire event ships in one round trip.
    // 1 activity = 1 slot; multi-activity blueprints write as parallel slots
    // at the same time.
    const timeSlotData = dayList.flatMap((day) =>
      day.slots.flatMap((slot) => {
        const slotStart = dayAt(
          blueprint.daysOffset + day.dayOffset,
          slot.startHour,
          slot.startMinute ?? 0,
        );
        const slotEnd = dayAt(
          blueprint.daysOffset + day.dayOffset,
          slot.endHour,
          slot.endMinute ?? 0,
        );
        return slot.activities.map((act) => {
          const blueprintDef = activityDefs.find((d) => d.nom === act.nom);
          const activityType: ActivityType =
            act.activityType ?? blueprintDef?.activityType ?? 'atelier';
          return {
            startTime: slotStart,
            endTime: slotEnd,
            activity: {
              create: {
                nom: act.nom,
                activityType,
              },
            },
          };
        });
      }),
    );

    const event = await prisma.event.create({
      data: {
        titre: blueprint.titre,
        date: eventStart,
        endDate: eventEnd,
        // Seeded events are all retro, so mark them validated for the dev space
        // (the gate the dev switcher and the attended-events history both use).
        devActivatedAt: eventEnd,
        // A stage historically named its cohort "stagiaire" (materialised);
        // anything else is left unnamed (null) and reads "participant" via the
        // fallback, exactly like an unconfigured event.
        cohortNoun: isStage ? 'stagiaire' : null,
        // The certificate the event issues, from the catalogue the migration
        // seeded. Set here because the export was unreachable locally otherwise:
        // the control it replaced defaulted off and the seed never turned it on.
        // The scalar, not a `connect`: this `data` already names `campusId`, and
        // mixing a scalar FK with a relation forces Prisma's unchecked input,
        // which has no relation fields at all.
        diplomaTemplateId: isStage
          ? diplomaTemplateIds.stage
          : diplomaTemplateIds.codingClub,
        campusId,
        modules: {
          create: (isStage ? STAGE_MODULE_KEYS : CODING_CLUB_MODULE_KEYS).map(
            (moduleKey) => ({ moduleKey }),
          ),
        },
        planning: { create: { timeSlots: { create: timeSlotData } } },
      },
    });
    eventIds.push(event.id);

    // Per-student context, derived once and reused across participation and
    // émargement rows. `isPresent`/`delay` are blueprint
    // attendance hints (from presentEmails/delays) that drive the EventPresence
    // status below — attendance no longer lives on Participation.
    const students = blueprint.studentEmails
      .map((email, i) => {
        const talent = talentByEmail[email];
        if (!talent) return null;
        return {
          email,
          i,
          talent,
          isPresent: blueprint.presentEmails?.includes(email) ?? false,
          delay: blueprint.delays?.[email] ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Participations (pure enrollment) — batched, then mapped back by talentId
    // (unique per event) to wire up the compliance child row.
    const participations = await prisma.participation.createManyAndReturn({
      data: students.map((s) => ({
        talentId: s.talent.id,
        eventId: event.id,
        campusId,
      })),
      select: { id: true, talentId: true },
    });
    const participationIdByTalent = new Map(
      participations.map((p) => [p.talentId, p.id]),
    );

    // EventPresence rows (émargement). Reproduce what staff would have recorded
    // for this event up to now: a present student is présent on every elapsed
    // créneau (en retard on their first one if they arrived late), everyone else
    // absent — with a deterministic slice excused. Créneaux that haven't closed
    // yet get no row, so an ongoing stage is half-filled and a future event
    // empty, like real data. Stage presence spans two working weeks; coding
    // clubs and other types span their own calendar days.
    const now = new Date();
    const creneauDays = presenceDayDates(event, isStage);
    const presenceRows = students.flatMap((s) => {
      const excused = !s.isPresent && s.i % 7 === 0;
      let markedFirst = false;
      return creneauDays.flatMap((dayUTC) =>
        PRESENCE_SLOTS.flatMap((slot) => {
          if (!slotDecided(dayUTC, slot, now)) return [];
          let status: PresenceStatus;
          if (!s.isPresent) {
            status = excused ? 'excused' : 'absent';
          } else if (s.delay > 0 && !markedFirst) {
            status = 'late';
          } else {
            status = 'present';
          }
          markedFirst = true;
          return [
            {
              talentId: s.talent.id,
              eventId: event.id,
              day: dayUTC,
              slot,
              status,
              source: 'manual' as const,
            },
          ];
        }),
      );
    });
    if (presenceRows.length > 0) {
      await prisma.eventPresence.createMany({
        data: presenceRows,
        skipDuplicates: true,
      });
    }
  }

  return eventIds;
}

async function recomputeXp(): Promise<number> {
  // Rebuild the XP ledger the way the app does (XpGrant rows), then set the
  // cached projections (Talent.xp / eventsCount) to match — so seeded talents
  // stay consistent with the ledger and survive any later recompute (onboarding
  // reset, émargement edit) instead of getting zeroed.
  //   - XP    → a single `onboarding` grant (WELCOME_XP_BONUS) per talent who
  //             signed the rules. Presence no longer grants XP.
  //   - events → derived from émargement, mirroring recomputeEventsCount in
  //             services/xpService.ts: an event counts once a talent has a
  //             présent/en-retard cell, so multiple slots collapse to one via a
  //             distinct (talentId, eventId).
  const [onboarded, attendance] = await Promise.all([
    prisma.talent.findMany({
      where: { rulesSignedAt: { not: null } },
      select: { id: true },
    }),
    prisma.eventPresence.findMany({
      where: { status: { in: ['present', 'late'] } },
      distinct: ['talentId', 'eventId'],
      select: { talentId: true },
    }),
  ]);

  const grants: Prisma.XpGrantCreateManyInput[] = [];
  const xpByTalent: Record<string, number> = {};
  const eventsByTalent: Record<string, number> = {};

  for (const t of onboarded) {
    grants.push({
      talentId: t.id,
      source: 'onboarding',
      sourceId: t.id,
      amount: WELCOME_XP_BONUS,
    });
    xpByTalent[t.id] = (xpByTalent[t.id] ?? 0) + WELCOME_XP_BONUS;
  }

  for (const a of attendance) {
    eventsByTalent[a.talentId] = (eventsByTalent[a.talentId] ?? 0) + 1;
  }

  await prisma.xpGrant.createMany({ data: grants, skipDuplicates: true });

  const talentIds = new Set([
    ...Object.keys(xpByTalent),
    ...Object.keys(eventsByTalent),
  ]);
  await Promise.all(
    [...talentIds].map((id) =>
      prisma.talent.update({
        where: { id },
        data: { xp: xpByTalent[id] ?? 0, eventsCount: eventsByTalent[id] ?? 0 },
      }),
    ),
  );

  return talentIds.size;
}

async function seedInterviews(
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
  talentByEmail: Record<string, { id: string }>,
  _campuses: Record<string, { id: string }>,
): Promise<number> {
  // Pre-resolve titre → eventId and (talentId, eventId) → participationId once,
  // so each interview resolves from memory instead of its own findUnique.
  const events = await prisma.event.findMany({
    select: { id: true, titre: true },
  });
  const eventIdByTitre = new Map(events.map((e) => [e.titre, e.id]));

  const participations = await prisma.participation.findMany({
    select: { id: true, talentId: true, eventId: true },
  });
  const participationByTalentEvent = new Map(
    participations.map((p) => [`${p.talentId}_${p.eventId}`, p.id]),
  );

  const rows = INTERVIEWS.flatMap((iv) => {
    const talent = talentByEmail[iv.studentEmail];
    const staff = staffByKey[iv.staffKey];
    if (!talent || !staff) return [];

    // participationId is required: the interview is 1:1 with the talent's
    // participation in this stage. Skip (warn) when there's no participation, so
    // the seed can only produce runtime-reachable rows.
    const eventId = eventIdByTitre.get(iv.forEventTitre);
    if (!eventId) {
      console.warn(
        `⚠ Interview for ${iv.studentEmail} references unknown event "${iv.forEventTitre}"`,
      );
      return [];
    }
    const participationId =
      participationByTalentEvent.get(`${talent.id}_${eventId}`) ?? null;
    if (!participationId) {
      console.warn(
        `⚠ Interview for ${iv.studentEmail} has no participation in "${iv.forEventTitre}"`,
      );
      return [];
    }

    return [
      {
        talentId: talent.id,
        staffId: staff.id,
        campusId: staff.campusId,
        participationId,
        status: iv.status,
        ...iv.answers,
      },
    ];
  });

  await prisma.interview.createMany({ data: rows });
  return rows.length;
}

// ─── Broadcasts ───

/**
 * Seed mass campaigns (mail + SMS) and their per-talent / per-parent
 * recipient rows. Each broadcast references a `MessageTemplate` (we
 * create one per channel up-front and reuse it across campaigns — the
 * snapshot lives on the `Broadcast` row itself, so reusing a template is
 * realistic and keeps the seed tight). Returns the number of recipient
 * rows created so `main()` can log it.
 */
async function seedBroadcasts(
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
  talentByEmail: Record<string, { id: string }>,
  campuses: Record<string, { id: string }>,
  eventIds: string[],
): Promise<number> {
  // Pick a deterministic template author. Same staff member created the
  // reusable transactional templates, so the broadcast templates feel
  // consistent in the admin UI.
  const templateAuthor =
    staffByKey['pauline.marchand']?.userId ??
    Object.values(staffByKey)[0]?.userId;
  if (!templateAuthor) return 0;

  const [mailTemplate, smsTemplate] = await Promise.all([
    prisma.messageTemplate.create({
      data: {
        name: 'Communications stage (mail)',
        channel: 'mail',
        subject: 'Communication Epitech Academy',
        body: 'Snapshot par défaut — chaque diffusion injecte son propre contenu.',
        createdById: templateAuthor,
      },
    }),
    prisma.messageTemplate.create({
      data: {
        name: 'Communications stage (SMS)',
        channel: 'sms',
        subject: null,
        body: 'Snapshot par défaut — chaque diffusion injecte son propre contenu.',
        createdById: templateAuthor,
      },
    }),
  ]);

  // Each broadcast ships with its recipient rows as one nested create. Skip
  // blueprints whose campus/author can't resolve, then fire the rest
  // concurrently.
  const plans = BROADCASTS.flatMap((bp) => {
    const campusId = campuses[bp.campus]?.id;
    const author = staffByKey[bp.createdByStaffKey];
    if (!campusId || !author) return [];

    const createdAt = dayAt(bp.createdDaysOffset, bp.createdHour, 0);
    const recipients = bp.recipients.flatMap((rcp) => {
      const talent = talentByEmail[rcp.studentEmail];
      if (!talent) return [];
      const recipientEmail = rcp.parentSide
        ? rcp.studentEmail.replace('@', '+parent@')
        : rcp.studentEmail;
      return [
        {
          talentId: rcp.parentSide ? null : talent.id,
          parentOfTalentId: rcp.parentSide ? talent.id : null,
          recipientEmail: bp.channel === 'mail' ? recipientEmail : null,
          recipientPhone: bp.channel === 'sms' ? '+33600000000' : null,
          status: rcp.status,
          errorMessage: rcp.errorMessage ?? null,
          sentAt:
            rcp.sentDaysOffset !== undefined
              ? dayAt(rcp.sentDaysOffset, rcp.sentHour ?? 10, 0)
              : null,
          openedAt:
            rcp.openedDaysOffset !== undefined
              ? dayAt(rcp.openedDaysOffset, rcp.openedHour ?? 10, 0)
              : null,
          createdAt,
        },
      ];
    });

    return [
      {
        data: {
          name: bp.name,
          channel: bp.channel,
          templateId: (bp.channel === 'mail' ? mailTemplate : smsTemplate).id,
          campusId,
          audience: bp.audience,
          eventId:
            bp.eventIndex !== null ? (eventIds[bp.eventIndex] ?? null) : null,
          subjectSnapshot: bp.subject,
          bodySnapshot: bp.body,
          status: bp.status,
          createdById: author.userId,
          createdAt,
          updatedAt: createdAt,
          recipients: { create: recipients },
        },
        recipientCount: recipients.length,
      },
    ];
  });

  await Promise.all(
    plans.map((p) => prisma.broadcast.create({ data: p.data })),
  );
  return plans.reduce((sum, p) => sum + p.recipientCount, 0);
}

// ─── Helpers ───

async function printSummary(parentEmail: string) {
  const origin = process.env.ORIGIN || 'http://localhost:3030';
  const [parisTalents, lyonTalents, eventCount, interviewCount] =
    await Promise.all([
      prisma.talent.count({
        where: {
          participations: { some: { campus: { name: 'Paris' } } },
        },
      }),
      prisma.talent.count({
        where: {
          participations: { some: { campus: { name: 'Lyon' } } },
        },
      }),
      prisma.event.count(),
      prisma.interview.count(),
    ]);

  const doneInterviews = await prisma.interview.count({
    where: { status: 'done' },
  });
  const inProgressInterviews = await prisma.interview.count({
    where: { status: 'in_progress' },
  });

  console.log('\n════════════════════════════════════════════════════════');
  console.log('                   SEED COMPLETE');
  console.log('════════════════════════════════════════════════════════\n');

  console.log('🔑 Credentials');
  console.log(
    `   admin      Microsoft OAuth only — bun run scripts/add-admin-user.ts`,
  );
  console.log(`   staff      *@epitech.eu (Microsoft OAuth)`);
  console.log(`              (pauline.marchand/hugo.lefebvre=superdev,`);
  console.log(`               marie.manta/sophie.bernard/jules.dupont=dev,`);
  console.log(`               camille.reader=no role → "contact admin")`);
  console.log(`   students   *@mail.com (OTP via email)`);
  console.log(`   parent     ${parentEmail} (OTP via email)\n`);

  console.log('📊 Volume');
  console.log(
    `   ${parisTalents} Paris students + ${lyonTalents} Lyon students`,
  );
  console.log(`   ${eventCount} events, ${interviewCount} interviews`);
  console.log('');

  console.log('🎯 Feature trigger points');
  console.log(`   Entretiens — finalisés:        ${doneInterviews}`);
  console.log(`   Entretiens — en cours:         ${inProgressInterviews}`);
  console.log(
    `   Task queue — missing planning: 1 event (Atelier Game Design, +4d)`,
  );
  console.log('');

  console.log('🌐 URLs');
  console.log(`   ${origin}/                            Talent app`);
  console.log(`   ${origin}/staff/login                 Staff sign-in`);
  console.log(`   ${origin}/staff/admin                 Admin panel`);
  console.log(`   ${origin}/staff/dev                   Dev space`);
  console.log(`   ${origin}/parent/login                Parent portal`);
  console.log('');
  console.log('════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
