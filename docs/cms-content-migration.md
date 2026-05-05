# Migration contenu activités : Markdown → HTML (Tiptap)

## Contexte

Le champ `content` des activités statiques est passé d'un format **markdown brut** (textarea) à du **HTML** (éditeur WYSIWYG Tiptap). Cette migration concerne les données du seed et les rendus frontend.

## Fichiers modifiés

### 1. Seed — conversion automatique à la persistance

**Fichier :** `frontend/prisma/seed.ts`

Le seed convertit maintenant le markdown en HTML via `marked.parse()` au moment de l'écriture en base (ligne ~2361). Les 6 templates statiques concernés :

| Template | Ligne (approx) | Campus |
|----------|----------------|--------|
| Les métiers de la tech | 730 | Global |
| Pause déjeuner | 786 | Global |
| Restitution finale | 810 | Global |
| Visite du campus Epitech Paris | 862 | Paris |
| Rencontre alumni Lyon | 910 | Lyon |
| Atelier partenaires Marseille | 961 | Marseille |

### 2. Rendus frontend — suppression du double-parsing

Les fichiers suivants appelaient `renderMarkdown()` sur le champ `content` qui est désormais déjà du HTML. Ils affichent maintenant le contenu directement via `{@html}` :

| Fichier | Changement |
|---------|-----------|
| `src/lib/components/events/planning/ActivityPreviewDialog.svelte` | `renderMarkdown(activity.content)` → `activity.content` |
| `src/routes/(talent)/[activityId]/+page.svelte` | `renderMarkdown(data.activity.content)` → `data.activity.content` |
| `src/routes/(staff)/staff/pedago/catalogue/[templateId]/+page.svelte` | `renderMarkdown(template.content)` → `template.content` |
| `src/routes/(staff)/staff/pedago/catalogue/[templateId]/practice/+page.svelte` | `renderMarkdown(template.content)` → `template.content` |

### 3. Éditeurs — Textarea → CmsEditor (Tiptap WYSIWYG)

| Fichier | Composant |
|---------|-----------|
| `src/routes/(staff)/staff/admin/templates/+page.svelte` | Formulaire création/édition template |
| `src/lib/components/events/planning/EditActivityDialog.svelte` | Dialog modification activité (planning) |
| `src/lib/components/events/planning/AssignActivityDialog.svelte` | Dialog création manuelle (planning) |

## Note

Les steps dynamiques (`content_markdown` dans `contentStructure` JSON) restent en markdown et continuent d'utiliser `renderMarkdown()`. Seul le champ `content` des activités/templates statiques est affecté.
