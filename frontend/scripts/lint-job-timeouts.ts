/**
 * lint-job-timeouts.ts : chaque job de workflow déclare son `timeout-minutes`.
 *
 * Usage : bun run scripts/lint-job-timeouts.ts   (ou bun run lint:job-timeouts)
 * Exit code : 0 si tout est OK, 1 si un job n'a pas de plafond.
 *
 * Un job sans plafond tourne sous le défaut de GitHub, 360 minutes. Le
 * 2026-11-19, `SAST (Semgrep)` s'est bloqué avant son analyse, en téléchargeant
 * ses règles depuis semgrep.dev, sans rien afficher : une étape qui prend 16 à
 * 27 secondes a retenu la pull request #523 pendant 17 minutes, jusqu'à ce que
 * quelqu'un l'annule à la main, et l'aurait retenue six heures (#525). Aucun job
 * de `.github/workflows/` n'avait de plafond alors, donc c'était vrai de tous.
 *
 * Comment un plafond se dimensionne, pour que le prochain job suive la même
 * règle : trois fois la plus longue exécution mesurée de ce job, arrondie aux
 * cinq minutes supérieures, jamais moins de cinq. Un plafond détecte un blocage,
 * ce n'est pas un budget de performance, donc il se tient assez loin d'un jour
 * lent pour ne pas le faire échouer. Un job dont les étapes portent leurs
 * propres échéances se tient au-dessus de leur somme, pour que l'erreur de
 * l'étape, qui dit ce qu'elle attendait, soit celle qui part.
 *
 * Les workflows sont lus par un vrai parseur YAML (`Bun.YAML`), pour la raison
 * que `lint-prose.ts` donne déjà : la première version lisait les clés à la
 * main avec awk, et répondait vert à tort sur un job dont la clé portait un
 * commentaire ou des guillemets, sur un fichier indenté de quatre espaces et
 * sur un fichier `.yaml`. `Bun.YAML` est intégré à Bun, donc ce script tourne
 * avant `bun install`, comme les gardes qui le précèdent dans la CI.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const WORKFLOWS = '.github/workflows';

type Job = { uses?: unknown; 'timeout-minutes'?: unknown };

/** La ligne (base 1) où la clé du job est écrite, pour l'annotation. */
function lineOf(text: string, id: string): number | undefined {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^jobs\s*:/.test(l));
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const key = new RegExp(`^\\s+(["']?)${escaped}\\1\\s*:`);
  const at = lines.findIndex((l, i) => i > start && key.test(l));
  return at === -1 ? undefined : at + 1;
}

function annotate(file: string, line: number | undefined, message: string) {
  const where = line === undefined ? file : `${file},line=${line}`;
  console.log(`::error file=${where}::${message}`);
}

let errors = 0;

const files = readdirSync(join(ROOT, WORKFLOWS))
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();

for (const name of files) {
  const file = `${WORKFLOWS}/${name}`;
  const text = readFileSync(join(ROOT, file), 'utf8');

  let workflow: unknown;
  try {
    workflow = Bun.YAML.parse(text);
  } catch (e) {
    annotate(file, undefined, `Unreadable YAML: ${(e as Error).message}`);
    errors++;
    continue;
  }

  const jobs = (workflow as { jobs?: unknown } | null)?.jobs;
  if (!jobs || typeof jobs !== 'object') continue;

  for (const [id, job] of Object.entries(jobs as Record<string, Job>)) {
    // Un job qui appelle un workflow réutilisable ne peut pas porter
    // `timeout-minutes` : GitHub y refuse la clé. Les jobs du workflow appelé
    // sont dans ce répertoire et portent le leur.
    if (job?.uses !== undefined) continue;

    const timeout = job?.['timeout-minutes'];
    if (typeof timeout === 'number' && timeout > 0) continue;

    annotate(
      file,
      lineOf(text, id),
      `Job '${id}' has no numeric timeout-minutes, so a hang holds it for GitHub's default of six hours. Add one, sized as frontend/scripts/lint-job-timeouts.ts says.`,
    );
    errors++;
  }
}

if (errors) process.exit(1);
console.log('Every workflow job declares its timeout-minutes.');
