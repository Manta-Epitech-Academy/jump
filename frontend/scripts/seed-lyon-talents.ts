/**
 * One-off: inject 200 Lyon talents with a Participation in the campus so
 * they show up under broadcast resolvers (which filter by
 * `Participation.campusId`). Idempotent enough for local dev — re-runs
 * just add 200 more.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PRENOMS = [
  'Léa',
  'Hugo',
  'Emma',
  'Lucas',
  'Chloé',
  'Nathan',
  'Manon',
  'Enzo',
  'Inès',
  'Maxime',
  'Camille',
  'Théo',
  'Sarah',
  'Adam',
  'Louise',
  'Mathis',
  'Jade',
  'Ethan',
  'Anna',
  'Liam',
  'Alice',
  'Noah',
  'Lola',
  'Tom',
  'Zoé',
  'Léo',
  'Lina',
  'Gabriel',
  'Romane',
  'Arthur',
  'Eva',
  'Raphaël',
  'Maëlle',
  'Sacha',
  'Lou',
  'Aaron',
  'Mila',
  'Naël',
  'Capucine',
  'Soan',
  'Margaux',
  'Maël',
];
const NOMS = [
  'Martin',
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Richard',
  'Petit',
  'Durand',
  'Leroy',
  'Moreau',
  'Simon',
  'Laurent',
  'Lefebvre',
  'Michel',
  'Garcia',
  'David',
  'Bertrand',
  'Roux',
  'Vincent',
  'Fournier',
  'Morel',
  'Girard',
  'André',
  'Mercier',
  'Dupont',
  'Lambert',
  'Bonnet',
  'François',
  'Martinez',
  'Legrand',
  'Garnier',
  'Faure',
  'Rousseau',
  'Blanc',
  'Guerin',
];
const NIVEAUX = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale'];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randPhone(): string {
  const tail = Math.floor(10000000 + Math.random() * 89999999);
  return `+33 6 ${String(tail).slice(0, 2)} ${String(tail).slice(2, 4)} ${String(tail).slice(4, 6)} ${String(tail).slice(6, 8)}`;
}

async function main() {
  const COUNT = 200;

  const campus = await prisma.campus.findFirst({ where: { name: 'Lyon' } });
  if (!campus) throw new Error('Lyon campus not found — run the seed first.');

  // We need any Lyon event so each talent has a Participation row that the
  // broadcast resolver picks up.
  let event = await prisma.event.findFirst({
    where: { campusId: campus.id },
    orderBy: { date: 'desc' },
    select: { id: true, titre: true },
  });
  if (!event) {
    throw new Error(
      'No Lyon event found — broadcasts need at least one event in the campus.',
    );
  }
  console.log(
    `Using campus=${campus.id} (Lyon), event=${event.id} (${event.titre})`,
  );

  const now = Date.now();
  const talents = Array.from({ length: COUNT }, (_, i) => {
    const prenom = pick(PRENOMS);
    const nom = pick(NOMS);
    const suffix = now.toString(36).slice(-4) + i.toString(36);
    const email = `${prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${nom.toLowerCase()}.${suffix}@mail.test`;
    return {
      prenom,
      nom,
      email,
      phone: randPhone(),
      parentEmail: `parent.${suffix}@mail.test`,
      parentPhone: randPhone(),
      parentPrenom: pick(PRENOMS),
      parentNom: nom,
      niveau: pick(NIVEAUX),
      charterAcceptedAt: new Date(),
    };
  });

  // createMany is fast but doesn't return ids — and we need ids to create
  // Participations. Do it as a transaction so a mid-loop failure leaves no
  // half-inserted state.
  const created = await prisma.$transaction(
    talents.map((data) => prisma.talent.create({ data, select: { id: true } })),
  );

  await prisma.participation.createMany({
    data: created.map(({ id }) => ({
      talentId: id,
      eventId: event.id,
      campusId: campus.id,
    })),
  });

  console.log(`Created ${created.length} talents + participations in Lyon.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
