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
 * lien de moins que la chaîne. La seconde a été réglée par suppression plutôt
 * que par surveillance : `AGENTS.md` renvoie à `package.json` au lieu de
 * recopier la chaîne, et la règle qui tenait la copie alignée est partie avec.
 *
 * Frère de `lint-design.ts` et `lint-tests.ts`, et volontairement dans le même
 * moule : même walker, même format `chemin:ligne - message`, même sortie 1. La
 * différence est l'énumération, et c'est la seule chose qui compte ici.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
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

/**
 * Les fichiers dont les chemins et les liens sont des affirmations.
 *
 * Une liste fixe, plus deux familles reconnues à leur chemin : tout `CLAUDE.md`
 * et tout fichier de `.claude/rules/`. Les `CLAUDE.md` de répertoire étaient
 * hors de la liste, et c'est par là qu'une douzaine de renvois ont pourri sans
 * que rien ne le dise quand leur doctrine a déménagé. Reconnaître une famille à
 * son chemin plutôt que l'énumérer est ce qui couvre le prochain fichier de
 * doctrine le jour où il naît, y compris en mode `--file`, où le hook passe un
 * fichier que l'index ne connaît pas encore.
 */
const DOCTRINE_FILES = [
  'AGENTS.md',
  'GEMINI.md',
  'DESIGN.md',
  'README.md',
  '.github/CONTRIBUTING.md',
  '.github/JARGON.md',
  '.github/copilot-instructions.md',
  '.github/pull_request_template.md',
  'frontend/TESTING.md',
];
const RULES_DIR = '.claude/rules/';
const isRulesFile = (f: string) => f.startsWith(RULES_DIR) && f.endsWith('.md');
const isDoctrine = (f: string) =>
  DOCTRINE_FILES.includes(f) || /(^|\/)CLAUDE\.md$/.test(f) || isRulesFile(f);

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

/**
 * L'index git, énuméré une fois et seulement si une règle le demande : le mode
 * `--file`, qui est le chemin du hook `PostToolUse`, n'a pas à payer un
 * `git ls-files` pour lire un fichier qu'on lui a nommé.
 */
let trackedCache: Set<string> | null = null;
const tracked = () => (trackedCache ??= new Set(trackedFiles()));

/**
 * Le périmètre de la règle A, décidé UNE fois pour les deux modes.
 *
 * Il l'était en deux endroits : ici pour `--file`, et dans la boucle de la règle
 * A pour les exclusions et le test de prose. Un fichier exclu (une migration, un
 * skill vendorisé) traversait donc le premier et sortait du second, et le
 * message final annonçait « respecte les règles de prose » un fichier
 * qu'aucune règle n'avait ouvert, ce que le commentaire du bas de ce fichier
 * interdit explicitement.
 */
function inProseScope(f: string): boolean {
  if (PROSE_EXCLUDED.some((re) => re.test(f))) return false;
  const full = join(ROOT, f);
  if (!existsSync(full)) return false;
  return isProse(f, full);
}

const files = onlyFile
  ? !isIgnored(onlyFile) && inProseScope(onlyFile)
    ? [onlyFile]
    : []
  : [...tracked()].filter(inProseScope);

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
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!DASHES.test(maskCodeSpans(lines[i]))) continue;
      // Une dérogation argumentée, sur place. Elle doit porter une raison :
      // un marqueur nu ne compte pas, comme dans lint-design.ts.
      //
      // Testée ligne par ligne, jamais sur la fenêtre recollée. Un `join(' ')`
      // met le texte de la ligne suivante juste après les deux points, donc un
      // marqueur nu y trouvait toujours un caractère non blanc : il désarmait
      // la règle pour trois lignes, ce que ce commentaire interdit.
      const waived = lines
        .slice(Math.max(0, i - 3), i + 1)
        .some((l) => /prose-lint-ignore:\s*\S/.test(l));
      if (waived) continue;
      fail(
        `${f}:${i + 1} - tiret cadratin ou demi-cadratin : utiliser un trait d'union, une virgule, deux points, des parenthèses ou deux phrases (AGENTS.md § Conventions)`,
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
 * Les ancres d'un fichier markdown, calculées comme GitHub les calcule : le
 * texte du titre en minuscules, privé de tout ce qui n'est ni lettre, ni
 * chiffre, ni espace, ni trait d'union, ni tiret bas, puis les espaces changés
 * en traits d'union, et un suffixe `-1`, `-2` pour un titre répété. Les titres
 * dans un bloc de code n'en sont pas.
 */
function anchorsOf(f: string): Set<string> {
  const out = new Set<string>();
  const seen = new Map<string, number>();
  let fenced = false;
  for (const line of readFileSync(join(ROOT, f), 'utf8').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = m[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '')
      .replace(/ /g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

/**
 * Une cible de lien est une affirmation : elle n'est jamais une illustration et
 * elle n'apparaît pas dans un bloc de code. C'est pour ça que cette règle ne
 * scanne pas toute la prose à la recherche de chemins. Une version large a été
 * écrite puis refusée : `frontend/TESTING.md` héberge trois chemins purement
 * illustratifs dans des blocs de code, `AGENTS.md` nomme un fichier
 * explicitement supprimé et un chemin généré donc gitignoré, et il aurait fallu
 * six listes d'exclusion pour ne rien attraper. Ici il n'y en a aucune.
 *
 * L'ancre fait partie de l'affirmation. Un lien `CONTRIBUTING.md#commits` dont
 * la section a été renommée ou déplacée mène encore au fichier, donc une règle
 * qui ne regarde que le fichier le déclare valide alors qu'il ne mène plus à ce
 * qu'il promet. Seules les ancres vers un fichier markdown sont vérifiées : une
 * ancre vers du code (`#L12`) est une ligne, pas un titre.
 */
function ruleLinksResolve(doctrine: string[]) {
  info('Les liens markdown de la doctrine pointent vers un fichier suivi');
  const before = errors;
  const trackedSet = tracked();
  const link = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const f of doctrine) {
    const full = join(ROOT, f);
    if (!existsSync(full)) continue;
    const lines = readFileSync(full, 'utf8').split('\n');
    let fenced = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
      if (fenced) continue;
      for (const m of lines[i].matchAll(link)) {
        const [rawTarget, anchor] = m[1].split('#');
        const target = rawTarget.trim();
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const resolved = target
          ? normalize(join(dirname(f), target))
              .split('\\')
              .join('/')
          : f;
        if (
          anchor &&
          resolved.endsWith('.md') &&
          existsSync(join(ROOT, resolved))
        ) {
          if (!anchorsOf(resolved).has(anchor.toLowerCase())) {
            fail(
              `${f}:${i + 1} - ancre introuvable : ${m[1]} (aucun titre de ${resolved} ne la produit)`,
            );
          }
        }
        if (!target || trackedSet.has(resolved)) continue;
        // Un lien vers un RÉPERTOIRE est légitime : rien ne le suit en propre.
        // Un fichier non suivi ne l'est pas, même s'il existe ici : il
        // n'existe que sur cette machine, donc un `existsSync` nu rendait la
        // règle verte en local et rouge pour tout le monde d'autre. C'est la
        // pire forme de vert, et le nom de la règle dit « suivi ».
        if (
          statSync(join(ROOT, resolved), {
            throwIfNoEntry: false,
          })?.isDirectory()
        ) {
          continue;
        }
        fail(`${f}:${i + 1} - lien vers un fichier non suivi : ${target}`);
      }
    }
  }
  if (errors === before) {
    green('Les liens markdown de la doctrine pointent vers un fichier suivi');
  }
}

const PKG = 'frontend/package.json';

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
/* Règle C : chaque lien de la chaîne verify est exécuté par la CI             */
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
 * La chaîne existe en deux exemplaires : `package.json` l'exécute, et le
 * workflow la rejoue étape par étape. Sans cette règle le second dérive seul, et
 * il dérive du mauvais côté. Un lien ajouté à `verify` et oublié dans le workflow ne bloque
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
    fail(`règle C : ${PKG} ou ${CI_WORKFLOW} est introuvable`);
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
/* Règle D : la doctrine de .claude/rules/ se charge, et la racine la nomme    */
/* -------------------------------------------------------------------------- */

/**
 * Un fichier de `.claude/rules/` n'entre en contexte que quand l'agent lit,
 * écrit ou modifie un fichier qui correspond à l'un de ses globs `paths:`. Ce
 * mécanisme a trois façons d'échouer en silence, et cette règle en ferme une
 * par vérification :
 *
 * - Un fichier SANS `paths:` est chargé à chaque session : c'est de la doctrine
 *   de racine déguisée, hors du budget de `AGENTS.md` et invisible des agents
 *   qui ne lisent pas `.claude/`.
 * - Un glob qui ne correspond à aucun fichier suivi ne charge jamais sa
 *   doctrine. C'est ce que produit un répertoire renommé, et rien d'autre ne le
 *   dirait.
 * - Un fichier que `AGENTS.md` ne nomme pas n'existe pas pour Codex, Copilot ou
 *   Gemini, qui ne chargent pas `.claude/rules/` : la racine est leur seul
 *   chemin vers lui.
 *
 * Les globs se limitent à `*`, `**` et `{a,b}`. Les parenthèses, les crochets,
 * `?` et un `!` de tête n'ont pas le même sens d'un moteur de glob à l'autre (un
 * groupe, une classe, une négation), et ce dépôt a des répertoires nommés
 * `(staff)` et `[id]` : un glob qui les écrit tels quels peut correspondre à
 * autre chose que ce qu'il montre. `**` les traverse sans les nommer. Un `+` ou
 * un `@` restent littéraux tant qu'aucune parenthèse ne les suit, ce qui est
 * déjà refusé, donc `+page.svelte` s'écrit tel quel.
 */
const GLOB_FORBIDDEN = /[()[\]?]|^!/;

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',') re += '|';
    else re += c.replace(/[.^$|\\+()[\]?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Les globs `paths:` d'un fichier de règles, en liste YAML ou en chaîne. */
function pathsOf(f: string): string[] | null {
  const text = readFileSync(join(ROOT, f), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return null;
  const lines = fm[1].split('\n');
  const at = lines.findIndex((l) => /^paths:/.test(l));
  if (at === -1) return null;
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '');
  const inline = lines[at].replace(/^paths:\s*/, '');
  if (inline) return inline.split(',').map(unquote).filter(Boolean);
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    const item = /^\s+-\s+(.*)$/.exec(l);
    if (!item) break;
    out.push(unquote(item[1]));
  }
  return out;
}

function ruleRulesFilesLoad() {
  info('Chaque fichier de .claude/rules/ se charge, et AGENTS.md le nomme');
  const before = errors;
  const trackedList = [...tracked()];
  const rulesFiles = trackedList.filter(isRulesFile);
  if (onlyFile && isRulesFile(onlyFile) && !rulesFiles.includes(onlyFile)) {
    rulesFiles.push(onlyFile);
  }
  const named = new Set<string>();
  const agents = join(ROOT, 'AGENTS.md');
  if (existsSync(agents)) {
    for (const m of readFileSync(agents, 'utf8').matchAll(/\]\(([^)#\s]+)/g)) {
      named.add(normalize(m[1]).split('\\').join('/'));
    }
  }
  for (const f of rulesFiles) {
    if (!existsSync(join(ROOT, f))) continue;
    if (!named.has(f)) {
      fail(
        `${f} - AGENTS.md ne le nomme pas : un agent qui ne charge pas .claude/rules/ ne le trouvera jamais`,
      );
    }
    const globs = pathsOf(f);
    if (!globs?.length) {
      fail(
        `${f} - pas de \`paths:\` en en-tête : ce fichier se chargerait à chaque session, comme la racine`,
      );
      continue;
    }
    for (const g of globs) {
      if (GLOB_FORBIDDEN.test(g)) {
        fail(
          `${f} - glob \`${g}\` : se limiter à *, ** et {a,b}, les autres signes changent de sens selon le moteur`,
        );
        continue;
      }
      const re = globToRegExp(g);
      if (!trackedList.some((t) => re.test(t))) {
        fail(
          `${f} - glob \`${g}\` : aucun fichier suivi ne lui correspond, cette doctrine ne se chargerait jamais`,
        );
      }
    }
  }
  if (errors === before) {
    green('Chaque fichier de .claude/rules/ se charge, et AGENTS.md le nomme');
  }
}

/* -------------------------------------------------------------------------- */

ruleNoDashes();
// Les règles B à D portent sur des fichiers précis, donc un appel ciblé sur un
// seul fichier (le hook PostToolUse) ne les lance que s'il les concerne.
if (!onlyFile) ruleLinksResolve([...tracked()].filter(isDoctrine));
else if (isDoctrine(onlyFile)) ruleLinksResolve([onlyFile]);
if (!onlyFile || onlyFile === CI_WORKFLOW || onlyFile === PKG) {
  ruleVerifyRunsInCi();
}
if (!onlyFile || onlyFile === 'AGENTS.md' || isRulesFile(onlyFile)) {
  ruleRulesFilesLoad();
}

console.log();
if (errors > 0) {
  console.log(
    `\x1b[31m✗ ${errors} violation(s). Voir AGENTS.md § Conventions.\x1b[0m`,
  );
  process.exit(1);
} else if (onlyFile && files.length === 0) {
  // Ne jamais annoncer conforme un fichier qu'on n'a pas lu : gitignoré, exclu,
  // absent, ou simplement pas de la prose, il est hors périmètre, et c'est une
  // réponse différente.
  console.log(`\x1b[32m✓ ${onlyFile} : hors périmètre du lint de prose\x1b[0m`);
} else {
  console.log(
    `\x1b[32m✓ ${onlyFile ? onlyFile : `${files.length} fichiers de prose suivis`} respecte(nt) les règles de prose\x1b[0m`,
  );
}
