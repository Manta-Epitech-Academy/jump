# lint-prose.ts : Vérification des règles de prose de la doctrine

Script TypeScript qui vérifie les règles que [`AGENTS.md`](../../AGENTS.md)
n'énonçait que par écrit.

Il existe pour une raison mesurée, pas par principe. Les règles de doctrine qui
tiennent tiennent parce qu'un composant ou un codemod les tient : `cursor-pointer`
parce que le primitif `Button` le porte dans sa classe de base, l'interdiction du
barrel `@lucide/svelte` parce qu'un codemod la répare. Les deux seules règles
qu'aucun mécanisme ne portait avaient dérivé, et rien ne pouvait le dire : le
bannissement du tiret cadratin était violé par 19 lignes de fichiers suivis
pendant que `AGENTS.md` affirmait qu'un passage dédié avait nettoyé la prose du
dépôt, et l'énumération de la chaîne `verify` comptait un lien de moins que la
chaîne elle-même.

Le linter lui-même en a fourni la troisième preuve : il est entré dans la chaîne
`verify` sans étape dans le job requis qui l'aurait fait bloquer. D'où la règle D.

## Usage

```bash
bun run lint:prose                              # tout le dépôt
bun run scripts/lint-prose.ts --file AGENTS.md  # un seul fichier
```

Code de sortie `0` si tout est OK, `1` si des violations sont trouvées. La forme
`--file` est ce que le hook `PostToolUse` appelle après chaque écriture : elle ne
lance que les règles qui concernent le fichier visé.

Le périmètre est décidé au même endroit dans les deux modes, donc `--file` sur un
chemin gitignoré, exclu, absent ou qui ne porte pas de prose répond « hors
périmètre » et jamais « conforme ». Annoncer conforme un fichier qu'aucune règle
n'a ouvert est la réponse la plus coûteuse que ce script puisse donner : elle est
lue comme une vérification.

## Ce qu'il énumère

`git ls-files`, à la racine du dépôt, et pas un parcours du système de fichiers
comme ses deux frères. Trois conséquences, toutes voulues :

- La prose de ce dépôt ne vit pas que sous `frontend/`. Les deux violations qui
  ont motivé ce script sont dans `.env.example` et dans `scripts/`, hors de portée
  d'un walker enraciné sur le paquet.
- Un worktree créé dans le checkout principal n'est pas suivi, donc il est
  structurellement hors de portée au lieu de tripler chaque résultat.
- Un fichier gitignoré n'est pas de la prose du dépôt. Un script personnel sous
  `frontend/scripts/` n'a pas à passer la règle.

Un fichier est lu si son extension porte du texte, s'il fait partie des
configurations sans extension connues, ou s'il n'a pas d'extension du tout mais
porte un shebang. Ce dernier cas rattrape les trois hooks de `.githooks/`, qui
sont des scripts shell nommés d'après l'évènement git : une première version
listait des noms à la main et les trois passaient à travers, alors que l'un
d'eux portait le caractère.

## Règles vérifiées

### A. Aucun tiret cadratin ni demi-cadratin dans la prose

`—` (U+2014) et `–` (U+2013) sont un marqueur de texte généré par un modèle, et
la règle couvre les commentaires, la documentation, les messages de commit et les
corps de pull request.

Un caractère entre accents graves est **nommé**, pas employé comme ponctuation :
les spans de code sont masqués. C'est ce qui permet à `AGENTS.md` d'énoncer la
règle en citant les deux caractères sans avoir à se déroger à elle-même.

Dérogation sur place, si elle porte une raison, dans les trois lignes qui
précèdent : `prose-lint-ignore: <raison>`. Un marqueur nu ne compte pas, comme
dans `lint-design.ts`.

Exclusions, chacune pour un motif qui lui est propre :

| Exclu                         | Pourquoi                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/`             | Vendorisé. `skills-lock.json` épingle deux de ces skills sur une source GitHub avec un hash de contenu : leur prose n'est pas la nôtre, et la corriger casserait le hash. |
| `frontend/prisma/migrations/` | Historique immuable. Une migration appliquée ne se réécrit pas, et neuf d'entre elles portent le caractère.                                                               |
| `CHANGELOG.md`                | Généré depuis les titres de pull request par `scripts/generate-changelog.sh`. La règle appartient au titre, pas au fichier.                                               |
| `scripts/lint-prose.ts`       | Il doit contenir les caractères qu'il cherche.                                                                                                                            |

### B. Les liens markdown de la doctrine pointent vers un fichier suivi

Une cible de lien est une affirmation : elle n'est jamais une illustration, et
elle n'apparaît pas dans un bloc de code. C'est pourquoi cette règle ne scanne
pas la prose à la recherche de chemins.

Une version large a été écrite, puis refusée. `frontend/TESTING.md` héberge trois
chemins purement illustratifs dans des blocs de code, `AGENTS.md` nomme un
fichier explicitement supprimé ainsi qu'un chemin généré donc gitignoré, et il
aurait fallu six listes d'exclusion pour n'attraper rien du tout : sur les liens
locaux existants, la règle étroite est verte. Elle garde sa place parce qu'elle
est gratuite et qu'elle garde les pointeurs vers les `CLAUDE.md` de répertoire,
qui sont exactement des liens de ce type.

### C. L'énumération de la chaîne `verify` correspond à `package.json`

C'est la dérive que ce dépôt a réellement produite, et aucune règle sur les
chemins ne l'attrape : il manquait un nom de script, pas un fichier. La phrase
promet la chaîne « in that order », donc l'ordre est comparé aussi.

Les noms lus sont ceux de la clause « It chains ... in that order », pas ceux de
la ligne. La première version lisait la ligne entière : la phrase suivante du
même paragraphe, qui rappelait `lint:prose`, le comptait comme un lien de plus.
Les deux bornes sont les mots de la phrase elle-même, et la seconde est déjà ce
sur quoi repose la comparaison d'ordre.

La règle s'est vérifiée elle-même en arrivant : ajouter `lint:prose` à la chaîne
l'a immédiatement rendue rouge sur `AGENTS.md`, qui ne le nommait pas encore.

### D. Chaque lien de la chaîne `verify` est exécuté par la CI

La chaîne existe en trois exemplaires : `frontend/package.json` l'exécute,
`AGENTS.md` l'énonce, `.github/workflows/test.yml` la rejoue étape par étape. La
règle C tient les deux premiers ensemble. Sans celle-ci le troisième dérive
seul, et du mauvais côté : un lien ajouté à `verify` et oublié dans le workflow
ne bloque aucune fusion, donc la règle qu'il porte se remet à pourrir derrière un
check requis vert.

Ce n'est pas une hypothèse. `lint:prose` est arrivé dans la chaîne sans étape
dans `Lint & Type Check`, qui énumère ses étapes à la main : le linter écrit pour
empêcher la prose de pourrir ne gardait rien, et la phrase d'`AGENTS.md` qui
promet « the same gate CI runs » était fausse le jour de son écriture.

Deux choix qui font la règle :

- **Un seul workflow est lu.** Les trois jobs de `test.yml` SONT les trois checks
  requis de la ruleset `push dev`, ce que dit déjà l'en-tête de ce fichier. Un
  lien lancé par un workflow qui ne bloque rien ne prouverait rien.
- **Les scalaires `run:`, et rien d'autre.** Un scan lexical compterait les
  mentions de `bun run ...` qui vivent dans les commentaires du workflow, et
  répondrait vert sur un lien qu'aucun job ne lance : c'est la seule direction
  d'erreur qu'une règle comme celle-ci n'a pas le droit d'avoir.

Un lien est couvert par un nom identique, ou par un script CI dont la commande
commence par la sienne : `test:coverage` est `test` plus `--coverage`, donc le
lancer lance le lien. Cette équivalence est **déduite** de `package.json` et
jamais déclarée dans le linter, sinon la chaîne aurait une quatrième copie à
tenir à jour.

## Quand le lancer ?

Jamais à la main dans le cas courant. Il est dans la chaîne `bun run verify`,
donc dans le gate, et le hook `PostToolUse` de `.claude/settings.json` l'appelle
sur chaque fichier écrit.

## Limites connues

- La règle A est lexicale. Elle ne sait pas si un tiret cadratin dans une chaîne
  de caractères est destiné à un humain ou à un protocole ; le masquage des spans
  de code et la dérogation argumentée sont les deux soupapes.
- La règle B ne voit que les liens markdown. Un chemin cité en prose, ou dans un
  commentaire de code, n'est pas vérifié, et c'est un choix argumenté ci-dessus
  et non un oubli.
- La règle C ne lit que la clause comprise entre « It chains » et « in that
  order », et pas la ligne : un paragraphe markdown est une ligne unique, et la
  phrase continue après l'énumération. Si l'une des deux bornes disparaît
  d'`AGENTS.md`, la règle le dit plutôt que de passer en silence.
- La règle D prouve qu'un lien est lancé par un job requis, jamais qu'il est
  lancé au bon endroit : déplacer une étape d'un job à l'autre la laisse verte.
  C'est l'ordre des jobs, pas la couverture, et `needs:` le tient déjà.
