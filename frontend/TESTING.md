# Politique de Tests — Epitech Intra Lycéens

> Stack : SvelteKit · TypeScript · Vitest · Playwright · Prisma · PostgreSQL · BetterAuth

---

## 1. Philosophie

Les tests ne sont pas une contrainte — ils sont le filet de sécurité qui permet de refactorer et de livrer sereinement. Ce document définit **ce qu'on teste, comment, et comment on maintient cette qualité dans le temps**.

Trois principes directeurs :

- **Un test = un comportement**, pas une fonction
- **Les tests doivent être lisibles** — un test qui échoue doit expliquer ce qui s'est cassé sans avoir à lire le code
- **Un test lent ou fragile est pire qu'un test absent** — on préfère moins de tests, fiables, que beaucoup de tests qui flappent

---

## 2. Stack de Tests

| Outil          | Usage                            |
| -------------- | -------------------------------- |
| **Vitest**     | Tests unitaires et d'intégration |
| **Playwright** | Tests E2E                        |

Il n'y a pas de bibliothèque de rendu de composants, et c'est cohérent : §3.1 dit
de ne pas tester les composants Svelte. `@testing-library/svelte` figurait ici
sans être installé.

---

## 3. Pyramide de Tests

```
           /\
          /E2E\          Playwright — full user journeys (10%)
         /------\
        / Integr. \      Vitest — services + DB interactions (20%)
       /------------\
      /    Unit      \   Vitest — business logic, utils, schemas (70%)
     /________________\
```

### 3.1 Tests Unitaires — Vitest (70%)

**Ce qu'on teste :**

- Fonctions utilitaires (`utils/`)
- Validation des schémas et des entrées
- Transformations de données
- Gestion des erreurs dans les services
- Logique métier pure (calculs, règles métier)

**Ce qu'on ne teste PAS ici :**

- Les composants Svelte (trop fragiles, peu de valeur)
- Les appels réseau réels
- La configuration

**Exemple :**

```typescript
// src/lib/utils/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateEmail, validateAge } from './validation';

describe('validateEmail', () => {
  it('should accept a valid email address', () => {
    expect(validateEmail('alice@lycee-victor-hugo.fr')).toBe(true);
  });

  it('should reject an email without a domain', () => {
    expect(validateEmail('alice@')).toBe(false);
  });

  it('should reject an empty string', () => {
    expect(validateEmail('')).toBe(false);
  });
});

describe('validateAge', () => {
  it('should flag a minor under 15 as requiring parental consent', () => {
    const result = validateAge(new Date('2015-01-01'));
    expect(result.requiresParentalConsent).toBe(true);
  });

  it('should not require parental consent for a student aged 16', () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 16);
    const result = validateAge(birthDate);
    expect(result.requiresParentalConsent).toBe(false);
  });
});
```

---

### 3.2 Tests d'Intégration — Vitest (20%)

**Ce qu'on teste :**

- Les services métier qui interagissent avec la DB
- Le client Prisma et les services qui l'utilisent
- Les interactions entre plusieurs services

**Ce qu'on ne teste PAS ici :**

- L'UI
- Le comportement interne des bibliothèques tierces

**Règles :**

- Suffixés `.integration.test.ts`, dans un dossier `__integration__`. Le nom et
  l'emplacement décident du projet vitest qui les ramasse, donc un fichier mal
  placé part dans le projet `unit`, qui n'a pas de base de données.
- **Appeler `assertTestDatabase()` avant d'écrire quoi que ce soit.** C'est la
  garde qui refuse un `DATABASE_URL` qui ne désigne pas une base de test, et elle
  est vérifiée par `bun run lint:tests`. Les worktrees de la machine partagent un
  Postgres, donc « le mauvais `DATABASE_URL` » est un accident réaliste.
- **Nettoyer ce qu'on a créé, en scopant par id.** `afterAll` avec des ids
  capturés en `beforeAll` est la forme normale ici (fixture partagée par les tests
  du fichier) ; `afterEach` convient quand chaque test crée les siennes. Ce qui
  n'est pas négociable, c'est le scope : un `deleteMany` par préfixe de nom
  supprimerait les fixtures d'un autre fichier.
- **Ne pas compter sur l'isolation entre fichiers pour l'ordre.** Le projet
  `integration` tourne un fichier à la fois (`fileParallelism: false` dans
  `vitest.config.ts`), parce que plusieurs suites lisent un agrégat plus large que
  leur propre fixture.

**Exemple** (la forme réelle des suites de ce repo) :

```typescript
// src/lib/server/services/__integration__/student.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { studentService } from '../studentService';

describe('studentService (integration)', () => {
  // Un discriminant par run : les fixtures d'un fichier ne doivent jamais
  // pouvoir collisionner avec celles d'un autre.
  const stamp = Date.now();
  let campusId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: { name: `Test Campus ${stamp}` },
    });
    campusId = campus.id;
  });

  afterAll(async () => {
    try {
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore - la base de test est jetable
    }
  });

  it('crée un talent rattaché au campus', async () => {
    const created = await studentService.create({ campusId, nom: 'Martin' });

    const found = await prisma.talent.findUnique({ where: { id: created.id } });
    expect(found?.nom).toBe('Martin');
  });
});
```

---

### 3.3 Tests E2E — Playwright (10%)

**Ce qu'on teste :**

- Les parcours utilisateur critiques de bout en bout
- Uniquement les flux qui valent le coût d'un test E2E

**Ce que couvre la suite, et pourquoi ces parcours-là :**

| Spec                        | Ce qu'elle prouve                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `staff-guards.spec.ts`      | La matrice inter-espaces : dev refoulé de l'admin, admin renvoyé de l'espace dev, talent renvoyé sur son dashboard, anonyme envoyé au bon login avec `?redirect=` intact |
| `talent-onboarding.spec.ts` | La porte d'onboarding tient dans les deux sens : dossier vierge poussé dans le tunnel, dossier complet non renvoyé en arrière                                            |
| `parent-flow.spec.ts`       | Le prédicat « ce responsable doit-il encore quelque chose » (`parentBlockedWhere`) décide de la destination                                                              |
| `emargement.spec.ts`        | Le seul parcours **mutant** : un membre dev marque une présence et l'état revient de la base après rechargement                                                          |

Le critère de sélection est le même partout : ce qui n'est vérifiable qu'au
travers du serveur réel. Les gardes vivent dans `hooks.server.ts` et pas dans une
page, donc aucun test unitaire ne les voit ; l'écriture d'émargement traverse
garde, scoping campus, module, superforms, transaction et projection, et seul un
navigateur touche la couture entre les six.

**Ce qu'on ne teste PAS en E2E :**

- Les cas d'erreur (couverts par les unitaires, moins coûteux)
- Les détails d'affichage (CSS, couleurs)
- Les fonctionnalités secondaires
- Les règles métier vérifiables contre la base : elles sont en intégration, où
  elles coûtent 100 fois moins cher (§3.2)

**Authentification : `/api/test/login-as`, pas l'UI de login.**

Le staff se connecte par OAuth Microsoft et les talents par OTP email, et une
suite headless ne peut walker ni l'un ni l'autre. Plutôt qu'un second backdoor,
la suite réutilise `/api/test/login-as`, qui existe déjà pour le driver de charge :
il insère une ligne `bauth_session` et signe le cookie comme `better-call`, donc
`auth.api.getSession()` le relit exactement comme un vrai login. L'endpoint
répond 404 tant que `LOAD_TEST_SECRET` n'est pas posé côté serveur, et seul
l'environnement E2E le pose pour son serveur jetable.

`tests/e2e/auth.setup.ts` est un **setup project** Playwright (pas un
`globalSetup` : seul le premier est garanti de tourner avec le `webServer` déjà
levé, et minter une session est un appel HTTP à ce serveur). Il sème la base puis
écrit un `storageState` par rôle dans `tests/e2e/.auth/`. Chaque spec déclare son
identité avec `test.use({ storageState: storageStatePath(...) })`, ce qui met le
rôle dans le titre du `describe` plutôt que dans une config à part.

**Pas de `data-testid`.** Il n'y en a aucun dans la codebase et il n'y en aura pas
pour les tests : les composants exposent déjà des rôles et des libellés français
visibles, qui sont ce qu'un humain voit. Un sélecteur accessible teste donc l'UI
telle qu'elle est utilisée, et ne se périme pas quand le balisage bouge.

**Exemple :**

```typescript
// tests/e2e/staff-guards.spec.ts
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.describe("un membre de l'espace dev", () => {
  test.use({ storageState: storageStatePath(E2E.dev.email) });

  test("est refoulé de l'espace admin", async ({ page }) => {
    await page.goto('/staff/admin');
    await expect(page).toHaveURL((url) => url.pathname === '/staff/login');
  });
});
```

**Les fixtures** vivent dans `tests/e2e/fixtures/` :

| Fichier         | Rôle                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identities.ts` | Qui la suite est (six comptes sous `@e2e.invalid`, ids littéraux) et où chaque session est stockée. Sans Prisma, parce que `playwright.config.ts` l'importe |
| `db.ts`         | Le client Prisma des fixtures, derrière `assertTestDatabase()` — la même garde que l'intégration, pas une copie                                             |
| `seed.ts`       | La purge et la reconstruction. Volontairement pas `prisma/seed.ts` : 3000 lignes de jeu de démo, auxquelles une spec ne doit pas être accrochée             |

---

## 4. Structure des Dossiers

```
src/
└── lib/
    ├── domain/
    │   ├── xp.ts
    │   └── xp.test.ts                          ← unitaire, à côté du fichier testé
    └── server/
        └── services/
            ├── onboardingService.ts
            └── __integration__/                ← vraie base de données
                ├── testDatabase.ts             ← assertTestDatabase(), la garde
                └── onboardingService.integration.test.ts

tests/
└── e2e/                                        ← Playwright
    ├── auth.setup.ts                           ← sème + minte un storageState par rôle
    ├── staff-guards.spec.ts
    ├── talent-onboarding.spec.ts
    ├── parent-flow.spec.ts
    ├── emargement.spec.ts
    ├── .auth/                                  ← généré, gitignored
    └── fixtures/
        ├── identities.ts                       ← les six comptes, sans Prisma
        ├── db.ts                               ← client Prisma derrière la garde
        └── seed.ts                             ← purge + reconstruction
```

**Règles de nommage :**

- Tests unitaires : `*.test.ts` à côté du fichier testé
- Tests d'intégration : `*.integration.test.ts` dans un dossier `__integration__`
- Tests E2E : `*.spec.ts` dans `tests/e2e/`

Ces trois règles décident quel runner ramasse quel fichier, donc un fichier mal
nommé n'est pas mal rangé : il ne tourne pas. C'est pour ça que
`bun run lint:tests` les vérifie et bloque.

### Pourquoi les tests unitaires sont co-localisés avec le code source ?

Les tests unitaires (`*.test.ts`) vivent **à côté du fichier qu'ils testent**, et non dans un dossier `tests/` séparé. C'est la convention recommandée par Vitest et la majorité des projets SvelteKit/Vite pour plusieurs raisons :

- **Proximité = maintenabilité** — quand on modifie un fichier, le test correspondant est juste à côté. Pas besoin de naviguer dans une arborescence miroir.
- **Imports simplifiés** — les imports relatifs sont courts (`./validation` au lieu de `../../../src/lib/utils/validation`), ce qui réduit la fragilité face aux refactors.
- **Détection des fichiers non testés** — un fichier sans `.test.ts` à côté de lui est immédiatement visible. Dans un dossier `tests/` séparé, les oublis passent inaperçus.
- **Convention de l'écosystème** — c'est la convention recommandée par SvelteKit qui précise : _"your unit tests will live in the `src` directory with a `.test.js` extension"_ ([Project structure - SvelteKit docs](https://svelte.dev/docs/kit/project-structure)). Pour un argumentaire détaillé des avantages (navigation, imports simplifiés, visibilité des fichiers non testés), voir [Co-locate Your Unit Tests - Yockyard](https://www.yockyard.com/post/co-locate-unit-tests/).

> Seuls les tests E2E (Playwright) vivent dans `tests/e2e/` car ils ne sont pas liés à un fichier source spécifique mais à des parcours utilisateur complets.

---

## 5. Conventions d'Écriture

Rien dans cette section n'est vérifié par un script, et c'est délibéré : ce sont
des conventions de lecture, pas des invariants. Ce qui bloque un merge est en
§9, et la liste y est courte exprès.

### Nommage des tests

- `describe` : nom du module ou de la fonction testée
- `describe` imbriqué : le cas ou la facette
- `it` : une phrase qui décrit le COMPORTEMENT, à l'indicatif, sans préfixe

```typescript
// ✅ Ce que la codebase écrit
it('refuses a batch of MCP calls');
it('counts only the talents Jump shows');
it('withholds the relative gap on a rate');

// ❌ À éviter
it('test getById');
it('error case');
it('works correctly');
```

Pas de préfixe `should`. Ce document l'a exigé longtemps, et `lint-tests.ts` l'a
vérifié : 396 findings, c'est-à-dire la suite entière. La convention avait perdu
contre la pratique, et la pratique avait raison, parce que c'est la phrase brute
qui se lit dans un rapport d'échec (`✗ refuses a batch of MCP calls`). La règle a
été retirée du script en même temps que cette exigence d'ici ; voir
[scripts/LINT-TESTS.md](scripts/LINT-TESTS.md), « Règles retirées ».

### Arrange, Act, Assert

La forme est utile et la plupart des tests la suivent naturellement :

```typescript
it('refuses a second registration when the event is full', async () => {
  const event = await createTestEvent({ maxParticipants: 1 });
  await registrationService.register(event.id, 'student-1');

  const result = registrationService.register(event.id, 'student-2');

  await expect(result).rejects.toThrow('EVENT_FULL');
});
```

Une ligne vide entre les trois temps suffit. Les commentaires `// Arrange`,
`// Act`, `// Assert` ne sont ni exigés ni souhaités : sur un test de trois
lignes ils sont de la ponctuation, et les exiger produisait 242 findings sur du
code parfaitement clair. Ce qui compte est qu'un test couvre **un** comportement,
ce qui rend les trois temps lisibles sans les annoter.

### Ce qu'on mock et ce qu'on ne mock pas

| ✅ À mocker                         | ❌ Ne pas mocker               |
| ----------------------------------- | ------------------------------ |
| Accès base de données (en unitaire) | La logique qu'on teste         |
| Appels HTTP externes                | Les utilitaires purs           |
| Horloge système (`Date.now`)        | Les validateurs                |
| Générateurs d'ID                    | Les transformateurs de données |

---

## 6. Priorités de Tests

### Critique — À couvrir en premier

- Authentication (login, logout, expired token, unauthorized access)
- Route guards (access without role, access with wrong role)
- Input validation (emails, dates, required fields)
- DB wrapper (create, read, update, delete on main entities)

### Haute — À couvrir en semaine 2-3

- Business services (`studentService`, `eventService`, `internshipService`)
- Data transformations between layers
- Error handling propagated to the UI

### Normale — À couvrir progressivement

- Reusable Svelte components (forms, lists)
- Secondary utilities
- Edge cases on already-covered services

---

## 7. Lancer les Tests

**Une seule commande reproduit le gate de la CI :**

```bash
bun run verify
```

C'est le contrat de ce document. `verify` enchaîne exactement ce que les checks
requis exécutent, dans le même ordre, avec les mêmes scripts : `lint:scripts`,
`lint`, `lint:design`, `lint:tests`, `check`, `test`, `test:integration`,
`test:schema-drift`, `test:e2e`. Un agent (ou un humain) peut donc produire du
code, le vérifier, corriger et revérifier avant d'ouvrir la PR, et « j'ai
vérifié » devient une affirmation que quelqu'un d'autre peut recontrôler.

Les maillons, quand on veut n'en jouer qu'un :

```bash
# Unitaires (dont le contrat de tokens DESIGN.md). Pas de base de données.
bun run test
bun run test:watch          # mode watch
bun run test:coverage       # + rapport de couverture

# Intégration : provisionne la base de test, applique les migrations, puis lance
bun run test:integration
bun run test:db             # provisionne seulement

# Le schéma correspond-il à sa trace de migrations ?
bun run test:schema-drift

# E2E : provisionne la base, build, lève le serveur, pilote Chromium
bun run test:e2e
bun run test:e2e:ui         # mode debug
```

### Prérequis : il n'y en a qu'un

```bash
cp .env.test.example .env.test    # une fois par worktree
```

Le reste est automatique. `scripts/with-test-db.sh` est le point d'entrée de tout
ce qui a besoin d'une vraie base : il démarre le conteneur, crée la base, applique
les migrations, puis lance la commande. Il n'y a plus de `docker compose up` ni de
`prisma migrate deploy` à faire à la main.

### Une base par worktree, et une par suite

Le script dérive le nom de la base : `jump_test` dans le checkout principal,
`jump_test_<nom-du-worktree>` ailleurs, plus un suffixe `_e2e` pour la suite
Playwright. Un seul conteneur, plusieurs bases.

Il dérive **aussi le port** du serveur E2E, du même discriminant, et exporte le
`ORIGIN` qui va avec (BetterAuth le lit comme base URL). C'est la même isolation
un cran plus haut, et il manquait : le port était écrit en dur dans
`.env.test.example`, donc chaque worktree copiait le même `4173`, et
`reuseExistingServer` rendait la collision silencieuse. Le deuxième worktree
trouvait 4173 qui répondait, sautait son build, et faisait tourner ses specs
contre le build et la base du premier. Comme tous les ids de fixture sont des
littéraux, les deux graines se ressemblent et le run passe au vert contre du code
qui n'a jamais été compilé. Le port est maintenant par worktree, et
`reuseExistingServer` est à `false` : le cas résiduel (deux worktrees dont les
noms tombent sur le même offset) échoue à l'ouverture du socket, ce qui se lit en
une ligne.

**Par worktree**, parce que c'était un vrai problème et pas une précaution : les
worktrees partageaient l'unique base `jump_test`, donc un `migrate deploy` lancé
depuis une branche laissait la suite de toutes les autres rouge contre un schéma
pour lequel elle n'avait jamais été écrite, sans que rien ne le dise.

**Par suite**, parce que les cycles de vie des données sont incompatibles. La
fixture E2E est semée une fois et doit survivre à tout le run Playwright ; une
suite d'intégration nettoie par fichier. Et plusieurs assertions d'intégration
lisent volontairement un agrégat **à l'échelle de la plateforme** (les
interdictions de droit à l'image en vigueur sont précisément le chiffre qu'aucun
filtre ne restreint), donc un talent laissé par la fixture E2E élargit
silencieusement leur dénominateur. Ce n'est pas un défaut de scoping de
l'agrégat : ce sont deux cycles de vie dans une même base, la même erreur que les
worktrees, un cran plus bas. Le garde a trouvé celle-là tout seul, au premier
`bun run verify` complet.

Deux détails qui trompent, et que le script gère à votre place :

- **`prisma.config.ts` charge `../.env`**, celui du dépôt, qui pointe sur la base
  de dev. Un `DATABASE_URL` déjà posé dans l'environnement gagne (dotenv n'écrase
  pas), mais seulement s'il est posé APRÈS. C'est pour ça que le script exporte le
  sien en dernier, et pour ça que `.env.test` ne contient pas de `DATABASE_URL` :
  il serait silencieusement ignoré.
- **Le conteneur n'est pas jetable à chaque lancement.** L'image postgres déclare
  son propre volume, donc un conteneur arrêté puis relancé revient avec ses
  bases. Seul `docker compose -f docker-compose.test.yml down -v` remet à zéro.

### Fichiers de configuration

| Fichier                         | Rôle                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest.config.ts`              | Deux projets : **unit** (les `*.test.ts` de `src/`, sans base) et **integration** (les `__integration__/*.integration.test.ts`, un fichier à la fois). Fixe aussi `KIT_OUTDIR` pour ne pas écrire dans le `.svelte-kit/` d'un serveur vivant |
| `playwright.config.ts`          | Le projet `setup` (graine + sessions) et le projet `chromium` qui en dépend. Le `webServer` **build et lève le serveur de prod**, avec la même commande en local et en CI, et ne réutilise jamais un serveur qu'il n'a pas démarré           |
| `scripts/with-test-db.sh`       | Le provisionnement, et tout ce qui doit différer d'un worktree à l'autre : conteneur, base, port + `ORIGIN`, migrations. Trois consommateurs (`test:integration`, `test:e2e`, la CI)                                                         |
| `scripts/check-schema-drift.sh` | Compare `schema.prisma` à la base que `migrate deploy` vient de construire                                                                                                                                                                   |
| `docker-compose.test.yml`       | Le Postgres jetable du port `5434`. Ne rien y créer à la main : le script s'en charge                                                                                                                                                        |
| `.env.test.example`             | À copier en `.env.test` (gitignored) : l'environnement du serveur de test (ORIGIN, PORT, secrets jetables). Pas de `DATABASE_URL`, voir plus haut                                                                                            |

---

## 8. Couverture

`bun run test:coverage` produit un rapport. **Ce n'est pas un gate, et ce n'est
pas près de le devenir.**

Un seuil global récompense mécaniquement le volume, ce que la philosophie de ce
repo interdit explicitement (§1, et `AGENTS.md` : « jamais du volume »). La façon
la moins chère de faire monter un pourcentage est d'écrire les tests qui n'attrapent
rien, et un chiffre qui bloque un merge finit toujours par être atteint de la façon
la moins chère.

Ce document a longtemps affiché un tableau d'objectifs (80 % / 90 % / 70 % / 60 %)
que rien n'appliquait. Le tableau est parti : une cible que personne ne mesure et
que personne n'atteint ne dit rien sur le code, elle apprend seulement à ne pas
lire ce fichier.

Ce qui remplace le chiffre, c'est §6 : la liste de ce qui doit être couvert, par
ordre de criticité. « Est-ce que les gardes d'accès ont un test ? » est une
question à laquelle on peut répondre ; « est-ce qu'on est à 60 % ? » ne dit pas
lesquels.

---

## 9. Vérification des conventions

`bun run lint:tests` vérifie que les fichiers de test respectent les règles de ce
document : nommage et emplacement (ce qui décide du runner qui les ramasse),
imports, présence d'un `describe`, absence d'URL de prod, et surtout les deux
règles qui portent tout le reste :

- **aucun test désactivé** (`.skip`, `.only`, `.todo`), parce qu'un test
  désactivé laisse la CI verte en ne vérifiant rien (voir §11) ;
- **toute suite d'intégration appelle `assertTestDatabase()`**, parce que les
  worktrees partagent un Postgres.

Le script tourne dans le job CI `Lint & Type Check`, donc chaque règle bloque un
merge. Pour le détail, et pour les quatre règles cosmétiques retirées quand il a
été câblé, voir [scripts/LINT-TESTS.md](scripts/LINT-TESTS.md).

---

## 10. Tests en CI

Trois jobs dans `.github/workflows/test.yml`, tous trois checks **requis** sur la
règle `push dev` (voir `.github/settings/repo-config.json`) :

| Job                          | Ce qu'il exécute                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| **Lint & Type Check**        | `lint:scripts` (bit exécutable), `lint`, `lint:design`, `lint:tests`, `check`              |
| **Unit & Integration Tests** | `test:coverage`, puis `test:integration` contre un vrai Postgres, puis `test:schema-drift` |
| **E2E Tests**                | build + serveur + les specs Playwright, avec le rapport HTML uploadé en cas d'échec        |

**Une PR ne peut pas être mergée si un de ces jobs échoue** (à une réserve près,
documentée dans `CONTRIBUTING.md` : une exception de bypass sur la règle `push dev`
la contourne, ce qui fait du merge en rouge un acte explicite plutôt que le
comportement par défaut).

> **Ne renommez pas un job.** Les noms ci-dessus sont les contextes requis. Un job
> renommé sort de la liste et cesse silencieusement de bloquer. C'est exactement
> la panne que cette CI a connue : `Unit & Integration Tests` portait ce nom en
> n'exécutant que le projet `unit`, faute de Postgres, et les ~190 tests
> d'intégration ne tournaient nulle part.

---

## 11. Processus quand un Test ne Passe Plus

### Si le test échoue en CI sur ta branche

1. **Ne pas ignorer** — ne jamais utiliser `it.skip()` pour contourner un test cassé. Ce n'est plus seulement une règle écrite : `bun run lint:tests` la refuse, dans un check requis (§9)
2. Analyser le rapport d'erreur dans la CI
3. Identifier si c'est **le code qui est cassé** ou **le test qui est obsolète** :
   - Code cassé → corriger le code
   - Test obsolète (comportement intentionnellement changé) → mettre à jour le test ET documenter pourquoi dans le commit

### Si un test passe en local mais échoue en CI

Causes fréquentes :

- Dépendance à l'ordre d'exécution (les tests doivent être indépendants)
- Variable d'environnement manquante en CI
- Problème de timing / `async` mal géré

### Si un test échoue sur `main` (urgence)

Un test rouge sur `main` est un correctif comme un autre, et il passe par le
protocole de [`CONTRIBUTING.md`](../.github/CONTRIBUTING.md) : ouvrir l'issue avec
le gabarit _Feature_, puis `scripts/start-work.sh --issue <n> --type fix --slug
short-name`. Le critère d'acceptation s'écrit tout seul : le test passe pour la
bonne raison, et la régression reste couverte.

Si c'est assez urgent pour ne pas s'arrêter à l'issue, l'échappatoire est nommée
et non silencieuse : `git push --no-verify`, label `no-issue` sur la PR, et une
section `## Process exception` qui dit pourquoi. C'est exactement le cas pour
lequel elle existe.

Ensuite :

1. Si le test cassé bloque les merges sur `main`, le hotfix est priorisé sur toutes les autres tâches
2. Ne jamais merger du code qui casse un test existant sans validation du Lead Qualité

---

## 12. Ressources

- [Vitest — Documentation officielle](https://vitest.dev)
- [Playwright — Documentation officielle](https://playwright.dev)
