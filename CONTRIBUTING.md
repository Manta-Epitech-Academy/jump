# Contribuer à Jump

Ce document formalise la façon dont on construit une feature sur Jump — du besoin
du PO au merge. Objectif : qu'une tâche puisse être confiée à quelqu'un d'autre
que Mateo, avec le même niveau de qualité.

Voir aussi : [`JARGON.md`](./JARGON.md) pour le vocabulaire partagé,
[`CLAUDE.md`](./CLAUDE.md) pour les directives techniques.

---

## Philosophie

**Cleanest, not quickest.** On ne cherche pas le raccourci. On cherche la solution
la plus propre, modulaire, et maintenable — même si ça prend plus de temps. Un
hotfix local ou un doublon de composant qui « fait le job » est un anti-pattern
ici.

**Modularité avant optimisation.** On n'optimise pas en avance de phase. Le code
doit d'abord être clair et découpé ; on optimise seulement quand un besoin mesurable
le justifie.

**DRY partout.** Pas de répétitions dans le code, pas de répétitions dans la doc.
Si quelque chose est vrai à deux endroits, il doit vivre à un seul.

---

## Pipeline d'une feature

### Étape 0 — Cadrage PO

Avant d'écrire quoi que ce soit : un échange avec le PO pour capter la vision, le
besoin utilisateur, et les règles métier. Ses idées d'implémentation sont de la
matière à challenger, pas des spécifications. On part du besoin, pas de la solution.

### Étape 1 — User Stories dans l'Issue GitHub

On exprime le besoin sous forme de User Stories dans l'item GitHub Projects. Format
simple :

```
En tant que [rôle], je veux [action] afin de [bénéfice].
```

Chaque story est accompagnée de ses critères d'acceptation (`Si X, alors Y`). Le PO
relit et valide avant qu'on passe à l'étape suivante. C'est le contrat : si la story
est validée et qu'on l'a bien réalisée, c'est bon.

Les critères d'acceptation servent directement de base aux tests (unitaires,
intégration, E2E).

### Étape 2 — Plan fonctionnel (contexte sans code)

Avant d'ouvrir une branche, on génère un plan fonctionnel avec l'assistant IA. Ce
plan décrit :

- le contexte métier et les règles décidées
- les entités et flux concernés
- les risques et cas limites identifiés
- ce qui est explicitement hors scope

**Pas de snippets de code à cette étape.** L'objectif est de s'assurer qu'on a bien
compris le besoin avant de coder.

Ce plan est copié dans la description de l'item GitHub Projects (ou en commentaire)
pour servir de trace en cas de post-mortem : si quelque chose déraille, on peut
remonter à l'origine — besoin mal exprimé, plan mal interprété, ou simple bug
d'implémentation.

> 💡 **Conseil prompt IA :** Au début d'un cadrage, préciser à l'assistant
> *"On est en phase de brainstorming, ne génère aucun code pour l'instant"* force
> une réflexion d'architecture propre avant de passer à l'exécution.

### Étape 3 — Plan d'exécution technique

Le plan technique détaillé (schéma DB, signatures de fonctions, migrations, ordre
des phases) est généré localement dans `docs/plans/` et référencé dans l'item
GitHub. Ce dossier est gitignored : les plans sont éphémères, ils guident
l'implémentation puis vivent dans l'item GitHub.

### Étape 4 — Branche et implémentation

On branche depuis `dev` (ou `main` selon le projet au moment du travail — voir la
section Branches ci-dessous).

```bash
git checkout dev && git pull origin dev
git checkout -b feat/nom-court-descriptif
```

Pendant l'implémentation :
- Refacto et util partagé si le code existe ailleurs — jamais de duplication locale.
- Le PO est impliqué au fil de l'eau (screenshots, questions) : un aller-retour tôt
  vaut mieux qu'une feature à refaire.
- Si une décision technique change par rapport au plan, on l'acte dans l'item.

### Étape 5 — Gate technique

Avant tout commit ou PR :

```bash
cd "$(git rev-parse --show-toplevel)/frontend"
bun run check   # 0 erreur, 0 warning TypeScript/Svelte
bun run lint    # Prettier
bun run test    # Tests unitaires
```

Pour les branches avec des changements de schéma, s'assurer que la migration est
nommée proprement et squashée (une seule migration nette par branche — voir
[`CLAUDE.md`](./CLAUDE.md#prisma-migrations)).

### Étape 6 — Revue visuelle et Definition of Done

Avant d'ouvrir la PR, passer la checklist :

- [ ] **Technique :** `check` 0/0, `lint` OK, migration nommée et squashée
- [ ] **Conventions de l'espace :** arrondis, couleurs de titres, disposition des
      boutons ; dialog carré (dev) vs arrondi (talent) ; `cursor-pointer` partout ;
      réutilisation des composants existants (ex : inscrits)
- [ ] **Cible utilisateur :**
  - Admin = stats/pratique, pas de fioritures
  - Dev = sobre, pas de tiers XP ni confetti
  - Talent = chaleureux, ludique, `tu`
- [ ] **Copie :** `vous` staff / `tu` talent, pas de jargon dev dans l'UI, pas
      d'em-dash (`—`)
- [ ] **Pas de jargon ambigu** : un terme qu'on utilise entre nous ne ressort pas
      tel quel à l'écran
- [ ] **Responsive :** testé sur son écran, un laptop moyen, un smartphone
- [ ] **Contrôles de liste longue :** campus / lycées / listes typables →
      `SearchableSelect`, jamais un `<select>` basique
- [ ] **Pas de doublon d'UI :** réutiliser un composant existant plutôt que d'en
      créer un presque identique
- [ ] **Décisions métier saines :** aucune décision technique ne casse un besoin
      réel (ex : rate-limit par IP sur un réseau partagé par un campus entier)

### Étape 7 — PR, self-review, merge

1. Commits en Conventional Commits (`feat(scope): sujet ≤ 72 chars`).
2. Utiliser le skill `/ship` pour générer la copie de commit et de PR dans `.ship/`.
3. Ouvrir la PR en **draft** d'abord.
4. Self-review : relire son propre diff comme si c'était celui d'un autre.
5. Passer en ready, assigner un reviewer si disponible.
6. Merge dans `dev` une fois approuvé (ou auto-merge si on est en solo).

---

## Branches

On utilise `dev` comme branche d'intégration courante. Chaque feature branche
depuis `dev` et y revient après validation. `main` = production stable.

Nommage des branches :

| Type              | Préfixe           | Exemple                           |
| ----------------- | ----------------- | --------------------------------- |
| Nouvelle feature  | `feat/`           | `feat/sf-member-status`           |
| Correctif         | `fix/`            | `fix/emargement-export`           |
| Refactoring       | `refactor/`       | `refactor/retire-event-type`      |
| Documentation     | `docs/`           | `docs/contributing-and-jargon`    |

---

## Review d'une PR

On commence par rejouer les cases du **Test Plan** dans le body de la PR. Si ça
ne se reproduit pas, on s'arrête là.

Ensuite, la Definition of Done ci-dessus appliquée au diff. Points particulièrement
importants à vérifier en review :

- **Le besoin métier tient** : relire les User Stories de l'item et vérifier que
  l'implémentation y répond exactement — ni plus, ni moins.
- **Les migrations** : nommées, une seule nette, backfill en SQL si besoin.
- **La copie** : vous/tu selon le lecteur, pas de jargon, pas d'em-dash.
- **Les conventions de l'espace** : cible, arrondis, cursor-pointer, composants
  réutilisés.

---

## Travailler avec l'IA

**Capacités natives de l'agent** (disponibles sans configuration, utilisables
dans n'importe quel projet) :

| Commande   | Usage                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| `/plan`    | Recherche le codebase, produit un plan d'implémentation et attend l'approbation avant d'exécuter |
| `/review`  | Relit un diff ou une PR, identifie les points critiques, propose des corrections |

> 💡 Au début d'un cadrage avec `/plan`, préciser *"On est en phase de
> brainstorming, ne génère aucun code pour l'instant"* force une réflexion
> d'architecture propre avant de passer à l'exécution.

**Skills custom du repo** (`.claude/skills/`) — encodent la façon de faire
propre à Jump, reproductibles par tous les devs du projet :

| Skill               | Usage                                                           |
| ------------------- | --------------------------------------------------------------- |
| `/ship`             | Génère la copie de commit + PR dans `.ship/`, prête à coller   |
| `/align-migrations` | Range les migrations après un merge conflictuel                 |
| `/database-design`  | Cadrage d'un modèle de données avant de coder                  |

L'utilisation de l'IA est encouragée mais reste un choix personnel. Ce document
décrit le pipeline ; l'IA est un outil parmi d'autres pour l'exécuter.

