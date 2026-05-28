import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Narrow re-runnable seed: only the two reference catalogs (talent interests
// + email templates). Same content and wipe-then-reseed semantics as the
// matching sections of `seed.ts`, scoped to those tables. Use when you want
// to refresh the catalogs without rebuilding the whole DB.
//
// Run: `bun run prisma/seed-catalogs.ts`

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('→ Wiping interests + email templates…');
  await wipe();

  console.log('→ Seeding interests…');
  const interestCount = await seedInterests();
  console.log(`✓  ${interestCount} interests`);

  console.log('→ Seeding email templates…');
  const templateCount = await seedEmailTemplates();
  console.log(`✓  ${templateCount} templates + mappings`);

  console.log('\nDone.');
}

async function wipe() {
  // FK order: cascade rows first (talentInterest, emailActionMapping), then
  // their parents (interest, messageTemplate). Both `talentInterest` and
  // `emailActionMapping` cascade-delete via schema, but doing it explicitly
  // keeps this script's intent obvious to readers.
  await prisma.$transaction([
    prisma.talentInterest.deleteMany(),
    prisma.interest.deleteMany(),
    prisma.emailActionMapping.deleteMany(),
    prisma.messageTemplate.deleteMany(),
  ]);
}

async function seedInterests(): Promise<number> {
  const techItems = [
    { nom: 'Créer des sites web', emoji: '🌐' },
    { nom: 'Créer des apps', emoji: '📱' },
    { nom: 'Créer des jeux vidéo', emoji: '🕹️' },
    { nom: 'Programmation', emoji: '💻' },
    { nom: 'Développement de logiciels', emoji: '🖥️' },
    { nom: 'Intelligence artificielle', emoji: '🤖' },
    { nom: 'Robotique', emoji: '🦾' },
    { nom: 'Data science / Analyse de données', emoji: '📊' },
    { nom: 'Cloud / Infrastructure', emoji: '☁️' },
    { nom: 'Cybersécurité / Hacking', emoji: '🔒' },
  ];

  const generalItems = [
    { nom: 'Jeux vidéo', emoji: '🎮' },
    { nom: 'Manga / Anime', emoji: '📺' },
    { nom: 'Séries / Films', emoji: '🎬' },
    { nom: 'Musique (écouter)', emoji: '🎧' },
    { nom: "Jouer d'un instrument", emoji: '🎸' },
    { nom: 'Dessin / Illustration', emoji: '✏️' },
    { nom: 'Photo / Vidéo', emoji: '📷' },
    { nom: 'Lecture', emoji: '📚' },
    { nom: 'Écriture / Poésie', emoji: '📝' },
    { nom: 'Cuisine / Pâtisserie', emoji: '👨‍🍳' },
    { nom: 'Sport collectif', emoji: '⚽' },
    { nom: 'Sport individuel', emoji: '🏃' },
    { nom: 'Danse', emoji: '💃' },
    { nom: 'Skateboard / Roller', emoji: '🛹' },
    { nom: 'Mode / Streetwear', emoji: '👟' },
    { nom: 'Maquillage / Beauté', emoji: '💄' },
    { nom: 'DIY / Bricolage', emoji: '🔨' },
    { nom: 'Jardinage', emoji: '🌱' },
    { nom: "L'espace / Astronomie", emoji: '🔭' },
    { nom: 'Les animaux', emoji: '🐾' },
    { nom: 'Environnement / Écologie', emoji: '🌍' },
    { nom: 'Psychologie', emoji: '🧠' },
    { nom: 'Histoire', emoji: '📜' },
    { nom: 'Politique / Débats', emoji: '🗳️' },
    { nom: 'Économie / Business', emoji: '💼' },
  ];

  const result = await prisma.interest.createMany({
    data: [
      ...techItems.map((it, i) => ({ ...it, kind: 'tech' as const, order: i })),
      ...generalItems.map((it, i) => ({
        ...it,
        kind: 'general' as const,
        order: i,
      })),
    ],
  });
  return result.count;
}

/**
 * Default transactional templates + their action mappings. Mirrors
 * `seedEmailTemplates` in seed.ts — keep bodies in sync. Author defaults to
 * pauline.marchand@epitech.eu (the superdev seeded by the main script);
 * falls back to any staff user, or any user, so the script doesn't break
 * if you run it before / outside a full seed.
 */
async function seedEmailTemplates(): Promise<number> {
  const createdById = await resolveAuthorUserId();

  const templates: {
    actionKey: string;
    name: string;
    subject: string;
    body: string;
  }[] = [
    {
      actionKey: 'otp_talent',
      name: 'OTP — Login talent (par défaut)',
      subject: "Ton code d'accès secret pour Jump 🔑",
      body: `Salut **{{prenom}}** !

Voici ton code secret temporaire pour te connecter à ton Cockpit :

# {{otp_code}}

*Si tu n'as pas essayé de te connecter, tu peux supprimer cet email sans t'inquiéter. Ce code expirera rapidement.*

Bon atelier !
L'équipe Epitech Academy`,
    },
    {
      actionKey: 'otp_parent',
      name: 'OTP — Login parent (par défaut)',
      subject: "Votre code d'accès Jump — Espace Parent",
      body: `Bonjour **{{parent_prenom}}**,

Voici votre code de connexion à l'Espace Parent :

# {{otp_code}}

Ce code est valable **10 minutes**.

:button[Se connecter à l'Espace Parent]({{login_link}})

*Si vous n'avez pas demandé ce code, vous pouvez ignorer cet email.*

Cordialement,
L'équipe Epitech Academy`,
    },
    {
      actionKey: 'parent_welcome',
      name: 'Bienvenue parent (par défaut)',
      subject:
        'Stage de seconde de {{child_prenom}} à Epitech : une dernière étape de votre côté',
      body: `Bonjour,

{{child_prenom}} vient de finaliser son inscription au stage de seconde à Epitech, qui se déroulera du 15 au 27 juin, sur notre campus de {{campus}}.

Pour finaliser le dossier, votre **co-signature du règlement intérieur** est attendue : elle accompagne celle de {{child_prenom}}, qui s'engage à respecter le cadre du stage.

Par ailleurs, pendant ce stage, nos équipes seront amenées à prendre des photos et vidéos : ateliers, défis, moments collectifs… Pour savoir si nous pouvons utiliser ces contenus dans les communications d'Epitech (réseaux sociaux, site, supports internes), nous avons besoin de votre **décision sur le droit à l'image**. Vous êtes bien sûr libre d'accepter ou de refuser.

L'ensemble vous prendra moins de 2 minutes via le lien ci-dessous.

:button[Finaliser le dossier de {{child_prenom}}]({{parent_fastlogin_link}})

Le lien vous connecte directement à votre espace, sans mot de passe à créer.

Si vous avez la moindre question, n'hésitez pas à nous écrire à {{email_contact_campus}}, nous vous répondons rapidement.

Bien cordialement,
L'équipe Epitech {{campus}}`,
    },
    {
      actionKey: 'relance_student',
      name: 'Relance — étudiant (par défaut)',
      subject:
        'J-{X}, {{prenom}} : dernière étape pour finaliser ton inscription au stage à Epitech.',
      body: `Salut {{prenom}},

Petit rappel : ton stage à Epitech démarre dans {X} jours, et ton inscription n'est pas encore finalisée. Il te reste 5 minutes à passer sur Jump pour boucler tout ça.

:button[Finalise ton inscription]({{fastlogin_link}})

Une question ? Un blocage ? Écris-nous à {{email_contact_campus}}, on te répond rapidement.

À très vite,
L'équipe Epitech {{campus}}`,
    },
    {
      actionKey: 'relance_parent',
      name: 'Relance — parent (par défaut)',
      subject:
        'Rappel : finaliser le dossier de {{child_prenom}} pour le stage à Epitech',
      body: `Bonjour,

Petit rappel : pour finaliser le dossier d'inscription de {{child_prenom}} au stage de seconde à Epitech, votre **co-signature du règlement intérieur** et votre **décision sur le droit à l'image** sont encore attendues.

Cela vous prendra moins de 2 minutes.

:button[Finaliser le dossier de {{child_prenom}}]({{parent_fastlogin_link}})

Le lien vous connecte directement à votre espace, sans mot de passe à créer.

Une question ? Écrivez-nous à {{email_contact_campus}}, on vous répond rapidement.

Bien cordialement,
L'équipe Epitech {{campus}}`,
    },
    {
      actionKey: 'account_deletion_refused',
      name: 'Suppression de compte — refus (par défaut)',
      subject: 'Ta demande de suppression de compte',
      body: `Salut **{{prenom}}**,

Nous avons bien reçu ta demande de suppression de ton compte Jump, mais nous ne pouvons pas y donner suite pour le moment.

**Motif :** {{deletion_reason}}

Tu peux refaire une demande plus tard, ou répondre à cet email si tu as des questions.

Si tu n'es pas d'accord, tu peux aussi introduire une réclamation auprès de la CNIL : [cnil.fr](https://www.cnil.fr/fr/plaintes).

L'équipe Epitech Academy`,
    },
    {
      actionKey: 'account_deletion_done',
      name: 'Suppression de compte — confirmation (par défaut)',
      subject: 'Ton compte Jump a été supprimé',
      body: `Salut **{{prenom}}**,

Comme tu l'avais demandé, ton compte Jump a été supprimé et tes données personnelles ont été définitivement anonymisées.

Tu n'as plus accès à la plateforme. Si tu souhaites revenir un jour, il te faudra créer un nouveau compte.

Merci d'avoir fait partie de l'aventure.
L'équipe Epitech Academy`,
    },
  ];

  const created = await prisma.messageTemplate.createManyAndReturn({
    data: templates.map((t) => ({
      name: t.name,
      channel: 'mail' as const,
      subject: t.subject,
      body: t.body,
      createdById,
    })),
    select: { id: true, name: true },
  });
  const templateIdByName = new Map(created.map((t) => [t.name, t.id]));

  await prisma.emailActionMapping.createMany({
    data: templates.map((t) => ({
      actionKey: t.actionKey,
      templateId: templateIdByName.get(t.name)!,
    })),
  });
  return templates.length;
}

async function resolveAuthorUserId(): Promise<string> {
  const preferred = await prisma.bauth_user.findUnique({
    where: { email: 'pauline.marchand@epitech.eu' },
    select: { id: true },
  });
  if (preferred) return preferred.id;

  const anyStaff = await prisma.bauth_user.findFirst({
    where: { staffProfile: { isNot: null } },
    select: { id: true },
  });
  if (anyStaff) return anyStaff.id;

  const anyUser = await prisma.bauth_user.findFirst({ select: { id: true } });
  if (anyUser) return anyUser.id;

  throw new Error(
    'No bauth_user found to author email templates. Run the full seed (`bun run db:seed`) at least once first.',
  );
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
