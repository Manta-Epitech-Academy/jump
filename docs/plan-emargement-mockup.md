# Plan : Refonte page Emargement (cockpit pedago)

## Contexte

La page "Cockpit" de l'espace Pedago (`/staff/pedago/events/[id]/cockpit/[activityId]`) permet aux mantas de gerer l'emargement des talents pendant un stage. Un mockup a ete produit pour repenser cette page. Ce plan decrit les modifications a apporter pour aligner le cockpit actuel sur le mockup, tout en conservant les fonctionnalites metier existantes.

**Mockup de reference** : `/tmp/jump-mockup/Jump Dev-new_edition/direction-a.jsx` (fonction `ScreenA_Presence`, lignes 468-545)

---

## Ce qui change

### 1. Layout : cards vers tableau

- Le cockpit passe d'une liste verticale de cards (`CockpitStudentCard`) a un tableau
- Colonnes dans l'ordre : #, Inscrit, Lycee, Statut, Emargement, Actions
- **#** : numero de ligne (01, 02, 03...)
- **Inscrit** : avatar + nom complet
- **Lycee** : nom du lycee (via `school.nom` ou `highSchoolNameManual`)
- **Statut** : chip colore (Present = vert, Excuse = jaune, Absent = orange)
- **Emargement** : 3 boutons (Present / Excuse / Absent)
- **Actions** : menu pour les fonctionnalites avancees (retard, verdict, etc.)

### 2. Ajout du statut "Excuse"

- Migration Prisma : ajouter une valeur au modele de presence
- 3 etats possibles au lieu de 2 : Present / Excuse / Absent
- Les 3 boutons d'emargement par ligne correspondent a ces 3 etats
- Impact sur la logique `syncEventPresence()` : un talent "excuse" est-il considere present pour le XP ? (proposition : non, seul "present" donne le XP)

### 3. Ajout colonne Lycee

- Inclure la relation `talent.school` dans la query du cockpit
- Afficher `school.nom` ou `highSchoolNameManual` en fallback
- Affichage en texte compact (tronquer le prefixe "Lycee ")

### 4. Bouton "Tout valider"

- Ajouter un bouton "Tout valider" dans le header du cockpit
- Action serveur qui marque tous les participants comme "Present" en une transaction
- Le bouton QR emargement n'est pas inclus dans ce plan (ticket separe)

### 5. Compteurs resume dans le header

- Remplacer ou completer les KPI actuels par un resume compact : X present, Y excuse, Z absent
- Aligne sur le mockup qui montre ces compteurs a cote du selecteur de jour

---

## Ce qui ne change pas

- La page Hub (`/staff/pedago/events/[id]/presences/`) reste telle quelle (overview des creneaux par jour avec cards)
- Le routing : hub -> cockpit par activite
- Le signalement de retard (menu 5m / 10m / 15m / 30m / 45m / 60m)
- Les verdicts et context tags
- Les alertes d'aide (quand un talent demande de l'aide)
- Les swipe gestures sur mobile
- Le focus mode
- La synchronisation XP transactionnelle (`syncEventPresence`)
- La navigation prev/next entre slots (`CockpitSlotNav`)
- La recherche et les filtres (nom, statut, niveau)

---

## Fichiers concernes

| Fichier | Action | Lignes actuelles |
|---------|--------|-----------------|
| `prisma/schema.prisma` | Migration : ajouter enum ou champ pour statut "excuse" | - |
| `cockpit/[activityId]/+page.svelte` | Refacto layout cards -> tableau, ajouter bouton "Tout valider" | 489 |
| `cockpit/[activityId]/+page.server.ts` | Ajouter query school, action "tout valider", gerer statut excuse | 372 |
| `cockpit/[activityId]/components/CockpitStudentCard.svelte` | Supprimer ou transformer en composant ligne de tableau | 604 |
| `cockpit/[activityId]/components/CockpitSlotNav.svelte` | Pas de modification | 75 |
| `src/lib/domain/presences.ts` | Adapter pour 3 etats (present, excuse, absent) | 263 |
| `presences/components/PresencesHeader.svelte` | Adapter les compteurs si necessaire | 89 |

**Fichiers non modifies** : la page Hub (presences/+page.svelte, SlotCard, SlotDayGroup, SlotStatusBadge)

---

## Etapes d'implementation

### Etape 1 : Migration Prisma - statut "Excuse"
- Ajouter le support du statut "excuse" au schema Prisma
- Creer la migration
- Adapter `src/lib/domain/presences.ts` pour gerer les 3 etats
- Adapter `syncEventPresence()` : "excuse" ne donne pas de XP

### Etape 2 : Query school dans le cockpit
- Modifier la query du cockpit (`+page.server.ts`) pour inclure `talent.school`
- S'assurer que le fallback `highSchoolNameManual` fonctionne

### Etape 3 : Refacto layout - cards vers tableau
- Transformer le cockpit de cards verticales en tableau
- Colonnes : #, Inscrit, Lycee, Statut, Emargement, Actions
- Les 3 boutons d'emargement (Present / Excuse / Absent) remplacent le toggle actuel
- Deplacer les fonctionnalites avancees (retard, verdict, alertes) dans le menu Actions
- Conserver les swipe gestures et le focus mode

### Etape 4 : Bouton "Tout valider"
- Ajouter le bouton dans le header du cockpit
- Creer l'action serveur qui marque tous les participants presents en transaction
- Le bouton doit respecter les memes gardes d'autorisation que les actions existantes

### Etape 5 : Compteurs resume
- Ajouter les compteurs "X present, Y excuse, Z absent" dans le header du cockpit
- Remplacement ou complement des KPI actuels

### Etape 6 : Verification
- `bun run check` (pas de nouvelles erreurs de type)
- `bun run lint` (formatting OK)
- `bunx prisma migrate dev` (migration OK)
- Test manuel : se connecter en staff pedago, ouvrir le cockpit d'une activite du stage en cours
- Verifier le tableau avec les 3 colonnes ajoutees (#, Lycee, Statut)
- Verifier les 3 boutons d'emargement (Present / Excuse / Absent)
- Verifier le bouton "Tout valider"
- Verifier les compteurs resume
- Verifier que retard, verdicts et alertes d'aide fonctionnent toujours
- Verifier que le XP se synchronise correctement (present = XP, excuse/absent = pas de XP)
