/**
 * lint-prose.ts : Vérifie les règles que la doctrine n'énonçait que par écrit.
 *
 * Usage : bun run scripts/lint-prose.ts [--file <chemin>]
 * Exit code : 0 si tout est OK, 1 si des violations sont trouvées.
 *
 * Pourquoi ce fichier existe. Les règles de `AGENTS.md` qui tiennent tiennent
 * parce qu'un composant ou un codemod les tient : `cursor-pointer` parce que le
 * primitif `Button` le porte, le barrel lucide parce qu'un codemod le réécrit.
 * Les deux seules règles qu'aucun mécanisme ne portait ont dérivé, et personne
 * ne pouvait le voir : le bannissement du tiret cadratin était violé par 15
 * fichiers suivis alors que `AGENTS.md` affirmait qu'un passage dédié avait
 * nettoyé la prose du dépôt, et l'énumération de la chaîne `verify` comptait un
 * lien de moins que la chaîne.
 *
 * Frère de `lint-design.ts` et `lint-tests.ts`, et volontairement dans le même
 * moule : même walker, même format `chemin:ligne - message`, même sortie 1. La
 * différence est l'énumération, et c'est la seule chose qui compte ici.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize, relative, resolve } from 'node:path';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

let errors = 0;

const red = (msg: string) => console.log(`\x1b[31m  ✗ ${msg}\x1b[0m`);
const green = (msg: string) => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
const info = (msg: string) => console.log(`\x1b[33m► ${msg}\x1b[0m`);

function fail(msg: string) {
  red(msg);
  errors++;
}

/**
 * L'énumération part de `git ls-files`, à la racine du dépôt, et pas d'un
 * parcours du système de fichiers comme ses deux frères. Trois raisons, et
 * `scripts/check-exec-bits.sh` est le précédent exact.
 *
 * La prose de ce dépôt ne vit pas que sous `frontend/` : les deux violations
 * qui ont motivé ce script sont dans `.env.example` et `scripts/`, hors de
 * portée d'un walker enraciné sur le paquet. Un index git ne voit que ce qui
 * est suivi, donc un worktree créé dans le checkout principal est
 * structurellement hors de portée au lieu de tripler chaque résultat. Et il ne
 * voit pas non plus les fichiers ignorés, ce qui est le bon comportement : un
 * script personnel gitignoré n'est pas de la prose du dépôt.
 */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

/** Les extensions qui portent de la prose. Le reste est binaire ou généré. */
const TEXT =
  /\.(ts|tsx|svelte|mjs|js|md|sh|json|ya?ml|toml|html|css|txt|tsv|prisma|sql|example)$/;
/** Les fichiers de configuration sans extension qu'on veut quand même lire. */
const TEXT_BASENAMES = new Set([
  '.gitignore',
  '.dockerignore',
  '.prettierignore',
  '.prettierrc',
  '.npmrc',
]);

/**
 * Un fichier sans extension du tout est lu s'il porte un shebang. C'est ce qui
 * rattrape `.githooks/post-checkout` et ses deux voisins, qui sont des scripts
 * shell nommés d'après l'évènement git et pas d'après leur langage. Une
 * première version listait des noms à la main et les trois hooks passaient à
 * travers, alors que l'un d'eux portait le caractère. `check-exec-bits.sh`
 * identifie déjà un script exactement comme ça.
 */
function hasShebang(full: string): boolean {
  try {
    return readFileSync(full, 'utf8').startsWith('#!');
  } catch {
    return false;
  }
}

function isProse(f: string, full: string): boolean {
  const base = f.split('/').pop() ?? f;
  if (TEXT.test(f) || TEXT_BASENAMES.has(base)) return true;
  // Pas d'extension : ni un point après le premier caractère.
  if (!base.slice(1).includes('.')) return hasShebang(full);
  return false;
}

/**
 * Chaque exclusion coûte une place où une violation peut se cacher, donc
 * chacune porte sa raison.
 *
 * `.claude/skills/` est vendorisé : `skills-lock.json` épingle deux de ces
 * skills sur une source GitHub avec un hash de contenu, leur prose n'est pas la
 * nôtre, et la corriger casserait le hash.
 *
 * `prisma/migrations/` est un historique immuable : une migration appliquée ne
 * se réécrit pas, et neuf d'entre elles portent le caractère.
 *
 * `CHANGELOG.md` est généré depuis les titres de pull request par
 * `scripts/generate-changelog.sh`, donc la règle appartient au titre, pas au
 * fichier.
 *
 * Ce script s'exclut lui-même pour la raison qui saute aux yeux : il doit
 * contenir les caractères qu'il cherche.
 */
const PROSE_EXCLUDED = [
  /^\.claude\/skills\//,
  /^frontend\/prisma\/migrations\//,
  /^CHANGELOG\.md$/,
  /^frontend\/scripts\/lint-prose\.ts$/,
];

/** Les fichiers dont les chemins et les liens sont des affirmations. */
const DOCTRINE = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'DESIGN.md',
  'README.md',
  '.github/CONTRIBUTING.md',
  '.github/JARGON.md',
  '.github/copilot-instructions.md',
  '.github/pull_request_template.md',
  'frontend/TESTING.md',
];

const onlyFile = (() => {
  const i = process.argv.indexOf('--file');
  if (i === -1) return null;
  const raw = process.argv[i + 1];
  if (!raw) return null;
  // `resolve` and not `join`: the hook that calls this passes an absolute path,
  // and `join(cwd, '/abs/path')` concatenates instead of replacing. The first
  // version did exactly that, turned `/home/.../.env.example` into
  // `frontend/home/.../.env.example`, matched nothing, and reported green.
  return relative(ROOT, resolve(process.cwd(), raw)).split('\\').join('/');
})();

/**
 * Sans `--file`, l'index git est la liste : ce qui n'est pas suivi n'est pas la
 * prose du dépôt.
 *
 * Avec `--file`, l'appelant a nommé le fichier, donc on le lit même s'il n'est
 * pas encore suivi : c'est le cas du hook `PostToolUse`, qui passe un fichier
 * que l'agent vient de créer. Le filtrer sur l'index rendait le hook muet sur
 * exactement les fichiers neufs, en répondant vert. Seul `git check-ignore`
 * garde son mot à dire, pour qu'un script personnel gitignoré reste hors sujet.
 */
function isIgnored(f: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', f], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const files = onlyFile
  ? existsSync(join(ROOT, onlyFile)) && !isIgnored(onlyFile)
    ? [onlyFile]
    : []
  : trackedFiles();

/* -------------------------------------------------------------------------- */
/* Règle A : pas de tiret cadratin ni demi-cadratin dans la prose             */
/* -------------------------------------------------------------------------- */

const DASHES = /[\u2014\u2013]/;

/**
 * Un caractère entre accents graves est *nommé*, pas employé comme
 * ponctuation. C'est ce qui permet à `AGENTS.md` d'énoncer la règle en citant
 * les deux caractères sans annotation, et à un extrait de code de montrer une
 * sortie qui en contient un. Masquer les spans plutôt que d'exiger une
 * dérogation garde la règle lisible là où elle est écrite.
 */
function maskCodeSpans(line: string): string {
  return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
}

function ruleNoDashes() {
  info('Aucun tiret cadratin ni demi-cadratin dans la prose');
  const before = errors;
  for (const f of files) {
    if (PROSE_EXCLUDED.some((re) => re.test(f))) continue;
    const full = join(ROOT, f);
    if (!existsSync(full)) continue;
    if (!isProse(f, full)) continue;
    const lines = readFileSync(full, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!DASHES.test(maskCodeSpans(lines[i]))) continue;
      // Une dérogation argumentée, sur place. Elle doit porter une raison :
      // un marqueur nu ne compte pas, comme dans lint-design.ts.
      const preceding = lines.slice(Math.max(0, i - 3), i + 1).join(' ');
      if (/prose-lint-ignore:\s*\S/.test(preceding)) continue;
      fail(
        `${f}:${i + 1} - tiret cadratin ou demi-cadratin : utiliser un trait d'union, une virgule, deux points, des parenthèses ou deux phrases (AGENTS.md § Coding Conventions)`,
      );
    }
  }
  if (errors === before)
    green('Aucun tiret cadratin ni demi-cadratin dans la prose');
}

/* -------------------------------------------------------------------------- */
/* Règle B : les liens markdown de la doctrine pointent vers un fichier suivi  */
/* -------------------------------------------------------------------------- */

/**
 * Une cible de lien est une affirmation : elle n'est jamais une illustration et
 * elle n'apparaît pas dans un bloc de code. C'est pour ça que cette règle ne
 * scanne pas toute la prose à la recherche de chemins. Une version large a été
 * écrite puis refusée : `frontend/TESTING.md` héberge trois chemins purement
 * illustratifs dans des blocs de code, `AGENTS.md` nomme un fichier
 * explicitement supprimé et un chemin généré donc gitignoré, et il aurait fallu
 * six listes d'exclusion pour ne rien attraper. Ici il n'y en a aucune.
 */
function ruleLinksResolve() {
  info('Les liens markdown de la doctrine pointent vers un fichier suivi');
  const before = errors;
  const tracked = new Set(trackedFiles());
  const link = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const f of DOCTRINE) {
    const full = join(ROOT, f);
    if (!existsSync(full)) continue;
    const lines = readFileSync(full, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(link)) {
        const target = m[1].split('#')[0].trim();
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const resolved = normalize(join(dirname(f), target))
          .split('\\')
          .join('/');
        if (tracked.has(resolved)) continue;
        // Un lien vers un répertoire est légitime : rien ne le suit en propre.
        if (existsSync(join(ROOT, resolved))) continue;
        fail(`${f}:${i + 1} - lien vers un fichier non suivi : ${target}`);
      }
    }
  }
  if (errors === before) {
    green('Les liens markdown de la doctrine pointent vers un fichier suivi');
  }
}

const PKG = 'frontend/package.json';

/** Les deux bornes de l'énumération dans `AGENTS.md`, mots de la phrase même. */
const CHAIN_OPENS = 'It chains `';
const CHAIN_CLOSES = 'in that order';

/** Les liens de la chaîne, dans l'ordre où `verify` les exécute. */
function verifyChain(scripts: Record<string, string>): string[] {
  return (scripts.verify ?? '')
    .split('&&')
    .map((s) =>
      s
        .trim()
        .replace(/^bun run /, '')
        .trim(),
    )
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Règle C : l'énumération de la chaîne verify correspond à package.json       */
/* -------------------------------------------------------------------------- */

/**
 * La dérive que ce dépôt a réellement produite, et qu'aucune règle sur les
 * chemins n'attrape : c'est un nom de script qui manquait, pas un fichier.
 * `AGENTS.md` promet la chaîne « in that order », donc l'ordre est comparé
 * aussi. Une phrase dont le travail est de décrire le gate cesse d'être de la
 * prose le jour où elle est vérifiée.
 */
function ruleVerifyChain() {
  info('L\u2019énumération de la chaîne verify correspond à package.json');
  const before = errors;
  const pkgPath = join(ROOT, PKG);
  const agentsPath = join(ROOT, 'AGENTS.md');
  if (!existsSync(pkgPath) || !existsSync(agentsPath)) {
    fail('règle C : package.json ou AGENTS.md est introuvable');
    return;
  }
  const scripts: Record<string, string> = JSON.parse(
    readFileSync(pkgPath, 'utf8'),
  ).scripts;
  const real = verifyChain(scripts);

  const lines = readFileSync(agentsPath, 'utf8').split('\n');
  const idx = lines.findIndex((l) => l.includes(CHAIN_OPENS));
  if (idx === -1) {
    fail(
      `AGENTS.md n\u2019énumère plus la chaîne verify (phrase « ${CHAIN_OPENS.trim()} » absente) : la règle C ne peut plus la vérifier`,
    );
    return;
  }
  /*
   * Seule la CLAUSE est lue, pas la ligne. Un paragraphe markdown est une ligne
   * unique ici, et il continue après l'énumération : la première version lisait
   * la ligne entière, donc la phrase suivante qui rappelait `lint:prose` le
   * comptait comme un douzième lien, deux fois. Les deux bornes sont les mots
   * de la phrase elle-même, et « in that order » est déjà ce sur quoi repose la
   * comparaison d'ordre plus bas.
   */
  const from = lines[idx].indexOf(CHAIN_OPENS);
  const to = lines[idx].indexOf(CHAIN_CLOSES, from);
  if (to === -1) {
    fail(
      `AGENTS.md:${idx + 1} - la phrase ne promet plus « ${CHAIN_CLOSES} » : la règle C ne sait plus où l\u2019énumération s\u2019arrête`,
    );
    return;
  }
  // Seuls les noms qui sont réellement des scripts comptent : la clause parle
  // aussi de `verify` lui-même et de fichiers, entre les mêmes accents graves.
  const claimed = [
    ...lines[idx].slice(from, to).matchAll(/`([a-z][a-z0-9:-]*)`/g),
  ]
    .map((m) => m[1])
    .filter((n) => n !== 'verify' && n in scripts);

  const missing = real.filter((s) => !claimed.includes(s));
  const extra = claimed.filter((s) => !real.includes(s));
  for (const s of missing) {
    fail(
      `AGENTS.md:${idx + 1} - la chaîne verify exécute \`${s}\` et la phrase ne le nomme pas`,
    );
  }
  for (const s of extra) {
    fail(
      `AGENTS.md:${idx + 1} - la phrase nomme \`${s}\` et la chaîne verify ne l\u2019exécute pas`,
    );
  }
  if (
    !missing.length &&
    !extra.length &&
    claimed.join('>') !== real.join('>')
  ) {
    fail(
      `AGENTS.md:${idx + 1} - la phrase promet la chaîne « in that order » et l\u2019ordre diffère : ${claimed.join(', ')}`,
    );
  }
  if (errors === before) {
    green('L\u2019énumération de la chaîne verify correspond à package.json');
  }
}

/* -------------------------------------------------------------------------- */
/* Règle D : chaque lien de la chaîne verify est exécuté par la CI             */
/* -------------------------------------------------------------------------- */

/**
 * Les trois checks requis de la ruleset `push dev` sont les trois jobs de ce
 * fichier, ce que son propre en-tête dit déjà. Un lien exécuté par un workflow
 * qui ne bloque rien ne prouverait rien, donc un seul fichier est lu.
 */
const CI_WORKFLOW = '.github/workflows/test.yml';

/**
 * Les noms de script que le workflow lance réellement, lus dans les scalaires
 * `run:` et nulle part ailleurs.
 *
 * Un scan lexical du fichier entier compterait les mentions de `bun run ...`
 * qui vivent dans ses commentaires, et répondrait vert sur un lien qu'aucun job
 * ne lance : c'est la seule direction d'erreur qu'une règle comme celle-ci n'a
 * pas le droit d'avoir. Les blocs `run: |` sont suivis à l'indentation, pour
 * qu'une étape multiligne compte comme les autres.
 */
function scriptsRunByCi(yaml: string): Set<string> {
  const out = new Set<string>();
  const collect = (s: string) => {
    for (const m of s.matchAll(/\bbun\s+run\s+([a-z][a-z0-9:-]*)/g)) {
      out.add(m[1]);
    }
  };
  let blockIndent = -1;
  for (const line of yaml.split('\n')) {
    const indent = line.length - line.trimStart().length;
    if (blockIndent > -1) {
      if (line.trim() === '' || indent > blockIndent) {
        collect(line);
        continue;
      }
      blockIndent = -1;
    }
    const m = /^\s*(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (!m) continue;
    if (/^[|>]/.test(m[1])) blockIndent = indent;
    else collect(m[1]);
  }
  return out;
}

/**
 * La chaîne existe en trois exemplaires : `package.json` l'exécute, `AGENTS.md`
 * l'énonce, et le workflow la rejoue étape par étape. La règle C tient les deux
 * premiers ensemble ; sans celle-ci le troisième dérive seul, et il dérive du
 * mauvais côté. Un lien ajouté à `verify` et oublié dans le workflow ne bloque
 * aucune fusion, donc la règle qu'il porte se remet à pourrir derrière un check
 * requis vert, ce qui est exactement l'état auquel ce linter existe pour mettre
 * fin. C'est ce qui est arrivé à `lint:prose` le jour de son arrivée.
 */
function ruleVerifyRunsInCi() {
  info('Chaque lien de la chaîne verify est exécuté par la CI');
  const before = errors;
  const pkgPath = join(ROOT, PKG);
  const wfPath = join(ROOT, CI_WORKFLOW);
  if (!existsSync(pkgPath) || !existsSync(wfPath)) {
    fail(`règle D : ${PKG} ou ${CI_WORKFLOW} est introuvable`);
    return;
  }
  const scripts: Record<string, string> = JSON.parse(
    readFileSync(pkgPath, 'utf8'),
  ).scripts;
  const inCi = scriptsRunByCi(readFileSync(wfPath, 'utf8'));

  /**
   * Un lien est couvert par un nom identique, ou par un script CI dont la
   * commande commence par la sienne : `test:coverage` est `test` plus
   * `--coverage`, donc le lancer lance le lien. L'équivalence est DÉDUITE de
   * `package.json`, jamais déclarée ici : une table d'alias écrite à la main
   * serait une quatrième copie de la chaîne, et le prochain endroit où elle
   * dérive.
   */
  const covers = (link: string) => {
    if (inCi.has(link)) return true;
    const cmd = (scripts[link] ?? '').trim();
    if (!cmd) return false;
    return [...inCi].some((name) => {
      const other = (scripts[name] ?? '').trim();
      return other === cmd || other.startsWith(`${cmd} `);
    });
  };

  for (const link of verifyChain(scripts)) {
    if (covers(link)) continue;
    fail(
      `${CI_WORKFLOW} - la chaîne verify exécute \`${link}\` et aucun job requis ne le lance : un lien qui ne bloque pas une fusion laisse sa règle pourrir derrière un check vert`,
    );
  }
  if (errors === before) {
    green('Chaque lien de la chaîne verify est exécuté par la CI');
  }
}

/* -------------------------------------------------------------------------- */

ruleNoDashes();
// Les règles B, C et D portent sur des fichiers précis, donc un appel ciblé sur
// un seul fichier (le hook PostToolUse) ne les lance que s'il les concerne.
if (!onlyFile || DOCTRINE.includes(onlyFile)) ruleLinksResolve();
if (!onlyFile || onlyFile === 'AGENTS.md' || onlyFile === PKG) {
  ruleVerifyChain();
}
if (!onlyFile || onlyFile === CI_WORKFLOW || onlyFile === PKG) {
  ruleVerifyRunsInCi();
}

console.log();
if (errors > 0) {
  console.log(
    `\x1b[31m✗ ${errors} violation(s). Voir AGENTS.md § Coding Conventions.\x1b[0m`,
  );
  process.exit(1);
} else if (onlyFile && files.length === 0) {
  // Ne jamais annoncer conforme un fichier qu'on n'a pas lu : gitignoré ou
  // absent, il est hors périmètre, et c'est une réponse différente.
  console.log(`\x1b[32m✓ ${onlyFile} : hors périmètre du lint de prose\x1b[0m`);
} else {
  console.log(
    `\x1b[32m✓ ${onlyFile ? onlyFile : `${files.length} fichiers suivis`} respecte(nt) les règles de prose\x1b[0m`,
  );
}
