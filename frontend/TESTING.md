# Politique de Tests — Epitech Intra Lycéens

> Stack : SvelteKit · TypeScript · Vitest · Playwright · Supabase

---

## 1. Philosophie

Les tests ne sont pas une contrainte — ils sont le filet de sécurité qui permet de refactorer et de livrer sereinement. Ce document définit **ce qu'on teste, comment, et comment on maintient cette qualité dans le temps**.

Trois principes directeurs :
- **Un test = un comportement**, pas une fonction
- **Les tests doivent être lisibles** — un test qui échoue doit expliquer ce qui s'est cassé sans avoir à lire le code
- **Un test lent ou fragile est pire qu'un test absent** — on préfère moins de tests, fiables, que beaucoup de tests qui flappent

---

## 2. Stack de Tests

| Outil | Usage |
|-------|-------|
| **Vitest** | Tests unitaires et d'intégration |
| **Playwright** | Tests E2E |
| **@testing-library/svelte** | Rendu de composants Svelte |

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
import { describe, it, expect } from 'vitest'
import { validateEmail, validateAge } from './validation'

describe('validateEmail', () => {
  it('should accept a valid email address', () => {
    expect(validateEmail('alice@lycee-victor-hugo.fr')).toBe(true)
  })

  it('should reject an email without a domain', () => {
    expect(validateEmail('alice@')).toBe(false)
  })

  it('should reject an empty string', () => {
    expect(validateEmail('')).toBe(false)
  })
})

describe('validateAge', () => {
  it('should flag a minor under 15 as requiring parental consent', () => {
    const result = validateAge(new Date('2015-01-01'))
    expect(result.requiresParentalConsent).toBe(true)
  })

  it('should not require parental consent for a student aged 16', () => {
    const birthDate = new Date()
    birthDate.setFullYear(birthDate.getFullYear() - 16)
    const result = validateAge(birthDate)
    expect(result.requiresParentalConsent).toBe(false)
  })
})
```

---

### 3.2 Tests d'Intégration — Vitest (20%)

**Ce qu'on teste :**
- Les services métier qui interagissent avec la DB
- Le wrapper DB (adaptateur Supabase)
- Les interactions entre plusieurs services

**Ce qu'on ne teste PAS ici :**
- L'UI
- Le comportement interne des bibliothèques tierces

**Règles :**
- Utiliser une instance Supabase de test dédiée — jamais la production, jamais le staging
- Nettoyer les données après chaque test (`afterEach`)
- Les tests d'intégration sont suffixés `.integration.test.ts` et placés dans un dossier `__integration__`

**Exemple :**
```typescript
// src/lib/services/__integration__/student.service.integration.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { studentService } from '../student.service'
import { testDb } from '../../db/test-adapter'

afterEach(async () => {
  await testDb.cleanup('students')
})

describe('studentService.create', () => {
  it('should create a student and retrieve them by id', async () => {
    const created = await studentService.create({
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@test.fr',
    })

    const found = await studentService.getById(created.id)
    expect(found?.email).toBe('alice@test.fr')
  })

  it('should throw if the email is already taken', async () => {
    await studentService.create({ email: 'duplicate@test.fr' })

    await expect(
      studentService.create({ email: 'duplicate@test.fr' })
    ).rejects.toThrow('EMAIL_ALREADY_EXISTS')
  })
})
```

---

### 3.3 Tests E2E — Playwright (10%)

**Ce qu'on teste :**
- Les parcours utilisateur critiques de bout en bout
- Uniquement les flux qui valent le coût d'un test E2E

**Parcours prioritaires (dans cet ordre) :**

| Priorité | Parcours | Statut |
|----------|----------|--------|
| Critique | Login and logout | À faire |
| Critique | Student registration for an event | À faire |
| Critique | Internship creation by a staff member | À faire |
| Haute | View registered participants list | À faire |
| Haute | Automatic logout on expired token | À faire |

**Ce qu'on ne teste PAS en E2E :**
- Les cas d'erreur (couverts par les unitaires, moins coûteux)
- Les détails d'affichage (CSS, couleurs)
- Les fonctionnalités secondaires

**Exemple :**
```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test('a staff member can log in and access the dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[data-testid="email"]', 'staff@epitech.eu')
  await page.fill('[data-testid="password"]', process.env.TEST_STAFF_PASSWORD!)
  await page.click('[data-testid="submit"]')

  await expect(page).toHaveURL('/dashboard')
  await expect(page.locator('h1')).toContainText('Dashboard')
})

test('a student cannot access the staff dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[data-testid="email"]', 'student@test.fr')
  await page.fill('[data-testid="password"]', process.env.TEST_STUDENT_PASSWORD!)
  await page.click('[data-testid="submit"]')

  await expect(page).not.toHaveURL('/dashboard')
})
```

---

## 4. Structure des Dossiers

```
src/
└── lib/
    ├── services/
    │   ├── student.service.ts
    │   ├── student.service.test.ts             ← unit tests, next to the source file
    │   └── __integration__/
    │       └── student.service.integration.test.ts
    ├── utils/
    │   ├── validation.ts
    │   └── validation.test.ts
    └── db/
        ├── supabase.adapter.ts
        └── supabase.adapter.test.ts

tests/
└── e2e/                                        ← all Playwright tests
    ├── auth.spec.ts
    ├── registration.spec.ts
    └── fixtures/                               ← shared test data and helpers
        └── users.ts
```

### Pourquoi les tests unitaires sont co-localisés avec le code source ?

Les tests unitaires (`*.test.ts`) vivent **à côté du fichier qu'ils testent**, et non dans un dossier `tests/` séparé. C'est la convention recommandée par Vitest et la majorité des projets SvelteKit/Vite pour plusieurs raisons :

- **Proximité = maintenabilité** — quand on modifie un fichier, le test correspondant est juste à côté. Pas besoin de naviguer dans une arborescence miroir.
- **Imports simplifiés** — les imports relatifs sont courts (`./validation` au lieu de `../../../src/lib/utils/validation`), ce qui réduit la fragilité face aux refactors.
- **Détection des fichiers non testés** — un fichier sans `.test.ts` à côté de lui est immédiatement visible. Dans un dossier `tests/` séparé, les oublis passent inaperçus.
- **Convention de l'écosystème** — c'est la convention recommandée par SvelteKit qui précise : *"your unit tests will live in the `src` directory with a `.test.js` extension"* ([Project structure - SvelteKit docs](https://svelte.dev/docs/kit/project-structure)). Pour un argumentaire détaillé des avantages (navigation, imports simplifiés, visibilité des fichiers non testés), voir [Co-locate Your Unit Tests - Yockyard](https://www.yockyard.com/post/co-locate-unit-tests/).

> Seuls les tests E2E (Playwright) vivent dans `tests/e2e/` car ils ne sont pas liés à un fichier source spécifique mais à des parcours utilisateur complets.

**Règles de nommage :**
- Tests unitaires : `*.test.ts` au côté du fichier testé
- Tests d'intégration : `*.integration.test.ts` dans un dossier `__integration__`
- Tests E2E : `*.spec.ts` dans `tests/e2e/`

---

## 5. Conventions d'Écriture

### Structure AAA — Arrange / Act / Assert

Tout test suit cette structure, sans exception :

```typescript
it('should reject registration when the event is full', async () => {
  // Arrange
  const event = await createTestEvent({ maxParticipants: 1 })
  await registrationService.register(event.id, 'student-1')

  // Act
  const result = registrationService.register(event.id, 'student-2')

  // Assert
  await expect(result).rejects.toThrow('EVENT_FULL')
})
```

### Nommage des tests

- `describe` : nom du module ou de la classe testée
- `describe` imbriqué : nom de la méthode ou fonctionnalité
- `it` : phrase commençant par **"should"**, décrivant le comportement attendu

```typescript
// ✅ Good
it('should return null if the student does not exist')
it('should throw if the email is already in use')
it('should require parental consent for students under 15')

// ❌ Avoid
it('test getById')
it('error case')
it('works correctly')
```

### Ce qu'on mock et ce qu'on ne mock pas

| ✅ À mocker | ❌ Ne pas mocker |
|------------|-----------------|
| Accès base de données (en unitaire) | La logique qu'on teste |
| Appels HTTP externes | Les utilitaires purs |
| Horloge système (`Date.now`) | Les validateurs |
| Générateurs d'ID | Les transformateurs de données |

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

```bash
# All unit tests
npm run test

# Unit tests in watch mode (development)
npm run test:watch

# Tests with coverage report
npm run test:coverage

# Integration tests only
npm run test:integration

# E2E tests (requires app + Supabase to be running)
npm run test:e2e

# E2E tests in UI mode (debug)
npm run test:e2e:ui
```

### Fichiers de configuration

| Fichier | Rôle |
|---------|------|
| `vitest.config.ts` | Configure Vitest avec deux projets : **unit** (tous les `*.test.ts` dans `src/`) et **integration** (les `*.integration.test.ts` dans les dossiers `__integration__/`). Exclut les tests E2E qui sont gérés par Playwright. |
| `playwright.config.ts` | Configure Playwright pour les tests E2E. Pointe sur `tests/e2e/`, lance automatiquement le serveur de dev si besoin, et utilise Chromium par défaut. |
| `docker-compose.test.yml` | Lance une **base de données Postgres Supabase isolée** sur le port `54322`, dédiée aux tests d'intégration. Elle permet de taper sur une vraie DB sans jamais toucher à celle de dev ou de prod. Chaque lancement donne une instance propre qu'on peut remplir, vider et détruire sans risque. |
| `.env.test.example` | Modèle à copier en `.env.test` (qui est gitignored). Documente toutes les variables d'environnement nécessaires pour lancer les tests d'intégration et E2E (URL Supabase, clés, credentials des users de test). Aucun secret dedans — les vrais mots de passe sont à renseigner localement. |

### Prérequis pour les tests d'intégration et E2E

```bash
# Start the test Supabase instance (separate port from dev/production)
docker-compose -f docker-compose.test.yml up -d

# Make sure test environment variables are configured
cp .env.test.example .env.test
```

---

## 8. Objectifs de Couverture

| Scope | Objectif | Priorité |
|-------|----------|----------|
| `src/lib/services/` | ≥ 80% | Critique |
| `src/lib/utils/` | ≥ 90% | Haute |
| `src/lib/db/` | ≥ 70% | Critique |
| Global | ≥ 60% | Normale |

> La couverture est un indicateur, pas un objectif en soi. Un test inutile qui gonfle la couverture est contre-productif. Mieux vaut 60% de vrais tests que 90% de tests qui vérifient que `1 + 1 === 2`.

---

## 9. Tests en CI

Chaque Pull Request déclenche automatiquement dans l'ordre :

```
lint → svelte-check → test → test:coverage → build → test:e2e
```

**Une PR ne peut pas être mergée si un de ces steps échoue.**

---

## 10. Processus quand un Test ne Passe Plus

### Si le test échoue en CI sur ta branche

1. **Ne pas ignorer** — ne jamais utiliser `it.skip()` pour contourner un test cassé
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

1. Créer immédiatement un ticket avec les labels `test-broken` + `priority:high`
2. Utiliser le template suivant :

```markdown
## Broken test report

**File:** src/lib/services/student.service.test.ts
**Test:** "should return null if the student does not exist"

## Observed behavior
<!-- Paste the CI error message here -->

## Expected behavior
The test should pass.

## Context
- Since which commit does the test fail?
- Which recent PR might have caused this?

## Impact
Does this broken test block merges on main? Yes / No
```

3. Si le test cassé bloque les merges sur `main`, le hotfix est priorisé sur toutes les autres tâches
4. Ne jamais merger du code qui casse un test existant sans validation du Lead Qualité

---

## 11. Ressources

- [Vitest — Documentation officielle](https://vitest.dev)
- [Playwright — Documentation officielle](https://playwright.dev)
- [@testing-library/svelte](https://testing-library.com/docs/svelte-testing-library/intro)
