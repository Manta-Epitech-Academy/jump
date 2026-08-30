# lint-tests.ts : Vérification des conventions de test

Script TypeScript qui vérifie que les fichiers de test respectent les conventions
définies dans [TESTING.md](../TESTING.md).

## Usage

```bash
bun run lint:tests
```

Code de sortie `0` si tout est OK (les warnings sont tolérés), `1` si des erreurs
sont trouvées. **Le script tourne dans le job CI `Lint & Type Check`**, qui est un
check requis : chaque règle ci-dessous bloque donc un merge.

C'est ce câblage qui a décidé du contenu du script. Une règle n'a sa place ici que
si sa violation laisse passer quelque chose de faux. Voir « Règles retirées » plus
bas : quatre règles cosmétiques ou peu fiables sortaient 638 findings sur du code
délibéré, et un script qui crie sans arrêt n'est pas un garde, c'est du bruit qu'on
apprend à ignorer.

## Règles vérifiées

| #   | Règle                                                                           | Sévérité | Ce que sa violation laisse passer                                                                              |
| --- | ------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `*.test.ts` doit être dans `src/`, pas dans `tests/`                            | Erreur   | Un fichier hors du glob vitest : le test n'est jamais exécuté et personne ne le remarque                       |
| 2   | `*.integration.test.ts` doit être dans un dossier `__integration__/`            | Erreur   | Idem, mais pire : le test part dans le projet `unit`, qui n'a pas de base de données                           |
| 3   | `*.spec.ts` doit être dans `tests/e2e/`                                         | Erreur   | Un fichier que Playwright ne ramasse pas                                                                       |
| 4   | Pas de `.skip()` / `.only()` / `.todo()` sur un `it`, `test` ou `describe`      | Erreur   | Un test désactivé et une CI verte. `.only` est le plus discret : il désactive tous les AUTRES tests du fichier |
| 5   | Toute suite `*.integration.test.ts` appelle `assertTestDatabase()`              | Erreur   | Une suite qui écrit ses fixtures dans la base de dev : les worktrees partagent un Postgres                     |
| 6   | Tests unit/integration importent depuis `vitest`, E2E depuis `@playwright/test` | Erreur   | Un fichier lancé par le mauvais runner                                                                         |
| 7   | Tests unit/integration contiennent un `describe()`                              | Erreur   | Un rapport d'échec sans contexte                                                                               |
| 8   | Pas d'URL de production ou staging dans les fichiers de test                    | Erreur   | Un test qui tape sur la prod                                                                                   |
| 9   | Pas de `console.log()`/`console.debug()`/`console.info()` dans les tests        | Warning  | Un oubli de debug (bruit, pas un faux positif)                                                                 |

## Règles retirées quand le script a été câblé en CI

| Règle                                              | Pourquoi elle est partie                                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Préfixe `it('should …')`                           | 396 findings. La codebase écrit ses tests en phrases (`'refuses a batch'`), ce qui se lit mieux dans un rapport d'échec. La convention avait perdu contre la pratique.      |
| Commentaires `// Arrange` / `// Act` / `// Assert` | 242 findings. De la ponctuation, et le délimiteur de bloc (comptage d'accolades plafonné à 50 lignes) se perd dans un gros littéral objet.                                  |
| « Au moins un `expect()` par test »                | Même délimiteur, donc mêmes faux positifs : 2 tests parfaitement assertifs signalés. Une vraie version demanderait un parser TypeScript.                                    |
| « `afterEach()` obligatoire en intégration »       | 20 findings, tous faux : les suites créent leur fixture en `beforeAll` et nettoient en `afterAll`, ce qui est correct pour une fixture partagée par les tests d'un fichier. |

## Quand le lancer ?

- Avant de commit des fichiers de test, ou via `bun run verify` qui l'inclut
- Après avoir fait écrire des tests par un agent : c'est le garde qui attrape un
  `it.skip()` posé pour « débloquer » la suite

## Limites connues

- **Pas de parsing AST.** Le script est en regex, et c'est assumé : aucune règle
  restante ne dépend de la structure d'un bloc de test. Les règles qui en
  dépendaient sont celles qui ont été retirées.
- **Deux formes acceptées pour la règle 5.** L'appel dans un hook
  (`beforeAll(async () => { assertTestDatabase(); ... })`) et la référence passée
  au hook (`beforeAll(assertTestDatabase)`). Les deux tournent réellement ; la
  simple présence du nom, elle, ne prouve rien et ne passe plus.
- **Commentaires en fin de ligne.** `isComment()` ne gère pas
  `const x = 1 // postgres://user@prod-db…`, donc la règle 8 pourrait signaler une
  URL dans un commentaire inline. En pratique ça n'arrive pas.
