# Relance semi-auto onboarding incomplet

**Date:** 2026-04-29
**Status:** Approved

## Contexte

L'onboarding des étudiants Epitech Academy comporte 3 étapes :

1. **Info validation** — l'étudiant renseigne ses infos personnelles et celles de son parent
2. **Signature règlement/charte** — l'étudiant signe le règlement intérieur (génère un PDF)
3. **Droit à l'image** — le parent se connecte et signe le droit à l'image (génère un PDF)

Quand un étudiant ou un parent ne complète pas ses étapes, le staff doit relancer manuellement. Ce ticket ajoute un outil semi-automatique de relance dans l'espace Dev.

## Design

### Nouvelle page : `/staff/dev/reminders/`

Page accessible uniquement aux `superdev` (groupe `devLead`).

**Tableau des onboardings incomplets** avec colonnes :

- Nom / Prénom de l'étudiant
- Campus
- Étapes complétées (info validée, règlement signé, droit à l'image) — icônes vert/ambre
- Email parent (si droit à l'image manquant)
- Date de dernière relance envoyée
- Checkbox de sélection

**Filtres :**

- Par étape manquante : étudiant (info ou règlement) / parent (droit à l'image) / les deux
- Par campus

**Actions :**

- Sélection individuelle ou "tout sélectionner"
- Bouton "Envoyer les relances" (gated `devLead`)
- Dialog de confirmation avant envoi indiquant le nombre de destinataires

### Emails de relance

Deux templates distincts envoyés via Resend :

**Template étudiant** (`sendStudentReminderEmail`) :

- Destinataire : email de l'étudiant
- Objet : "Finalise ton inscription sur Jump"
- Contenu : rappel des étapes restantes + lien vers `/onboarding`
- Cas d'usage : `infoValidatedAt` ou `rulesSignedAt` est null

**Template parent** (`sendParentReminderEmail`) :

- Destinataire : `parentEmail` du Talent
- Objet : "Signez le droit à l'image de {prénom enfant}"
- Contenu : rappel de l'importance de la signature + lien vers `/parent/login`
- Cas d'usage : `imageRightsSignedAt` est null et `parentEmail` est renseigné

### Tracking des relances

Nouveau modèle Prisma `OnboardingReminder` :

```prisma
model OnboardingReminder {
  id        String   @id @default(cuid())
  talentId  String
  type      String   // "student" | "parent"
  sentAt    DateTime @default(now())
  sentBy    String   // staffProfile userId
  talent    Talent   @relation(fields: [talentId], references: [id])

  @@index([talentId])
}
```

Relation inverse ajoutée sur le modèle `Talent` : `reminders OnboardingReminder[]`.

**Garde-fou anti-spam :** pas de relance si la dernière a été envoyée il y a moins de 3 jours pour le même type (student/parent).

### Contrôle d'accès

- **Route** : gatée via `STAFF_ROLE_GATES` pour le groupe `devLead`
- **Sidebar** : lien visible uniquement pour `superdev` via `<Gated group="devLead">`
- **Action serveur** : `requireStaffGroup(locals, 'devLead')` sur l'action d'envoi

### Fichiers impactés

| Fichier                                                  | Changement                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `prisma/schema.prisma`                                   | Ajout modèle `OnboardingReminder` + relation sur `Talent`               |
| `src/lib/server/otp.ts`                                  | Ajout fonctions `sendStudentReminderEmail` et `sendParentReminderEmail` |
| `src/routes/(staff)/staff/dev/reminders/+page.server.ts` | Page server : chargement des talents incomplets + action d'envoi        |
| `src/routes/(staff)/staff/dev/reminders/+page.svelte`    | UI : tableau, filtres, sélection, bouton relance                        |
| Sidebar Dev                                              | Ajout lien "Relances" gated `devLead`                                   |
| `src/lib/server/auth/guards.ts`                          | Ajout gate route `/staff/dev/reminders`                                 |

## Hors scope

- Relances automatiques (cron) — à envisager dans un second temps
- Relances par SMS
- Personnalisation des templates par le staff
