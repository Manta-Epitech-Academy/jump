# Fil d'actualite talent

Remplacer le message de bienvenue unique (`CmsPage` slug=welcome) par un fil d'actualites : plusieurs posts riches, auteurs, avec expiration automatique a 14 jours.

## Schema DB

Renommer `CmsPage` -> `NewsPost` via `ALTER TABLE`. Nouveaux champs, champs supprimes :

```
model NewsPost {
  id          String        @id @default(cuid())
  campusId    String?                          // null = cross-campus (admin)
  eventId     String?                          // null = actu globale
  authorId    String                           // FK StaffProfile
  title       String
  content     String        @db.Text           // HTML riche (TipTap)
  publishedAt DateTime      @default(now())
  expiresAt   DateTime                         // publishedAt + 14j
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  campus      Campus?       @relation(fields: [campusId], references: [id])
  event       Event?        @relation(fields: [eventId], references: [id], onDelete: SetNull)
  author      StaffProfile  @relation(fields: [authorId], references: [id], onDelete: SetNull)

  @@index([campusId, publishedAt])
  @@index([eventId])
}
```

Champs supprimes par rapport a `CmsPage` : `slug`, `updatedBy` (remplace par `authorId`).
Champs ajoutes : `campusId`, `authorId`, `title`, `publishedAt`, `expiresAt`, `createdAt`.
`eventId` passe de required a optionnel (actu globale possible).
`onDelete` de `eventId` passe de Cascade a SetNull (une actu survit a la suppression de l'event).
La contrainte `@@unique([slug, eventId])` est supprimee (plus de slug).

## Migration

1. `ALTER TABLE "CmsPage" RENAME TO "NewsPost"`
2. Ajouter les nouvelles colonnes (`campusId`, `authorId`, `title`, `publishedAt`, `expiresAt`, `createdAt`)
3. Backfill : pour chaque row existante, remplir `campusId` depuis `Event.campusId`, `authorId` depuis `updatedBy` (via la FK bauth_user -> StaffProfile), `title` = 'Message de bienvenue', `publishedAt` = `updatedAt`, `expiresAt` = null (les anciens messages ne sont pas soumis a l'expiration), `createdAt` = `updatedAt`
4. Rendre `authorId` NOT NULL, dropper `slug`, `updatedBy`
5. Dropper la contrainte unique `slug_eventId`, ajouter les nouveaux index
6. Rendre `eventId` nullable

## Feature flag

Renommer `staff_welcome_page` -> `news_feed` dans `FEATURE_FLAGS`. Meme kind `rollout`, `defaultEnabled: false`. Mettre a jour toutes les references dans le code et les rows `CampusFeatureFlag` en DB.

## Tokens

Les tokens existants (`{{PRENOM}}`, `{{NOM}}`, `{{CAMPUS}}`, `{{EMAIL_CAMPUS}}`, `{{STAGE}}`) continuent de fonctionner. `{{STAGE}}` n'est resolu que si le talent a une participation active ; sinon il est remplace par une chaine vide.

## Permissions

| Role | Peut creer | Scope |
|---|---|---|
| devMember (superdev, dev) | Oui | campus du staff |
| admin | Oui | un campus cible OU cross-campus (campusId=null) |

Tous les devMembers peuvent creer/editer/supprimer les actus de leur campus. Les admins peuvent tout voir et gerer.

## Routes

### Espace dev

**`/staff/dev/contenu/actus`** (renomme depuis `/staff/dev/contenu/welcome`)

- Liste des actus du campus du staff, plus recentes en haut
- Bouton "Nouvelle actualite" : ouvre l'editeur CMS existant (CmsEditor/TipTap)
- Chaque actu : titre, date, auteur, preview du contenu, boutons edit/supprimer
- L'editeur reutilise le CmsEditor existant + un champ titre + eventuellement un select event (optionnel)
- Gate : `news_feed` flag + `devMember`

### Espace admin

**`/staff/admin/actus`** (renomme depuis `/staff/admin/welcome-pages`)

- Liste de toutes les actus, toutes campuses confondues
- Filtre par campus (dropdown) + vue "Tous" par defaut
- Trie par date (plus recentes en haut)
- L'admin peut creer une actu cross-campus (campusId=null) ou ciblee sur un campus
- Gate : admin role

### Espace pedago

**`/staff/pedago/contenu/welcome`** : a evaluer si on le transforme aussi ou si on le supprime. Les pedago n'avaient pas ete mentionnes dans le brief comme auteurs d'actus. Pour cette iteration, on supprime l'acces pedago a l'edition ; ils voient le resultat cote talent si besoin.

### Espace talent

**Dashboard `/`**

- Card "Actualites" : preview clamp de la derniere actu non expiree visible par le talent
- Si pas d'actu : le card n'est pas affiche (comme aujourd'hui)
- Lien "Voir tout" mene a `/actus`

**Page `/actus`**

- Liste en colonne unique, plus recentes en haut
- Chaque actu : titre, date, auteur, preview clamp
- Clic sur une actu : dialog responsive avec le contenu complet (meme pattern que le "Lire le message" actuel)
- Un talent voit : les actus de son campus + les actus cross-campus (campusId=null)
- Les actus avec `expiresAt < now()` ne sont pas affichees (sauf si expiresAt=null pour les migrees)

## Composants reutilises

- `CmsEditor.svelte` : editeur TipTap existant, reutilise tel quel
- `WelcomeMessageBody.svelte` : renommer en `NewsPostBody.svelte`, meme logique ({@html content} dans un container prose)
- `NewsFeedCard.svelte` : adapter pour afficher la derniere actu du fil au lieu du welcome
- `CmsImage` : table inchangee, les images inline restent gerees par le meme systeme (upload S3 + GC)

## Composants nouveaux

- `NewsPostCard.svelte` : card individuelle dans la liste `/actus` (titre, date, auteur, preview)
- `NewsPostList.svelte` : liste verticale de NewsPostCard

## Nettoyage

- Supprimer la route `/staff/pedago/contenu/welcome`
- Renommer les fichiers/imports de "welcome" a "news" / "actus" la ou c'est pertinent
- `sweepOrphanCmsImages` : adapter pour referencer `NewsPost.content` au lieu de `CmsPage.content`
- `renderWelcomeMessage` dans `domain/welcomeMessage.ts` : renommer en `renderNewsPost` ou similaire

## Hors scope

- Notifications push/email quand une actu est publiee
- Brouillons / publication differee
- Commentaires / reactions
- Pieces jointes (hors images inline)
