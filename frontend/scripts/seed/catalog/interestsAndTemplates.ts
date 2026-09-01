/**
 * Reference catalogues: talent interests, the default transactional email
 * templates with their action mappings, and the broadcast templates staff pick
 * in the composer.
 *
 * These are a referential, not a scenario: they are the same rows in every
 * environment, they are not scaled by profile, and they are the one part of the
 * generator that is safe to run against an already-populated database. That is
 * what `--catalog-only` exposes, and it is why this file kept its own shape when
 * the rest of the seed was replaced.
 *
 * The writes are idempotent and CREATE-ONLY: they insert catalogue rows that are
 * missing and leave every existing row alone. A row that has shipped, including
 * one staff later edited in production (an interest emoji renamed through
 * /staff/admin/interests, a hand-tuned template body), survives a re-run
 * untouched. Fixing an already-shipped default is a deliberate manual or
 * migration step.
 *
 * The client is passed in rather than imported: the generator owns its own
 * `PrismaClient`, and there is no singleton to reach for outside Vite.
 */

import type { BroadcastChannel, PrismaClient } from '@prisma/client';

// ─── Interests catalogue ───

/**
 * Tech-leaning interests. Order within the array is the displayed order.
 */
export const INTEREST_TECH: { nom: string; emoji: string }[] = [
  { nom: 'Créer des sites web', emoji: '🌐' },
  { nom: 'Créer des apps', emoji: '📱' },
  { nom: 'Créer des jeux vidéo', emoji: '🕹️' },
  { nom: 'Programmation', emoji: '💻' },
  { nom: 'Intelligence artificielle', emoji: '🤖' },
  { nom: 'Robotique', emoji: '🦾' },
  { nom: 'Data science / Analyse de données', emoji: '📊' },
  { nom: 'Cloud / Infrastructure', emoji: '☁️' },
  { nom: 'Cybersécurité / Hacking', emoji: '🔒' },
];

/** General-interest options. Order within the array is the displayed order. */
export const INTEREST_GENERAL: { nom: string; emoji: string }[] = [
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

/**
 * Idempotently populate the interests catalogue, CREATE-ONLY: insert each entry
 * whose unique `nom` is missing, and never touch a row that already exists. The
 * catalogue is a first-time populator, not an authority over live rows: staff
 * can rename or re-emoji an interest via `/staff/admin/interests`, and a re-seed
 * must not undo that. Existing `interestId`s stay stable, so the `TalentInterest`
 * rows a student selected survive a re-run.
 *
 * Deliberately does NOT prune rows absent from the catalogue (same reason: the
 * `Interest` table is shared with admin-added interests). Removing or editing a
 * default that already shipped is therefore a manual/migration step, not this
 * function's job. The one exception is the additive backfill below.
 * Returns the catalogue size.
 */
export async function seedInterests(prisma: PrismaClient): Promise<number> {
  const catalogue = [
    ...INTEREST_TECH.map((it, i) => ({
      ...it,
      kind: 'tech' as const,
      order: i,
    })),
    ...INTEREST_GENERAL.map((it, i) => ({
      ...it,
      kind: 'general' as const,
      order: i,
    })),
  ];
  await prisma.interest.createMany({ data: catalogue, skipDuplicates: true });

  return catalogue.length;
}

// ─── Email templates + action mappings ───

/**
 * Default transactional templates and the action key each is wired to. Without
 * these, the transactional senders bail with `no_template` and the OTP login
 * flow breaks. Each default is identified by its `actionKey` (the unique
 * `EmailActionMapping` primary key); `seedEmailTemplates` refreshes the bound
 * template in place, so two defaults could safely share a display `name`.
 *
 * Mail only, by design: there is no SMS catalogue here. SMS escalation is
 * fixed-shape: its body is a compiled-in default (`RELANCE_SMS_DEFAULTS` in
 * `src/lib/domain/relanceTemplates.ts`), with no admin template and no
 * `EmailActionMapping` row, so there is nothing for a seed to populate. The
 * only `channel: 'sms'` `MessageTemplate` rows in `seed.ts` are demo broadcast
 * snapshots, which prod must not have.
 */
export const EMAIL_TEMPLATE_DEFAULTS: {
  actionKey: string;
  name: string;
  subject: string;
  body: string;
}[] = [
  {
    actionKey: 'otp_talent',
    name: 'OTP - Login talent (par défaut)',
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
    name: 'OTP - Login parent (par défaut)',
    subject: "Votre code d'accès Jump : Espace Parent",
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
    name: 'Relance - étudiant (par défaut)',
    subject:
      'J-{{jours_restants}}, {{prenom}} : dernière étape pour finaliser ton inscription au stage à Epitech.',
    body: `Salut {{prenom}},

Petit rappel : ton stage à Epitech démarre dans {{jours_restants}} jours, et ton inscription n'est pas encore finalisée. Il te reste 5 minutes à passer sur Jump pour boucler tout ça.

:button[Finalise ton inscription]({{fastlogin_link}})

Une question ? Un blocage ? Écris-nous à {{email_contact_campus}}, on te répond rapidement.

À très vite,
L'équipe Epitech {{campus}}`,
  },
  {
    actionKey: 'relance_parent',
    name: 'Relance - parent (par défaut)',
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
    name: 'Suppression de compte - refus (par défaut)',
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
    name: 'Suppression de compte - confirmation (par défaut)',
    subject: 'Ton compte Jump a été supprimé',
    body: `Salut **{{prenom}}**,

Comme tu l'avais demandé, ton compte Jump a été supprimé et tes données personnelles ont été définitivement anonymisées.

Tu n'as plus accès à la plateforme. Si tu souhaites revenir un jour, il te faudra créer un nouveau compte.

Merci d'avoir fait partie de l'aventure.
L'équipe Epitech Academy`,
  },
];

/**
 * Populate the default templates, CREATE-ONLY. For each `actionKey`: if a mapping
 * already exists, skip it entirely: the bound template may have been edited in
 * prod and a re-seed must not revert that. Only a missing `actionKey` is created
 * (template + mapping), so adding a new default lights up, but existing ones are
 * never rewritten. Admin-authored broadcast templates (no action mapping) and the
 * rest of `MessageTemplate` are left untouched. `createdById` authors the rows it
 * creates. Needs no prior wipe. Returns the number of default templates.
 *
 * Fixing an already-shipped default is therefore a manual/migration step, not a
 * re-seed, deliberately, so hand-tuned prod copy survives.
 */
export async function seedEmailTemplates(
  prisma: PrismaClient,
  createdById: string,
): Promise<number> {
  for (const t of EMAIL_TEMPLATE_DEFAULTS) {
    const existing = await prisma.emailActionMapping.findUnique({
      where: { actionKey: t.actionKey },
      select: { templateId: true },
    });
    if (existing) continue; // create-only: never overwrite an existing default
    const created = await prisma.messageTemplate.create({
      data: {
        name: t.name,
        channel: 'mail',
        subject: t.subject,
        body: t.body,
        createdById,
      },
      select: { id: true },
    });
    await prisma.emailActionMapping.create({
      data: { actionKey: t.actionKey, templateId: created.id },
    });
  }
  return EMAIL_TEMPLATE_DEFAULTS.length;
}

// ─── Broadcast templates ───

/**
 * Default broadcast templates: free-standing `MessageTemplate` rows staff pick
 * (and may tweak) in the broadcast composer. Unlike the transactional defaults
 * above, these carry no `EmailActionMapping`: nothing sends them automatically,
 * a staff member fires them as a one-off broadcast. Each is keyed by a stable
 * `seedKey` (see the schema field) so a re-seed matches the same row instead of
 * duplicating on a non-unique `name`.
 *
 * Variables are the standard broadcast tokens (`BROADCAST_VARIABLES`), resolved
 * per recipient at send time: `{{fastlogin_link}}` is minted per talent,
 * `{{email}}` is the recipient's own mailbox, and `{{jours_restants}}` counts
 * down to the broadcast's linked event (so the sender must attach the stage
 * event for the countdown to render). The SMS entries are link-free by design,
 * pointing the recipient back to their inbox via `{{email}}`; their bodies
 * mirror `RELANCE_SMS_DEFAULTS` in `src/lib/domain/relanceTemplates.ts`, kept in
 * sync by inspection since the STANDALONE RULE forbids importing it here.
 */
export const BROADCAST_TEMPLATE_DEFAULTS: {
  seedKey: string;
  name: string;
  channel: BroadcastChannel;
  subject: string | null;
  body: string;
}[] = [
  {
    seedKey: 'announce_inscription_talent',
    name: 'Annonce inscription (talents)',
    channel: 'mail',
    subject: 'J-{{jours_restants}} : finalise ton inscription au stage Epitech',
    body: `Salut {{prenom}},

Plus que **{{jours_restants}} jours** avant le coup d'envoi de ton stage de seconde à Epitech, et il ne te reste qu'une dernière étape de ton côté : finaliser ton inscription sur notre plateforme des stages de seconde.

Ça te prendra **5 minutes**, pas plus. Tu vas juste :

- vérifier tes coordonnées et celles de tes parents,
- nous dire ce qui t'intéresse (tech et hors tech),
- décrire ton matériel informatique,
- et signer le règlement intérieur.

:button[Finalise ton inscription]({{fastlogin_link}})

Ce lien te connecte directement à ton espace, pas besoin de créer un mot de passe.

Une question ? Un blocage ? Écris-nous à {{email_contact_campus}}, on te répond rapidement.

À très vite,
L'équipe Epitech {{campus}}`,
  },
  {
    seedKey: 'relance_inscription_talent_sms',
    name: 'Relance inscription talent (SMS)',
    channel: 'sms',
    subject: null,
    body: "Salut {{prenom}}, plus que {{jours_restants}} jours avant ton stage à Epitech ! Finalise vite ton inscription : on t'a envoyé un mail sur {{email}}. - Epitech {{campus}}",
  },
  {
    seedKey: 'relance_image_parent_sms',
    name: "Relance droit à l'image parent (SMS)",
    channel: 'sms',
    subject: null,
    body: "Bonjour, votre signature est attendue pour finaliser l'inscription de {{child_prenom}} au stage de seconde à Epitech. Mail envoyé sur {{email}}. - Epitech {{campus}}",
  },
];

/**
 * Populate the default broadcast templates, CREATE-ONLY: insert each by its
 * unique `seedKey` only when missing (`skipDuplicates`), and never rewrite one
 * that already exists: a prod copy may have been hand-tuned and a re-seed must
 * not revert it. `createdById` authors the rows it creates. Only ever inserts the
 * seeded rows; admin-authored templates (null `seedKey`) are untouched. Returns
 * the number of default broadcast templates.
 */
export async function seedBroadcastTemplates(
  prisma: PrismaClient,
  createdById: string,
): Promise<number> {
  await prisma.messageTemplate.createMany({
    data: BROADCAST_TEMPLATE_DEFAULTS.map((t) => ({
      seedKey: t.seedKey,
      name: t.name,
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      createdById,
    })),
    skipDuplicates: true,
  });
  return BROADCAST_TEMPLATE_DEFAULTS.length;
}
