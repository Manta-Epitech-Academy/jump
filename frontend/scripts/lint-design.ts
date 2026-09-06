/**
 * lint-design.ts : Vérifie que les composants respectent le contrat visuel
 * défini dans DESIGN.md (racine du dépôt).
 *
 * Usage : npx tsx scripts/lint-design.ts   (ou bun run lint:design)
 * Exit code : 0 si tout est OK, 1 si des violations sont trouvées.
 *
 * Complémentaire, et volontairement disjoint, de
 * `src/lib/design/contract.test.ts` : ce script est lexical (des classes
 * interdites dans les composants), le test est numérique (les valeurs des
 * tokens et leurs contrastes). Le calcul de contraste n'existe qu'à un seul
 * endroit, et ce n'est pas ici.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
let errors = 0;

const red = (msg: string) => console.log(`\x1b[31m  ✗ ${msg}\x1b[0m`);
const green = (msg: string) => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
const info = (msg: string) => console.log(`\x1b[33m► ${msg}\x1b[0m`);

function fail(msg: string) {
  red(msg);
  errors++;
}

function findFiles(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full, pattern));
    else if (pattern.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p);
/**
 * `.css` is in here for `routes/layout.css`, the only stylesheet in `src/` and
 * the only place `@apply` is still written: every one of the 26 `@apply`
 * directives in the project lives there and none in a `.svelte` file. The
 * `overline` rule below was added for a bug in an `@apply`, and while this
 * walker skipped `.css` that rule had no reachable target at all.
 */
const FILES = findFiles(SRC, /\.(svelte|ts|css)$/).filter(
  (f) => !f.endsWith('lint-design.ts'),
);

/**
 * `ErrorTerminal` and the server-side PDF templates are self-contained
 * artefacts with their own stylesheet: they render outside the app shell (a
 * crash page, a Puppeteer page) and cannot read the app's tokens.
 */
const SELF_CONTAINED = /ErrorTerminal\.svelte$|server[/\\]templates[/\\]/;

type Rule = {
  name: string;
  /** Matches a violation. Reported per line. */
  pattern: RegExp;
  message: string;
  /**
   * Skip when this matches the offending line or the two after it. The window
   * exists because the thing that makes a pattern acceptable is often on the
   * next line: an input suppressing its own outline is fine when its wrapper
   * draws a `focus-within` border.
   */
  unless?: RegExp;
  files?: RegExp;
};

const rules: Rule[] = [
  {
    name: 'Aucune famille de couleur hors palette',
    pattern:
      /\b(?:[a-z-]+:)*(?:bg|text|border|ring|divide|placeholder|decoration|from|to|via|shadow|fill|stroke|accent|outline|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    message:
      'famille Tailwind hors palette : utiliser un token (voir DESIGN.md § Colors)',
  },
  {
    name: 'Aucune taille de police arbitraire',
    pattern: /\btext-\[\d+px\]/,
    message:
      'taille en px arbitraire : utiliser epi-overline, text-xs ou un token display',
  },
  {
    name: 'Aucune graisse que la police ne sait pas rendre',
    pattern: /\bfont-(?:black|extrabold)\b/,
    message:
      'IBM Plex Sans Variable est font-weight 100 700 : 800/900 rendent 700',
  },
  {
    name: 'Aucun flou de fond',
    pattern: /\bbackdrop-blur\b|\bbackdrop-blur-[a-z]+\b/,
    message:
      'la charte préfère les bords francs : surface opaque + bordure 1px',
  },
  {
    name: 'Aucun fond en dégradé',
    pattern: /\bbg-(?:gradient|linear|radial|conic)-/,
    message:
      'pas de fond en dégradé : la texture de marque est blueprint-grid + carrés pixel',
    // A fade used as a truncation mask or a scrim is not a background.
    unless: /to-transparent|from-transparent/,
  },
  {
    name: 'Aucune ombre hors des trois niveaux',
    pattern: /\bshadow-(?:xs|sm|md|lg|xl|2xl)\b/,
    message: 'trois niveaux : (rien) / shadow-raised / shadow-overlay',
  },
  {
    name: 'Aucun rayon hors échelle',
    pattern: /\brounded-(?:2xl|3xl|4xl)\b|\brounded(?:-[trbl]{1,2})?\s*"/,
    message:
      'rounded-sm/md (contrôles), rounded-lg/xl (surfaces), rounded-full (puces)',
  },
  {
    name: 'Aucune transition non nommée',
    pattern: /\btransition-all\b/,
    message:
      'transition-all anime aussi les propriétés de layout : utiliser transition-ui',
  },
  {
    name: 'Aucune durée au-dessus du plafond',
    pattern: /\bduration-(?:4|5|6|7|8|9)\d\d\b|\bduration-\[[4-9]\d\d(?:ms)?\]/,
    message:
      '320 ms est le plafond pour une transition d’état (DESIGN.md § Motion)',
  },
  {
    name: 'Aucun `overline` nu (la décoration Tailwind)',
    // Tailwind ships `overline` for text-decoration-line. Written where
    // `epi-overline` was meant, it draws a hairline over the text and applies no
    // font at all: that is exactly what happened to the dev sidebar's event
    // title, in an `@apply` where the rename could not see it.
    // Only in a class position: `overline` is also a legitimate prop name
    // (EpiSection takes one) and a perfectly good word in a comment.
    //
    // The second arm catches a variant-prefixed spelling anywhere, including a
    // plain object of class strings, which is neither an attribute nor a `cn()`
    // call: `svelte-sonner` takes its classes that way and kept a
    // `group-[.toast]:overline` that the first arm could not see. A prefix is
    // unambiguous - no prop or prose writes `hover:overline` - so it needs no
    // surrounding context to be certain.
    pattern:
      /(?:class(?:Name)?\s*=\s*["'{][^"'}]*|@apply[^;]*|cn\([^)]*)(?<![-\w])overline(?![-\w])|[\w[\]&.\-/]+:overline(?![-\w])/,
    message:
      '`overline` est la décoration Tailwind : le label mono est `epi-overline`',
    files: /\.svelte$|\.css$/,
  },
  {
    name: 'Aucune ombre teintée',
    pattern:
      /\bshadow-(?:epi-[a-z-]+|primary|destructive|success|warning|accent)(?:\/\d+)?\b/,
    message:
      'la lueur colorée est traitée en photo, pas en box-shadow (DESIGN.md § Elevation)',
  },
  {
    name: 'Aucune image de fond en style inline',
    pattern: /style="[^"]*background-image/,
    message:
      'la grille blueprint et les carrés pixel sont des utilitaires, pas des styles inline',
  },
  {
    name: 'Aucun accent brut en remplissage de bouton',
    pattern: /bg-epi-(?:tomorrow|together)\b(?![-/])[^"'`]*\btext-white\b/,
    message:
      'blanc sur un accent brut est à 3,1:1 : l’action principale est bg-primary',
  },
  {
    name: 'Aucun blanc figé sur un remplissage qui s’inverse',
    // `--destructive` / `--success` / `--warning` nomment une variante d’encre :
    // elles s’éclaircissent sous `.dark` et `.on-dark`. `text-white` ne suit
    // pas, donc le libellé monte avec le fond jusqu’à 1,3:1. La paire est
    // `text-status-foreground`, qui s’inverse dans l’autre sens.
    // Les deux ordres d’écriture, la classe pouvant précéder le fond.
    pattern:
      /\bbg-(?:destructive|success|warning|epi-[a-z]+-ink)\b(?![-/])[^"'`]*\btext-white\b|\btext-white\b[^"'`]*\bbg-(?:destructive|success|warning|epi-[a-z]+-ink)\b(?![-/])/,
    message:
      'blanc figé sur un fond qui s’inverse : utiliser text-status-foreground (DESIGN.md § Dark theme)',
  },
  {
    name: 'Aucun indicateur de focus supprimé sans remplacement',
    pattern: /\boutline-none\b/,
    message:
      'outline-none masque le focus : le supprimer, ou dessiner une bordure sur :focus',
    // A container that only receives focus programmatically, and the seamless
    // inline editors, which draw a border instead.
    unless: /focus:border-|focus-visible:border-|focus-within:border-/,
  },
];

/**
 * Which lines are prose rather than code.
 *
 * Tracked across lines, not matched per line: a rule's own documentation names
 * the classes it forbids, and in a `/* *\/` block only the first line starts
 * with the delimiter. Testing each line on its own read every continuation line
 * as code, which is why `layout.css` could not simply be added to the walk.
 */
function commentMask(lines: readonly string[]): boolean[] {
  const mask: boolean[] = [];
  let inBlock = false;
  for (const line of lines) {
    const opens = line.lastIndexOf('/*');
    const closes = line.lastIndexOf('*/');
    const wasInBlock = inBlock;
    if (inBlock) {
      if (closes > -1) inBlock = false;
    } else if (opens > -1 && closes < opens) {
      inBlock = true;
    }
    mask.push(
      wasInBlock ||
        inBlock ||
        /^\s*(?:\/\/|\*|\/\*|<!--)/.test(line) ||
        /<!--[\s\S]*-->/.test(line),
    );
  }
  return mask;
}

/** Files are read once and shared by every rule, mask included. */
const SOURCES = new Map<string, { lines: string[]; mask: boolean[] }>();
for (const f of FILES) {
  if (SELF_CONTAINED.test(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  SOURCES.set(f, { lines, mask: commentMask(lines) });
}

for (const rule of rules) {
  info(rule.name);
  const before = errors;
  for (const [f, { lines, mask }] of SOURCES) {
    if (rule.files && !rule.files.test(f)) continue;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (mask[i]) continue;
      if (!rule.pattern.test(line)) continue;
      const window = lines.slice(i, i + 6).join(' ');
      if (rule.unless?.test(window)) continue;
      // An argued, in-place exception. It has to carry a reason, so the next
      // reader can judge it; a bare marker does not count. The lookback covers
      // an element's attribute list, since a comment cannot sit inside one and
      // has to go above the opening tag.
      const preceding = lines.slice(Math.max(0, i - 12), i + 1).join(' ');
      if (/design-lint-ignore:\s*\S/.test(preceding)) continue;
      fail(`${rel(f)}:${i + 1} - ${rule.message}`);
    }
  }
  if (errors === before) green(rule.name);
}

console.log();
if (errors > 0) {
  console.log(
    `\x1b[31m✗ ${errors} violation(s). Voir DESIGN.md à la racine du dépôt.\x1b[0m`,
  );
  process.exit(1);
} else {
  console.log(
    `\x1b[32m✓ ${FILES.length} fichiers respectent le contrat visuel de DESIGN.md\x1b[0m`,
  );
}
