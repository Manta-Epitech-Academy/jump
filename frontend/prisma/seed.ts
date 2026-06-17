/**
 * Database seed.
 *
 * STANDALONE RULE: this file must depend only on `node:*`, npm packages,
 * `@prisma/client`, and `prisma/`-local siblings (e.g. `./catalogs`), never on
 * `$lib`/`src`. `prisma db seed` runs in deploy and migration environments where
 * the SvelteKit `src/` tree isn't packaged (and the `$lib` alias doesn't resolve
 * outside Vite), but the whole `prisma/` dir ships, so relative sibling imports
 * are safe. Any domain logic needed here is re-stated locally and tagged
 * "mirrors src/lib/domain/…" so it stays in sync by inspection (see `XP_MAP`,
 * `WELCOME_XP_BONUS`, `toStoredPhone` below).
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import {
  PrismaClient,
  Prisma,
  type ActivityType,
  type ParticipationVerdict,
  type ParticipationContextTag,
  type ImageRightsDecision,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { marked } from 'marked';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import {
  seedInterests,
  seedEmailTemplates,
  seedBroadcastTemplates,
} from './catalogs';

// Mirrors normalizePhoneToE164 in src/lib/domain/phone.ts (see STANDALONE RULE).
// Phones are written below in a readable spaced form ("+33 6 12 34 56 01"), but
// runtime never stores that shape: onboarding submits canonical E.164 and the SF
// sync normalizes on ingest. Collapse the seed values to the same canonical form
// so the seeded data matches what prod persists (and the reconciliation demo
// compares like with like). Falls back to the raw string if a literal ever fails
// to parse, so a typo surfaces rather than silently becoming null.
const toStoredPhone = (raw: string): string => {
  const parsed =
    parsePhoneNumberFromString(raw) ?? parsePhoneNumberFromString(raw, 'FR');
  return parsed?.isValid() ? parsed.number : raw;
};

const EVENT_TYPES = {
  CODING_CLUB: 'coding_club',
  STAGE_SECONDE: 'stage_seconde',
} as const;
type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── XP mapping (matches src/lib/domain/xp.ts) ───

const XP_MAP: Record<string, number> = {
  Débutant: 20,
  Intermédiaire: 45,
  Avancé: 75,
};

// Onboarding arrival bonus — mirrors WELCOME_XP_BONUS in src/lib/domain/xp.ts.
const WELCOME_XP_BONUS = 200;

// ─── Time helpers (anchored to run-time `today`) ───

const now = new Date();
const startOfToday = new Date(now);
startOfToday.setHours(0, 0, 0, 0);

function dayAt(offsetDays: number, hour: number, minute = 0): Date {
  const d = new Date(startOfToday);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Real stage de seconde campaigns are named after their kickoff date so
// admissions can spot the cohort at a glance — e.g. `STAGE - Marseille -
// 2026/06/15 - stage seconde`. Build the title from the seed's relative
// offset so the format stays stable whenever the seed is replayed.
function formatStageSecondeTitle(
  campus: 'Paris' | 'Lyon',
  daysOffset: number,
): string {
  const start = dayAt(daysOffset, 0, 0);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `STAGE - ${campus} - ${y}/${m}/${d} - stage seconde`;
}

// Fake 18-char Salesforce Lead id (`00Q…`). Real prefix for Lead is `00Q`;
// the trailing 3 chars are normally a checksum we don't bother computing.
function mockSalesforceLeadId(seed: number): string {
  const tail = (seed + 1_000_000).toString(36).toUpperCase().padStart(13, '0');
  return `00Q5j${tail}`;
}

// ─── Activity step content (dynamic activity checkpoints) ───

type StepDef = {
  id: string;
  title: string;
  content_markdown: string;
  type: 'theory' | 'exercise' | 'checkpoint';
  validation?: {
    type: 'auto_qcm' | 'manual_manta';
    qcm_data?: {
      question: string;
      options: string[];
      correct_index: number;
    };
    unlock_code?: string;
  };
};

const steps = (s: StepDef[]) => ({ steps: s });

const contentStructures: Record<string, ReturnType<typeof steps>> = {
  'Ma première page HTML': steps([
    {
      id: 'html-1',
      title: "Qu'est-ce que le HTML ?",
      content_markdown: `# Titre de niveau 1

## Titre de niveau 2

### Titre de niveau 3

#### Titre de niveau 4

##### Titre de niveau 5

###### Titre de niveau 6

---

## Texte et mise en forme

Ceci est un paragraphe normal. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

Texte en **gras**, en *italique*, en ***gras et italique***, en ~~barré~~ et du \`code inline\` dans une phrase.

Un deuxième paragraphe pour montrer l'espacement entre les blocs. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

---

## Listes

Liste à puces :
- Premier élément
- Deuxième élément
  - Sous-élément A
  - Sous-élément B
    - Encore plus profond
- Troisième élément

Liste numérotée :
1. Première étape
2. Deuxième étape
   1. Sous-étape 2.1
   2. Sous-étape 2.2
3. Troisième étape

---

## Checklist

- [x] Tâche terminée
- [x] Autre tâche terminée
- [ ] Tâche en cours
- [ ] Tâche à faire

---

## Citations

> Ceci est une citation simple sur une ligne.

> Ceci est une citation plus longue qui s'étend sur plusieurs lignes pour montrer comment le rendu gère les blocs de texte dans les blockquotes.
>
> Elle contient même un deuxième paragraphe.

---

## Tableau

| Nom | Âge | Ville | Rôle |
|-----|-----|-------|------|
| Alice | 14 | Paris | Élève |
| Bob | 15 | Lyon | Élève |
| Charlie | 13 | Marseille | Élève |
| Diana | 16 | Bordeaux | Mentore |

---

## Code

Code inline : la fonction \`renderMarkdown()\` retourne une \`string\`.

Bloc JavaScript :
\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
\`\`\`

Bloc HTML :
\`\`\`html
<section class="container">
  <h1>Bienvenue</h1>
  <p>Un paragraphe avec un <a href="#">lien</a>.</p>
</section>
\`\`\`

Bloc CSS :
\`\`\`css
.container {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: linear-gradient(135deg, #013afb, #00ff97);
}
\`\`\`

Bloc sans langage :
\`\`\`
Ceci est un bloc de code sans langage spécifié.
Il est affiché tel quel.
\`\`\`

---

## Liens

Voici un [lien vers Google](https://www.google.com) et un autre vers [GitHub](https://github.com).

---

## Image

![Paysage de montagne](https://picsum.photos/600/300)

---

## Ligne de séparation

Les trois lignes ci-dessous sont des séparateurs horizontaux (hr) :

---

***

___

## Texte long

Ce paragraphe sert à montrer le rendu d'un texte plus long. Dans un contexte pédagogique, les activités contiennent souvent des descriptions détaillées avec des explications sur plusieurs lignes. Il est important que la typographie soit agréable à lire, avec un bon espacement entre les lignes, un contraste suffisant et une largeur de colonne qui ne fatigue pas les yeux. Le but est d'avoir un rendu propre, aéré et moderne — comme sur Notion.`,
      type: 'theory',
    },
    {
      id: 'html-2',
      title: 'Ta première balise',
      content_markdown:
        'Crée un fichier `index.html` et écris :\n```html\n<h1>Bonjour le monde !</h1>\n<p>Je suis en train d\u2019apprendre le HTML.</p>\n```',
      type: 'exercise',
    },
    {
      id: 'html-3',
      title: 'Quiz HTML',
      content_markdown: 'Vérifie tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Quelle balise affiche un titre principal ?',
          options: ['<p>', '<h1>', '<img>', '<div>'],
          correct_index: 1,
        },
      },
    },
    {
      id: 'html-4',
      title: 'Validation Manta',
      content_markdown: 'Montre ta page HTML à ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'CSS : Styliser sa page': steps([
    {
      id: 'css-1',
      title: 'Introduction au CSS',
      content_markdown:
        'Le **CSS** ajoute du style (couleurs, polices, dispositions) à tes pages HTML.',
      type: 'theory',
    },
    {
      id: 'css-2',
      title: 'Tes premières propriétés',
      content_markdown:
        '```css\nh1 { color: #e74c3c; font-family: Arial; }\nbody { background: #f0f0f0; }\n```',
      type: 'exercise',
    },
    {
      id: 'css-3',
      title: 'Quiz CSS',
      content_markdown: 'Teste tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Quelle propriété change la couleur du texte ?',
          options: ['background-color', 'font-size', 'color', 'margin'],
          correct_index: 2,
        },
      },
    },
  ]),
  'JavaScript : Premiers pas': steps([
    {
      id: 'js-1',
      title: "C'est quoi JavaScript ?",
      content_markdown:
        'JavaScript rend les pages interactives — il réagit aux clics, modifie la page, appelle des serveurs.',
      type: 'theory',
    },
    {
      id: 'js-2',
      title: 'Variables & conditions',
      content_markdown:
        "```js\nlet age = 14;\nif (age >= 13) console.log('Ok');\n```",
      type: 'exercise',
    },
    {
      id: 'js-3',
      title: 'Quiz JavaScript',
      content_markdown: 'Vérifie tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Comment déclare-t-on une variable moderne en JS ?',
          options: ['var x = 1', 'let x = 1', 'int x = 1', 'x := 1'],
          correct_index: 1,
        },
      },
    },
    {
      id: 'js-4',
      title: 'Validation finale',
      content_markdown: 'Montre ton mini-projet interactif à ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Construis ton robot': steps([
    {
      id: 'robot-1',
      title: 'Les composants de base',
      content_markdown:
        'Un robot = microcontrôleur + moteurs + capteurs + batterie.',
      type: 'theory',
    },
    {
      id: 'robot-2',
      title: 'Assemblage',
      content_markdown: 'Assemble le châssis, connecte les moteurs.',
      type: 'exercise',
    },
    {
      id: 'robot-3',
      title: 'Premier programme',
      content_markdown:
        '```python\nrobot.avancer(50)\nrobot.attendre(2)\nrobot.stop()\n```',
      type: 'exercise',
    },
    {
      id: 'robot-4',
      title: 'Validation du robot',
      content_markdown: 'Fais rouler ton robot devant ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Capteurs et actionneurs': steps([
    {
      id: 'capteur-1',
      title: 'Types de capteurs',
      content_markdown:
        'Ultrason (distance), infrarouge (obstacles), lumière, gyroscope.',
      type: 'theory',
    },
    {
      id: 'capteur-2',
      title: "Évitement d'obstacles",
      content_markdown:
        '```python\nwhile True:\n  if robot.ultrason() < 15: robot.stop()\n  else: robot.avancer(40)\n```',
      type: 'exercise',
    },
    {
      id: 'capteur-3',
      title: 'Quiz capteurs',
      content_markdown: 'Teste tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Quel capteur mesure la distance ?',
          options: ['Infrarouge', 'Gyroscope', 'Ultrason', 'Photorésistance'],
          correct_index: 2,
        },
      },
    },
  ]),
  'Crée ton jeu Scratch': steps([
    {
      id: 'scratch-1',
      title: "L'interface Scratch",
      content_markdown:
        'Ouvre [scratch.mit.edu](https://scratch.mit.edu). Découvre scène, sprites, blocs.',
      type: 'theory',
    },
    {
      id: 'scratch-2',
      title: 'Ton premier sprite',
      content_markdown:
        'Fais bouger ton personnage avec les flèches du clavier.',
      type: 'exercise',
    },
    {
      id: 'scratch-3',
      title: 'Validation',
      content_markdown: 'Montre ton jeu à ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Initiation à la cybersécurité': steps([
    {
      id: 'cyber-1',
      title: "C'est quoi la cybersécurité ?",
      content_markdown:
        'Protège les systèmes informatiques. 3 piliers : Confidentialité, Intégrité, Disponibilité.',
      type: 'theory',
    },
    {
      id: 'cyber-2',
      title: 'Les mots de passe',
      content_markdown:
        '≥ 12 caractères, majuscules, chiffres, symboles. Évalue tes mots de passe sur [howsecureismypassword.net](https://howsecureismypassword.net).',
      type: 'exercise',
    },
    {
      id: 'cyber-3',
      title: 'Quiz cybersécurité',
      content_markdown: 'Teste tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: "Qu'est-ce que le phishing ?",
          options: [
            'Un virus',
            'Une technique pour voler des identifiants',
            'Un pare-feu',
            'Un mot de passe fort',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
  "L'IA et moi": steps([
    {
      id: 'ia-1',
      title: "Qu'est-ce que l'IA ?",
      content_markdown:
        "L'IA permet aux machines d'apprendre. Exemples : reconnaissance d'images, assistants vocaux, recommandations.",
      type: 'theory',
    },
    {
      id: 'ia-2',
      title: 'IA au quotidien',
      content_markdown: "Liste 5 usages d'IA dans ta journée.",
      type: 'exercise',
    },
    {
      id: 'ia-3',
      title: 'Quiz IA',
      content_markdown: 'Vérifie tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Comment une IA apprend-elle à partir de données ?',
          options: [
            'Le codage',
            "L'apprentissage automatique",
            'La compilation',
            'Le débogage',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
  'Entraîne ton modèle': steps([
    {
      id: 'ml-1',
      title: 'Teachable Machine',
      content_markdown:
        'Ouvre [teachablemachine.withgoogle.com](https://teachablemachine.withgoogle.com). Choisis **Image Project**.',
      type: 'theory',
    },
    {
      id: 'ml-2',
      title: 'Collecte tes données',
      content_markdown: "Crée 3 classes d'images, 30 images chacune.",
      type: 'exercise',
    },
    {
      id: 'ml-3',
      title: 'Entraîne et teste',
      content_markdown:
        'Clique **Train Model**. Teste en temps réel avec ta webcam.',
      type: 'exercise',
    },
    {
      id: 'ml-4',
      title: 'Validation Manta',
      content_markdown: 'Montre ton modèle entraîné à ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Poster numérique': steps([
    {
      id: 'poster-1',
      title: 'Les bases du design',
      content_markdown:
        '4 principes : Contraste, Alignement, Répétition, Proximité.',
      type: 'theory',
    },
    {
      id: 'poster-2',
      title: 'Crée ton poster',
      content_markdown:
        'Utilise [Canva](https://canva.com). Titre + image + appel à l\u2019action.',
      type: 'exercise',
    },
    {
      id: 'poster-3',
      title: 'Validation finale',
      content_markdown: 'Présente ton poster à ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Game Design avancé': steps([
    {
      id: 'gd-1',
      title: 'La boucle de gameplay',
      content_markdown:
        'Action → Récompense → Progression. Exemple Mario : sauter → pièces → niveaux suivants.',
      type: 'theory',
    },
    {
      id: 'gd-2',
      title: 'Game Design Document',
      content_markdown:
        'Rédige : concept, mécaniques, boucle, 3 niveaux de difficulté.',
      type: 'exercise',
    },
    {
      id: 'gd-3',
      title: 'Prototype papier',
      content_markdown: 'Dessine ton premier niveau, fais-le tester.',
      type: 'exercise',
    },
    {
      id: 'gd-4',
      title: 'Quiz Game Design',
      content_markdown: 'Teste tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: "Qu'est-ce que la boucle de gameplay ?",
          options: [
            'Le menu principal',
            "Le cycle d'actions répétées par le joueur",
            'La boucle de rendu',
            'Le code source',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
  'Cryptographie : les secrets du code': steps([
    {
      id: 'crypto-1',
      title: "L'histoire de la cryptographie",
      content_markdown:
        'Chiffre de César, Enigma, RSA. Rendre un message illisible sauf pour son destinataire.',
      type: 'theory',
    },
    {
      id: 'crypto-2',
      title: 'Le chiffre de César',
      content_markdown:
        '`JUMP EST GENIAL` avec décalage 3 → `MXPS HVW JHQLDO`. Déchiffre `EUDYR` (décalage 3).',
      type: 'exercise',
    },
    {
      id: 'crypto-3',
      title: 'Quiz Crypto',
      content_markdown: 'Teste tes connaissances.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Principe du chiffre de César ?',
          options: [
            'Remplacer chaque lettre par un symbole',
            "Décaler chaque lettre d'un nombre fixe",
            'Inverser le message',
            'Supprimer les voyelles',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
};

// ─── Activity template blueprints ───

type ActivityDef = {
  nom: string;
  description: string;
  difficulte: 'Débutant' | 'Intermédiaire' | 'Avancé';
  activityType: ActivityType;
  isDynamic: boolean;
  themes: string[];
  defaultDuration: number;
  campus?: 'Paris' | 'Lyon' | 'Marseille';
  content?: string;
  link?: string;
};

const activityDefs: ActivityDef[] = [
  {
    nom: 'Ma première page HTML',
    description:
      'Découvre les bases du HTML et crée ta toute première page web.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Développement Web'],
    defaultDuration: 120,
  },
  {
    nom: 'CSS : Styliser sa page',
    description: 'Apprends à colorer et mettre en forme ta page web avec CSS.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Développement Web', 'Design & Création'],
    defaultDuration: 120,
  },
  {
    nom: 'JavaScript : Premiers pas',
    description: 'Variables, conditions, interactions avec la page.',
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Développement Web'],
    defaultDuration: 150,
  },
  {
    nom: 'Construis ton robot',
    description: 'Assemble et programme un petit robot.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Robotique'],
    defaultDuration: 180,
  },
  {
    nom: 'Capteurs et actionneurs',
    description: 'Utilise capteurs et moteurs pour rendre ton robot autonome.',
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Robotique'],
    defaultDuration: 150,
  },
  {
    nom: 'Crée ton jeu Scratch',
    description: 'Conçois un jeu interactif avec Scratch.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Jeux Vidéo'],
    defaultDuration: 120,
  },
  {
    nom: 'Game Design avancé',
    description: 'Mécaniques, niveaux, boucle de gameplay.',
    difficulte: 'Avancé',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Jeux Vidéo', 'Design & Création'],
    defaultDuration: 180,
  },
  {
    nom: 'Initiation à la cybersécurité',
    description: 'Mots de passe, phishing, bonnes pratiques.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Cybersécurité'],
    defaultDuration: 120,
  },
  {
    nom: 'Cryptographie : les secrets du code',
    description: 'Chiffre César, Vigenère, bases de la crypto moderne.',
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Cybersécurité'],
    defaultDuration: 120,
  },
  {
    nom: "L'IA et moi",
    description: "Découvre l'IA à travers des exemples concrets.",
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Intelligence Artificielle'],
    defaultDuration: 90,
  },
  {
    nom: 'Entraîne ton modèle',
    description: "Entraîne un modèle d'IA avec Teachable Machine.",
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Intelligence Artificielle'],
    defaultDuration: 150,
  },
  {
    nom: 'Poster numérique',
    description: 'Crée une affiche numérique percutante avec Canva.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Design & Création'],
    defaultDuration: 120,
  },
  // ─── Static templates: official (campus-less) ───
  {
    nom: 'Conférence : Les métiers de la tech',
    description:
      'Panorama des métiers du numérique présenté par un·e intervenant·e externe.',
    difficulte: 'Débutant',
    activityType: 'conference',
    isDynamic: false,
    themes: ['Développement Web', 'Cybersécurité', 'Intelligence Artificielle'],
    defaultDuration: 90,
    content: `# Les métiers de la tech

> « Il n'y a pas **un** métier de la tech, il y en a des dizaines. »
>
> *Intervenant·e invité·e*

Le numérique n'est pas réservé aux personnes qui « codent toute la journée ». Derrière chaque application, chaque site, chaque jeu, il y a une équipe aux profils très variés : des personnes qui imaginent, qui conçoivent, qui sécurisent, qui testent, qui accompagnent les utilisateurs. Cette session te donne une carte de ce paysage pour que tu puisses y repérer ce qui te ressemble.

## Objectifs de la session

- Découvrir la **diversité** des rôles dans le numérique, au-delà du seul développement.
- Comprendre les **compétences clés** de chaque grande famille de métiers.
- Mettre des mots sur ce qui t'attire : créer, résoudre, protéger, transmettre.
- Poser des questions concrètes à un·e professionnel·le en activité.

## Déroulé (90 min)

| Temps  | Séquence                       | Format      |
| ------ | ------------------------------ | ----------- |
| 10 min | Accueil et brise-glace         | Plénière    |
| 30 min | Présentation des 4 familles    | Talk        |
| 20 min | Témoignages vidéo              | Projection  |
| 25 min | Questions et réponses          | Interactif  |
| 5 min  | Synthèse et ressources         | Plénière    |

## Les 4 grandes familles

### 1. Développement

On construit le produit : interfaces, logique métier, applications mobiles, systèmes embarqués.

- **Front-end** : ce que voit l'utilisateur (HTML, CSS, JavaScript).
- **Back-end** : la logique côté serveur et les bases de données.
- **Mobile** : applications iOS et Android.
- **Embarqué** : le logiciel qui pilote des objets physiques (robots, capteurs).

### 2. Data et IA

On fait parler les données et on entraîne des modèles.

- **Data analyst** : lire les données pour aider à décider.
- **Data scientist** : modéliser et prédire.
- **ML engineer** : mettre les modèles en production à grande échelle.

### 3. Cybersécurité

On protège les systèmes et les données.

- **Pentester** : attaquer un système (légalement) pour révéler ses failles.
- **Analyste SOC** : surveiller et réagir aux incidents en temps réel.
- **RSSI** : définir la stratégie de sécurité de toute une organisation.

### 4. Produit et Design

On décide quoi construire, et comment le rendre agréable.

- **Product manager / owner** : prioriser ce qui apporte le plus de valeur.
- **UX / UI designer** : concevoir des parcours clairs et des écrans soignés.
- **Ops** : garantir que tout reste disponible et fiable.

### Exemple de stack côté web

\`\`\`ts
// Un·e même dev peut toucher plusieurs couches au cours d'un projet
const stack = {
  front: ['Svelte', 'React', 'Vue'],
  back: ['Node', 'Go', 'Rust'],
  data: ['Postgres', 'Redis', 'Kafka'],
};
\`\`\`

## Quelles compétences pour quel métier ?

| Famille          | Compétence cœur            | Une qualité utile      |
| ---------------- | -------------------------- | ---------------------- |
| Développement    | Logique et rigueur         | Curiosité technique    |
| Data et IA       | Maths et statistiques      | Esprit critique        |
| Cybersécurité    | Compréhension des systèmes | Sens du détail         |
| Produit / Design | Empathie utilisateur       | Communication          |

## Idées reçues à tordre

> « Il faut être un génie des maths pour travailler dans la tech. »

Faux pour la majorité des métiers : la rigueur et l'envie d'apprendre comptent bien plus que le don.

> « La tech, c'est un métier solitaire. »

Faux : presque tout se construit en équipe, avec beaucoup d'échanges.

## Questions à préparer pour l'intervenant·e

- [ ] Quel a été votre parcours, et qu'est-ce qui vous a décidé ?
- [ ] À quoi ressemble une journée type dans votre métier ?
- [ ] Qu'est-ce qui vous plaît le plus, et le moins ?
- [ ] Quel conseil donneriez-vous à un·e élève de seconde curieux·se ?

## Ressources officielles

- Fiches métiers : [Onisep, le numérique](https://www.onisep.fr/metiers/des-metiers-par-secteur/les-metiers-de-l-informatique)
- Rapport annuel *Numeum* sur l'emploi tech
- Podcasts recommandés : **IfThisThenDev**, **Underscore_**

---

*Support à projeter en 16:9. Prévoir des enceintes pour les vidéos témoignages.*`,
  },
  {
    nom: 'Pause déjeuner',
    description: 'Temps de repas commun.',
    difficulte: 'Débutant',
    activityType: 'orga',
    isDynamic: false,
    themes: [],
    defaultDuration: 60,
    content: `# Pause déjeuner

Un temps de repas commun, mais aussi un moment clé de la journée : c'est souvent autour de la table que se créent les liens entre élèves et que remontent les retours les plus sincères sur la matinée.

> ⚠️ *Aucun·e élève ne quitte l'établissement sans accompagnant·e.*

## Déroulé indicatif (60 min)

| Temps  | Séquence                          |
| ------ | --------------------------------- |
| 5 min  | Rassemblement et comptage         |
| 40 min | Repas                             |
| 10 min | Temps libre encadré               |
| 5 min  | Rappel des consignes de reprise   |

## Points de vigilance

- [ ] **Allergies** et régimes spéciaux signalés en amont à l'équipe.
- [ ] Repas **halal et végétarien** disponibles pour qui en a besoin.
- [ ] Eau et snacks accessibles en libre-service.
- [ ] Rappel des **horaires de reprise** en fin de pause.
- [ ] Comptage des élèves avant et après la pause.

## Gestion des allergies

> En cas de doute sur un plat, on s'abstient et on propose une alternative. La trousse de premiers secours et la liste des contacts d'urgence restent à portée de main.

## Astuce encadrant·e

Profite de la pause pour **échanger de façon informelle** avec les élèves : une question simple comme « qu'est-ce qui t'a surpris ce matin ? » ouvre souvent des conversations utiles pour ajuster l'après-midi.

## Avant de reprendre

- [ ] Salle rangée, tables nettoyées.
- [ ] Tout le monde est présent (re-comptage).
- [ ] Matériel de l'après-midi prêt et distribué.`,
  },
  {
    nom: 'Restitution finale',
    description:
      'Présentation des projets devant le groupe et remise des diplômes.',
    difficulte: 'Intermédiaire',
    activityType: 'conference',
    isDynamic: false,
    themes: ['Design & Création'],
    defaultDuration: 120,
    content: `# Restitution finale

> « La restitution n'est pas une note, c'est une **célébration** du chemin parcouru. »

C'est le dernier temps fort du stage : chaque équipe présente ce qu'elle a construit, devant ses pairs, l'équipe pédagogique et parfois les familles. L'objectif n'est pas de juger, mais de **valoriser** le travail accompli et de donner confiance.

## Format officiel

| Séquence                       | Durée       | Responsable          |
| ------------------------------ | ----------- | -------------------- |
| Mot d'accueil                  | 5 min       | Responsable pédago   |
| Pitchs par équipe (5 min par groupe) | ~60 min | Élèves               |
| Questions et réponses          | 15 min      | Jury et public       |
| Délibération rapide            | 10 min      | Jury                 |
| Remise des diplômes            | 20 min      | Directeur·rice       |
| Photo de groupe et pot         | 10 min      | Tout le monde        |

## Trame de pitch conseillée

1. **Le problème** qu'on a voulu résoudre.
2. **La solution** et ses choix techniques.
3. **Une démo**, en vidéo ou en direct.
4. **Ce qu'on a appris**, techniquement et humainement.
5. **Ce qu'on ferait ensuite** avec plus de temps.

> 💡 *Un bon pitch tient en 5 minutes : mieux vaut montrer une chose qui marche que dix idées non abouties.*

### Conseils pour bien présenter

- Se répartir la parole : chaque membre dit au moins une phrase.
- Regarder le public, pas l'écran.
- Assumer les bugs : expliquer ce qu'on aurait fait avec plus de temps.
- Terminer par une phrase claire : « voilà ce dont on est fier·ères. »

## Check-list technique avant restitution

- [ ] HDMI et adaptateur USB-C testés sur la machine de présentation.
- [ ] Micros sans fil chargés.
- [ ] Démos ouvertes et prêtes dans les onglets.
- [ ] Diplômes imprimés et signés.
- [ ] Photographe ou référent·e photo désigné·e.

## Critères de jury (à communiquer avant)

| Critère                                   | Poids |
| ----------------------------------------- | ----- |
| **Clarté** du pitch                       | 30 %  |
| **Qualité** de la réalisation             | 30 %  |
| **Originalité** et prise de risque        | 20 %  |
| **Esprit d'équipe** visible à l'oral      | 20 %  |

## Après la restitution

- Récupérer les retours des élèves « à chaud ».
- Partager les photos (avec accord pour le droit à l'image).
- Rappeler les prochaines étapes : clubs, événements, contacts.

---

*Prévoir un plan B audio en cas de panne : enceinte bluetooth et câble jack 3.5 mm.*`,
  },
  // ─── Static templates: local (campus-scoped) ───
  {
    nom: 'Visite du campus Epitech Paris',
    description: 'Découverte des locaux et rencontre des équipes pédagogiques.',
    difficulte: 'Débutant',
    activityType: 'conference',
    isDynamic: false,
    themes: ['Développement Web'],
    defaultDuration: 60,
    campus: 'Paris',
    link: 'https://www.epitech.eu/campus/paris/',
    content: `# Visite du campus : Paris Kremlin-Bicêtre

> 📍 **Adresse** : 14-16 rue Voltaire, 94270 Le Kremlin-Bicêtre
> 🚇 Métro **7**, station *Le Kremlin-Bicêtre* (sortie rue Voltaire)

Une heure pour découvrir un campus Epitech de l'intérieur : pas une salle de classe figée, mais un lieu vivant où l'on apprend en faisant. L'idée n'est pas de tout retenir, mais de **se projeter** : « Est-ce que je me vois travailler ici dans deux ou trois ans ? »

## Itinéraire conseillé (60 min)

1. **Accueil et hall principal** : présentation rapide de l'école et de son histoire.
2. **Salles de cours et amphi** : comment se déroule une journée, comment naissent les projets.
3. **Hub et espace communautaire** : vie associative, clubs techniques, entraide entre promos.
4. **Labs et salles serveur** : le côté infra, réseau et hardware, souvent invisible mais essentiel.
5. **Cafétéria et coin détente** : clôture informelle, moment pour poser ses dernières questions.

> 💡 *Garde le groupe ensemble entre deux étapes : les couloirs sont fréquentés en journée.*

## Points à mettre en avant

- La **pédagogie par projet** : pas de cours magistraux classiques, on apprend en construisant.
- L'**autonomie** accompagnée : on cherche, on se trompe, on recommence, jamais seul·e.
- La **communauté alumni** très présente, qui ouvre des portes vers l'emploi.
- Les **partenariats entreprises** : stages, alternances, hackathons toute l'année.

## Les clubs à présenter (au moins 2 parmi)

| Club              | Thème                          | Pour qui ?                    |
| ----------------- | ------------------------------ | ----------------------------- |
| **EpiGames**      | Jeu vidéo, game design         | Celles et ceux qui créent     |
| **HackademINT**   | Cybersécurité, CTF             | Les curieux·ses de la faille  |
| **Epitech.eu AI** | Intelligence artificielle      | Les amateur·rices de data     |
| **WebAcademie**   | Développement web, open-source | Les bâtisseur·ses du web      |

## Une journée type (à raconter)

| Moment         | Ce qu'il s'y passe                          |
| -------------- | ------------------------------------------- |
| Matin          | Travail sur les projets en autonomie        |
| Midi           | Pause partagée, échanges informels          |
| Après-midi     | Entraide, revues de code, ateliers          |
| Fin de journée | Soutenances, vie associative, clubs         |

## Questions fréquentes des élèves

> « Faut-il déjà savoir coder pour entrer ? »

Non : beaucoup d'élèves démarrent sans aucune expérience. C'est la motivation qui compte.

> « On travaille seul·e ou en groupe ? »

Les deux, mais le travail en équipe est central : on progresse beaucoup au contact des autres.

## Consignes sécurité

- [ ] Vérifier les **badges visiteurs** à l'entrée et les garder visibles.
- [ ] **Pas de photos** dans les salles serveur.
- [ ] Respecter les **issues de secours** balisées et rester avec le groupe.
- [ ] Signaler tout incident à l'encadrant·e référent·e.

---

Plus d'infos : [epitech.eu/campus/paris](https://www.epitech.eu/campus/paris/)`,
  },
  {
    nom: 'Rencontre alumni Lyon',
    description:
      'Échange avec des ancien·ne·s du campus lyonnais autour de leur parcours.',
    difficulte: 'Débutant',
    activityType: 'conference',
    isDynamic: false,
    themes: ['Développement Web', 'Intelligence Artificielle'],
    defaultDuration: 90,
    campus: 'Lyon',
    content: `# Rencontre alumni : Campus Lyon

> *« J'ai commencé Epitech sans savoir coder une ligne. Aujourd'hui je travaille sur des modèles d'IA chez un éditeur lyonnais. »*
>
> **Sarah**, promo 2019

Rien ne parle mieux d'un métier que quelqu'un qui l'exerce. Cette table ronde donne la parole à d'ancien·ne·s élèves : leur parcours, leurs doutes, leurs réussites. Pour les élèves de seconde, c'est l'occasion de voir un futur possible incarné par des personnes réelles, pas par une brochure.

## Format : table ronde

- **3 alumni** aux parcours volontairement différents.
- **1 modérateur·rice** (pédago ou manta) qui relance et distribue la parole.
- Public : élèves, plus quelques parents invités.

## Profils d'alumni invités

| Profil                    | Entreprise type            | Années d'expérience |
| ------------------------- | -------------------------- | ------------------- |
| Développeur·se full-stack | Scale-up lyonnaise         | 3 à 5 ans           |
| Data ou ML engineer       | Grand groupe bancaire      | 5 ans et plus       |
| Entrepreneur·e tech       | Start-up SaaS autofinancée | 2 à 4 ans           |

## Déroulé (90 min)

| Temps  | Séquence                          |
| ------ | --------------------------------- |
| 10 min | Présentation des intervenant·e·s  |
| 40 min | Échange guidé par le·la modérateur·rice |
| 25 min | Questions ouvertes du public      |
| 15 min | Mot de clôture et networking      |

## Trame de questions

1. **Pourquoi Epitech** plutôt qu'une autre formation ?
2. Votre **premier stage** : comment l'avez-vous trouvé ?
3. À quoi ressemble une **journée type** dans votre métier actuel ?
4. Quel conseil donneriez-vous à votre **vous d'il y a 10 ans** ?
5. Comment la **communauté alumni** vous aide-t-elle aujourd'hui ?

> 💡 *Prévoir 20 à 25 minutes de questions ouvertes en fin de session.*

## Faire participer le public

- Distribuer des post-it pour écrire les questions timides.
- Inviter un·e élève à reformuler un conseil entendu.
- Garder une question « pour la route » si le temps le permet.

## À distribuer aux élèves

- Lien LinkedIn des **intervenant·e·s** (avec leur accord).
- Flyer du réseau **Epitech Alumni Lyon**.
- QR code du **Discord** d'entraide local.

---

*Tournage autorisé uniquement avec l'accord explicite des alumni présent·e·s.*`,
  },
  {
    nom: 'Atelier partenaires Marseille',
    description:
      "Atelier animé par un partenaire local autour d'un cas concret.",
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: false,
    themes: ['Cybersécurité'],
    defaultDuration: 150,
    campus: 'Marseille',
    content: `# Atelier partenaire : analyse de logs et détection d'incidents

> Atelier animé par un·e **analyste SOC** d'un partenaire local (éditeur cyber marseillais).

Pendant 2 h 30, les élèves se glissent dans la peau d'un·e analyste sécurité. Pas de théorie abstraite : un vrai extrait de logs, un incident à élucider, et une méthode pour passer d'une montagne de lignes illisibles à un récit clair de ce qui s'est passé.

## Contexte du cas pratique

Un serveur web expose une API publique. Sur les **dernières 24 h**, on soupçonne une activité malveillante. La tâche des élèves : **identifier** les requêtes suspectes et **reconstruire** le scénario d'attaque, étape par étape.

### Environnement fourni

- Extrait de logs \`access.log\` (format *Apache Combined*).
- Accès navigateur à une instance **Kibana** en lecture seule.
- Fiche *cheat-sheet* avec les expressions régulières usuelles.

## Étapes (150 min)

1. **Briefing** du cas (15 min).
2. **Exploration** des logs en binôme (45 min).
3. **Point d'étape** collectif (15 min).
4. **Construction** de la timeline d'attaque (45 min).
5. **Restitution** et débrief partenaire (30 min).

### Exemple de ligne à analyser

\`\`\`
203.0.113.42 - - [14/Mar/2026:03:12:44 +0100] "GET /admin/../etc/passwd HTTP/1.1" 404 162 "-" "sqlmap/1.7"
\`\`\`

**Indices à repérer** :

- User-Agent suspect : \`sqlmap/1.7\` (outil d'attaque automatisé).
- Tentative de *path traversal* : \`../etc/passwd\`.
- Horaire atypique : **3 h du matin**.

### Anatomie d'une ligne de log

| Champ        | Exemple                       | Ce qu'il dit               |
| ------------ | ----------------------------- | -------------------------- |
| IP source    | \`203.0.113.42\`              | Qui fait la requête        |
| Horodatage   | \`14/Mar/2026:03:12:44\`      | Quand                      |
| Requête      | \`GET /admin/../etc/passwd\`  | Ce qui est demandé         |
| Code HTTP    | \`404\`                       | Comment le serveur répond  |
| User-Agent   | \`sqlmap/1.7\`                | Avec quel outil            |

## Méthode conseillée

1. Filtrer par **code d'erreur** (4xx et 5xx) pour repérer les tentatives ratées.
2. Trier par **IP** pour voir qui insiste.
3. Chercher les **motifs suspects** dans les URL (\`../\`, \`SELECT\`, \`<script>\`).
4. Recouper avec l'**heure** : une rafale à 3 h du matin n'est pas un·e utilisateur·rice normal·e.

## Pré-requis

- [ ] Avoir fait l'activité *Initiation à la cybersécurité*.
- [ ] Laptop avec terminal (macOS, Linux ou WSL).
- [ ] Connaissance basique des **codes HTTP** (200, 301, 404, 500).

## Livrables attendus

| Livrable                          | Format      | Qui ?               |
| --------------------------------- | ----------- | ------------------- |
| Liste des IP suspectes            | \`.txt\`    | Chaque binôme       |
| Timeline de l'attaque             | Slide ou doc | Chaque binôme      |
| 3 recommandations de mitigation   | Oral        | Un binôme au hasard |

## Pour aller plus loin

> Une fois l'attaque reconstituée, demande-toi : qu'est-ce qui aurait empêché ça ? Pare-feu applicatif, limitation du débit, validation des entrées ? C'est là que l'analyse devient défense.

---

*Contact partenaire confidentiel : voir la fiche coordonnées côté pédago.*`,
  },
];

// ─── Static data: staff, students ───

const STAFF_MEMBERS = [
  {
    key: 'pauline.marchand',
    email: 'pauline.marchand@epitech.eu',
    name: 'Pauline Marchand',
    campus: 'Paris',
    role: 'superdev' as const,
    image: 'https://i.pravatar.cc/96?u=pauline.marchand@epitech.eu',
  },
  {
    key: 'marie.manta',
    email: 'marie.manta@epitech.eu',
    name: 'Marie Manta',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=marie.manta@epitech.eu',
  },
  {
    key: 'sophie.bernard',
    email: 'sophie.bernard@epitech.eu',
    name: 'Sophie Bernard',
    campus: 'Paris',
    role: 'peda' as const,
    image: 'https://i.pravatar.cc/96?u=sophie.bernard@epitech.eu',
  },
  {
    key: 'jules.dupont',
    email: 'jules.dupont@epitech.eu',
    name: 'Jules Dupont',
    campus: 'Paris',
    role: 'manta' as const,
    image: 'https://i.pravatar.cc/96?u=jules.dupont@epitech.eu',
  },
  {
    key: 'laura.garcia',
    email: 'laura.garcia@epitech.eu',
    name: 'Laura Garcia',
    campus: 'Paris',
    role: 'manta' as const,
    image: null,
  },
  {
    key: 'nathan.blanc',
    email: 'nathan.blanc@epitech.eu',
    name: 'Nathan Blanc',
    campus: 'Lyon',
    role: 'peda' as const,
    image: 'https://i.pravatar.cc/96?u=nathan.blanc@epitech.eu',
  },
  {
    key: 'pierre.leblanc',
    email: 'pierre.leblanc@epitech.eu',
    name: 'Pierre Leblanc',
    campus: 'Lyon',
    role: 'manta' as const,
    image: null,
  },
  {
    key: 'camille.reader',
    email: 'camille.reader@epitech.eu',
    name: 'Camille Reader',
    campus: 'Paris',
    role: null, // Unassigned — tests the "contact admin" guard
    image: null,
  },
  // ── Extra staff for grid density ──
  {
    key: 'hugo.lefebvre',
    email: 'hugo.lefebvre@epitech.eu',
    name: 'Hugo Lefebvre',
    campus: 'Lyon',
    role: 'superdev' as const,
    image: 'https://i.pravatar.cc/96?u=hugo.lefebvre@epitech.eu',
  },
  {
    key: 'sarah.moreau',
    email: 'sarah.moreau@epitech.eu',
    name: 'Sarah Moreau',
    campus: 'Lyon',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=sarah.moreau@epitech.eu',
  },
  {
    key: 'antoine.roux',
    email: 'antoine.roux@epitech.eu',
    name: 'Antoine Roux',
    campus: 'Paris',
    role: 'dev' as const,
    image: null,
  },
  {
    key: 'clara.noel',
    email: 'clara.noel@epitech.eu',
    name: 'Clara Noël',
    campus: 'Paris',
    role: 'dev' as const,
    image: 'https://i.pravatar.cc/96?u=clara.noel@epitech.eu',
  },
  {
    key: 'elise.dumas',
    email: 'elise.dumas@epitech.eu',
    name: 'Élise Dumas',
    campus: 'Lyon',
    role: 'peda' as const,
    image: 'https://i.pravatar.cc/96?u=elise.dumas@epitech.eu',
  },
  {
    key: 'maxime.girard',
    email: 'maxime.girard@epitech.eu',
    name: 'Maxime Girard',
    campus: 'Paris',
    role: 'peda' as const,
    image: 'https://i.pravatar.cc/96?u=maxime.girard@epitech.eu',
  },
  {
    key: 'theo.vincent',
    email: 'theo.vincent@epitech.eu',
    name: 'Théo Vincent',
    campus: 'Paris',
    role: 'manta' as const,
    image: null,
  },
  {
    key: 'lena.faure',
    email: 'lena.faure@epitech.eu',
    name: 'Léna Faure',
    campus: 'Paris',
    role: 'manta' as const,
    image: 'https://i.pravatar.cc/96?u=lena.faure@epitech.eu',
  },
  {
    key: 'jeanne.albert',
    email: 'jeanne.albert@epitech.eu',
    name: 'Jeanne Albert',
    campus: 'Lyon',
    role: 'manta' as const,
    image: null,
  },
  {
    key: 'romain.caron',
    email: 'romain.caron@epitech.eu',
    name: 'Romain Caron',
    campus: 'Lyon',
    role: 'manta' as const,
    image: 'https://i.pravatar.cc/96?u=romain.caron@epitech.eu',
  },
  {
    key: 'yacine.benali',
    email: 'yacine.benali@epitech.eu',
    name: 'Yacine Benali',
    campus: 'Paris',
    role: 'manta' as const,
    image: null,
  },
  {
    key: 'martin.ferrand',
    email: 'martin.ferrand@epitech.eu',
    name: 'Martin Ferrand',
    campus: 'Lyon',
    role: 'manta' as const,
    image: null,
  },
];

type StudentDef = {
  email: string;
  prenom: string;
  nom: string;
  phone: string;
  parentPhone: string;
  niveau: string;
  campus: 'Paris' | 'Lyon';
  charterSigned: boolean;
  lastActiveDaysAgo: number | null;
  skipOnboarding?: boolean;
};

const STUDENTS: StudentDef[] = [
  // ── Paris (20 students) ──
  {
    email: 'alice.martin@mail.com',
    prenom: 'Alice',
    nom: 'Martin',
    phone: '+33 6 12 34 56 01',
    parentPhone: '+33 6 98 76 54 01',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
    skipOnboarding: true,
  },
  {
    email: 'lucas.dupont@mail.com',
    prenom: 'Lucas',
    nom: 'Dupont',
    phone: '+33 6 12 34 56 02',
    parentPhone: '+33 6 98 76 54 02',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 2,
    skipOnboarding: false,
  },
  {
    email: 'emma.bernard@mail.com',
    prenom: 'Emma',
    nom: 'Bernard',
    phone: '+33 6 12 34 56 03',
    parentPhone: '+33 6 98 76 54 03',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 5,
  },
  {
    email: 'hugo.petit@mail.com',
    prenom: 'Hugo',
    nom: 'Petit',
    phone: '+33 6 12 34 56 04',
    parentPhone: '+33 6 98 76 54 04',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 3,
  },
  {
    email: 'lea.moreau@mail.com',
    prenom: 'Léa',
    nom: 'Moreau',
    phone: '+33 6 12 34 56 05',
    parentPhone: '+33 6 98 76 54 05',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 0,
  },
  {
    email: 'nathan.garcia@mail.com',
    prenom: 'Nathan',
    nom: 'Garcia',
    phone: '+33 6 12 34 56 06',
    parentPhone: '+33 6 98 76 54 06',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 8,
  },
  {
    email: 'chloe.roux@mail.com',
    prenom: 'Chloé',
    nom: 'Roux',
    phone: '+33 6 12 34 56 07',
    parentPhone: '+33 6 98 76 54 07',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 12,
  },
  {
    email: 'theo.fournier@mail.com',
    prenom: 'Théo',
    nom: 'Fournier',
    phone: '+33 6 12 34 56 08',
    parentPhone: '+33 6 98 76 54 08',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 4,
  },
  {
    email: 'jade.morel@mail.com',
    prenom: 'Jade',
    nom: 'Morel',
    phone: '+33 6 12 34 56 09',
    parentPhone: '+33 6 98 76 54 09',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 200,
  },
  {
    email: 'louis.simon@mail.com',
    prenom: 'Louis',
    nom: 'Simon',
    phone: '+33 6 12 34 56 10',
    parentPhone: '+33 6 98 76 54 10',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'sarah.lefevre@mail.com',
    prenom: 'Sarah',
    nom: 'Lefèvre',
    phone: '+33 6 12 34 56 11',
    parentPhone: '+33 6 98 76 54 11',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 6,
  },
  {
    email: 'maxime.durand@mail.com',
    prenom: 'Maxime',
    nom: 'Durand',
    phone: '+33 6 12 34 56 12',
    parentPhone: '+33 6 98 76 54 12',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 180,
  },
  {
    email: 'clara.leroy@mail.com',
    prenom: 'Clara',
    nom: 'Leroy',
    phone: '+33 6 12 34 56 13',
    parentPhone: '+33 6 98 76 54 13',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
  {
    email: 'tom.robert@mail.com',
    prenom: 'Tom',
    nom: 'Robert',
    phone: '+33 6 12 34 56 14',
    parentPhone: '+33 6 98 76 54 14',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 7,
  },
  {
    email: 'julie.richard@mail.com',
    prenom: 'Julie',
    nom: 'Richard',
    phone: '+33 6 12 34 56 15',
    parentPhone: '+33 6 98 76 54 15',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 0,
    skipOnboarding: true,
  },
  {
    email: 'antoine.michel@mail.com',
    prenom: 'Antoine',
    nom: 'Michel',
    phone: '+33 6 12 34 56 16',
    parentPhone: '+33 6 98 76 54 16',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 15,
  },
  {
    email: 'mila.laurent@mail.com',
    prenom: 'Mila',
    nom: 'Laurent',
    phone: '+33 6 12 34 56 17',
    parentPhone: '+33 6 98 76 54 17',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 3,
  },
  {
    email: 'nolan.chevalier@mail.com',
    prenom: 'Nolan',
    nom: 'Chevalier',
    phone: '+33 6 12 34 56 18',
    parentPhone: '+33 6 98 76 54 18',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: null, // Never active
  },
  {
    email: 'zoe.dubois@mail.com',
    prenom: 'Zoé',
    nom: 'Dubois',
    phone: '+33 6 12 34 56 19',
    parentPhone: '+33 6 98 76 54 19',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 9,
  },
  {
    email: 'ethan.bonnet@mail.com',
    prenom: 'Ethan',
    nom: 'Bonnet',
    phone: '+33 6 12 34 56 20',
    parentPhone: '+33 6 98 76 54 20',
    niveau: '1ere',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  // ── Paris extras (grid density) ──
  {
    email: 'mathis.perrin@mail.com',
    prenom: 'Mathis',
    nom: 'Perrin',
    phone: '+33 6 12 34 56 26',
    parentPhone: '+33 6 98 76 54 26',
    niveau: '5eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 4,
  },
  {
    email: 'eva.lambert@mail.com',
    prenom: 'Eva',
    nom: 'Lambert',
    phone: '+33 6 12 34 56 27',
    parentPhone: '+33 6 98 76 54 27',
    niveau: '3eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 11,
  },
  {
    email: 'raphael.mercier@mail.com',
    prenom: 'Raphaël',
    nom: 'Mercier',
    phone: '+33 6 12 34 56 28',
    parentPhone: '+33 6 98 76 54 28',
    niveau: '4eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
  {
    email: 'ines.renaud@mail.com',
    prenom: 'Inès',
    nom: 'Renaud',
    phone: '+33 6 12 34 56 29',
    parentPhone: '+33 6 98 76 54 29',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 0,
  },
  {
    email: 'noah.brun@mail.com',
    prenom: 'Noah',
    nom: 'Brun',
    phone: '+33 6 12 34 56 30',
    parentPhone: '+33 6 98 76 54 30',
    niveau: '6eme',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 90,
  },
  {
    email: 'camille.lopez@mail.com',
    prenom: 'Camille',
    nom: 'Lopez',
    phone: '+33 6 12 34 56 31',
    parentPhone: '+33 6 98 76 54 31',
    niveau: 'Terminale',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'elise.pierre@mail.com',
    prenom: 'Élise',
    nom: 'Pierre',
    phone: '+33 6 12 34 56 32',
    parentPhone: '+33 6 98 76 54 32',
    niveau: '3eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 6,
  },
  {
    email: 'tristan.roussel@mail.com',
    prenom: 'Tristan',
    nom: 'Roussel',
    phone: '+33 6 12 34 56 33',
    parentPhone: '+33 6 98 76 54 33',
    niveau: '4eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: null,
  },
  {
    email: 'leon.marin@mail.com',
    prenom: 'Léon',
    nom: 'Marin',
    phone: '+33 6 12 34 56 34',
    parentPhone: '+33 6 98 76 54 34',
    niveau: '1ere',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 14,
  },
  {
    email: 'anais.vasseur@mail.com',
    prenom: 'Anaïs',
    nom: 'Vasseur',
    phone: '+33 6 12 34 56 35',
    parentPhone: '+33 6 98 76 54 35',
    niveau: '5eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 3,
  },
  {
    email: 'sacha.picard@mail.com',
    prenom: 'Sacha',
    nom: 'Picard',
    phone: '+33 6 12 34 56 36',
    parentPhone: '+33 6 98 76 54 36',
    niveau: '2nde',
    campus: 'Paris',
    charterSigned: false,
    lastActiveDaysAgo: 220,
  },
  {
    email: 'lou.carpentier@mail.com',
    prenom: 'Lou',
    nom: 'Carpentier',
    phone: '+33 6 12 34 56 37',
    parentPhone: '+33 6 98 76 54 37',
    niveau: '6eme',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 5,
  },
  // ── Lyon (5 students) ──
  {
    email: 'eliot.amanieu@epitech.eu',
    prenom: 'Eliot',
    nom: 'Amanieu',
    phone: '+33 7 12 34 56 20',
    parentPhone: '+33 7 98 76 54 20',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 0,
    skipOnboarding: true,
  },
  {
    email: 'ines.durand@mail.com',
    prenom: 'Inès',
    nom: 'Durand',
    phone: '+33 7 12 34 56 21',
    parentPhone: '+33 7 98 76 54 21',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
  {
    email: 'adam.leroy@mail.com',
    prenom: 'Adam',
    nom: 'Leroy',
    phone: '+33 7 12 34 56 22',
    parentPhone: '+33 7 98 76 54 22',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 5,
  },
  {
    email: 'manon.david@mail.com',
    prenom: 'Manon',
    nom: 'David',
    phone: '+33 7 12 34 56 23',
    parentPhone: '+33 7 98 76 54 23',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 10,
  },
  {
    email: 'enzo.girard@mail.com',
    prenom: 'Enzo',
    nom: 'Girard',
    phone: '+33 7 12 34 56 24',
    parentPhone: '+33 7 98 76 54 24',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'rose.henri@mail.com',
    prenom: 'Rose',
    nom: 'Henri',
    phone: '+33 7 12 34 56 25',
    parentPhone: '+33 7 98 76 54 25',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: false,
    lastActiveDaysAgo: 20,
  },
  // ── Lyon extras (grid density) ──
  {
    email: 'eliott.marchal@mail.com',
    prenom: 'Eliott',
    nom: 'Marchal',
    phone: '+33 7 12 34 56 26',
    parentPhone: '+33 7 98 76 54 26',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 4,
  },
  {
    email: 'romane.garnier@mail.com',
    prenom: 'Romane',
    nom: 'Garnier',
    phone: '+33 7 12 34 56 27',
    parentPhone: '+33 7 98 76 54 27',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  {
    email: 'owen.pasquier@mail.com',
    prenom: 'Owen',
    nom: 'Pasquier',
    phone: '+33 7 12 34 56 28',
    parentPhone: '+33 7 98 76 54 28',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 8,
  },
  {
    email: 'maelys.olivier@mail.com',
    prenom: 'Maëlys',
    nom: 'Olivier',
    phone: '+33 7 12 34 56 29',
    parentPhone: '+33 7 98 76 54 29',
    niveau: '2nde',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 0,
  },
  {
    email: 'jules.riviere@mail.com',
    prenom: 'Jules',
    nom: 'Rivière',
    phone: '+33 7 12 34 56 30',
    parentPhone: '+33 7 98 76 54 30',
    niveau: '1ere',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 13,
  },
  {
    email: 'lilou.renaud@mail.com',
    prenom: 'Lilou',
    nom: 'Renaud',
    phone: '+33 7 12 34 56 31',
    parentPhone: '+33 7 98 76 54 31',
    niveau: '6eme',
    campus: 'Lyon',
    charterSigned: false,
    lastActiveDaysAgo: 150,
  },
  {
    email: 'soan.brunet@mail.com',
    prenom: 'Soan',
    nom: 'Brunet',
    phone: '+33 7 12 34 56 32',
    parentPhone: '+33 7 98 76 54 32',
    niveau: '4eme',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: null,
  },
  {
    email: 'iris.lemaire@mail.com',
    prenom: 'Iris',
    nom: 'Lemaire',
    phone: '+33 7 12 34 56 33',
    parentPhone: '+33 7 98 76 54 33',
    niveau: 'Terminale',
    campus: 'Lyon',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
];

// ─── Event blueprints ───

type SlotBlueprint = {
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  label?: string;
  activities: { nom: string; activityType?: ActivityType }[];
};

type DayBlueprint = {
  dayOffset: number; // offset from event start day
  slots: SlotBlueprint[];
};

type EventBlueprint = {
  titre: string;
  eventType?: EventType;
  daysOffset: number; // event date offset from today
  durationDays?: number; // >1 for multi-day events
  campus: 'Paris' | 'Lyon';
  theme: string;
  pin: string;
  notes?: string | null;
  mantaKeys: string[];
  days?: DayBlueprint[]; // if multi-day
  slots?: SlotBlueprint[]; // if single day (dayOffset=0)
  // Participations
  studentEmails: string[];
  presentEmails?: string[]; // subset of studentEmails
  delays?: Record<string, number>; // email -> delay minutes
  verdicts_by_email?: Record<
    string,
    {
      verdict: ParticipationVerdict;
      contextTag?: ParticipationContextTag;
      authorKey: string;
    }
  >;
  ratings?: Record<string, number>;
  feedback?: Record<string, string>;
  bringPc?: (email: string, index: number) => boolean;
  // Stage compliance: only for stage_seconde events
  stageSigned?: string[]; // emails with fully signed compliance
  stageUnsigned?: string[]; // emails missing at least one doc
};

// Build a helper to keep event definitions readable
const parisStudents = STUDENTS.filter((s) => s.campus === 'Paris').map(
  (s) => s.email,
);
const lyonStudents = STUDENTS.filter((s) => s.campus === 'Lyon').map(
  (s) => s.email,
);

const standardOrgaSlot = (): SlotBlueprint => ({
  startHour: 13,
  endHour: 13,
  endMinute: 30,
  label: 'Accueil & appel',
  activities: [{ nom: 'Appel', activityType: 'orga' }],
});

// Stage de seconde anchors. One stage per talent per academic year, ~2
// weeks long, kickoff around mid-month. Past Paris edition is ~11 months
// back (previous cohort), the current Paris one straddles "today" so QA
// can exercise the En-cours phase, and the Lyon edition is the upcoming
// kickoff. Shared between EVENTS and the INTERVIEWS/BROADCASTS
// blueprints that point at those stages by titre/eventIndex.
const STAGE_DURATION_DAYS = 14;
const PAST_PARIS_STAGE_OFFSET = -338;
const ONGOING_PARIS_STAGE_OFFSET = -2;
const FUTURE_LYON_STAGE_OFFSET = 27;

const PAST_PARIS_STAGE_TITLE = formatStageSecondeTitle(
  'Paris',
  PAST_PARIS_STAGE_OFFSET,
);
const ONGOING_PARIS_STAGE_TITLE = formatStageSecondeTitle(
  'Paris',
  ONGOING_PARIS_STAGE_OFFSET,
);
const FUTURE_LYON_STAGE_TITLE = formatStageSecondeTitle(
  'Lyon',
  FUTURE_LYON_STAGE_OFFSET,
);

const EVENTS: EventBlueprint[] = [
  // 1. Past cyber workshop (2 weeks ago) — certificate-ready
  {
    titre: 'Atelier Cybersécurité',
    daysOffset: -14,
    campus: 'Paris',
    theme: 'Cybersécurité',
    pin: '9999',
    notes: 'Sujet phishing très apprécié.',
    mantaKeys: ['jules.dupont', 'laura.garcia'],
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 15,
        endMinute: 45,
        label: 'Après-midi',
        activities: [
          { nom: 'Initiation à la cybersécurité' },
          { nom: 'Cryptographie : les secrets du code' },
        ],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 8),
      parisStudents[19], // ethan.bonnet — 1ere
      parisStudents[20], // mathis.perrin — 5eme
      parisStudents[21], // eva.lambert — 3eme
    ],
    presentEmails: [
      ...parisStudents.slice(0, 7),
      parisStudents[19],
      parisStudents[20],
      parisStudents[21],
    ], // 10/11 attended
    delays: { [parisStudents[3]]: 10 },
    verdicts_by_email: {
      [parisStudents[0]]: {
        verdict: 'comfortable',
        authorKey: 'jules.dupont',
      },
      [parisStudents[4]]: {
        verdict: 'comfortable',
        contextTag: 'helped_others',
        authorKey: 'laura.garcia',
      },
    },
    ratings: {
      [parisStudents[0]]: 3,
      [parisStudents[1]]: 3,
      [parisStudents[2]]: 2,
      [parisStudents[3]]: 3,
      [parisStudents[4]]: 3,
      [parisStudents[5]]: 2,
      [parisStudents[6]]: 3,
    },
    feedback: {
      [parisStudents[0]]: "J'ai adoré le challenge César !",
      [parisStudents[4]]: 'On veut plus de crypto !',
    },
    bringPc: (_, i) => i % 3 !== 0,
  },

  // 2. Past robotics workshop (1 week ago)
  {
    titre: 'Atelier Robotique Découverte',
    daysOffset: -7,
    campus: 'Paris',
    theme: 'Robotique',
    pin: '4321',
    notes: null,
    mantaKeys: ['laura.garcia'],
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        endMinute: 30,
        label: 'Après-midi',
        activities: [{ nom: 'Construis ton robot' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 10),
      parisStudents[22], // raphael.mercier — 4eme
      parisStudents[24], // noah.brun — 6eme
      parisStudents[25], // camille.lopez — Terminale
    ],
    presentEmails: [
      ...parisStudents.slice(0, 9),
      parisStudents[22],
      parisStudents[24],
    ], // 11/13 attended
    delays: { [parisStudents[1]]: 10, [parisStudents[5]]: 5 },
    ratings: {
      [parisStudents[0]]: 3,
      [parisStudents[1]]: 3,
      [parisStudents[2]]: 2,
      [parisStudents[3]]: 3,
      [parisStudents[4]]: 2,
      [parisStudents[5]]: 3,
      [parisStudents[6]]: 3,
      [parisStudents[7]]: 2,
      [parisStudents[8]]: 3,
    },
    feedback: { [parisStudents[1]]: 'Le robot était trop cool !' },
    bringPc: () => false,
  },

  // 3. Past STAGE DE SECONDE (promotion précédente — historique + portfolio)
  {
    titre: PAST_PARIS_STAGE_TITLE,
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: PAST_PARIS_STAGE_OFFSET,
    durationDays: STAGE_DURATION_DAYS,
    campus: 'Paris',
    theme: 'Développement Web',
    pin: '1001',
    notes: 'Édition juin — promotion précédente. Archive pédagogique.',
    mantaKeys: ['jules.dupont', 'laura.garcia'],
    days: [
      {
        dayOffset: 0,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 15,
            endMinute: 45,
            label: 'Web — Matin',
            activities: [
              { nom: 'Ma première page HTML' },
              { nom: 'CSS : Styliser sa page' },
            ],
          },
        ],
      },
      {
        dayOffset: 1,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 15,
            endMinute: 45,
            label: 'Robotique',
            activities: [{ nom: 'Construis ton robot' }],
          },
          {
            startHour: 16,
            endHour: 17,
            label: 'Capteurs (avancé)',
            activities: [{ nom: 'Capteurs et actionneurs' }],
          },
        ],
      },
      {
        dayOffset: 2,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 15,
            endMinute: 45,
            label: 'IA',
            activities: [
              { nom: "L'IA et moi" },
              { nom: 'Entraîne ton modèle' },
            ],
          },
        ],
      },
    ],
    studentEmails: parisStudents.slice(0, 6),
    presentEmails: parisStudents.slice(0, 6), // all attended
    ratings: {
      [parisStudents[0]]: 3,
      [parisStudents[1]]: 3,
      [parisStudents[2]]: 3,
      [parisStudents[3]]: 3,
      [parisStudents[4]]: 3,
      [parisStudents[5]]: 2,
    },
    bringPc: () => true,
    stageSigned: parisStudents.slice(0, 3), // 3 fully signed
    stageUnsigned: parisStudents.slice(3, 6), // 3 partial
  },

  // 4. LIVE EVENT (today) — IA workshop
  {
    titre: "Atelier IA : L'intelligence artificielle",
    daysOffset: 0,
    campus: 'Paris',
    theme: 'Intelligence Artificielle',
    pin: '7777',
    notes: null,
    mantaKeys: ['jules.dupont', 'laura.garcia'],
    slots: [
      {
        startHour: 13,
        endHour: 14,
        label: 'Conférence',
        activities: [
          { nom: "Bienvenue à l'atelier IA", activityType: 'conference' },
        ],
      },
      {
        startHour: 14,
        endHour: 14,
        endMinute: 15,
        label: 'Appel',
        activities: [{ nom: 'Appel après-midi', activityType: 'orga' }],
      },
      {
        startHour: 14,
        startMinute: 15,
        endHour: 16,
        endMinute: 30,
        label: 'Ateliers',
        activities: [{ nom: "L'IA et moi" }, { nom: 'Entraîne ton modèle' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 8),
      parisStudents[27], // tristan.roussel — 4eme
      parisStudents[28], // leon.marin — 1ere
    ],
    presentEmails: parisStudents.slice(0, 6), // 6 already checked in
    delays: { [parisStudents[4]]: 15 },
    verdicts_by_email: {
      [parisStudents[2]]: {
        verdict: 'progressing',
        authorKey: 'jules.dupont',
      },
    },
    bringPc: (_, i) => i % 2 === 0,
  },

  // 5. Task queue trigger: event in 2 days WITHOUT MANTAS
  {
    titre: 'Atelier Web Débutants',
    daysOffset: 2,
    campus: 'Paris',
    theme: 'Développement Web',
    pin: '2222',
    notes: null,
    mantaKeys: [], // ← intentional
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 15,
        endMinute: 45,
        label: 'Après-midi',
        activities: [
          { nom: 'Ma première page HTML' },
          { nom: 'CSS : Styliser sa page' },
        ],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(10, 16),
      parisStudents[26], // elise.pierre — 3eme
      parisStudents[29], // anais.vasseur — 5eme
    ],
    bringPc: () => true,
  },

  // 6. Task queue trigger: event in 4 days WITHOUT PLANNING (has mantas, no slots)
  {
    titre: 'Atelier Game Design',
    daysOffset: 4,
    campus: 'Paris',
    theme: 'Jeux Vidéo',
    pin: '3333',
    notes: null,
    mantaKeys: ['jules.dupont'],
    slots: [], // ← intentional (empty planning)
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(5, 12),
      parisStudents[19], // ethan.bonnet — 1ere
      parisStudents[31], // lou.carpentier — 6eme
    ],
    bringPc: () => true,
  },

  // 7. Fully-prepared event in 7 days
  {
    titre: 'Atelier Scratch : Crée ton jeu',
    daysOffset: 7,
    campus: 'Paris',
    theme: 'Jeux Vidéo',
    pin: '5678',
    notes: null,
    mantaKeys: ['laura.garcia'],
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        label: 'Création',
        activities: [{ nom: 'Crée ton jeu Scratch' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + extras from other class levels.
    studentEmails: [
      ...parisStudents.slice(0, 10),
      parisStudents[20], // mathis.perrin — 5eme
      parisStudents[22], // raphael.mercier — 4eme
      parisStudents[27], // tristan.roussel — 4eme
    ],
    bringPc: () => true,
  },

  // 8. Ongoing STAGE DE SECONDE — En-cours phase QA (today = J3 of 14)
  {
    titre: ONGOING_PARIS_STAGE_TITLE,
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: ONGOING_PARIS_STAGE_OFFSET,
    durationDays: STAGE_DURATION_DAYS,
    campus: 'Paris',
    theme: 'Développement Web',
    pin: '1003',
    notes:
      "Cohorte en plein milieu du stage. Demo Day vendredi à 14h (Amphi A).\n\n## Logistique\n\n- Repas : commande validée pour les 5 jours.\n- Mentors : 2 référents pédago disponibles tous les après-midis.\n\n## À surveiller\n\n- Retour parents sur le droit à l'image — 3 dossiers en attente de relance.",
    mantaKeys: ['jules.dupont', 'laura.garcia'],
    days: [
      // Day 0 — Lundi (déjà passé, J1)
      {
        dayOffset: 0,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J1', activityType: 'orga' }],
          },
          {
            startHour: 9,
            startMinute: 30,
            endHour: 12,
            label: 'Web — démarrage',
            activities: [{ nom: 'Ma première page HTML' }],
          },
          {
            startHour: 14,
            endHour: 17,
            label: 'CSS & créa',
            activities: [{ nom: 'CSS : Styliser sa page' }],
          },
        ],
      },
      // Day 1 — Mardi (déjà passé, J2)
      {
        dayOffset: 1,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J2', activityType: 'orga' }],
          },
          {
            startHour: 10,
            endHour: 12,
            label: 'IA — découverte',
            activities: [{ nom: "L'IA et moi" }],
          },
          {
            startHour: 14,
            endHour: 17,
            label: 'Visite du campus',
            activities: [{ nom: 'Visite du campus Epitech Paris' }],
          },
        ],
      },
      // Day 2 — Aujourd'hui (J3)
      {
        dayOffset: 2,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J3', activityType: 'orga' }],
          },
          {
            startHour: 10,
            endHour: 12,
            label: 'Métiers de la tech',
            activities: [{ nom: 'Conférence : Les métiers de la tech' }],
          },
          {
            startHour: 14,
            endHour: 16,
            label: 'Visite du campus',
            activities: [{ nom: 'Visite du campus Epitech Paris' }],
          },
        ],
      },
      // Day 3 — Jeudi (à venir, J4)
      {
        dayOffset: 3,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J4', activityType: 'orga' }],
          },
          {
            startHour: 10,
            endHour: 17,
            label: 'Game design',
            activities: [{ nom: 'Crée ton jeu Scratch' }],
          },
        ],
      },
      // Day 4 — Vendredi (à venir, J5 — Demo Day)
      {
        dayOffset: 4,
        slots: [
          {
            startHour: 9,
            endHour: 9,
            endMinute: 30,
            label: 'Appel matin',
            activities: [{ nom: 'Appel matin J5', activityType: 'orga' }],
          },
          {
            startHour: 14,
            endHour: 16,
            label: 'Demo Day',
            activities: [
              { nom: 'Demo Day — final', activityType: 'conference' },
            ],
          },
        ],
      },
    ],
    // parisStudents[0] (alice.martin) already did her stage de seconde with
    // the previous cohort — one stage per talent, ever — so the current
    // edition only registers the new cohort at indices 6..17.
    studentEmails: parisStudents.slice(6, 18),
    presentEmails: parisStudents.slice(6, 16), // 10/12 émargés
    delays: { [parisStudents[9]]: 10, [parisStudents[13]]: 5 },
    bringPc: () => true,
    stageSigned: parisStudents.slice(6, 14), // 8/12 dossiers complets
    stageUnsigned: parisStudents.slice(14, 18), // 4 partiels — alimente alertes
  },

  // 9. Past Lyon event
  {
    titre: 'Atelier Web Lyon',
    daysOffset: -10,
    campus: 'Lyon',
    theme: 'Développement Web',
    pin: '6001',
    notes: null,
    mantaKeys: ['pierre.leblanc'],
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        label: 'Après-midi',
        activities: [{ nom: 'Ma première page HTML' }],
      },
    ],
    // Niveau mix: stage cohort (2nde) + Lyon extras from other class levels.
    studentEmails: [
      ...lyonStudents.slice(0, 4),
      lyonStudents[10], // jules.riviere — 1ere
      lyonStudents[11], // lilou.renaud — 6eme
    ],
    presentEmails: [
      ...lyonStudents.slice(0, 4),
      lyonStudents[10],
      lyonStudents[11],
    ],
    ratings: {
      [lyonStudents[0]]: 3,
      [lyonStudents[1]]: 3,
      [lyonStudents[2]]: 2,
      [lyonStudents[3]]: 3,
    },
    bringPc: () => true,
  },

  // 10. Upcoming Lyon event
  {
    titre: 'Atelier Robotique Lyon',
    daysOffset: 10,
    campus: 'Lyon',
    theme: 'Robotique',
    pin: '6002',
    notes: null,
    mantaKeys: ['pierre.leblanc'],
    slots: [
      standardOrgaSlot(),
      {
        startHour: 13,
        startMinute: 45,
        endHour: 16,
        label: 'Robotique',
        activities: [{ nom: 'Construis ton robot' }],
      },
    ],
    studentEmails: lyonStudents,
    bringPc: () => false,
  },

  // 11. Future STAGE DE SECONDE Lyon (compliance + cross-campus coverage)
  {
    titre: FUTURE_LYON_STAGE_TITLE,
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: FUTURE_LYON_STAGE_OFFSET,
    durationDays: STAGE_DURATION_DAYS,
    campus: 'Lyon',
    theme: 'Développement Web',
    pin: '6003',
    notes: null,
    mantaKeys: ['pierre.leblanc', 'jeanne.albert', 'romain.caron'],
    days: [
      {
        dayOffset: 0,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 16,
            label: 'Web',
            activities: [
              { nom: 'Ma première page HTML' },
              { nom: 'CSS : Styliser sa page' },
            ],
          },
        ],
      },
      {
        dayOffset: 1,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 16,
            label: 'Robotique',
            activities: [{ nom: 'Construis ton robot' }],
          },
        ],
      },
      {
        dayOffset: 2,
        slots: [
          standardOrgaSlot(),
          {
            startHour: 13,
            startMinute: 45,
            endHour: 16,
            label: 'IA',
            activities: [{ nom: "L'IA et moi" }],
          },
        ],
      },
    ],
    studentEmails: lyonStudents.slice(0, 10),
    stageSigned: lyonStudents.slice(0, 5), // 5 of 10 fully signed
    stageUnsigned: lyonStudents.slice(5, 10), // 5 partial
    bringPc: () => true,
  },
];

// ─── Interview blueprints ───

// The questionnaire answers, typed straight off the Prisma create input so the
// enum/array values are checked at compile time.
type InterviewAnswers = Partial<
  Pick<
    Prisma.InterviewCreateManyInput,
    // Choice / rating answers.
    | 'discoveryChannel'
    | 'motivation'
    | 'orientationTalkAtSchool'
    | 'passionateTeacher'
    | 'techProjection'
    | 'specialties'
    | 'otherJobs'
    | 'infoSources'
    | 'wantsMore'
    | 'nextYearEvents'
    | 'satisfactionStars'
    | 'recommendation'
    // Free text: the per-question notes, plus the testimony and the verdict.
    | 'discoveryChannelNote'
    | 'motivationNote'
    | 'specialtiesNote'
    | 'orientationTalkNote'
    | 'passionateTeacherNote'
    | 'techProjectionNote'
    | 'otherJobsNote'
    | 'infoSourcesNote'
    | 'wantsMoreNote'
    | 'satisfactionNote'
    | 'nextYearEventsNote'
    | 'oneSentence'
    | 'verdictNote'
  >
>;

type InterviewBlueprint = {
  studentEmail: string;
  staffKey: string;
  status: 'in_progress' | 'done';
  // Required: the interview is 1:1 with the talent's participation in this stage.
  // A blueprint whose talent has no participation here is skipped (warn), so
  // only real stage participants ever get an interview row.
  forEventTitre: string;
  answers?: InterviewAnswers;
};

// Orientation interviews on the ongoing Paris stage. Conducted by the dev team
// (marie.manta = dev, pauline.marchand = superdev). A handful are finalized with
// full answers + a recommendation so the Entretiens list, the synthesis card and
// the recommendation breakdown all render; a couple stay in progress; the rest of
// the cohort has no row, i.e. "à faire".
const INTERVIEWS: InterviewBlueprint[] = [
  {
    studentEmail: parisStudents[6],
    staffKey: 'marie.manta',
    status: 'done',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'site_1e1s',
      motivation: 'passion',
      specialties: ['nsi', 'maths'],
      orientationTalkAtSchool: 'un_peu',
      passionateTeacher: 'oui',
      passionateTeacherNote:
        'M. Garnier (NSI), anime un club robotique au lycée.',
      techProjection: ['dev'],
      infoSources: ['youtube', 'tiktok', 'ia_chatgpt'],
      wantsMore: 'oui',
      satisfactionStars: 5,
      satisfactionNote: 'Niveau parfaitement adapté, repart très motivée.',
      oneSentence: 'Une semaine qui m’a donné envie de coder tous les jours.',
      nextYearEvents: ['coding_club', 'jpo'],
      recommendation: 'tres_compatible',
      verdictNote: 'Très motivée, projet clair. À inviter à la prochaine JPO.',
    },
  },
  {
    studentEmail: parisStudents[7],
    staffKey: 'marie.manta',
    status: 'done',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'entourage',
      motivation: 'metier',
      specialties: ['maths', 'physique_chimie'],
      orientationTalkAtSchool: 'pas_du_tout',
      passionateTeacher: 'pas_sur',
      techProjection: ['jeux_video'],
      techProjectionNote: 'Hésite entre le dev de jeux et le game design.',
      otherJobs: ['arts_design'],
      infoSources: ['instagram', 'youtube'],
      wantsMore: 'peut_etre',
      satisfactionStars: 4,
      oneSentence: 'J’ai compris comment un jeu est fabriqué.',
      nextYearEvents: ['camp', 'journee_decouverte'],
      recommendation: 'bon_profil',
      verdictNote: 'Hésite avec le game design, à relancer dans 6 mois.',
    },
  },
  {
    studentEmail: parisStudents[8],
    staffKey: 'pauline.marchand',
    status: 'done',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'google',
      motivation: 'curiosite',
      specialties: ['indecis'],
      orientationTalkAtSchool: 'un_peu',
      passionateTeacher: 'pas_sur',
      techProjection: ['pas_idee'],
      otherJobs: ['sante', 'commerce_gestion'],
      infoSources: ['parcoursup_onisep', 'entourage'],
      wantsMore: 'peut_etre',
      satisfactionStars: 4,
      satisfactionNote: 'A trouvé la semaine un peu dense, mais intéressante.',
      oneSentence: 'Intéressant mais beaucoup d’informations d’un coup.',
      nextYearEvents: ['conference'],
      recommendation: 'indecis',
      verdictNote: 'Profil ouvert, encore en réflexion sur son orientation.',
    },
  },
  {
    studentEmail: parisStudents[9],
    staffKey: 'marie.manta',
    status: 'in_progress',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'epitech',
      motivation: 'cadre_stage',
      techProjection: ['cyber'],
      infoSources: ['tiktok'],
    },
  },
  {
    studentEmail: parisStudents[10],
    staffKey: 'pauline.marchand',
    status: 'in_progress',
    forEventTitre: ONGOING_PARIS_STAGE_TITLE,
    answers: {
      discoveryChannel: 'site_1e1s',
      specialties: ['nsi'],
      specialtiesNote: 'Vise une prépa, hésite encore sur la voie.',
    },
  },
];

// ─── Reminder blueprints ───
//
// Onboarding relances envoyées depuis /staff/dev/events/[id]/onboarding. Visible
// dans "Historique des relances" sur la fiche talent. Cible : élèves en cours
// d'onboarding (signatures incomplètes), avec une vraie cadence (J-10 puis J-3
// par exemple) plutôt que des dates uniformes.

type ReminderBlueprint = {
  studentEmail: string;
  type: 'student' | 'parent';
  // 'email' is the primary nudge; 'sms' is the link-free escalation. Defaults
  // to 'email' when omitted.
  channel?: 'email' | 'sms';
  staffKey: string;
  daysOffset: number; // negative = past
  hour?: number;
  // Optional archived copy of what was sent. When absent the fiche shows the
  // "contenu non archivé" placeholder — keep a few that way so devs see both
  // states in the timeline. SMS reminders carry no subject.
  subject?: string;
  body?: string;
};

const REMINDERS: ReminderBlueprint[] = [
  // Cohorte en cours — 4 dossiers partiels (parisStudents 14–17). Pauline
  // (devLead) et Marie (dev) ont relancé à plusieurs reprises avant le démarrage.
  {
    studentEmail: parisStudents[14],
    type: 'student',
    staffKey: 'pauline.marchand',
    daysOffset: -10,
    hour: 9,
    subject: 'Ton stage de seconde — derniers documents à signer',
    body: `Bonjour,

Le stage commence dans une dizaine de jours et il manque encore ta
convention signée pour finaliser ton inscription.

Tu peux la récupérer directement depuis ton espace Jump (rubrique
Documents) puis nous la renvoyer signée par tes parents.

N'hésite pas à me répondre si tu rencontres la moindre difficulté.

Bonne journée,
Pauline — Epitech Academy Paris`,
  },
  {
    studentEmail: parisStudents[14],
    type: 'parent',
    staffKey: 'pauline.marchand',
    daysOffset: -3,
    hour: 11,
    subject: 'Stage de seconde — rappel signature convention',
    body: `Bonjour,

Nous accueillons votre enfant dans 3 jours pour son stage de seconde
à Epitech Paris. Pour pouvoir le recevoir, il nous manque encore la
convention de stage signée.

Pourriez-vous nous la retourner avant vendredi soir ? Le document
est disponible dans l'espace Jump de votre enfant.

Bien cordialement,
Pauline Marchand — Talent Acquisition`,
  },
  {
    studentEmail: parisStudents[15],
    type: 'parent',
    staffKey: 'marie.manta',
    daysOffset: -4,
    hour: 14,
  },
  {
    studentEmail: parisStudents[16],
    type: 'student',
    staffKey: 'marie.manta',
    daysOffset: -12,
    hour: 10,
    subject: 'Rappel — autorisation parentale',
    body: `Salut,

Petit rappel : il nous faut l'autorisation parentale signée par
l'un de tes parents pour que tu puisses participer au stage.

Le document se trouve sur ton espace Jump > Documents. Une fois
signé, dépose-le au même endroit ou renvoie-le moi par mail.

À très vite,
Marie`,
  },
  {
    studentEmail: parisStudents[16],
    type: 'parent',
    staffKey: 'pauline.marchand',
    daysOffset: -5,
    hour: 9,
  },
  {
    studentEmail: parisStudents[17],
    type: 'parent',
    staffKey: 'pauline.marchand',
    daysOffset: -2,
    hour: 16,
  },
  // Talents hors stage avec onboarding incomplet — relances génériques pour
  // alimenter les fiches profils en dehors du contexte stage.
  {
    studentEmail: parisStudents[20],
    type: 'student',
    staffKey: 'antoine.roux',
    daysOffset: -15,
    hour: 11,
  },
  {
    studentEmail: parisStudents[25],
    type: 'parent',
    staffKey: 'clara.noel',
    daysOffset: -7,
    hour: 14,
  },
  // Lyon — stage de seconde Lyon a 5 dossiers partiels (lyonStudents 5–9).
  // Hugo (Lyon devLead) et Sarah (Lyon dev) gèrent les relances.
  {
    studentEmail: lyonStudents[5],
    type: 'parent',
    staffKey: 'hugo.lefebvre',
    daysOffset: -6,
    hour: 10,
  },
  {
    studentEmail: lyonStudents[6],
    type: 'student',
    staffKey: 'sarah.moreau',
    daysOffset: -8,
    hour: 15,
  },
  {
    studentEmail: lyonStudents[6],
    type: 'parent',
    staffKey: 'hugo.lefebvre',
    daysOffset: -4,
    hour: 9,
  },
  {
    studentEmail: lyonStudents[8],
    type: 'parent',
    staffKey: 'sarah.moreau',
    daysOffset: -3,
    hour: 11,
  },
  // SMS escalation — the email relances to parisStudents[14] above went
  // unanswered, so Pauline escalates with a link-free text pointing back to
  // the inbox. Drives the "Relance · SMS" badge in the fiche timeline.
  {
    studentEmail: parisStudents[14],
    type: 'student',
    channel: 'sms',
    staffKey: 'pauline.marchand',
    daysOffset: -1,
    hour: 10,
    body: "Salut, plus que 5 jours avant ton stage à Epitech ! Finalise vite ton inscription : on t'a envoyé un mail. - Epitech Paris",
  },
];

// ─── Broadcast blueprints ───
//
// Mass campaigns (mail + SMS) targeting talents or their parents. Visible
// in the Communications timeline on the fiche talent, mixed with the 1:1
// onboarding reminders above. Covers every UI state we want devs to be
// able to eyeball: opened, sent-not-opened, failed (with error), pending
// (queued), SMS variant, parent-side recipient.

type BroadcastRecipientBlueprint = {
  studentEmail: string;
  /** Recipient is the parent (parentOfTalentId) rather than the talent. */
  parentSide?: boolean;
  status: 'pending' | 'sent' | 'failed';
  sentDaysOffset?: number;
  sentHour?: number;
  openedDaysOffset?: number;
  openedHour?: number;
  errorMessage?: string;
};

type BroadcastBlueprint = {
  name: string;
  channel: 'mail' | 'sms';
  audience: 'talent' | 'parent';
  campus: 'Paris' | 'Lyon';
  /** Index into the seeded eventIds list; null = campus-wide, no event link. */
  eventIndex: number | null;
  subject: string | null;
  body: string;
  createdByStaffKey: string;
  createdDaysOffset: number;
  createdHour: number;
  /** Final aggregate status of the broadcast itself (independent of each
   * recipient row). `queued` = nothing dispatched yet; `sent` = all done. */
  status: 'queued' | 'sent' | 'partial_failed';
  recipients: BroadcastRecipientBlueprint[];
};

const BROADCASTS: BroadcastBlueprint[] = [
  // Headline campaign sent at stage kickoff — drives the "opened" + "sent
  // not opened" variants in the fiche timeline. Event-scoped to the
  // ongoing Paris stage (eventIds[7]).
  {
    name: 'Bienvenue au stage de seconde 🚀',
    channel: 'mail',
    audience: 'talent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'pauline.marchand',
    createdDaysOffset: -8,
    createdHour: 8,
    status: 'sent',
    subject: 'À demain ! Tout ce qu’il faut savoir pour ton stage',
    body: `Salut {{prenom}},

Demain, c'est le grand jour : ton stage de seconde commence à Epitech Paris !

📍 Rendez-vous à 9h, 14-16 rue Voltaire, 94270 Le Kremlin-Bicêtre.
🎒 Apporte-toi de quoi noter et ta carte d'identité.
💻 Pas besoin d'ordinateur — tout est fourni sur place.

On se voit demain !
L'équipe Epitech Academy`,
    recipients: [
      {
        studentEmail: parisStudents[6],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        openedDaysOffset: -7,
        openedHour: 19,
      },
      {
        studentEmail: parisStudents[14],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        openedDaysOffset: -7,
        openedHour: 12,
      },
      {
        studentEmail: parisStudents[16],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        // No openedAt — surfaces the "Non ouvert" tooltip in the UI.
      },
      {
        studentEmail: parisStudents[7],
        status: 'sent',
        sentDaysOffset: -8,
        sentHour: 8,
        openedDaysOffset: -6,
        openedHour: 9,
      },
    ],
  },
  // Parent-side reminder — exercises audience=parent + parentSide on the
  // recipient + the "Échec" delivery state.
  {
    name: 'Rappel — Signature de la convention',
    channel: 'mail',
    audience: 'parent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'pauline.marchand',
    createdDaysOffset: -5,
    createdHour: 10,
    status: 'partial_failed',
    subject: 'Convention de stage — à signer avant vendredi',
    body: `Bonjour,

Le stage de votre enfant approche et nous n'avons pas encore reçu la
convention signée. Pour pouvoir l'accueillir lundi, nous avons besoin
du document avant vendredi soir.

Vous le trouverez dans l'espace Jump de votre enfant (rubrique
Documents). N'hésitez pas à nous écrire en cas de besoin.

Bien cordialement,
Pauline Marchand — Epitech Academy Paris`,
    recipients: [
      {
        studentEmail: parisStudents[14],
        parentSide: true,
        status: 'sent',
        sentDaysOffset: -5,
        sentHour: 10,
        openedDaysOffset: -5,
        openedHour: 18,
      },
      {
        studentEmail: parisStudents[15],
        parentSide: true,
        status: 'sent',
        sentDaysOffset: -5,
        sentHour: 10,
      },
      {
        studentEmail: parisStudents[16],
        parentSide: true,
        status: 'failed',
        errorMessage: 'Adresse parent inconnue ou inactive',
      },
    ],
  },
  // SMS J-1 — exercises the channel switch (MessageSquare icon, no opened
  // state since SMS has no open tracking).
  {
    name: 'Démarrage demain — checklist & adresse',
    channel: 'sms',
    audience: 'talent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'marie.manta',
    createdDaysOffset: -1,
    createdHour: 17,
    status: 'sent',
    subject: null,
    body: `Salut {{prenom}}, RDV demain 9h au 14-16 rue Voltaire (Kremlin-Bicêtre). Apporte ta carte d'identité, on s'occupe du reste. — Epitech Academy`,
    recipients: [
      {
        studentEmail: parisStudents[6],
        status: 'sent',
        sentDaysOffset: -1,
        sentHour: 17,
      },
      {
        studentEmail: parisStudents[14],
        status: 'sent',
        sentDaysOffset: -1,
        sentHour: 17,
      },
      {
        studentEmail: parisStudents[16],
        status: 'sent',
        sentDaysOffset: -1,
        sentHour: 17,
      },
    ],
  },
  // Queued campaign — recipients are still pending (no sentAt yet), so the
  // timeline falls back to broadcast.createdAt for ordering. Demonstrates
  // the "En attente" pill.
  {
    name: 'Récap de stage — bravo et retours',
    channel: 'mail',
    audience: 'talent',
    campus: 'Paris',
    eventIndex: 7,
    createdByStaffKey: 'pauline.marchand',
    createdDaysOffset: 0,
    createdHour: 9,
    status: 'queued',
    subject: 'Ton stage est fini — un dernier message',
    body: `Bravo {{prenom}} !

Tu viens de boucler ton stage de seconde à Epitech. On a passé une
semaine super avec toi.

On t'enverra un récap personnalisé d'ici quelques jours, avec
quelques pistes pour la suite si la tech t'intéresse.

À très vite,
L'équipe Epitech Academy`,
    recipients: [
      { studentEmail: parisStudents[6], status: 'pending' },
      { studentEmail: parisStudents[14], status: 'pending' },
    ],
  },
];

// ─── Portfolio items ───

// Portfolio livrables — populated for talents that have already been
// marked present at a past or ongoing event. New talents (no presence
// history) stay empty so the "premier livrable" empty state remains
// reachable in QA.
const PORTFOLIO: {
  studentEmail: string;
  eventIndex: number;
  url?: string;
  caption: string;
}[] = [
  // ── eventIndex 0 — Atelier Cybersécurité (-14d) ──
  {
    studentEmail: parisStudents[0],
    eventIndex: 0,
    caption: 'Affiche cyberhygiène pour ma classe',
  },
  {
    studentEmail: parisStudents[1],
    eventIndex: 0,
    caption: 'Quiz cybersécurité — 9/10',
  },
  {
    studentEmail: parisStudents[2],
    eventIndex: 0,
    url: 'https://example.com/phishing-poster',
    caption: 'Affiche phishing en équipe',
  },
  {
    studentEmail: parisStudents[3],
    eventIndex: 0,
    caption: 'Notes — comment fabriquer un mot de passe solide',
  },
  {
    studentEmail: parisStudents[4],
    eventIndex: 0,
    url: 'https://example.com/crypto-challenge',
    caption: 'Défi de cryptographie César résolu',
  },
  {
    studentEmail: parisStudents[5],
    eventIndex: 0,
    caption: 'Démo chiffrement César',
  },
  {
    studentEmail: parisStudents[6],
    eventIndex: 0,
    caption: 'Quiz cybersécurité complété',
  },
  {
    studentEmail: parisStudents[19],
    eventIndex: 0,
    caption: 'Notes sur la cyberhygiène',
  },
  {
    studentEmail: parisStudents[20],
    eventIndex: 0,
    caption: "Schéma d'un phishing reconstitué",
  },
  {
    studentEmail: parisStudents[21],
    eventIndex: 0,
    url: 'https://example.com/phishing-spotted',
    caption: 'Site phishing repéré et décortiqué',
  },

  // ── eventIndex 1 — Atelier Robotique (-7d) ──
  {
    studentEmail: parisStudents[0],
    eventIndex: 1,
    caption: 'Robot assemblé avec Emma',
  },
  {
    studentEmail: parisStudents[1],
    eventIndex: 1,
    caption: 'Mon robot évite les obstacles',
  },
  {
    studentEmail: parisStudents[2],
    eventIndex: 1,
    caption: 'Robot terminé et fonctionnel',
  },
  {
    studentEmail: parisStudents[3],
    eventIndex: 1,
    caption: 'Capteur de distance calibré',
  },
  {
    studentEmail: parisStudents[4],
    eventIndex: 1,
    caption: 'Photo de mon robot ramasseur',
  },
  {
    studentEmail: parisStudents[5],
    eventIndex: 1,
    caption: 'Robot suiveur de ligne',
  },
  {
    studentEmail: parisStudents[6],
    eventIndex: 1,
    caption: 'Programmation moteur — premiers pas',
  },
  {
    studentEmail: parisStudents[7],
    eventIndex: 1,
    caption: 'Vidéo du robot en action',
  },
  {
    studentEmail: parisStudents[8],
    eventIndex: 1,
    caption: 'Croquis du robot avant assemblage',
  },
  {
    studentEmail: parisStudents[22],
    eventIndex: 1,
    caption: "Plan d'assemblage du robot",
  },
  {
    studentEmail: parisStudents[24],
    eventIndex: 1,
    caption: 'Mon premier programme robot',
  },

  // ── eventIndex 2 — Past Stage de seconde (-338d, promotion précédente) ──
  {
    studentEmail: parisStudents[0],
    eventIndex: 2,
    url: 'https://codepen.io/example/first-page',
    caption: 'Ma toute première page web (stage)',
  },
  {
    studentEmail: parisStudents[1],
    eventIndex: 2,
    url: 'https://codepen.io/example/lucas-site',
    caption: 'Mon site CSS perso',
  },
  {
    studentEmail: parisStudents[2],
    eventIndex: 2,
    url: 'https://codepen.io/example/css-page',
    caption: 'Ma page CSS colorée',
  },
  {
    studentEmail: parisStudents[3],
    eventIndex: 2,
    caption: 'Modèle IA entraîné sur images de chats',
  },
  {
    studentEmail: parisStudents[4],
    eventIndex: 2,
    caption: 'Robot soccer du stage',
  },
  {
    studentEmail: parisStudents[5],
    eventIndex: 2,
    caption: 'Photo de la démo finale du stage',
  },

  // ── eventIndex 7 — Ongoing stage (J3 of 14): J1/J2 livrables ──
  {
    studentEmail: parisStudents[6],
    eventIndex: 7,
    url: 'https://codepen.io/example/chloe-html',
    caption: 'Page HTML — J1 du stage',
  },
  {
    studentEmail: parisStudents[7],
    eventIndex: 7,
    caption: 'CSS J1 — palette pastel',
  },
  {
    studentEmail: parisStudents[8],
    eventIndex: 7,
    caption: 'Modèle IA J2 — reconnaissance images',
  },
  {
    studentEmail: parisStudents[9],
    eventIndex: 7,
    url: 'https://codepen.io/example/louis-html',
    caption: 'Site HTML J1',
  },
  {
    studentEmail: parisStudents[10],
    eventIndex: 7,
    caption: 'Modèle IA J2 — chiffres manuscrits',
  },
  {
    studentEmail: parisStudents[11],
    eventIndex: 7,
    caption: 'Page HTML J1',
  },
  {
    studentEmail: parisStudents[12],
    eventIndex: 7,
    caption: 'Modèle IA J2 — entraîné en équipe',
  },
  {
    studentEmail: parisStudents[13],
    eventIndex: 7,
    caption: 'CSS J1 — page de présentation',
  },

  // ── eventIndex 8 — Past Atelier Web Lyon (-10d) ──
  {
    studentEmail: lyonStudents[0],
    eventIndex: 8,
    url: 'https://codepen.io/example/eliot-html',
    caption: 'Première page HTML Lyon',
  },
  {
    studentEmail: lyonStudents[1],
    eventIndex: 8,
    caption: 'Page CSS avec mes couleurs préférées',
  },
  {
    studentEmail: lyonStudents[2],
    eventIndex: 8,
    caption: 'Site portfolio HTML',
  },
  {
    studentEmail: lyonStudents[3],
    eventIndex: 8,
    caption: 'Mes premiers tags HTML',
  },
  {
    studentEmail: lyonStudents[10],
    eventIndex: 8,
    caption: 'Page web personnelle',
  },
  {
    studentEmail: lyonStudents[11],
    eventIndex: 8,
    caption: 'Démo HTML présentée en classe',
  },
];

// ─── Main ───

async function main() {
  console.log('⟳  Wiping existing data…');
  await wipeAll();

  console.log('✓  Wipe complete. Seeding fresh data…\n');

  // 1. Campuses
  const campuses = await seedCampuses();
  console.log(`✓  Campuses (${Object.keys(campuses).length})`);

  // 2. Staff (no default admin — admins are provisioned via
  //    scripts/add-admin-user.ts and authenticate via Microsoft OAuth only)
  const staffByKey = await seedStaff(campuses);
  console.log(`✓  Users (${Object.keys(staffByKey).length} staff)`);

  // 2b. Intérêts catalogue (referenced by talents)
  const interestCount = await seedInterests(prisma);
  console.log(`✓  Intérêts (${interestCount})`);

  // 2c. Email templates + action mappings (OTP, parent welcome, relances).
  //     Without these, the transactional senders bail with `no_template` and
  //     local dev breaks the OTP login flow. Author defaults to the seeded
  //     superdev, falling back to any seeded staff.
  const createdById =
    staffByKey['pauline.marchand']?.userId ??
    Object.values(staffByKey)[0]?.userId;
  if (!createdById)
    throw new Error('No staff user available to author templates');
  const templateCount = await seedEmailTemplates(prisma, createdById);
  console.log(`✓  Email templates + action mappings (${templateCount})`);

  // 2d. Default broadcast templates (e.g. the inscription announcement staff
  //     send to all talents). Free-standing rows the broadcast composer lists;
  //     no action mapping, so nothing fires them automatically.
  const broadcastTemplateCount = await seedBroadcastTemplates(
    prisma,
    createdById,
  );
  console.log(`✓  Broadcast templates (${broadcastTemplateCount})`);

  // 3. Students
  const talentByEmail = await seedStudents();
  console.log(`✓  Students (${Object.keys(talentByEmail).length})`);

  // 3b. Parent accounts (one per distinct parentEmail; Alice→Sophie is the
  // human-recognisable test pair)
  const parentEmail = await seedParents(talentByEmail);
  console.log(`✓  Parent (${parentEmail})`);

  // 3c. Talent interest assignments
  await assignTalentInterests();
  console.log('✓  Talent interest assignments');

  // 4. Themes
  const themesByKey = await seedThemes(campuses);
  console.log(
    `✓  Themes (${Object.keys(themesByKey).length} campus-scoped + 6 official)`,
  );

  // 5. Activity templates
  const templatesByName = await seedActivityTemplates(themesByKey, campuses);
  console.log(`✓  Activity templates (${Object.keys(templatesByName).length})`);

  // 6. Planning template (multi-day stage)
  await seedPlanningTemplate(templatesByName);
  console.log('✓  Planning template (Stage de seconde — 5 jours)');

  // 7. Events + planning + participations + compliance
  const eventIds = await seedEvents(
    campuses,
    staffByKey,
    talentByEmail,
    themesByKey,
    templatesByName,
  );
  console.log(`✓  Events (${eventIds.length})`);

  // 8. Steps progress (live event alerts + past event completions)
  const alertCount = await seedStepsProgress(talentByEmail, eventIds);
  console.log(`✓  StepsProgress (live event needs_help: ${alertCount} alerts)`);

  // 9. XP & levels (computed from participations)
  const updated = await recomputeXp();
  console.log(`✓  XP & levels (${updated} students updated)`);

  // 10. Interviews
  const interviewCount = await seedInterviews(
    staffByKey,
    talentByEmail,
    campuses,
  );
  console.log(`✓  Interviews (${interviewCount})`);

  // 11. Portfolio
  const portfolioCount = await seedPortfolio(talentByEmail, eventIds);
  console.log(`✓  Portfolio (${portfolioCount} items)`);

  // 12. Reminders (1:1 staff → talent / parent)
  const reminderCount = await seedReminders(staffByKey, talentByEmail);
  console.log(`✓  Reminders (${reminderCount})`);

  // 12b. Broadcasts (mass mail / SMS campaigns) — feed the unified
  //      communications timeline on the fiche talent.
  const broadcastRecipientCount = await seedBroadcasts(
    staffByKey,
    talentByEmail,
    campuses,
    eventIds,
  );
  console.log(`✓  Broadcasts (${broadcastRecipientCount} recipient rows)`);

  // 13. CMS welcome pages for stage_seconde events
  await seedWelcomePages(eventIds, staffByKey);
  console.log('✓  CMS welcome pages');

  // ── Final summary ──
  await printSummary(parentEmail);
}

// ─── Welcome pages ───

async function seedWelcomePages(
  eventIds: string[],
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
) {
  // stage_seconde events are at indices 2 (past), 7 (ongoing), 10 (future Lyon)
  const stageEventIndices = [2, 7, 10];
  const updatedBy = Object.values(staffByKey)[0].userId;

  const content = `<h2>Bienvenue sur Jump ! 🚀</h2>
<p>Salut, et <strong>bienvenue dans l'aventure !</strong> Tu viens de rejoindre Jump, la plateforme de ton stage de seconde à Epitech. Pendant ces quelques jours, découvre l'univers du <strong>code</strong>, de la <strong>tech</strong> et de la <strong>création numérique</strong> en <em>construisant</em> tes propres projets.</p>
<h3>Ce qui t'attend</h3>
<ul>
  <li>🧩 <strong>Des ateliers concrets :</strong> tu vas coder, créer, recommencer — c'est comme ça qu'on apprend.</li>
  <li>🏆 <strong>Des XP et des niveaux :</strong> gagne de l'expérience à chaque activité pour grimper de Novice à <em>Expert</em> !</li>
  <li>🎮 <strong>Un mini-jeu par jour :</strong> un défi quotidien pour des XP bonus.</li>
  <li>💼 <strong>Ton portfolio :</strong> repars avec une vraie trace de ce que tu as accompli.</li>
</ul>
<img src="https://placehold.co/600x400/blue/white?text=Photo%20du%20campus" alt="Bannière bleue: Photo du campus à venir" />
<h3>Comment ça marche</h3>
<p>Chaque jour, retrouve ta <strong>mission du jour</strong> sur ton tableau de bord. Clique, suis les étapes, et gagne tes XP. Si tu bloques, <strong>pas de panique</strong> — les Mantas (tes encadrants) sont là pour t'aider.</p>
<blockquote><p>« Ne cherche pas à tout réussir du premier coup. Le code, c'est essayer, se tromper, et recommencer. »</p></blockquote>`;

  const rows = stageEventIndices.flatMap((idx) => {
    const eventId = eventIds[idx];
    if (!eventId) return [];
    return [{ slug: 'welcome', eventId, updatedBy, content }];
  });
  await prisma.cmsPage.createMany({ data: rows });
}

// ─── Wipe ───

async function wipeAll() {
  // One transaction, children first, parents last. Order matters: each
  // deleteMany must run after the rows referencing it are gone, so the array
  // order is the FK dependency order — keep it.
  await prisma.$transaction([
    prisma.stageCompliance.deleteMany(),
    prisma.participationActivity.deleteMany(),
    prisma.portfolioItem.deleteMany(),
    prisma.stepsProgress.deleteMany(),
    prisma.onboardingReminder.deleteMany(),
    // Broadcasts + email-action mappings — dropped before staff so the
    // `MessageTemplate.createdById` FK doesn't block.
    prisma.emailActionMapping.deleteMany(),
    prisma.broadcastRecipient.deleteMany(),
    prisma.broadcast.deleteMany(),
    prisma.messageTemplate.deleteMany(),
    prisma.participation.deleteMany(),
    prisma.interview.deleteMany(),
    prisma.eventManta.deleteMany(),
    prisma.activityTheme.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.timeSlot.deleteMany(),
    prisma.planning.deleteMany(),
    prisma.event.deleteMany(),
    prisma.activityTemplateTheme.deleteMany(),
    prisma.planningTemplateSlot.deleteMany(),
    prisma.planningTemplateDay.deleteMany(),
    prisma.planningTemplate.deleteMany(),
    prisma.activityTemplate.deleteMany(),
    prisma.theme.deleteMany(),
    prisma.talentInterest.deleteMany(),
    prisma.interest.deleteMany(),
    prisma.talent.deleteMany(),
    // Subject hierarchy must drop before StaffProfile: SubjectVersion.importedBy
    // is a required FK with default RESTRICT, so live versions block the delete.
    prisma.subjectVersion.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.refCompSnapshot.deleteMany(),
    prisma.staffProfile.deleteMany(),
    prisma.campus.deleteMany(),
    prisma.syncError.deleteMany(),
    prisma.bauth_session.deleteMany(),
    prisma.bauth_account.deleteMany(),
    prisma.bauth_verification.deleteMany(),
    prisma.bauth_user.deleteMany(),
  ]);
}

// ─── Interests ───

async function assignTalentInterests() {
  // TalentInterest rows are written by the (atomic) interests step, which
  // validates tech and general together — so any talent past that step has both
  // kinds, never tech alone. Gate on `techInterestsValidatedAt` and seed both.
  const talents = await prisma.talent.findMany({
    where: { techInterestsValidatedAt: { not: null } },
    select: { id: true },
  });

  const techIds = await prisma.interest.findMany({
    where: { kind: 'tech' },
    select: { id: true },
  });
  const generalIds = await prisma.interest.findMany({
    where: { kind: 'general' },
    select: { id: true },
  });

  const rows = talents.flatMap((talent) => {
    // 1-2 tech, 1-5 general — shuffle-and-slice per talent (validation schema:
    // tech 1-2, general 1-5).
    const techCount = 1 + Math.floor(Math.random() * 2);
    const selectedTech = [...techIds]
      .sort(() => Math.random() - 0.5)
      .slice(0, techCount);
    const selectedGen = [...generalIds]
      .sort(() => Math.random() - 0.5)
      .slice(0, 1 + Math.floor(Math.random() * 5));
    return [...selectedTech, ...selectedGen].map((interest) => ({
      talentId: talent.id,
      interestId: interest.id,
    }));
  });

  await prisma.talentInterest.createMany({ data: rows, skipDuplicates: true });
}

// ─── Seeders ───

async function seedCampuses(): Promise<
  Record<string, { id: string; name: string }>
> {
  const names = ['Paris', 'Lyon', 'Marseille'];
  const created = await prisma.campus.createManyAndReturn({
    // contactEmail feeds the {{EMAIL_CONTACT_CAMPUS}} broadcast variable; seed it
    // so dev broadcasts don't render an empty token.
    data: names.map((name) => ({
      name,
      contactEmail: `contact.${name.toLowerCase()}@epitech.eu`,
    })),
    select: { id: true, name: true },
  });
  const byName: Record<string, { id: string; name: string }> = {};
  for (const c of created) byName[c.name] = c;
  return byName;
}

async function seedStaff(
  campuses: Record<string, { id: string }>,
): Promise<Record<string, { id: string; userId: string; campusId: string }>> {
  // Users first, then profiles referencing them. createManyAndReturn doesn't
  // guarantee row order, so map back by the unique business key (email →
  // userId, then userId → profile) rather than by index.
  const users = await prisma.bauth_user.createManyAndReturn({
    data: STAFF_MEMBERS.map((s) => ({
      email: s.email,
      name: s.name,
      role: 'staff',
      emailVerified: true,
      image: s.image,
    })),
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));

  const profiles = await prisma.staffProfile.createManyAndReturn({
    data: STAFF_MEMBERS.map((s) => ({
      userId: userIdByEmail.get(s.email)!,
      campusId: campuses[s.campus].id,
      staffRole: s.role,
    })),
    select: { id: true, userId: true, campusId: true },
  });
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  const byKey: Record<
    string,
    { id: string; userId: string; campusId: string }
  > = {};
  for (const s of STAFF_MEMBERS) {
    const userId = userIdByEmail.get(s.email)!;
    const profile = profileByUserId.get(userId)!;
    byKey[s.key] = { id: profile.id, userId, campusId: profile.campusId! };
  }
  return byKey;
}

/**
 * The talent admissions/onboarding funnel, as a single per-student state. It
 * drives BOTH whether a `bauth_user` exists and how far onboarding got, so the
 * two axes the admin talents list reads — account (`never`) vs onboarding
 * progress (`pending`/`active`) — stay consistent:
 *
 *   - `imported`    → SF lead, no account yet (`userId = null`, status `never`);
 *                     impersonation bootstraps the account on the fly.
 *   - `fresh`       → logged in once, onboarding untouched (status `pending`,
 *                     "Non démarré").
 *   - `in-progress` → account, stalled mid-funnel at a varied step.
 *   - `onboarded`   → account, all 7 steps done (status `active`).
 *
 * Skewed early on purpose: a freshly-imported cohort is mostly leads with no
 * account or a fresh login, which is also the most useful state to exercise
 * (impersonate → walk the full parcours). `skipOnboarding` fixtures pin the
 * extremes so there are always ready-to-test accounts.
 */
type StudentLifecycle = 'imported' | 'fresh' | 'in-progress' | 'onboarded';

function studentLifecycle(s: StudentDef, i: number): StudentLifecycle {
  if (s.skipOnboarding === true) return 'onboarded';
  if (s.skipOnboarding === false) return 'fresh';
  const bucket = i % 20;
  if (bucket < 7) return 'imported'; // ~35%
  if (bucket < 14) return 'fresh'; // ~35%
  if (bucket < 17) return 'in-progress'; // ~15%
  return 'onboarded'; // ~15%
}

// The canonical onboarding ladder has 7 gated steps (identity → school →
// parents → interests → equipment → processing → rules) — see
// ONBOARDING_STEP_ORDER in src/lib/domain/talentOnboarding.ts. Seeded onboarding
// is a monotonic prefix of that ladder, so a partial talent is byte-identical to
// a real one who stopped at the same point.
const ONBOARDING_FULL_STEPS = 7;

function onboardingStepsFor(lifecycle: StudentLifecycle, i: number): number {
  switch (lifecycle) {
    case 'onboarded':
      return ONBOARDING_FULL_STEPS;
    case 'in-progress':
      return 1 + (i % 6); // 1..6 — stalls spread across the funnel
    default:
      return 0; // imported & fresh — nothing done
  }
}

async function seedStudents(): Promise<
  Record<string, { id: string; nom: string; prenom: string }>
> {
  const byEmail: Record<string, { id: string; nom: string; prenom: string }> =
    {};

  // Students enrolled in the ongoing stage de seconde must NOT be pre-onboarded
  // (QA needs to walk the full parcours live), so default them to `fresh`
  // (account, nothing done) regardless of bucket. Matches event 8
  // (ONGOING_PARIS_STAGE): parisStudents.slice(6, 18). An explicit
  // `skipOnboarding: true` fixture is a deliberate pin that overrides this
  // default (a real stage student can already be fully onboarded), so those
  // still resolve through studentLifecycle.
  const ongoingStageEmails = new Set(parisStudents.slice(6, 18));
  const lifecycles = STUDENTS.map(
    (s, i): StudentLifecycle =>
      s.skipOnboarding !== true && ongoingStageEmails.has(s.email)
        ? 'fresh'
        : studentLifecycle(s, i),
  );

  // Talents deliberately routed to a different School than Salesforce claims, so
  // /staff/admin/sf-conflicts shows a real school *conflict* (not just a
  // "missing"). Anchored by email rather than a modulus: a divergence only
  // surfaces once the talent has confirmed the school step, so the anchor must
  // be a fully-onboarded talent (here, eliot via `skipOnboarding`). The other
  // half — SF must itself assert a school, else the row downgrades to *missing*
  // and the alternate School is left an orphan — is guaranteed below, where
  // these emails are forced to carry an `sfSchoolId`.
  const schoolConflictEmails = new Set(['eliot.amanieu@epitech.eu']);

  // Accounts only for students who've logged in at least once — `imported`
  // leads stay account-less (their talent row carries `userId = null`). Users
  // first, then talents referencing them; both batched. Talent rows map back to
  // their user by email (createManyAndReturn order isn't guaranteed), which is
  // also the talent's own unique key.
  const users = await prisma.bauth_user.createManyAndReturn({
    data: STUDENTS.filter((_, i) => lifecycles[i] !== 'imported').map((s) => ({
      email: s.email,
      name: `${s.prenom} ${s.nom}`,
      role: 'student',
      emailVerified: true,
    })),
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));

  // Canonical schools for seeded talents. Onboarded talents are linked to Victor
  // Hugo; the alt school + a few perturbed SF mirrors below produce realistic
  // reconciliation conflicts on /staff/admin/sf-conflicts.
  const victorHugo = await prisma.school.upsert({
    where: { uai: '0750001A' },
    update: {},
    create: {
      uai: '0750001A',
      name: 'Lycée général Victor Hugo',
      city: 'Paris',
      resolvedAt: new Date(),
    },
    select: { id: true },
  });
  const altSchool = await prisma.school.upsert({
    where: { uai: '0750002B' },
    update: {},
    create: {
      uai: '0750002B',
      name: 'Lycée Jean Moulin',
      city: 'Paris',
      resolvedAt: new Date(),
    },
    select: { id: true },
  });

  // Each seeded talent carries two independent axes, mirroring production:
  //  1. What Salesforce populated at lead creation (school, civilité) — present
  //     for most leads, absent for some. The worker seeds these onto Talent
  //     BEFORE onboarding, so even pending talents already carry SF data.
  //  2. How far the talent's own onboarding got (the monotonic step prefix),
  //     which may confirm — and possibly change — what SF sent.
  // The TalentSfImport mirror always holds the SF claim; a few confirmed talents
  // diverge from it (and some fill in what SF lacked) to populate the
  // reconciliation page realistically.
  const seeded = STUDENTS.map((s, i) => {
    const lifecycle = lifecycles[i];
    const hasAccount = lifecycle !== 'imported';

    // No account → never logged in. Otherwise dated per StudentDef.
    const lastActiveAt =
      !hasAccount || s.lastActiveDaysAgo === null
        ? null
        : new Date(now.getTime() - s.lastActiveDaysAgo * 86400000);

    // Onboarding is a monotonic PREFIX of the canonical 7-step ladder, in the
    // wizard's own order: identity → school → parents → interests → equipment →
    // processing → rules. Each step posts its own timestamp(s); the interests
    // step is atomic (tech + general + recap land together, as the reworked
    // wizard writes them), so there is no tech-without-general state — exactly
    // what the real flow can produce. `charterAcceptedAt` lands with
    // `rulesSignedAt` at the final step.
    const onboardingSteps = onboardingStepsFor(lifecycle, i);
    const ts = new Date();
    const profileConfirmed = onboardingSteps >= 1; // identity
    const schoolConfirmed = onboardingSteps >= 2; // school
    const parentsConfirmed = onboardingSteps >= 3; // parents
    const interestsConfirmed = onboardingSteps >= 4; // interests (atomic)
    const equipmentConfirmed = onboardingSteps >= 5; // equipment
    const processingConfirmed = onboardingSteps >= 6; // processing (PDF gen)
    const fullyOnboarded = onboardingSteps >= 7; // rules + charter
    const hasParentInfo = parentsConfirmed;

    // ── Axis 1: what Salesforce sent (independent of onboarding) ──
    // ~90% of leads carry a gender, ~80% a school; the rest SF never populated.
    // Conflict anchors are forced to carry an SF school: a divergence is only a
    // *conflict* (not a downgraded *missing*) when SF asserts a school too, and
    // that side is otherwise index-derived — so pinning the talent by email
    // isn't enough on its own.
    const sfCivilite = i % 10 === 0 ? null : i % 2 === 0 ? 'homme' : 'femme';
    const sfSchoolId = schoolConflictEmails.has(s.email)
      ? victorHugo.id
      : i % 5 === 0
        ? null
        : victorHugo.id;

    // ── Demo divergences (only meaningful once the talent has confirmed) ──
    const schoolDiverges =
      schoolConfirmed &&
      sfSchoolId !== null &&
      schoolConflictEmails.has(s.email);
    const phoneDiverges = profileConfirmed && i % 12 === 7;

    // ── Talent (Jump truth) ──
    // Pending: keep the SF seed. Confirmed: the talent's own value — may differ
    // from SF (divergence) or fill in what SF lacked.
    const civilite =
      sfCivilite ??
      (profileConfirmed ? (i % 2 === 0 ? 'homme' : 'femme') : null);
    const schoolId = schoolConfirmed
      ? schoolDiverges
        ? altSchool.id
        : (sfSchoolId ?? victorHugo.id)
      : sfSchoolId;

    // ── Image-rights decision (parent-driven, strictly downstream of the
    // parents step) ──
    // The parent_welcome mail — the only path to a decision — is sent when the
    // talent completes the parents step (provisionParentAccount). So a decision
    // can exist ONLY once parentsConfirmed; before that the field stays null
    // ('undecided'), exactly as the real flow leaves it (and why an ongoing,
    // not-yet-onboarded cohort lands their parents on /parent/signature, not
    // straight to /parent/merci). Of the parents who were mailed, a
    // deterministic ~25% haven't answered yet — these feed the image-rights
    // relances ("dossiers en attente") — and of those who did, a minority
    // refuse, enough to exercise the refusal paths (staff badge, broadcast
    // filter, "ne pas photographier", PDF).
    const parentMailed = parentsConfirmed;
    const parentAnswered = parentMailed && i % 4 !== 0;
    const parentRefused = parentAnswered && i % 5 === 2;
    const imageRightsDecision: ImageRightsDecision | null = parentAnswered
      ? parentRefused
        ? 'refused'
        : 'accepted'
      : null;

    const talent = {
      userId: hasAccount ? (userIdByEmail.get(s.email) ?? null) : null,
      email: s.email,
      nom: s.nom,
      prenom: s.prenom,
      phone: toStoredPhone(s.phone),
      parentPhone: toStoredPhone(s.parentPhone),
      niveau: s.niveau,
      // Welcome strictly precedes onboarding: "On y va" stamps welcomeSeenAt
      // and hands off to step 1. So anyone who has cleared a single step has
      // necessarily passed the gate. Leaving it null on an onboarded talent is
      // a state the real flow can't produce — it would re-trap them on
      // /welcome at next login (seed bug, not a runtime one).
      welcomeSeenAt: profileConfirmed ? ts : null,
      infoValidatedAt: profileConfirmed ? ts : null,
      highSchoolValidatedAt: schoolConfirmed ? ts : null,
      parentsValidatedAt: parentsConfirmed ? ts : null,
      techInterestsValidatedAt: interestsConfirmed ? ts : null,
      generalInterestsValidatedAt: interestsConfirmed ? ts : null,
      interestsRecapSeenAt: interestsConfirmed ? ts : null,
      processingCompletedAt: processingConfirmed ? ts : null,
      rulesSignedAt: fullyOnboarded ? ts : null,
      charterAcceptedAt: fullyOnboarded ? ts : null,
      schoolId,
      parentNom: hasParentInfo ? 'Martin' : null,
      parentPrenom: hasParentInfo ? 'Sophie' : null,
      parentEmail: hasParentInfo ? `parent.${s.email}` : null,
      civilite,
      parentType: hasParentInfo ? (i % 3 === 0 ? 'pere' : 'mere') : null,
      parentCivilite: hasParentInfo ? (i % 3 === 0 ? 'homme' : 'femme') : null,
      imageRightsDecision,
      imageRightsDecidedAt: imageRightsDecision ? ts : null,
      imageRightsSignerPrenom: imageRightsDecision ? 'Sophie' : null,
      imageRightsSignerNom: imageRightsDecision ? 'Martin' : null,
      // Règlement intérieur precedes droit-à-l'image in the parent flow, so a
      // guardian who reached an image-rights decision necessarily co-signed the
      // règlement first (runtime invariant: image decided ⟹ règlement co-signed).
      parentRulesSignedAt: imageRightsDecision ? ts : null,
      parentRulesSignerPrenom: imageRightsDecision ? 'Sophie' : null,
      parentRulesSignerNom: imageRightsDecision ? 'Martin' : null,
      parent2Type: null,
      parent2Civilite: null,
      parent2Nom: null,
      parent2Prenom: null,
      parent2Email: null,
      parent2Phone: null,
      hasLaptop: equipmentConfirmed,
      setupDescription:
        equipmentConfirmed && i % 3 === 0
          ? 'PC gaming RTX 4070, double écran'
          : null,
      equipmentValidatedAt: equipmentConfirmed ? ts : null,
      interestsFreeText: null,
      lastActiveAt,
      externalId: mockSalesforceLeadId(i),
    };

    // ── Salesforce mirror (the SF claim, as the worker would have written it) ──
    const sf = {
      phone: toStoredPhone(phoneDiverges ? '+33 6 99 99 99 99' : s.phone),
      civilite: sfCivilite,
      schoolId: sfSchoolId,
    };

    return { talent, sf, signCity: s.campus };
  });

  const talentData = seeded.map((x) => x.talent);

  const talents = await prisma.talent.createManyAndReturn({
    data: talentData,
    select: { id: true, email: true, nom: true, prenom: true },
  });
  for (const t of talents) {
    // email is nullable in the schema but always set here — guard for the type.
    if (t.email) byEmail[t.email] = { id: t.id, nom: t.nom, prenom: t.prenom };
  }

  // SF mirror per talent — every seeded talent is an SF lead, so each gets one.
  // It holds what SF sent (null where SF had nothing); a few confirmed talents'
  // values diverge from it, surfacing on the reconciliation page.
  const talentIdByEmail = new Map(talents.map((t) => [t.email, t.id]));
  const sfImportData = seeded
    .map((x) => {
      const talentId = x.talent.email
        ? talentIdByEmail.get(x.talent.email)
        : undefined;
      if (!talentId) return null;
      return {
        talentId,
        nom: x.talent.nom,
        prenom: x.talent.prenom,
        phone: x.sf.phone,
        civilite: x.sf.civilite,
        niveau: x.talent.niveau,
        sfSchoolId: x.sf.schoolId,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  await prisma.talentSfImport.createMany({ data: sfImportData });

  // Image-rights ledger: every seeded talent that carries a decision in the
  // projection above gets the matching append-only fact, so seed data isn't a
  // projection without a history (which would read like a bug in the staff
  // history view). A real parent decision captures the signer, their qualité and
  // the town, so the seed fills all three (relationship from parentType, town
  // from the campus city) — otherwise a staff correction would regenerate the
  // PDF with a blank "Fait à …" place, the gap real onboarding never produces.
  const imageRightsRecordData = seeded
    .map((x) => {
      const talentId = x.talent.email
        ? talentIdByEmail.get(x.talent.email)
        : undefined;
      if (
        !talentId ||
        !x.talent.imageRightsDecision ||
        !x.talent.imageRightsDecidedAt
      )
        return null;
      return {
        talentId,
        decision: x.talent.imageRightsDecision,
        decidedAt: x.talent.imageRightsDecidedAt,
        signerPrenom: x.talent.imageRightsSignerPrenom,
        signerNom: x.talent.imageRightsSignerNom,
        relationship:
          x.talent.parentType === 'pere'
            ? 'père'
            : x.talent.parentType === 'mere'
              ? 'mère'
              : 'représentant légal',
        city: x.signCity,
        source: 'parent_portal' as const,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  await prisma.imageRightsDecisionRecord.createMany({
    data: imageRightsRecordData,
  });

  return byEmail;
}

async function seedParents(
  talentByEmail: Record<string, { id: string; nom: string; prenom: string }>,
): Promise<string> {
  // Promote one seeded talent to a real, human-recognisable parent so the parent
  // flow has an obvious test pair (Alice → Sophie Martin).
  const realParentEmail = 'sophie.martin@mail.com';
  const child = talentByEmail['alice.martin@mail.com'];
  if (child) {
    await prisma.talent.update({
      where: { id: child.id },
      data: {
        parentEmail: realParentEmail,
        parentNom: 'Martin',
        parentPrenom: 'Sophie',
      },
    });
  }

  // In prod the parent's bauth_user is created in the SAME action that writes
  // Talent.parentEmail (provisionParentAccount, called from the onboarding
  // parents step). So a non-null parentEmail always implies a matching
  // role:'parent' account — without it /parent/login and /parent/fastlogin
  // reject the address ("Aucun compte parent trouvé") and the magic link in the
  // image-rights mail can never resolve. Mirror that here: provision an account
  // for every distinct parentEmail a talent carries, not just Sophie's.
  const withParent = await prisma.talent.findMany({
    where: { parentEmail: { not: null } },
    select: { parentEmail: true, parentNom: true, parentPrenom: true },
  });
  const nameByEmail = new Map<string, string>();
  for (const t of withParent) {
    if (!t.parentEmail) continue;
    const name = `${t.parentPrenom ?? ''} ${t.parentNom ?? ''}`.trim();
    nameByEmail.set(t.parentEmail, name || t.parentEmail);
  }
  await prisma.bauth_user.createMany({
    data: [...nameByEmail].map(([email, name]) => ({
      email,
      name,
      role: 'parent',
      emailVerified: true,
    })),
    skipDuplicates: true,
  });

  return realParentEmail;
}

async function seedThemes(campuses: Record<string, { id: string }>) {
  const themeNames = [
    'Développement Web',
    'Robotique',
    'Jeux Vidéo',
    'Cybersécurité',
    'Intelligence Artificielle',
    'Design & Création',
  ];

  const lyonThemes = [
    'Développement Web',
    'Robotique',
    'Intelligence Artificielle',
  ];

  // Official (campus-less), Paris (all), Lyon (web/robotics/IA only) in one
  // insert. Each row carries the prefix used to rebuild the lookup key, and is
  // remapped by (campusId, nom) since createManyAndReturn order isn't ordered.
  const themeData = [
    ...themeNames.map((nom) => ({ nom, campusId: null, prefix: 'official' })),
    ...themeNames.map((nom) => ({
      nom,
      campusId: campuses.Paris.id,
      prefix: 'Paris',
    })),
    ...lyonThemes.map((nom) => ({
      nom,
      campusId: campuses.Lyon.id,
      prefix: 'Lyon',
    })),
  ];
  const prefixByCampusId = new Map<string | null, string>([
    [null, 'official'],
    [campuses.Paris.id, 'Paris'],
    [campuses.Lyon.id, 'Lyon'],
  ]);

  const created = await prisma.theme.createManyAndReturn({
    data: themeData.map(({ nom, campusId }) => ({ nom, campusId })),
    select: { id: true, nom: true, campusId: true },
  });

  const byKey: Record<string, { id: string }> = {};
  for (const t of created) {
    byKey[`${prefixByCampusId.get(t.campusId)}:${t.nom}`] = { id: t.id };
  }
  return byKey;
}

async function seedActivityTemplates(
  themesByKey: Record<string, { id: string }>,
  campuses: Record<string, { id: string }>,
) {
  // Each template carries a nested activityTemplateThemes create, which
  // createMany can't express — so fire the per-template creates concurrently
  // instead. The set is small (one row per activityDef), well within the pool.
  const created = await Promise.all(
    activityDefs.map((def) => {
      const campusId = def.campus ? (campuses[def.campus]?.id ?? null) : null;
      return prisma.activityTemplate.create({
        data: {
          nom: def.nom,
          description: def.description,
          difficulte: def.difficulte,
          activityType: def.activityType,
          isDynamic: def.isDynamic,
          contentStructure: def.isDynamic
            ? (contentStructures[def.nom] ?? undefined)
            : undefined,
          content: def.content
            ? (marked.parse(def.content) as string)
            : undefined,
          link: def.link,
          defaultDuration: def.defaultDuration,
          campusId,
          activityTemplateThemes: {
            create: def.themes
              .map((themeName) => {
                const themeId =
                  (def.campus &&
                    themesByKey[`${def.campus}:${themeName}`]?.id) ||
                  themesByKey[`official:${themeName}`]?.id;
                return themeId ? { themeId } : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null),
          },
        },
        select: { id: true, nom: true },
      });
    }),
  );

  const byName: Record<string, { id: string }> = {};
  for (const tpl of created) byName[tpl.nom] = { id: tpl.id };
  return byName;
}

async function seedPlanningTemplate(
  templatesByName: Record<string, { id: string }>,
) {
  const byDay: [string, string][] = [
    ['Ma première page HTML', 'CSS : Styliser sa page'],
    ['Construis ton robot', 'Capteurs et actionneurs'],
    ["L'IA et moi", 'Entraîne ton modèle'],
    ['Initiation à la cybersécurité', 'Cryptographie : les secrets du code'],
    ['Crée ton jeu Scratch', 'Game Design avancé'],
  ];

  // Whole template (days → appel + atelier slots) as one nested create.
  await prisma.planningTemplate.create({
    data: {
      nom: 'Stage de seconde — 5 jours',
      description:
        'Modèle de planning sur 5 jours avec accueil/appel + ateliers thématiques par jour.',
      nbDays: 5,
      days: {
        create: byDay.map((actNames, i) => ({
          dayIndex: i,
          label: `Jour ${i + 1}`,
          slots: {
            create: [
              {
                startTime: '13:00',
                endTime: '13:30',
                sortOrder: 0,
                nom: 'Appel',
                activityType: 'orga' as ActivityType,
              },
              ...actNames.map((actName, j) => ({
                startTime: '13:45',
                endTime: '16:30',
                sortOrder: 1 + j,
                activityTemplateId: templatesByName[actName]?.id ?? null,
                nom: templatesByName[actName] ? null : actName,
                activityType: 'atelier' as ActivityType,
              })),
            ],
          },
        })),
      },
    },
  });
}

async function seedEvents(
  campuses: Record<string, { id: string }>,
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
  talentByEmail: Record<string, { id: string; nom: string; prenom: string }>,
  themesByKey: Record<string, { id: string }>,
  templatesByName: Record<string, { id: string }>,
) {
  const eventIds: string[] = [];

  for (const blueprint of EVENTS) {
    const campusId = campuses[blueprint.campus].id;
    const themeId =
      themesByKey[`${blueprint.campus}:${blueprint.theme}`]?.id ??
      themesByKey[`Paris:${blueprint.theme}`]?.id ??
      null;

    const eventStart = dayAt(blueprint.daysOffset, 13, 0);
    const eventEnd =
      blueprint.durationDays && blueprint.durationDays > 1
        ? dayAt(blueprint.daysOffset + blueprint.durationDays - 1, 23, 59)
        : null;

    // Normalise single-day vs multi-day into a loop (empty when no slots/days)
    const dayList: DayBlueprint[] =
      blueprint.days ??
      (blueprint.slots ? [{ dayOffset: 0, slots: blueprint.slots }] : []);

    // Whole planning skeleton — timeSlots → activity → activityThemes — built
    // as nested-create input so the entire event ships in one round trip.
    // 1 activity = 1 slot; multi-activity blueprints write as parallel slots
    // at the same time.
    const timeSlotData = dayList.flatMap((day) =>
      day.slots.flatMap((slot) => {
        const slotStart = dayAt(
          blueprint.daysOffset + day.dayOffset,
          slot.startHour,
          slot.startMinute ?? 0,
        );
        const slotEnd = dayAt(
          blueprint.daysOffset + day.dayOffset,
          slot.endHour,
          slot.endMinute ?? 0,
        );
        return slot.activities.map((act) => {
          const blueprintDef = activityDefs.find((d) => d.nom === act.nom);
          const activityType: ActivityType =
            act.activityType ?? blueprintDef?.activityType ?? 'atelier';
          const isDynamic = blueprintDef?.isDynamic ?? false;
          const themeRows = (blueprintDef?.themes ?? [])
            .map(
              (themeName) =>
                themesByKey[`${blueprint.campus}:${themeName}`]?.id,
            )
            .filter((id): id is string => Boolean(id))
            .map((themeId) => ({ themeId }));
          return {
            startTime: slotStart,
            endTime: slotEnd,
            activity: {
              create: {
                nom: act.nom,
                description: blueprintDef?.description ?? null,
                difficulte: blueprintDef?.difficulte ?? null,
                activityType,
                isDynamic,
                // Static activities render `activity.content` directly (see the
                // talent `[activityId]` page); production copies it off the
                // template on instantiation (planningActions), so the seed does
                // the same instead of leaving the row content-less.
                content: blueprintDef?.content
                  ? (marked.parse(blueprintDef.content) as string)
                  : undefined,
                contentStructure:
                  isDynamic && contentStructures[act.nom]
                    ? contentStructures[act.nom]
                    : undefined,
                templateId: templatesByName[act.nom]?.id ?? null,
                activityThemes: { create: themeRows },
              },
            },
          };
        });
      }),
    );

    const event = await prisma.event.create({
      data: {
        titre: blueprint.titre,
        date: eventStart,
        endDate: eventEnd,
        eventType: blueprint.eventType ?? EVENT_TYPES.CODING_CLUB,
        campusId,
        themeId,
        pin: blueprint.pin,
        notes: blueprint.notes ?? null,
        mantas: {
          create: blueprint.mantaKeys
            .map((key) => {
              const staff = staffByKey[key];
              return staff ? { staffProfileId: staff.id } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null),
        },
        planning: { create: { timeSlots: { create: timeSlotData } } },
      },
      include: {
        planning: { include: { timeSlots: { include: { activity: true } } } },
      },
    });
    eventIds.push(event.id);

    const activitiesCreated = (event.planning?.timeSlots ?? [])
      .map((ts) => ts.activity)
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Per-student context, derived once and reused across participation,
    // participationActivity and stageCompliance rows.
    const students = blueprint.studentEmails
      .map((email, i) => {
        const talent = talentByEmail[email];
        if (!talent) return null;
        const verdictEntry = blueprint.verdicts_by_email?.[email];
        const verdictAuthor = verdictEntry
          ? staffByKey[verdictEntry.authorKey]
          : undefined;
        return {
          email,
          i,
          talent,
          isPresent: blueprint.presentEmails?.includes(email) ?? false,
          delay: blueprint.delays?.[email] ?? 0,
          verdictEntry,
          verdictAuthor,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Participations — batched, then mapped back by talentId (unique per
    // event) to wire up the activity + compliance child rows.
    const participations = await prisma.participation.createManyAndReturn({
      data: students.map((s) => ({
        talentId: s.talent.id,
        eventId: event.id,
        campusId,
        isPresent: s.isPresent,
        delay: s.delay,
        bringPc: blueprint.bringPc ? blueprint.bringPc(s.email, s.i) : false,
        camperRating: s.isPresent
          ? (blueprint.ratings?.[s.email] ?? null)
          : null,
        camperFeedback: s.isPresent
          ? (blueprint.feedback?.[s.email] ?? null)
          : null,
      })),
      select: { id: true, talentId: true },
    });
    const participationIdByTalent = new Map(
      participations.map((p) => [p.talentId, p.id]),
    );

    // Cockpit attaches verdicts at the orga (roll-call) slot, so seed mirrors
    // that on the event's orga activity.
    const verdictTargetId = activitiesCreated.find(
      (a) => a.activityType === 'orga',
    )?.id;

    const participationActivityRows = students.flatMap((s) => {
      const participationId = participationIdByTalent.get(s.talent.id)!;
      return activitiesCreated.map((activity) => {
        const isVerdictTarget =
          s.verdictEntry && s.verdictAuthor && activity.id === verdictTargetId;
        return {
          participationId,
          activityId: activity.id,
          isPresent: s.isPresent,
          delay: s.delay,
          ...(isVerdictTarget
            ? {
                verdict: s.verdictEntry!.verdict,
                contextTag: s.verdictEntry!.contextTag ?? null,
                verdictAuthorId: s.verdictAuthor!.id,
                verdictAt: new Date(),
              }
            : {}),
        };
      });
    });
    await prisma.participationActivity.createMany({
      data: participationActivityRows,
    });

    // Stage compliance (only for stage_seconde events). This row tracks the
    // event-scoped charte; the image-rights decision is a talent-level fact
    // seeded with the onboarding ladder (see seedStudents), because the parent
    // mail that drives it fires at the parents step — independent of any event.
    if (blueprint.eventType === EVENT_TYPES.STAGE_SECONDE) {
      const complianceRows: {
        participationId: string;
        charteSigned: boolean;
      }[] = [];
      for (const s of students) {
        const fullySigned = blueprint.stageSigned?.includes(s.email) ?? false;
        const partiallySigned =
          blueprint.stageUnsigned?.includes(s.email) ?? false;
        if (!fullySigned && !partiallySigned) continue;
        complianceRows.push({
          participationId: participationIdByTalent.get(s.talent.id)!,
          charteSigned: fullySigned || Math.random() < 0.5,
        });
      }
      await prisma.stageCompliance.createMany({ data: complianceRows });
    }
  }

  return eventIds;
}

async function seedStepsProgress(
  talentByEmail: Record<string, { id: string }>,
  eventIds: string[],
): Promise<number> {
  const liveEvent = EVENTS.find((e) => e.daysOffset === 0);
  if (!liveEvent) return 0;

  const liveEventId = eventIds[EVENTS.indexOf(liveEvent)];
  const activities = await prisma.activity.findMany({
    where: {
      timeSlot: { planning: { eventId: liveEventId } },
      isDynamic: true,
    },
  });
  if (activities.length === 0) return 0;

  // Use the first dynamic activity for alerts
  const targetActivity = activities[0];
  const cs = contentStructures[targetActivity.nom];
  const firstStep = cs?.steps[0]?.id;
  const midStep = cs?.steps[Math.floor((cs?.steps.length ?? 1) / 2)]?.id;
  const lastStep = cs?.steps[cs.steps.length - 1]?.id;

  let alertCount = 0;
  const presentEmails = liveEvent.presentEmails ?? [];
  const liveRows = presentEmails.flatMap((email, i) => {
    const talent = talentByEmail[email];
    if (!talent || !firstStep) return [];

    // Distribution on 6 present students: 2 completed, 1 active, 3 needs_help
    let status: 'active' | 'needs_help' | 'completed';
    let stepId = firstStep;
    if (i < 2) {
      status = 'completed';
      stepId = lastStep ?? firstStep;
    } else if (i < 3) {
      status = 'active';
      stepId = midStep ?? firstStep;
    } else {
      status = 'needs_help';
      stepId = midStep ?? firstStep;
      alertCount++;
    }

    return [
      {
        talentId: talent.id,
        eventId: liveEventId,
        activityId: targetActivity.id,
        currentStepId: stepId,
        unlockedStepId: stepId,
        status,
        lastUnlockSource: 'student' as const,
      },
    ];
  });
  await prisma.stepsProgress.createMany({ data: liveRows });

  // Past event completions for XP / progress history. Fetch every past
  // event's dynamic activities in one query, then build all rows.
  const pastEvents = EVENTS.filter((e) => e.daysOffset < 0);
  const pastEventIds = pastEvents.map((e) => eventIds[EVENTS.indexOf(e)]);
  const pastActivities = await prisma.activity.findMany({
    where: {
      timeSlot: { planning: { eventId: { in: pastEventIds } } },
      isDynamic: true,
    },
    select: {
      id: true,
      nom: true,
      timeSlot: { select: { planning: { select: { eventId: true } } } },
    },
  });

  const pastRows = pastActivities.flatMap((activity) => {
    const acs = contentStructures[activity.nom];
    const last = acs?.steps[acs.steps.length - 1]?.id;
    const evtId = activity.timeSlot.planning.eventId;
    const evt = pastEvents.find((e) => eventIds[EVENTS.indexOf(e)] === evtId);
    if (!last || !evt) return [];

    return (evt.presentEmails ?? []).flatMap((email) => {
      const talent = talentByEmail[email];
      if (!talent) return [];
      return [
        {
          talentId: talent.id,
          eventId: evtId,
          activityId: activity.id,
          currentStepId: last,
          unlockedStepId: last,
          status: 'completed' as const,
          lastUnlockSource: 'staff' as const,
        },
      ];
    });
  });
  // skipDuplicates absorbs the (talentId, activityId) unique collisions the
  // old per-row .catch() swallowed.
  await prisma.stepsProgress.createMany({
    data: pastRows,
    skipDuplicates: true,
  });

  return alertCount;
}

async function recomputeXp(): Promise<number> {
  // Rebuild the XP ledger the way the app does (XpGrant rows), then set the
  // cached projections (Talent.xp / eventsCount) to match — so seeded talents
  // stay consistent with the ledger and survive any later recompute
  // (mark-present, onboarding reset) instead of getting zeroed. Two grant
  // sources, mirroring production:
  //   - `onboarding`        → WELCOME_XP_BONUS, one per talent who signed rules.
  //   - `activity_presence` → one per present participation; amount = sum of
  //     present non-orga difficulties, or a 20-XP base when present with no
  //     eligible activity (matches getTotalXp on an empty list — so a staff
  //     mark-present recompute reproduces this number instead of changing it).
  const [participations, onboarded] = await Promise.all([
    prisma.participation.findMany({
      where: { isPresent: true },
      select: {
        id: true,
        talentId: true,
        campusId: true,
        activities: {
          select: {
            isPresent: true,
            activity: { select: { activityType: true, difficulte: true } },
          },
        },
      },
    }),
    prisma.talent.findMany({
      where: { rulesSignedAt: { not: null } },
      select: { id: true },
    }),
  ]);

  const grants: Prisma.XpGrantCreateManyInput[] = [];
  const xpByTalent: Record<string, number> = {};
  const eventsByTalent: Record<string, number> = {};

  for (const t of onboarded) {
    grants.push({
      talentId: t.id,
      source: 'onboarding',
      sourceId: t.id,
      amount: WELCOME_XP_BONUS,
    });
    xpByTalent[t.id] = (xpByTalent[t.id] ?? 0) + WELCOME_XP_BONUS;
  }

  for (const p of participations) {
    eventsByTalent[p.talentId] = (eventsByTalent[p.talentId] ?? 0) + 1;
    const eligible = p.activities.filter(
      (pa) => pa.isPresent && pa.activity.activityType !== 'orga',
    );
    const amount = eligible.length
      ? eligible.reduce(
          (sum, pa) => sum + (XP_MAP[pa.activity.difficulte ?? ''] ?? 20),
          0,
        )
      : 20; // base attendance XP (matches getTotalXp on an empty list)
    grants.push({
      talentId: p.talentId,
      source: 'activity_presence',
      sourceId: p.id,
      amount,
      campusId: p.campusId,
    });
    xpByTalent[p.talentId] = (xpByTalent[p.talentId] ?? 0) + amount;
  }

  await prisma.xpGrant.createMany({ data: grants, skipDuplicates: true });

  const talentIds = new Set([
    ...Object.keys(xpByTalent),
    ...Object.keys(eventsByTalent),
  ]);
  await Promise.all(
    [...talentIds].map((id) =>
      prisma.talent.update({
        where: { id },
        data: { xp: xpByTalent[id] ?? 0, eventsCount: eventsByTalent[id] ?? 0 },
      }),
    ),
  );

  return talentIds.size;
}

async function seedInterviews(
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
  talentByEmail: Record<string, { id: string }>,
  _campuses: Record<string, { id: string }>,
): Promise<number> {
  // Pre-resolve titre → eventId and (talentId, eventId) → participationId once,
  // so each interview resolves from memory instead of its own findUnique.
  const events = await prisma.event.findMany({
    select: { id: true, titre: true },
  });
  const eventIdByTitre = new Map(events.map((e) => [e.titre, e.id]));

  const participations = await prisma.participation.findMany({
    select: { id: true, talentId: true, eventId: true },
  });
  const participationByTalentEvent = new Map(
    participations.map((p) => [`${p.talentId}_${p.eventId}`, p.id]),
  );

  const rows = INTERVIEWS.flatMap((iv) => {
    const talent = talentByEmail[iv.studentEmail];
    const staff = staffByKey[iv.staffKey];
    if (!talent || !staff) return [];

    // participationId is required: the interview is 1:1 with the talent's
    // participation in this stage. Skip (warn) when there's no participation, so
    // the seed can only produce runtime-reachable rows.
    const eventId = eventIdByTitre.get(iv.forEventTitre);
    if (!eventId) {
      console.warn(
        `⚠ Interview for ${iv.studentEmail} references unknown event "${iv.forEventTitre}"`,
      );
      return [];
    }
    const participationId =
      participationByTalentEvent.get(`${talent.id}_${eventId}`) ?? null;
    if (!participationId) {
      console.warn(
        `⚠ Interview for ${iv.studentEmail} has no participation in "${iv.forEventTitre}"`,
      );
      return [];
    }

    return [
      {
        talentId: talent.id,
        staffId: staff.id,
        campusId: staff.campusId,
        participationId,
        status: iv.status,
        ...iv.answers,
      },
    ];
  });

  await prisma.interview.createMany({ data: rows });
  return rows.length;
}

async function seedPortfolio(
  talentByEmail: Record<string, { id: string }>,
  eventIds: string[],
): Promise<number> {
  const rows = PORTFOLIO.flatMap((p) => {
    const talent = talentByEmail[p.studentEmail];
    const eventId = eventIds[p.eventIndex];
    if (!talent || !eventId) return [];
    return [
      { talentId: talent.id, eventId, url: p.url ?? null, caption: p.caption },
    ];
  });
  await prisma.portfolioItem.createMany({ data: rows });
  return rows.length;
}

async function seedReminders(
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
  talentByEmail: Record<string, { id: string }>,
): Promise<number> {
  const rows = REMINDERS.flatMap((r) => {
    const talent = talentByEmail[r.studentEmail];
    const staff = staffByKey[r.staffKey];
    if (!talent || !staff) return [];
    return [
      {
        talentId: talent.id,
        type: r.type,
        channel: r.channel ?? 'email',
        subject: r.subject ?? null,
        body: r.body ?? null,
        sentAt: dayAt(r.daysOffset, r.hour ?? 10, 0),
        sentBy: staff.userId,
      },
    ];
  });
  await prisma.onboardingReminder.createMany({ data: rows });
  return rows.length;
}

// ─── Broadcasts ───

/**
 * Seed mass campaigns (mail + SMS) and their per-talent / per-parent
 * recipient rows. Each broadcast references a `MessageTemplate` (we
 * create one per channel up-front and reuse it across campaigns — the
 * snapshot lives on the `Broadcast` row itself, so reusing a template is
 * realistic and keeps the seed tight). Returns the number of recipient
 * rows created so `main()` can log it.
 */
async function seedBroadcasts(
  staffByKey: Record<string, { id: string; userId: string; campusId: string }>,
  talentByEmail: Record<string, { id: string }>,
  campuses: Record<string, { id: string }>,
  eventIds: string[],
): Promise<number> {
  // Pick a deterministic template author. Same staff member created the
  // reusable transactional templates, so the broadcast templates feel
  // consistent in the admin UI.
  const templateAuthor =
    staffByKey['pauline.marchand']?.userId ??
    Object.values(staffByKey)[0]?.userId;
  if (!templateAuthor) return 0;

  const [mailTemplate, smsTemplate] = await Promise.all([
    prisma.messageTemplate.create({
      data: {
        name: 'Communications stage (mail)',
        channel: 'mail',
        subject: 'Communication Epitech Academy',
        body: 'Snapshot par défaut — chaque diffusion injecte son propre contenu.',
        createdById: templateAuthor,
      },
    }),
    prisma.messageTemplate.create({
      data: {
        name: 'Communications stage (SMS)',
        channel: 'sms',
        subject: null,
        body: 'Snapshot par défaut — chaque diffusion injecte son propre contenu.',
        createdById: templateAuthor,
      },
    }),
  ]);

  // Each broadcast ships with its recipient rows as one nested create. Skip
  // blueprints whose campus/author can't resolve, then fire the rest
  // concurrently.
  const plans = BROADCASTS.flatMap((bp) => {
    const campusId = campuses[bp.campus]?.id;
    const author = staffByKey[bp.createdByStaffKey];
    if (!campusId || !author) return [];

    const createdAt = dayAt(bp.createdDaysOffset, bp.createdHour, 0);
    const recipients = bp.recipients.flatMap((rcp) => {
      const talent = talentByEmail[rcp.studentEmail];
      if (!talent) return [];
      const recipientEmail = rcp.parentSide
        ? rcp.studentEmail.replace('@', '+parent@')
        : rcp.studentEmail;
      return [
        {
          talentId: rcp.parentSide ? null : talent.id,
          parentOfTalentId: rcp.parentSide ? talent.id : null,
          recipientEmail: bp.channel === 'mail' ? recipientEmail : null,
          recipientPhone: bp.channel === 'sms' ? '+33600000000' : null,
          status: rcp.status,
          errorMessage: rcp.errorMessage ?? null,
          sentAt:
            rcp.sentDaysOffset !== undefined
              ? dayAt(rcp.sentDaysOffset, rcp.sentHour ?? 10, 0)
              : null,
          openedAt:
            rcp.openedDaysOffset !== undefined
              ? dayAt(rcp.openedDaysOffset, rcp.openedHour ?? 10, 0)
              : null,
          createdAt,
        },
      ];
    });

    return [
      {
        data: {
          name: bp.name,
          channel: bp.channel,
          templateId: (bp.channel === 'mail' ? mailTemplate : smsTemplate).id,
          campusId,
          audience: bp.audience,
          eventId:
            bp.eventIndex !== null ? (eventIds[bp.eventIndex] ?? null) : null,
          subjectSnapshot: bp.subject,
          bodySnapshot: bp.body,
          status: bp.status,
          createdById: author.userId,
          createdAt,
          updatedAt: createdAt,
          recipients: { create: recipients },
        },
        recipientCount: recipients.length,
      },
    ];
  });

  await Promise.all(
    plans.map((p) => prisma.broadcast.create({ data: p.data })),
  );
  return plans.reduce((sum, p) => sum + p.recipientCount, 0);
}

// ─── Helpers ───

async function printSummary(parentEmail: string) {
  const origin = process.env.ORIGIN || 'http://localhost:3030';
  const [parisTalents, lyonTalents, eventCount, interviewCount] =
    await Promise.all([
      prisma.talent.count({
        where: {
          participations: { some: { campus: { name: 'Paris' } } },
        },
      }),
      prisma.talent.count({
        where: {
          participations: { some: { campus: { name: 'Lyon' } } },
        },
      }),
      prisma.event.count(),
      prisma.interview.count(),
    ]);

  const doneInterviews = await prisma.interview.count({
    where: { status: 'done' },
  });
  const inProgressInterviews = await prisma.interview.count({
    where: { status: 'in_progress' },
  });
  const alertCount = await prisma.stepsProgress.count({
    where: { status: 'needs_help' },
  });
  const missingMantaCount = await prisma.event.count({
    where: {
      date: { gte: startOfToday, lte: dayAt(7, 23, 59) },
      mantas: { none: {} },
    },
  });

  console.log('\n════════════════════════════════════════════════════════');
  console.log('                   SEED COMPLETE');
  console.log('════════════════════════════════════════════════════════\n');

  console.log('🔑 Credentials');
  console.log(
    `   admin      Microsoft OAuth only — bun run scripts/add-admin-user.ts`,
  );
  console.log(`   staff      *@epitech.eu (Microsoft OAuth)`);
  console.log(`              (pauline.marchand=superdev, marie.manta=dev,`);
  console.log(`               sophie.bernard/nathan.blanc=peda,`);
  console.log(`               jules.dupont/laura.garcia/pierre.leblanc=manta,`);
  console.log(`               camille.reader=no role → "contact admin")`);
  console.log(`   students   *@mail.com (OTP via email)`);
  console.log(`   parent     ${parentEmail} (OTP via email)\n`);

  console.log('📊 Volume');
  console.log(
    `   ${parisTalents} Paris students + ${lyonTalents} Lyon students`,
  );
  console.log(`   ${eventCount} events, ${interviewCount} interviews`);
  console.log('');

  console.log('🎯 Feature trigger points');
  console.log(
    `   Live alerts (cockpit):         ${alertCount} needs_help entries on today's event`,
  );
  console.log(`   Entretiens — finalisés:        ${doneInterviews}`);
  console.log(`   Entretiens — en cours:         ${inProgressInterviews}`);
  console.log(
    `   Task queue — missing mantas:   ${missingMantaCount} events ≤ 7 days`,
  );
  console.log(
    `   Task queue — missing planning: 1 event (Atelier Game Design, +4d)`,
  );
  console.log(
    '   Stage compliance:              3 stage_seconde events with mixed signed/unsigned',
  );
  const reminderTotal = await prisma.onboardingReminder.count();
  console.log(
    `   Onboarding reminders:          ${reminderTotal} relances envoyées (CommHistoryList)`,
  );
  console.log('');

  console.log('🌐 URLs');
  console.log(`   ${origin}/                            Talent app`);
  console.log(`   ${origin}/staff/login                 Staff sign-in`);
  console.log(`   ${origin}/staff/admin                 Admin panel`);
  console.log(`   ${origin}/staff/dev                   Dev space`);
  console.log(`   ${origin}/staff/pedago                Pedago / Manta space`);
  console.log(`   ${origin}/parent/login                Parent portal`);
  console.log('');
  console.log('════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
