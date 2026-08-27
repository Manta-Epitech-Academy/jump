/**
 * lint-tests.ts — Vérifie que les fichiers de test respectent les conventions
 * définies dans TESTING.md.
 *
 * Usage      : bun run lint:tests
 * Exit code  : 0 si tout est OK, 1 si des violations sont trouvées.
 *
 * Ce script tourne dans le job CI `Lint & Type Check`, donc chaque règle ici
 * bloque un merge. C'est ce qui a décidé lesquelles gardent leur place : une
 * règle n'est là que si sa violation laisse passer quelque chose de faux.
 *
 * Quatre règles ont été retirées quand le script a été câblé, parce qu'elles
 * produisaient 638 findings sur du code délibéré ou sur ses propres angles morts
 * (détail dans scripts/LINT-TESTS.md) :
 *
 *   - le préfixe `it('should …')` : la codebase écrit ses tests en phrases
 *     ('refuses a batch'), ce qui se lit mieux dans un rapport d'échec ;
 *   - les commentaires `// Arrange / Act / Assert` : de la ponctuation, et le
 *     délimiteur de bloc (comptage d'accolades plafonné à 50 lignes) se perd
 *     dans un gros littéral objet ;
 *   - « au moins un expect() par test » : même délimiteur, donc mêmes faux
 *     positifs, sur des tests qui assertent parfaitement ;
 *   - « afterEach() obligatoire en intégration » : les vingt suites créent leur
 *     fixture en `beforeAll` et nettoient en `afterAll`, ce qui est correct.
 *
 * Le script est en regex, pas en AST : c'est assumé pour ce qui reste, dont
 * aucune règle ne dépend de la structure du bloc de test.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
let errors = 0;
let warnings = 0;

// ── Helpers ──────────────────────────────────────────────────

const red = (msg: string) => console.log(`\x1b[31m  ✗ ${msg}\x1b[0m`);
const green = (msg: string) => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
const yellow = (msg: string) => console.log(`\x1b[33m  ⚠ ${msg}\x1b[0m`);
const info = (msg: string) => console.log(`\x1b[33m► ${msg}\x1b[0m`);

function fail(msg: string) {
  red(msg);
  errors++;
}

function warn(msg: string) {
  yellow(msg);
  warnings++;
}

function findFiles(dir: string, pattern: RegExp, exclude?: RegExp): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        results.push(...findFiles(fullPath, pattern, exclude));
      } else if (
        pattern.test(entry.name) &&
        (!exclude || !exclude.test(entry.name))
      ) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.warn(
      `\x1b[33m  ⚠ Impossible de lire ${dir}: ${(err as Error).message}\x1b[0m`,
    );
  }
  return results;
}

function rel(path: string): string {
  return relative(ROOT, path);
}

function readLines(path: string): string[] {
  return readFileSync(path, 'utf-8').split('\n');
}

/** Retourne true si la ligne est un commentaire (// ou début de bloc) */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  );
}

/** Collecte tous les fichiers de test (unit + integration + e2e) */
function allTestFiles(): string[] {
  return [
    ...findFiles(join(ROOT, 'src'), /\.test\.ts$/),
    ...findFiles(join(ROOT, 'tests'), /\.spec\.ts$/),
  ];
}

// ── Rules ────────────────────────────────────────────────────

type Rule = {
  name: string;
  check: () => void;
};

const rules: Rule[] = [
  {
    name: 'Nommage et emplacement des fichiers de test',
    check() {
      // Unit tests (*.test.ts mais pas *.integration.test.ts) doivent être dans src/
      const unitInTests = findFiles(
        join(ROOT, 'tests'),
        /\.test\.ts$/,
        /\.integration\.test\.ts$/,
      );
      for (const f of unitInTests) {
        fail(
          `${rel(f)} — un fichier .test.ts ne doit pas être dans tests/ (réservé aux .spec.ts E2E)`,
        );
      }

      // Unit tests ne doivent pas être dans __integration__/
      const unitInSrc = findFiles(
        join(ROOT, 'src'),
        /\.test\.ts$/,
        /\.integration\.test\.ts$/,
      );
      for (const f of unitInSrc) {
        if (f.includes('__integration__')) {
          fail(
            `${rel(f)} — un fichier .test.ts (non integration) ne doit pas être dans __integration__/`,
          );
        }
      }

      // Integration tests doivent être dans __integration__/
      const integrationTests = findFiles(
        join(ROOT, 'src'),
        /\.integration\.test\.ts$/,
      );
      for (const f of integrationTests) {
        if (!f.includes('__integration__/')) {
          fail(
            `${rel(f)} — un fichier .integration.test.ts doit être dans un dossier __integration__/`,
          );
        }
      }

      // E2E tests (*.spec.ts) doivent être dans tests/e2e/
      const allSpecs = findFiles(ROOT, /\.spec\.ts$/);
      for (const f of allSpecs) {
        const r = rel(f);
        if (!r.startsWith('tests/e2e/')) {
          fail(`${r} — un fichier .spec.ts doit être dans tests/e2e/`);
        }
      }

      // Pas de .spec.ts dans src/
      const specsInSrc = findFiles(join(ROOT, 'src'), /\.spec\.ts$/);
      for (const f of specsInSrc) {
        fail(
          `${rel(f)} — un fichier .spec.ts ne doit pas être dans src/ (utiliser .test.ts pour les unitaires)`,
        );
      }
    },
  },

  {
    // La règle qui porte tout le reste. Un test désactivé est un test qui passe
    // au vert sans rien vérifier, et c'est précisément la case de la Definition
    // of Done qui se coche sur parole. `.only` est aussi dangereux que `.skip`
    // et se voit moins : il désactive tous les AUTRES tests du fichier.
    // TESTING.md §11 l'interdit déjà par écrit ; ici c'est bloquant.
    name: 'Pas de .skip() / .only() / .todo() sur un test',
    check() {
      const files = allTestFiles();
      const disabledRegex = /(?:it|describe|test)\.(skip|only|todo)\s*\(/;

      for (const f of files) {
        const lines = readLines(f);
        for (let i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) continue;
          const match = disabledRegex.exec(lines[i]);
          if (match) {
            fail(
              `${rel(f)}:${i + 1} — .${match[1]}() interdit : le test ne vérifie plus rien mais la CI reste verte. Corriger le test ou le code (TESTING.md §11).`,
            );
          }
        }
      }
    },
  },

  {
    // La garde qui empêche une suite d'intégration d'écrire dans la base de dev.
    // Elle existe (`__integration__/testDatabase.ts`) et les vingt suites
    // l'appellent déjà ; sans cette règle, la vingt-et-unième peut l'oublier et
    // rien ne le dira avant qu'elle ait semé des lignes de test dans un vrai
    // cohorte. Les worktrees partagent un Postgres, donc « le mauvais
    // DATABASE_URL » est un accident réaliste, pas théorique.
    name: "Les suites d'intégration appellent assertTestDatabase()",
    check() {
      const tests = findFiles(join(ROOT, 'src'), /\.integration\.test\.ts$/);
      for (const f of tests) {
        const content = readFileSync(f, 'utf-8');
        if (!content.includes('assertTestDatabase')) {
          fail(
            `${rel(f)} — doit appeler assertTestDatabase() (beforeAll ou beforeEach) avant d'écrire quoi que ce soit`,
          );
        }
      }
    },
  },

  {
    name: 'Imports corrects (vitest pour unit/integration, @playwright/test pour E2E)',
    check() {
      // Unit & integration → vitest
      const vitestTests = findFiles(join(ROOT, 'src'), /\.test\.ts$/);
      for (const f of vitestTests) {
        const content = readFileSync(f, 'utf-8');
        if (
          !content.includes("from 'vitest'") &&
          !content.includes('from "vitest"')
        ) {
          fail(`${rel(f)} — doit importer depuis 'vitest'`);
        }
        if (content.includes('@playwright/test')) {
          fail(
            `${rel(f)} — ne doit pas importer depuis '@playwright/test' (c'est un test vitest)`,
          );
        }
      }

      // E2E → @playwright/test
      const e2eTests = findFiles(join(ROOT, 'tests/e2e'), /\.spec\.ts$/);
      for (const f of e2eTests) {
        const content = readFileSync(f, 'utf-8');
        if (!content.includes('@playwright/test')) {
          fail(`${rel(f)} — doit importer depuis '@playwright/test'`);
        }
        if (
          content.includes("from 'vitest'") ||
          content.includes('from "vitest"')
        ) {
          fail(
            `${rel(f)} — ne doit pas importer depuis 'vitest' (c'est un test E2E)`,
          );
        }
      }
    },
  },

  {
    name: 'Les tests unit/integration utilisent describe()',
    check() {
      const tests = findFiles(join(ROOT, 'src'), /\.test\.ts$/);
      for (const f of tests) {
        const lines = readLines(f);
        const hasDescribe = lines.some(
          (l) => !isComment(l) && /\bdescribe\s*\(/.test(l),
        );
        if (!hasDescribe) {
          fail(`${rel(f)} — doit contenir au moins un describe()`);
        }
      }
    },
  },

  {
    name: "Pas d'URL de production ou staging dans les tests",
    check() {
      const files = allTestFiles();
      const prodPatterns = [
        // URLs Postgres prod/staging en dur (autorise localhost, 127.0.0.1, postgres-test, host.docker.internal)
        /postgres(ql)?:\/\/[^@\s]+@(?!localhost|127\.0\.0\.1|postgres-test|host\.docker\.internal)/i,
        // URLs d'API en dur (adapter selon vos domaines)
        /https?:\/\/[a-z0-9-]*\.?epitech\.(eu|net|digital)/i,
      ];

      for (const f of files) {
        const lines = readLines(f);
        for (let i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) continue;
          for (const pattern of prodPatterns) {
            if (pattern.test(lines[i])) {
              fail(
                `${rel(f)}:${i + 1} — URL de prod/staging détectée dans un test`,
              );
              break;
            }
          }
        }
      }
    },
  },

  {
    name: 'Pas de console.log() dans les tests',
    check() {
      const files = allTestFiles();

      for (const f of files) {
        const lines = readLines(f);
        for (let i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) continue;
          if (/\bconsole\.(log|debug|info)\s*\(/.test(lines[i])) {
            warn(
              `${rel(f)}:${i + 1} — console.log() dans un test — probablement un oubli de debug`,
            );
          }
        }
      }
    },
  },
];

// ── Run ──────────────────────────────────────────────────────

for (const rule of rules) {
  const before = errors;
  info(rule.name);
  rule.check();
  if (errors === before) {
    green(rule.name);
  }
}

console.log();
if (errors > 0) {
  console.log(
    `\x1b[31m✗ ${errors} erreur(s) et ${warnings} warning(s). Voir TESTING.md pour les conventions.\x1b[0m`,
  );
  process.exit(1);
} else if (warnings > 0) {
  console.log(
    `\x1b[33m⚠ ${warnings} warning(s) — pas bloquant mais à corriger. Voir TESTING.md.\x1b[0m`,
  );
} else {
  console.log(
    '\x1b[32m✓ Tous les fichiers de test respectent les conventions TESTING.md\x1b[0m',
  );
}
