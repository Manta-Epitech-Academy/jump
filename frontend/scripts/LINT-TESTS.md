# lint-tests.ts — Vérification des conventions de test

Script TypeScript qui vérifie automatiquement que les fichiers de test respectent les conventions définies dans [TESTING.md](../TESTING.md).

## Usage

```bash
npx tsx scripts/lint-tests.ts
```

Le script retourne un code de sortie `0` si tout est OK (warnings autorisés), `1` si des erreurs sont trouvées.

## Règles vérifiées

| #   | Règle                                                                                                           | Sévérité | Référence TESTING.md                        |
| --- | --------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| 1   | `*.test.ts` doit être dans `src/`, pas dans `tests/`                                                            | Erreur   | §4 — Structure des Dossiers                 |
| 2   | `*.integration.test.ts` doit être dans un dossier `__integration__/`                                            | Erreur   | §3.2 — Tests d'Intégration                  |
| 3   | `*.spec.ts` doit être dans `tests/e2e/`                                                                         | Erreur   | §3.3 — Tests E2E                            |
| 4   | Les `it()`/`test()` doivent commencer par `'should'` (unit/integration uniquement)                              | Erreur   | §5 — Nommage des tests                      |
| 5   | Pas de `it.skip()`, `describe.skip()` ni `test.skip()`                                                          | Erreur   | §11 — Processus quand un Test ne Passe Plus |
| 6   | Tests unit/integration importent depuis `vitest`, E2E depuis `@playwright/test`                                 | Erreur   | §2 — Stack de Tests                         |
| 7   | Tests unit/integration contiennent un `describe()`                                                              | Erreur   | §5 — Nommage des tests                      |
| 8   | Tests d'intégration contiennent un `afterEach()` pour le cleanup                                                | Erreur   | §3.2 — Règles                               |
| 9   | Pas d'URL de production ou staging dans les fichiers de test (connexions Postgres prod, domaines Epitech, etc.) | Erreur   | §3.2 — Règles                               |
| 10  | Les tests substantiels (3+ statements) utilisent les commentaires `// Arrange`, `// Act`, `// Assert`           | Erreur   | §5 — Structure AAA                          |
| 11  | Chaque `it()`/`test()` contient au moins un `expect()`                                                          | Erreur   | —                                           |
| 12  | Pas de `console.log()`/`console.debug()`/`console.info()` dans les tests                                        | Warning  | —                                           |

## Quand le lancer ?

- **Avant de commit** des fichiers de test
- **Après avoir fait écrire des tests par Claude** pour vérifier qu'il n'a pas halluciné sur les conventions

## Exemple de sortie

```
► Nommage et emplacement des fichiers de test
  ✓ Nommage et emplacement des fichiers de test
► Les it()/test() commencent par "should" (unit/integration uniquement)
  ✗ src/lib/utils/date.test.ts:12 — it('returns formatted date') doit commencer par 'should'
► Pas de console.log() dans les tests
  ⚠ src/lib/utils/date.test.ts:8 — console.log() dans un test — probablement un oubli de debug

✗ 1 erreur(s) et 1 warning(s). Voir TESTING.md pour les conventions.
```

## Limites connues

- **AAA** — Le comptage d'accolades pour délimiter les blocs peut se tromper sur des template literals contenant `{` ou `}`. Cas rare.
- **`expect()` obligatoire** — Ne détecte pas les `expect` dans des fonctions helper appelées depuis le test (ex: `assertStudentExists(id)`). Peut générer des faux positifs sur des tests qui externalisent leurs assertions.
- **Commentaires inline** — `isComment()` ne gère pas les commentaires en fin de ligne (`const x = 1 // postgres://user@prod-db.epitech.eu/db`). La règle 9 pourrait donc signaler une URL dans un commentaire inline — en pratique ce n'est pas un problème.
- **Pas de parsing AST** — Le script utilise des regex, pas un vrai parser TypeScript. Pour des cas complexes (multiline, nested templates), un outil basé sur `@typescript-eslint` serait plus fiable, mais pas nécessaire au stade actuel du projet.
