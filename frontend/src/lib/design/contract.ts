/**
 * Reads the design contract and its implementation so a test can assert they
 * agree.
 *
 * `DESIGN.md` at the repo root declares the tokens; `src/routes/layout.css`
 * implements them. Nothing else may hold a colour value, so these two files are
 * the only inputs here. The point of parsing both rather than duplicating a
 * table in the test is that a contract nobody checks becomes a second source of
 * truth within a release or two.
 *
 * Deliberately hand-rolled rather than pulling a CSS parser: the shapes we need
 * are a flat custom-property block and a YAML front-matter map, both of which we
 * write ourselves and both of which fail loudly here if their shape changes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const CSS_PATH = resolve(here, '../../routes/layout.css');
export const DESIGN_MD_PATH = resolve(here, '../../../../DESIGN.md');

/** Custom properties declared in one selector block, unresolved. */
export type TokenBlock = Record<string, string>;

/** Custom property declarations in one block body. */
function readDeclarations(body: string): TokenBlock {
  const out: TokenBlock = {};
  for (const line of body.split('\n')) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*(?:\/\*.*)?$/i.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Custom properties every top-level block whose selector list names `selector`
 * declares, merged in source order.
 *
 * A selector LIST, not one block: half the dark palette is declared under
 * `.dark, .on-dark` rather than `.dark`, because the ink swap applies to both a
 * theme and an always-dark surface. Reading only the block spelled exactly
 * `.dark` silently skipped those, so a token could be declared and unchecked -
 * which is how the status roles stayed pinned to their light values in the dark
 * theme with a green contract test.
 *
 * Brace counting rather than a regex for the block body: `:root` holds
 * `color-mix(...)` and `rgb(...)` calls, and a lazy `[^}]*` would stop at the
 * first nested brace the day one of them gains a block-valued function.
 */
export function readCssBlock(selector: string, css: string): TokenBlock {
  // Comments first: the charte's own `{ }` primitive is discussed in a comment
  // in this very file, and an unbalanced brace in prose derails brace counting.
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: TokenBlock = {};
  let found = false;
  let i = 0;

  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) break;

    let depth = 0;
    let end = -1;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end === -1) throw new Error(`unterminated block near ${selector}`);

    // Only the top level is walked (each iteration jumps past a whole block),
    // so this is a real selector list and never a nested fragment. It starts
    // after the previous block or statement: the file opens with `@import` and
    // `@custom-variant` lines, which would otherwise be read as part of the
    // first selector.
    const from = Math.max(src.lastIndexOf(';', open), i - 1) + 1;
    const parts = src
      .slice(from, open)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.includes(selector)) {
      found = true;
      Object.assign(out, readDeclarations(src.slice(open + 1, end)));
    }
    i = end + 1;
  }

  if (!found) throw new Error(`selector ${selector} not found`);
  return out;
}

/**
 * Follows `var(--x)` chains to a literal.
 *
 * `scope` wins over `root`, which is what makes the dark theme cheap: `.dark`
 * re-points four ramp steps and every semantic role that references them
 * follows, so `--border` needs no dark declaration of its own.
 */
export function resolveToken(
  name: string,
  scope: TokenBlock,
  root: TokenBlock,
  seen = new Set<string>(),
): string | null {
  if (seen.has(name)) throw new Error(`cyclic token reference at ${name}`);
  seen.add(name);
  const raw = scope[name] ?? root[name];
  if (raw === undefined) return null;
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(raw.trim());
  return ref ? resolveToken(ref[1], scope, root, seen) : raw.trim();
}

/** `epiTechInk` to `--epi-tech-ink`. */
export function cssVarName(designMdName: string): string {
  return `--${designMdName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/**
 * The `colors:` map of DESIGN.md's front matter, with `{colors.x}` references
 * resolved. Front matter is read by hand rather than with a YAML dependency:
 * the map is one level deep and quoting it wrong should fail here, not silently
 * parse into something else.
 */
export function readDesignMdColors(markdown: string): Record<string, string> {
  const fm = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!fm) throw new Error('DESIGN.md has no front matter');
  const section = /\ncolors:\n([\s\S]*?)\n[a-z]/.exec('\n' + fm[1]);
  if (!section) throw new Error('DESIGN.md front matter has no colors section');

  const raw: Record<string, string> = {};
  for (const line of section[1].split('\n')) {
    const m = /^\s{2}([A-Za-z0-9]+):\s*'(.+?)'\s*$/.exec(line);
    if (m) raw[m[1]] = m[2];
  }

  const resolved: Record<string, string> = {};
  const resolve1 = (key: string, seen = new Set<string>()): string => {
    if (seen.has(key)) throw new Error(`cyclic colour reference at ${key}`);
    seen.add(key);
    const value = raw[key];
    if (value === undefined) throw new Error(`broken reference to ${key}`);
    const ref = /^\{colors\.([A-Za-z0-9]+)\}$/.exec(value);
    return ref ? resolve1(ref[1], seen) : value;
  };
  for (const key of Object.keys(raw)) resolved[key] = resolve1(key);
  return resolved;
}

/** WCAG 2.x relative luminance. Accepts `#rgb` and `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function loadContract() {
  const css = readFileSync(CSS_PATH, 'utf8');
  return {
    root: readCssBlock(':root', css),
    dark: readCssBlock('.dark', css),
    declared: readDesignMdColors(readFileSync(DESIGN_MD_PATH, 'utf8')),
  };
}
