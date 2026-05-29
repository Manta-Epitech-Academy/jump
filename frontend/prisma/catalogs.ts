/**
 * Reference catalogues shared by both seed entry points.
 *
 * Single source of truth for the prod-relevant reference catalogues:
 *   - talent interests (`Interest`)
 *   - default transactional email templates + their action mappings
 *     (`MessageTemplate` + `EmailActionMapping`)
 *   - default broadcast templates staff pick in the broadcast composer
 *     (`MessageTemplate`, anchored by `seedKey`, no action mapping)
 *
 * `seed.ts` (full local seed, run by `prisma db seed`) and `seed-catalogs.ts`
 * (narrow re-runnable prod catalogue refresh) both import from here, so the
 * data can never drift between them. Edit a body once, in this file.
 *
 * STANDALONE RULE (mirrors seed.ts): this module must depend only on `node:*`,
 * npm packages, and `@prisma/client`. It ships inside `prisma/` alongside the
 * seeds, so a relative sibling import (`./catalogs`) resolves in the deploy /
 * migration environments where `src/` and the `$lib` alias are absent.
 *
 * These writes are idempotent upserts (no wipe of their own), so the two
 * seeders differ only in how they resolve the template author: the full seed
 * already holds a seeded superdev, the narrow refresh looks one up. Both pass
 * their own client in (each seed script owns a distinct PrismaClient, so there
 * is no shared singleton to thread).
 */

import type { BroadcastChannel, PrismaClient } from '@prisma/client';

// ─── Interests catalogue ───

/** Tech-leaning interests. Order within the array is the displayed order. */
export const INTEREST_TECH: { nom: string; emoji: string }[] = [
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
 * Idempotently sync the interests catalogue: upsert each entry by its unique
 * `nom`, creating it when missing and refreshing emoji/kind/order in place when
 * present. Existing `interestId`s stay stable, so the `TalentInterest` rows a
 * student selected survive a re-run.
 *
 * Deliberately does NOT prune rows absent from the catalogue: the `Interest`
 * table is shared with admin-added interests (`/staff/admin/interests`), so a
 * blanket delete would wipe their additions and cascade away the student
 * selections hanging off them. Removing a default that was dropped from the
 * catalogue is therefore a manual/migration step, not this function's job.
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
  for (const it of catalogue) {
    await prisma.interest.upsert({
      where: { nom: it.nom },
      create: it,
      update: { emoji: it.emoji, kind: it.kind, order: it.order },
    });
  }
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

/**
 * Idempotently sync the default templates. For each `actionKey`: if a mapping
 * already exists, refresh the template it points to in place (keeping its `id`
 * stable, so any `Broadcast` referencing it keeps working); otherwise create
 * the template and its mapping. Only ever touches templates wired to a known
 * `actionKey`. Admin-authored broadcast templates (which carry no action
 * mapping) and the rest of the shared `MessageTemplate` table are left
 * untouched. `createdById` (the `MessageTemplate.createdById` FK author) is
 * applied to newly created rows only, never reassigned on refresh. Needs no
 * prior wipe. Returns the number of default templates.
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
    if (existing) {
      await prisma.messageTemplate.update({
        where: { id: existing.templateId },
        data: {
          name: t.name,
          channel: 'mail',
          subject: t.subject,
          body: t.body,
        },
      });
    } else {
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
  }
  return EMAIL_TEMPLATE_DEFAULTS.length;
}

// ─── Broadcast templates ───

/**
 * Default broadcast templates: free-standing `MessageTemplate` rows staff pick
 * (and may tweak) in the broadcast composer. Unlike the transactional defaults
 * above, these carry no `EmailActionMapping`: nothing sends them automatically,
 * a staff member fires them as a one-off broadcast. Each is keyed by a stable
 * `seedKey` (see the schema field) so re-seeding refreshes the same row instead
 * of duplicating on a non-unique `name`.
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
 * Idempotently sync the default broadcast templates: upsert each by its unique
 * `seedKey`, refreshing name/channel/subject/body in place when present so the
 * row `id` stays stable (any `Broadcast` already built from it keeps working).
 * `createdById` authors newly created rows only, never reassigned on refresh.
 * Only ever touches the seeded rows; admin-authored templates (null `seedKey`)
 * are left untouched. Returns the number of default broadcast templates.
 */
export async function seedBroadcastTemplates(
  prisma: PrismaClient,
  createdById: string,
): Promise<number> {
  for (const t of BROADCAST_TEMPLATE_DEFAULTS) {
    await prisma.messageTemplate.upsert({
      where: { seedKey: t.seedKey },
      create: {
        seedKey: t.seedKey,
        name: t.name,
        channel: t.channel,
        subject: t.subject,
        body: t.body,
        createdById,
      },
      update: {
        name: t.name,
        channel: t.channel,
        subject: t.subject,
        body: t.body,
      },
    });
  }
  return BROADCAST_TEMPLATE_DEFAULTS.length;
}
