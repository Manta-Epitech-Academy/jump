/**
 * lint-tests.ts — Vérifie que les fichiers de test respectent
 * les conventions définies dans TESTING.md.
 *
 * Usage : npx tsx scripts/lint-tests.ts
 * Exit code : 0 si tout est OK, 1 si des violations sont trouvées.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
let errors = 0
let warnings = 0

// ── Helpers ──────────────────────────────────────────────────

const red = (msg: string) => console.log(`\x1b[31m  ✗ ${msg}\x1b[0m`)
const green = (msg: string) => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`)
const yellow = (msg: string) => console.log(`\x1b[33m  ⚠ ${msg}\x1b[0m`)
const info = (msg: string) => console.log(`\x1b[33m► ${msg}\x1b[0m`)

function fail(msg: string) {
  red(msg)
  errors++
}

function warn(msg: string) {
  yellow(msg)
  warnings++
}

function findFiles(dir: string, pattern: RegExp, exclude?: RegExp): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        results.push(...findFiles(fullPath, pattern, exclude))
      } else if (pattern.test(entry.name) && (!exclude || !exclude.test(entry.name))) {
        results.push(fullPath)
      }
    }
  } catch (err) {
    console.warn(`\x1b[33m  ⚠ Impossible de lire ${dir}: ${(err as Error).message}\x1b[0m`)
  }
  return results
}

function rel(path: string): string {
  return relative(ROOT, path)
}

function readLines(path: string): string[] {
  return readFileSync(path, 'utf-8').split('\n')
}

/** Retourne true si la ligne est un commentaire (// ou début de bloc) */
function isComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

/** Collecte tous les fichiers de test (unit + integration + e2e) */
function allTestFiles(): string[] {
  return [
    ...findFiles(join(ROOT, 'src'), /\.test\.ts$/),
    ...findFiles(join(ROOT, 'tests'), /\.spec\.ts$/),
  ]
}

// ── Rules ────────────────────────────────────────────────────

type Rule = {
  name: string
  check: () => void
}

const rules: Rule[] = [
  {
    name: 'Nommage et emplacement des fichiers de test',
    check() {
      // Unit tests (*.test.ts mais pas *.integration.test.ts) doivent être dans src/
      const unitInTests = findFiles(join(ROOT, 'tests'), /\.test\.ts$/, /\.integration\.test\.ts$/)
      for (const f of unitInTests) {
        fail(`${rel(f)} — un fichier .test.ts ne doit pas être dans tests/ (réservé aux .spec.ts E2E)`)
      }

      // Unit tests ne doivent pas être dans __integration__/
      const unitInSrc = findFiles(join(ROOT, 'src'), /\.test\.ts$/, /\.integration\.test\.ts$/)
      for (const f of unitInSrc) {
        if (f.includes('__integration__')) {
          fail(`${rel(f)} — un fichier .test.ts (non integration) ne doit pas être dans __integration__/`)
        }
      }

      // Integration tests doivent être dans __integration__/
      const integrationTests = findFiles(join(ROOT, 'src'), /\.integration\.test\.ts$/)
      for (const f of integrationTests) {
        if (!f.includes('__integration__/')) {
          fail(`${rel(f)} — un fichier .integration.test.ts doit être dans un dossier __integration__/`)
        }
      }

      // E2E tests (*.spec.ts) doivent être dans tests/e2e/
      const allSpecs = findFiles(ROOT, /\.spec\.ts$/)
      for (const f of allSpecs) {
        const r = rel(f)
        if (!r.startsWith('tests/e2e/')) {
          fail(`${r} — un fichier .spec.ts doit être dans tests/e2e/`)
        }
      }

      // Pas de .spec.ts dans src/
      const specsInSrc = findFiles(join(ROOT, 'src'), /\.spec\.ts$/)
      for (const f of specsInSrc) {
        fail(`${rel(f)} — un fichier .spec.ts ne doit pas être dans src/ (utiliser .test.ts pour les unitaires)`)
      }
    },
  },

  {
    name: 'Les it()/test() commencent par "should" (unit/integration uniquement)',
    check() {
      // La convention "should" s'applique aux tests vitest (unit + integration)
      // Les tests E2E (Playwright) utilisent test() avec des descriptions de parcours
      const files = findFiles(join(ROOT, 'src'), /\.test\.ts$/)
      // Gère it() et test() + leurs variantes .only/.skip/.todo
      // Fonctionne sur le contenu complet pour gérer les descriptions multilignes
      const itRegex = /(?:^|\s)(?:it|test)(?:\.(?:only|skip|todo))?\(\s*(['"`])(.*?)\1/gm

      for (const f of files) {
        const content = readFileSync(f, 'utf-8')
        let match: RegExpExecArray | null
        itRegex.lastIndex = 0

        while ((match = itRegex.exec(content)) !== null) {
          const desc = match[2]
          if (!desc.startsWith('should')) {
            const lineNo = content.substring(0, match.index).split('\n').length
            fail(`${rel(f)}:${lineNo} — it('${desc}') doit commencer par 'should'`)
          }
        }
      }
    },
  },

  {
    name: 'Pas de it.skip() / describe.skip() / test.skip()',
    check() {
      const files = allTestFiles()
      const skipRegex = /(?:it|describe|test)\.skip\s*\(/

      for (const f of files) {
        const lines = readLines(f)
        for (let i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) continue
          if (skipRegex.test(lines[i])) {
            fail(`${rel(f)}:${i + 1} — skip() interdit. Ouvrir une issue 'Broken Test' à la place.`)
          }
        }
      }
    },
  },

  {
    name: 'Imports corrects (vitest pour unit/integration, @playwright/test pour E2E)',
    check() {
      // Unit & integration → vitest
      const vitestTests = findFiles(join(ROOT, 'src'), /\.test\.ts$/)
      for (const f of vitestTests) {
        const content = readFileSync(f, 'utf-8')
        if (!content.includes("from 'vitest'") && !content.includes('from "vitest"')) {
          fail(`${rel(f)} — doit importer depuis 'vitest'`)
        }
        if (content.includes('@playwright/test')) {
          fail(`${rel(f)} — ne doit pas importer depuis '@playwright/test' (c'est un test vitest)`)
        }
      }

      // E2E → @playwright/test
      const e2eTests = findFiles(join(ROOT, 'tests/e2e'), /\.spec\.ts$/)
      for (const f of e2eTests) {
        const content = readFileSync(f, 'utf-8')
        if (!content.includes('@playwright/test')) {
          fail(`${rel(f)} — doit importer depuis '@playwright/test'`)
        }
        if (content.includes("from 'vitest'") || content.includes('from "vitest"')) {
          fail(`${rel(f)} — ne doit pas importer depuis 'vitest' (c'est un test E2E)`)
        }
      }
    },
  },

  {
    name: 'Les tests unit/integration utilisent describe()',
    check() {
      const tests = findFiles(join(ROOT, 'src'), /\.test\.ts$/)
      for (const f of tests) {
        const lines = readLines(f)
        const hasDescribe = lines.some((l) => !isComment(l) && /\bdescribe\s*\(/.test(l))
        if (!hasDescribe) {
          fail(`${rel(f)} — doit contenir au moins un describe()`)
        }
      }
    },
  },

  {
    name: 'Les tests d\'intégration nettoient avec afterEach()',
    check() {
      const tests = findFiles(join(ROOT, 'src'), /\.integration\.test\.ts$/)
      for (const f of tests) {
        const content = readFileSync(f, 'utf-8')
        if (!content.includes('afterEach(')) {
          fail(`${rel(f)} — doit contenir un afterEach() pour nettoyer les données après chaque test`)
        }
      }
    },
  },

  {
    name: 'Pas d\'URL de production ou staging dans les tests',
    check() {
      const files = allTestFiles()
      const prodPatterns = [
        // URLs Supabase/PocketBase de prod/staging
        /(prod|production|staging)\.(supabase|pocketbase)/i,
        // Domaine Supabase en dur (pas localhost)
        /https?:\/\/[a-z0-9-]+\.supabase\.co/i,
        // URLs d'API en dur (adapter selon vos domaines)
        /https?:\/\/[a-z0-9-]*\.?epitech\.(eu|net|digital)/i,
      ]

      for (const f of files) {
        const lines = readLines(f)
        for (let i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) continue
          for (const pattern of prodPatterns) {
            if (pattern.test(lines[i])) {
              fail(`${rel(f)}:${i + 1} — URL de prod/staging détectée dans un test`)
              break
            }
          }
        }
      }
    },
  },

  {
    name: 'Structure AAA (// Arrange, // Act, // Assert) pour les tests substantiels',
    check() {
      const files = allTestFiles()
      // Gère it() et test() + variantes
      const testStartRegex = /^\s*(?:it|test)(?:\.(?:only|todo))?\s*\(/
      const stmtRegex = /^\s*(?:expect\s*\(|await\s|const\s|let\s)/

      for (const f of files) {
        const lines = readLines(f)
        for (let i = 0; i < lines.length; i++) {
          if (!testStartRegex.test(lines[i])) continue

          // Trouver la fin du bloc en comptant les accolades
          let braceCount = 0
          let blockStarted = false
          const blockLines: string[] = []

          for (let j = i; j < Math.min(i + 50, lines.length); j++) {
            blockLines.push(lines[j])
            for (const ch of lines[j]) {
              if (ch === '{') { braceCount++; blockStarted = true }
              if (ch === '}') braceCount--
            }
            if (blockStarted && braceCount === 0) break
          }

          const stmtCount = blockLines.filter((l) => !isComment(l) && stmtRegex.test(l)).length

          if (stmtCount >= 3) {
            const hasArrange = blockLines.some((l) => /\/\/\s*Arrange/.test(l))
            const hasAct = blockLines.some((l) => /\/\/\s*Act/.test(l))
            const hasAssert = blockLines.some((l) => /\/\/\s*Assert/.test(l))

            if (!hasArrange || !hasAct || !hasAssert) {
              const missing = [
                !hasArrange && 'Arrange',
                !hasAct && 'Act',
                !hasAssert && 'Assert',
              ].filter(Boolean).join(', ')
              fail(`${rel(f)}:${i + 1} — test substantiel, commentaire(s) AAA manquant(s) : ${missing}`)
            }
          }
        }
      }
    },
  },

  {
    name: 'Chaque it()/test() contient au moins un expect()',
    check() {
      const files = allTestFiles()
      const testStartRegex = /^\s*(?:it|test)(?:\.(?:only))?\s*\(/
      const skipTodoRegex = /\.(?:skip|todo)\s*\(/

      for (const f of files) {
        const lines = readLines(f)
        for (let i = 0; i < lines.length; i++) {
          if (!testStartRegex.test(lines[i])) continue
          if (skipTodoRegex.test(lines[i])) continue

          // Trouver la fin du bloc
          let braceCount = 0
          let blockStarted = false
          const blockLines: string[] = []

          for (let j = i; j < Math.min(i + 50, lines.length); j++) {
            blockLines.push(lines[j])
            for (const ch of lines[j]) {
              if (ch === '{') { braceCount++; blockStarted = true }
              if (ch === '}') braceCount--
            }
            if (blockStarted && braceCount === 0) break
          }

          const hasExpect = blockLines.some((l) => /\bexpect\s*\(/.test(l))
          if (!hasExpect) {
            fail(`${rel(f)}:${i + 1} — test sans expect() — un test sans assertion passe toujours au vert`)
          }
        }
      }
    },
  },

  {
    name: 'Pas de console.log() dans les tests',
    check() {
      const files = allTestFiles()

      for (const f of files) {
        const lines = readLines(f)
        for (let i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) continue
          if (/\bconsole\.(log|debug|info)\s*\(/.test(lines[i])) {
            warn(`${rel(f)}:${i + 1} — console.log() dans un test — probablement un oubli de debug`)
          }
        }
      }
    },
  },

]

// ── Run ──────────────────────────────────────────────────────

for (const rule of rules) {
  const before = errors
  info(rule.name)
  rule.check()
  if (errors === before) {
    green(rule.name)
  }
}

console.log()
if (errors > 0) {
  console.log(`\x1b[31m✗ ${errors} erreur(s) et ${warnings} warning(s). Voir TESTING.md pour les conventions.\x1b[0m`)
  process.exit(1)
} else if (warnings > 0) {
  console.log(`\x1b[33m⚠ ${warnings} warning(s) — pas bloquant mais à corriger. Voir TESTING.md.\x1b[0m`)
} else {
  console.log('\x1b[32m✓ Tous les fichiers de test respectent les conventions TESTING.md\x1b[0m')
}
