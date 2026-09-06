// Codemod: convert `import { Foo, Bar } from '@lucide/svelte'` (barrel)
// into per-icon imports that don't drag the entire icon set through Vite's
// dev-mode resolver. Run with `bun scripts/codemod-lucide-imports.ts`.
//
// Flags:
//   --dry-run   print diffs, don't write
//   --limit=N   only touch the first N matching files (useful for sampling)

import { glob } from 'tinyglobby';
import { readFile, writeFile } from 'node:fs/promises';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const BARREL_IMPORT =
  /^([ \t]*)import\s*\{([^}]+)\}\s*from\s*['"]@lucide\/svelte['"]\s*;?/gm;

function kebab(pascal: string): string {
  // Lucide exposes an `Icon`-suffixed alias for icons whose bare name would
  // collide with HTML/JS globals (File, Image, Link, Map, ...). The on-disk
  // file is the bare kebab name: strip the suffix before kebab-casing.
  // No real Lucide icon path ends in `-icon`, so this is safe.
  const name =
    pascal.endsWith('Icon') && pascal !== 'Icon' ? pascal.slice(0, -4) : pascal;
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d+)/g, '$1-$2')
    .toLowerCase();
}

function rewrite(src: string): string {
  return src.replace(BARREL_IMPORT, (_match, indent: string, names: string) => {
    const entries = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return entries
      .map((entry) => {
        const [orig, alias] = entry.split(/\s+as\s+/).map((s) => s.trim());
        const local = alias ?? orig;
        return `${indent}import ${local} from '@lucide/svelte/icons/${kebab(orig)}';`;
      })
      .join('\n');
  });
}

function unifiedDiff(path: string, before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  // Cheap line-by-line diff (good enough for import-block changes).
  let i = 0;
  let j = 0;
  while (i < beforeLines.length || j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      i++;
      j++;
      continue;
    }
    // Find next sync point.
    const beforeChunk: string[] = [];
    const afterChunk: string[] = [];
    while (
      i < beforeLines.length &&
      !afterLines.slice(j).includes(beforeLines[i])
    ) {
      beforeChunk.push(beforeLines[i++]);
    }
    while (j < afterLines.length && afterLines[j] !== beforeLines[i]) {
      afterChunk.push(afterLines[j++]);
    }
    for (const l of beforeChunk) out.push(`- ${l}`);
    for (const l of afterChunk) out.push(`+ ${l}`);
  }
  return out.join('\n');
}

const files = await glob(['./src/**/*.svelte', './src/**/*.ts'], {
  cwd: process.cwd(),
});
let touched = 0;
let scanned = 0;

for (const file of files.sort()) {
  if (touched >= limit) break;
  const src = await readFile(file, 'utf8');
  scanned++;
  if (!BARREL_IMPORT.test(src)) continue;
  BARREL_IMPORT.lastIndex = 0;
  const out = rewrite(src);
  if (out === src) continue;
  touched++;
  console.log('\n' + unifiedDiff(file, src, out));
  if (!dryRun) await writeFile(file, out);
}

console.log(
  `\n${dryRun ? '[dry-run] would touch' : 'touched'} ${touched} files (scanned ${scanned}).`,
);
