# Mini CMS — Page d'accueil éditable en markdown

**Date:** 2026-04-29
**Statut:** Validé
**Ticket:** Mini CMS - Pages statiques éditables en markdown

## Contexte

Les talents (étudiants) arrivent sur la plateforme sans page d'accueil explicative. Le besoin MVP est d'avoir une page de bienvenue avec du contenu riche éditable par les leads et admins, scopée par campus.

## Périmètre MVP

- Une seule page : `welcome` (accueil talent)
- Contenu scopé par campus
- Éditeur WYSIWYG (Tiptap) pour les leads et admins
- Le modèle DB est extensible (slug-based) pour d'éventuelles futures pages

## Data

### Nouveau modèle Prisma : `CmsPage`

```prisma
model CmsPage {
  id        String   @id @default(cuid())
  slug      String
  campusId  String
  campus    Campus   @relation(fields: [campusId], references: [id])
  content   String   @db.Text
  updatedAt DateTime @updatedAt
  updatedBy String
  user      bauth_user @relation(fields: [updatedBy], references: [id])

  @@unique([slug, campusId])
}
```

- `slug` : identifiant de la page (MVP : uniquement `"welcome"`)
- `content` : HTML sanitisé produit par Tiptap
- `updatedBy` : traçabilité de la dernière modification

### Migration

```
bunx prisma migrate dev --name add_cms_page
```

## Routes

### Lecture — `/(talent)/welcome/+page.svelte`

- Charge `CmsPage` par `slug: "welcome"` + `campusId` du talent connecté
- Si pas de contenu en DB : affiche un message par défaut ("Bienvenue sur la plateforme !")
- Rendu HTML dans un conteneur `prose` (réutilise les styles Notion-like existants dans `layout.css`)
- Page accessible à tous les talents authentifiés

### Édition — `/(staff)/staff/pedago/cms/welcome/+page.svelte` et `/(staff)/staff/dev/cms/welcome/+page.svelte`

Ces deux routes peuvent partager le même composant d'édition.

- **Accès :** `devLead` + `pedaLead` + `admin` (via `requireStaffGroup`)
- **Chargement :** récupère le `CmsPage(slug: "welcome", campusId)` existant ou retourne un contenu vide
- **Éditeur :** Tiptap WYSIWYG avec toolbar
- **Sauvegarde :** form action qui fait un upsert (`CmsPage`) avec le HTML sanitisé via `DOMPurify`
- **Feedback :** toast de confirmation après sauvegarde

## Éditeur WYSIWYG — Tiptap

### Dépendances

```
bun add @tiptap/core @tiptap/pm @tiptap/starter-kit svelte-tiptap
```

`@tiptap/starter-kit` inclut : headings (h1-h3), bold, italic, strike, lists (ordered/unordered), blockquote, code block, horizontal rule, hard break.

Extensions additionnelles si besoin :
- `@tiptap/extension-link` pour les liens
- `@tiptap/extension-image` pour les images (optionnel MVP)
- `@tiptap/extension-placeholder` pour le placeholder

### Composant `CmsEditor.svelte`

- Composant réutilisable dans `src/lib/components/cms/CmsEditor.svelte`
- Props : `content: string` (HTML initial), `onSave: (html: string) => void`
- Toolbar avec boutons iconiques pour chaque action de formatage
- Zone d'édition avec les styles `prose` existants
- Bouton "Enregistrer" en bas

### Sanitisation

Le HTML produit par Tiptap est sanitisé côté serveur avec `DOMPurify` avant stockage en DB. Le rendu côté talent utilise `{@html content}` sur du contenu déjà sanitisé.

## Contrôle d'accès

| Action | Rôles autorisés | Mécanisme |
|--------|----------------|-----------|
| Lire la page welcome | Tous les talents du campus | Auth talent standard |
| Éditer la page welcome | `devLead`, `pedaLead`, `admin` | `requireStaffGroup(locals, 'leads')` + admin check |

## Navigation

- Talent : lien "Accueil" dans la navigation principale pointant vers `/welcome`
- Staff : lien "Page d'accueil" dans le menu du workspace (pedago/dev) sous une section "Contenu" ou similaire

## Styling

Réutilise intégralement le système prose existant :
- Classes `prose` de `@tailwindcss/typography`
- Overrides Notion-like définis dans `layout.css` (headings, tables, code blocks, etc.)
- L'éditeur Tiptap utilise les mêmes classes pour un rendu WYSIWYG fidèle au résultat final

## Limites MVP

- Un seul slug (`welcome`), pas d'interface de création de nouvelles pages
- Pas d'upload d'images (les images peuvent être référencées par URL externe)
- Pas d'historique de versions
- Pas de brouillon/publication — la sauvegarde est immédiate
