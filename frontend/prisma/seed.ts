import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient, type ActivityType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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

function levelFromXp(xp: number): string {
  if (xp >= 200) return 'Expert';
  if (xp >= 80) return 'Apprentice';
  return 'Novice';
}

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

> « Il n'y a pas **un** métier de la tech, il y en a des dizaines. » — *Intervenant·e invité·e*

## Objectifs de la session

- Découvrir la **diversité** des rôles dans le numérique
- Identifier les compétences clés de chaque métier
- Poser des questions concrètes à un·e professionnel·le

## Déroulé (90 min)

| Temps  | Séquence                       | Format      |
| ------ | ------------------------------ | ----------- |
| 10 min | Accueil + brise-glace          | Plénière    |
| 30 min | Présentation des 4 familles    | Talk        |
| 20 min | Témoignages vidéo              | Projection  |
| 25 min | Questions / Réponses           | Interactif  |
| 5 min  | Synthèse et ressources         | Plénière    |

## Les 4 grandes familles

1. **Développement** — *front-end, back-end, mobile, systèmes embarqués*
2. **Data & IA** — *data analyst, data scientist, ML engineer*
3. **Cybersécurité** — *pentester, analyste SOC, RSSI*
4. **Produit & Design** — *PM, PO, UX/UI, ops*

### Exemple de stack côté web

\`\`\`ts
// Un même·e dev peut toucher plusieurs couches
const stack = {
  front: ['Svelte', 'React', 'Vue'],
  back: ['Node', 'Go', 'Rust'],
  data: ['Postgres', 'Redis', 'Kafka'],
};
\`\`\`

## Ressources officielles

- Fiches métiers : [Onisep — numérique](https://www.onisep.fr/metiers/des-metiers-par-secteur/les-metiers-de-l-informatique)
- Rapport annuel *Numeum* sur l'emploi tech
- Podcasts recommandés : **IfThisThenDev**, **Underscore_**

---

*Support à projeter en 16:9. Prévoir enceintes pour les vidéos témoignages.*`,
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

## Points de vigilance

- [ ] **Allergies** et régimes spéciaux signalés en amont
- [ ] Repas **halal / végétarien** disponibles
- [ ] Eau et snacks accessibles en libre-service
- [ ] Rappel des **horaires de reprise** en fin de pause

> ⚠️ *Aucun·e élève ne quitte l'établissement sans accompagnant·e.*

## Astuce encadrant·e

Profite de la pause pour **échanger de façon informelle** avec les élèves : c'est souvent là que remontent les retours les plus riches sur la matinée.`,
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

> « La restitution n'est pas une note — c'est une **célébration** du chemin parcouru. »

## Format officiel

| Séquence                       | Durée       | Responsable          |
| ------------------------------ | ----------- | -------------------- |
| Mot d'accueil                  | 5 min       | Responsable pédago   |
| Pitchs par équipe (5 min × N)  | ~60 min     | Élèves               |
| Questions / Réponses           | 15 min      | Jury + public        |
| Délibération rapide            | 10 min      | Jury                 |
| Remise des diplômes            | 20 min      | Directeur·rice       |
| Photo de groupe + pot          | 10 min      | Tout le monde        |

## Trame de pitch conseillée

1. **Le problème** qu'on a voulu résoudre
2. **La solution** et ses choix techniques
3. **Une démo** (vidéo ou live)
4. **Ce qu'on a appris** — techniquement *et* humainement
5. **Ce qu'on ferait ensuite** avec plus de temps

### Check-list technique avant restitution

- [ ] HDMI + adaptateur USB-C testés
- [ ] Micros sans fil chargés
- [ ] Diplômes imprimés et signés
- [ ] Photographe ou référent·e photo désigné·e

## Critères de jury (à communiquer avant)

- **Clarté** du pitch (30%)
- **Qualité** de la réalisation (30%)
- **Originalité** / prise de risque (20%)
- **Esprit d'équipe** visible dans la présentation (20%)

---

*Prévoir un plan B audio en cas de panne : enceinte bluetooth + câble jack 3.5mm.*`,
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
    content: `# Visite du campus — Paris Kremlin-Bicêtre

## Itinéraire conseillé (60 min)

1. **Accueil & hall principal** — présentation rapide de l'école
2. **Salles de cours & amphi** — comment se déroulent les projets
3. **Hub / espace communautaire** — vie associative, clubs techniques
4. **Labs & salles serveur** — côté infra / réseau / hardware
5. **Cafétéria + coin détente** — clôture informelle

> 📍 **Adresse** : 14-16 rue Voltaire, 94270 Le Kremlin-Bicêtre
> 🚇 Métro **7** — station *Le Kremlin-Bicêtre*

## Points à mettre en avant

- La **pédagogie par projet** : pas de cours magistraux classiques
- La **communauté alumni** très présente
- Les **partenariats entreprises** (stages, alternances, hackathons)

### Clubs à présenter (au moins 2 parmi)

| Club              | Thème                          |
| ----------------- | ------------------------------ |
| **EpiGames**      | Jeu vidéo, game design         |
| **HackademINT**   | Cybersécurité, CTF             |
| **Epitech.eu AI** | Intelligence artificielle      |
| **WebAcademie**   | Développement web, open-source |

## Consignes sécurité

- [ ] Vérifier les **badges visiteurs** à l'entrée
- [ ] Pas de photos dans les salles serveur
- [ ] Respect des **issues de secours** balisées

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
    content: `# Rencontre alumni — Campus Lyon

> *« J'ai commencé Epitech sans savoir coder une ligne. Aujourd'hui je bosse sur des modèles d'IA chez un éditeur lyonnais. »*
> — **Sarah**, promo 2019

## Format — table ronde

- **3 alumni** aux parcours différents
- **1 modérateur·rice** (pédago ou manta)
- Public : élèves + quelques parents invités

## Profils d'alumni invités

| Profil                | Entreprise type              | Années d'XP |
| --------------------- | ---------------------------- | ----------- |
| Développeur·se full-stack | Scale-up lyonnaise         | 3–5 ans     |
| Data / ML engineer    | Grand groupe bancaire        | 5+ ans      |
| Entrepreneur·e tech   | Start-up SaaS autofinancée   | 2–4 ans     |

## Trame de questions

1. **Pourquoi Epitech** plutôt qu'une autre formation ?
2. Votre **premier stage** : comment l'avez-vous trouvé ?
3. Une **journée type** dans votre métier actuel ?
4. Un conseil à votre **vous d'il y a 10 ans** ?
5. Comment la **communauté alumni** vous aide aujourd'hui ?

### Bonus — questions du public

> 💡 *Prévoir 20–25 min de Q&A ouvert en fin de session.*

## À distribuer aux élèves

- Lien LinkedIn des **intervenant·e·s** (avec leur accord)
- Flyer du réseau **Epitech Alumni Lyon**
- QR code du **Discord** d'entraide local

---

*Tournage autorisé uniquement avec accord explicite des alumni présents.*`,
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
    content: `# Atelier partenaire — Analyse de logs & détection d'incidents

> Atelier animé par un·e **analyste SOC** d'un partenaire local (éditeur cyber marseillais).

## Contexte du cas pratique

Un serveur web expose une API publique. Sur les **dernières 24 h**, on soupçonne une activité malveillante. Tâche des élèves : **identifier** les requêtes suspectes et **reconstruire** le scénario d'attaque.

### Environnement fourni

- Extrait de logs \`access.log\` (format *Apache Combined*)
- Accès navigateur à une instance **Kibana** en lecture seule
- Fiche *cheat-sheet* avec les regex usuelles

## Étapes (150 min)

1. **Briefing** du cas (15 min)
2. **Exploration** des logs en binôme (45 min)
3. **Point d'étape** collectif (15 min)
4. **Construction** de la timeline d'attaque (45 min)
5. **Restitution** + débrief partenaire (30 min)

### Exemple de ligne à analyser

\`\`\`
203.0.113.42 - - [14/Mar/2026:03:12:44 +0100] "GET /admin/../etc/passwd HTTP/1.1" 404 162 "-" "sqlmap/1.7"
\`\`\`

**Indices à repérer** :

- User-Agent suspect → \`sqlmap/1.7\`
- Tentative de *path traversal* → \`../etc/passwd\`
- Horaire atypique → **3 h du matin**

## Pré-requis

- [ ] Avoir fait l'activité *Initiation à la cybersécurité*
- [ ] Laptop avec terminal (macOS / Linux / WSL)
- [ ] Connaissance basique des **codes HTTP** (200, 301, 404, 500)

## Livrables attendus

| Livrable                      | Format        | Qui ?      |
| ----------------------------- | ------------- | ---------- |
| Liste des IP suspectes        | \`.txt\`      | Chaque binôme |
| Timeline de l'attaque         | Slide / doc   | Chaque binôme |
| 3 recommandations de mitigation | Oral        | Un binôme au hasard |

---

*Contact partenaire confidentiel — voir fiche coordonnées côté pédago.*`,
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
  },
  {
    key: 'marie.manta',
    email: 'marie.manta@epitech.eu',
    name: 'Marie Manta',
    campus: 'Paris',
    role: 'dev' as const,
  },
  {
    key: 'sophie.bernard',
    email: 'sophie.bernard@epitech.eu',
    name: 'Sophie Bernard',
    campus: 'Paris',
    role: 'peda' as const,
  },
  {
    key: 'jules.dupont',
    email: 'jules.dupont@epitech.eu',
    name: 'Jules Dupont',
    campus: 'Paris',
    role: 'manta' as const,
  },
  {
    key: 'laura.garcia',
    email: 'laura.garcia@epitech.eu',
    name: 'Laura Garcia',
    campus: 'Paris',
    role: 'manta' as const,
  },
  {
    key: 'nathan.blanc',
    email: 'nathan.blanc@epitech.eu',
    name: 'Nathan Blanc',
    campus: 'Lyon',
    role: 'peda' as const,
  },
  {
    key: 'pierre.leblanc',
    email: 'pierre.leblanc@epitech.eu',
    name: 'Pierre Leblanc',
    campus: 'Lyon',
    role: 'manta' as const,
  },
  {
    key: 'camille.reader',
    email: 'camille.reader@epitech.eu',
    name: 'Camille Reader',
    campus: 'Paris',
    role: null, // Unassigned — tests the "contact admin" guard
  },
];

type StudentDef = {
  email: string;
  prenom: string;
  nom: string;
  phone: string;
  parentPhone: string;
  niveau: string;
  niveauDifficulte: 'Débutant' | 'Intermédiaire' | 'Avancé';
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
    niveau: '4eme',
    niveauDifficulte: 'Débutant',
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
    niveau: '3eme',
    niveauDifficulte: 'Intermédiaire',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 2,
  },
  {
    email: 'emma.bernard@mail.com',
    prenom: 'Emma',
    nom: 'Bernard',
    phone: '+33 6 12 34 56 03',
    parentPhone: '+33 6 98 76 54 03',
    niveau: '5eme',
    niveauDifficulte: 'Débutant',
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
    niveau: '6eme',
    niveauDifficulte: 'Débutant',
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
    niveauDifficulte: 'Avancé',
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
    niveau: '4eme',
    niveauDifficulte: 'Intermédiaire',
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
    niveau: '3eme',
    niveauDifficulte: 'Intermédiaire',
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
    niveau: '5eme',
    niveauDifficulte: 'Débutant',
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
    niveau: '6eme',
    niveauDifficulte: 'Débutant',
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
    niveau: '1ere',
    niveauDifficulte: 'Avancé',
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
    niveauDifficulte: 'Intermédiaire',
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
    niveau: '3eme',
    niveauDifficulte: 'Intermédiaire',
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
    niveau: '5eme',
    niveauDifficulte: 'Débutant',
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
    niveau: '4eme',
    niveauDifficulte: 'Intermédiaire',
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
    niveau: 'Terminale',
    niveauDifficulte: 'Avancé',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 0,
  },
  {
    email: 'antoine.michel@mail.com',
    prenom: 'Antoine',
    nom: 'Michel',
    phone: '+33 6 12 34 56 16',
    parentPhone: '+33 6 98 76 54 16',
    niveau: '6eme',
    niveauDifficulte: 'Débutant',
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
    niveau: '3eme',
    niveauDifficulte: 'Avancé',
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
    niveau: '4eme',
    niveauDifficulte: 'Débutant',
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
    niveauDifficulte: 'Intermédiaire',
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
    niveauDifficulte: 'Avancé',
    campus: 'Paris',
    charterSigned: true,
    lastActiveDaysAgo: 1,
  },
  // ── Lyon (5 students) ──
  {
    email: 'ines.durand@mail.com',
    prenom: 'Inès',
    nom: 'Durand',
    phone: '+33 7 12 34 56 21',
    parentPhone: '+33 7 98 76 54 21',
    niveau: '4eme',
    niveauDifficulte: 'Débutant',
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
    niveau: '3eme',
    niveauDifficulte: 'Intermédiaire',
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
    niveau: '5eme',
    niveauDifficulte: 'Débutant',
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
    niveauDifficulte: 'Avancé',
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
    niveau: '6eme',
    niveauDifficulte: 'Débutant',
    campus: 'Lyon',
    charterSigned: false,
    lastActiveDaysAgo: 20,
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
  notes_by_email?: Record<string, { text: string; authorKey: string }>;
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
    studentEmails: parisStudents.slice(0, 8),
    presentEmails: parisStudents.slice(0, 7), // 7/8 attended
    delays: { [parisStudents[3]]: 10 },
    notes_by_email: {
      [parisStudents[0]]: {
        text: 'Très engagée, super motivée sur les exercices.',
        authorKey: 'jules.dupont',
      },
      [parisStudents[4]]: {
        text: 'A aidé ses camarades sur César.',
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
    studentEmails: parisStudents.slice(0, 10),
    presentEmails: parisStudents.slice(0, 9), // 9/10 attended
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

  // 3. Past 3-day STAGE DE SECONDE (test multi-day planning + compliance)
  {
    titre: 'Stage de seconde — Découverte Tech',
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: -21,
    durationDays: 3,
    campus: 'Paris',
    theme: 'Développement Web',
    pin: '1001',
    notes:
      'Premier stage de la saison. 3 élèves ont signé tous leurs documents.',
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
    studentEmails: parisStudents.slice(0, 8),
    presentEmails: parisStudents.slice(0, 6), // 6 already checked in
    delays: { [parisStudents[4]]: 15 },
    notes_by_email: {
      [parisStudents[2]]: {
        text: 'Hésite sur la collecte des données.',
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
    studentEmails: parisStudents.slice(10, 16),
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
    studentEmails: parisStudents.slice(5, 12),
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
    studentEmails: parisStudents.slice(0, 10),
    bringPc: () => true,
  },

  // 8. Future STAGE DE SECONDE (stage compliance in planning)
  {
    titre: 'Stage de seconde — Avril',
    eventType: EVENT_TYPES.STAGE_SECONDE,
    daysOffset: 30,
    durationDays: 3,
    campus: 'Paris',
    theme: 'Développement Web',
    pin: '1002',
    notes: null,
    mantaKeys: ['jules.dupont'],
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
            label: 'IA',
            activities: [{ nom: "L'IA et moi" }],
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
            label: 'Game Design',
            activities: [{ nom: 'Crée ton jeu Scratch' }],
          },
        ],
      },
    ],
    studentEmails: parisStudents.slice(10, 16),
    stageSigned: parisStudents.slice(10, 12), // 2 of 6 fully signed
    stageUnsigned: parisStudents.slice(12, 16), // 4 partial — triggers compliance alert
    bringPc: () => true,
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
    studentEmails: lyonStudents.slice(0, 4),
    presentEmails: lyonStudents.slice(0, 4),
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
];

// ─── Interview blueprints ───

type InterviewBlueprint = {
  studentEmail: string;
  staffKey: string;
  daysOffset: number; // when the interview is/was scheduled
  status: 'planned' | 'completed' | 'cancelled';
  notes?: {
    motivation?: string;
    globalNote?: string;
    satisfaction?: string;
    influencers?: string;
  };
};

const INTERVIEWS: InterviewBlueprint[] = [
  // Today (2) — triggers dev task queue
  {
    studentEmail: parisStudents[10],
    staffKey: 'marie.manta',
    daysOffset: 0,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[11],
    staffKey: 'marie.manta',
    daysOffset: 0,
    status: 'planned',
  },
  // Overdue (3) — triggers dev task queue
  {
    studentEmail: parisStudents[12],
    staffKey: 'marie.manta',
    daysOffset: -2,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[13],
    staffKey: 'marie.manta',
    daysOffset: -5,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[14],
    staffKey: 'pauline.marchand',
    daysOffset: -1,
    status: 'planned',
  },
  // Completed (5) — for KPI
  {
    studentEmail: parisStudents[0],
    staffKey: 'marie.manta',
    daysOffset: -20,
    status: 'completed',
    notes: {
      motivation: 'Très motivée, projet déjà clair.',
      globalNote: 'Profil idéal pour le coding club.',
      satisfaction: 'Très satisfaite',
      influencers: 'Sa grande sœur (ingénieure)',
    },
  },
  {
    studentEmail: parisStudents[1],
    staffKey: 'marie.manta',
    daysOffset: -18,
    status: 'completed',
    notes: {
      motivation: 'Fan de jeux vidéo, veut comprendre comment ils sont faits.',
      globalNote: 'À orienter game design.',
    },
  },
  {
    studentEmail: parisStudents[4],
    staffKey: 'pauline.marchand',
    daysOffset: -15,
    status: 'completed',
    notes: { motivation: 'Projet de stage de seconde clair.' },
  },
  {
    studentEmail: parisStudents[9],
    staffKey: 'marie.manta',
    daysOffset: -10,
    status: 'completed',
  },
  {
    studentEmail: parisStudents[14],
    staffKey: 'marie.manta',
    daysOffset: -8,
    status: 'completed',
    notes: { motivation: 'Orientation Supinfo envisagée.' },
  },
  // Future planned (10) — for KPI
  {
    studentEmail: parisStudents[15],
    staffKey: 'marie.manta',
    daysOffset: 1,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[16],
    staffKey: 'marie.manta',
    daysOffset: 2,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[17],
    staffKey: 'marie.manta',
    daysOffset: 3,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[18],
    staffKey: 'pauline.marchand',
    daysOffset: 3,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[19],
    staffKey: 'pauline.marchand',
    daysOffset: 5,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[2],
    staffKey: 'marie.manta',
    daysOffset: 6,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[3],
    staffKey: 'marie.manta',
    daysOffset: 7,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[5],
    staffKey: 'pauline.marchand',
    daysOffset: 8,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[6],
    staffKey: 'marie.manta',
    daysOffset: 10,
    status: 'planned',
  },
  {
    studentEmail: parisStudents[7],
    staffKey: 'marie.manta',
    daysOffset: 12,
    status: 'planned',
  },
  // Cancelled (1) — realism
  {
    studentEmail: parisStudents[8],
    staffKey: 'marie.manta',
    daysOffset: -3,
    status: 'cancelled',
  },
  // Lyon (2)
  {
    studentEmail: lyonStudents[0],
    staffKey: 'nathan.blanc',
    daysOffset: -4,
    status: 'completed',
    notes: { motivation: 'Curieuse de tout.' },
  },
  {
    studentEmail: lyonStudents[3],
    staffKey: 'nathan.blanc',
    daysOffset: 5,
    status: 'planned',
  },
];

// ─── Portfolio items ───

const PORTFOLIO: {
  studentEmail: string;
  eventIndex: number;
  url?: string;
  caption: string;
}[] = [
  {
    studentEmail: parisStudents[0],
    eventIndex: 2, // stage past
    url: 'https://codepen.io/example/first-page',
    caption: 'Ma toute première page web (stage)',
  },
  {
    studentEmail: parisStudents[0],
    eventIndex: 1, // robotics past
    caption: 'Robot assemblé avec Emma',
  },
  {
    studentEmail: parisStudents[1],
    eventIndex: 1,
    caption: 'Mon robot évite les obstacles',
  },
  {
    studentEmail: parisStudents[2],
    eventIndex: 2,
    url: 'https://codepen.io/example/css-page',
    caption: 'Ma page CSS colorée',
  },
  {
    studentEmail: parisStudents[4],
    eventIndex: 0, // cyber past
    url: 'https://example.com/crypto-challenge',
    caption: 'Défi de cryptographie César résolu',
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

  // 3. Students
  const talentByEmail = await seedStudents();
  console.log(`✓  Students (${Object.keys(talentByEmail).length})`);

  // 3b. Parent account (links to first child for portal testing)
  const parentEmail = await seedParents(talentByEmail);
  console.log(`✓  Parent (${parentEmail})`);

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

  // ── Final summary ──
  await printSummary(parentEmail);
}

// ─── Wipe ───

async function wipeAll() {
  // Children first, parents last
  await prisma.stageCompliance.deleteMany();
  await prisma.participationActivity.deleteMany();
  await prisma.portfolioItem.deleteMany();
  await prisma.stepsProgress.deleteMany();
  await prisma.participation.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.eventManta.deleteMany();
  await prisma.activityTheme.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.timeSlot.deleteMany();
  await prisma.planning.deleteMany();
  await prisma.event.deleteMany();
  await prisma.activityTemplateTheme.deleteMany();
  await prisma.planningTemplateSlot.deleteMany();
  await prisma.planningTemplateDay.deleteMany();
  await prisma.planningTemplate.deleteMany();
  await prisma.activityTemplate.deleteMany();
  await prisma.theme.deleteMany();
  await prisma.talent.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.campus.deleteMany();
  await prisma.syncError.deleteMany();
  await prisma.bauth_session.deleteMany();
  await prisma.bauth_account.deleteMany();
  await prisma.bauth_verification.deleteMany();
  await prisma.bauth_user.deleteMany();
}

// ─── Seeders ───

async function seedCampuses(): Promise<
  Record<string, { id: string; name: string }>
> {
  const names = ['Paris', 'Lyon', 'Marseille'];
  const byName: Record<string, { id: string; name: string }> = {};
  for (const name of names) {
    const campus = await prisma.campus.create({ data: { name } });
    byName[name] = { id: campus.id, name: campus.name };
  }
  return byName;
}

async function seedStaff(
  campuses: Record<string, { id: string }>,
): Promise<Record<string, { id: string; campusId: string }>> {
  const byKey: Record<string, { id: string; campusId: string }> = {};
  for (const s of STAFF_MEMBERS) {
    const user = await prisma.bauth_user.create({
      data: {
        email: s.email,
        name: s.name,
        role: 'staff',
        emailVerified: true,
      },
    });
    const profile = await prisma.staffProfile.create({
      data: {
        userId: user.id,
        campusId: campuses[s.campus].id,
        staffRole: s.role,
      },
    });
    byKey[s.key] = { id: profile.id, campusId: profile.campusId! };
  }
  return byKey;
}

async function seedStudents(): Promise<
  Record<string, { id: string; nom: string; prenom: string }>
> {
  const byEmail: Record<string, { id: string; nom: string; prenom: string }> =
    {};
  for (const s of STUDENTS) {
    const user = await prisma.bauth_user.create({
      data: {
        email: s.email,
        name: `${s.prenom} ${s.nom}`,
        role: 'student',
        emailVerified: true,
      },
    });
    const lastActiveAt =
      s.lastActiveDaysAgo !== null
        ? new Date(now.getTime() - s.lastActiveDaysAgo * 86400000)
        : null;
    const talent = await prisma.talent.create({
      data: {
        userId: user.id,
        email: s.email,
        nom: s.nom,
        prenom: s.prenom,
        phone: s.phone,
        parentPhone: s.parentPhone,
        niveau: s.niveau,
        niveauDifficulte: s.niveauDifficulte,
        charterAcceptedAt: s.charterSigned ? new Date() : null,
        infoValidatedAt: s.skipOnboarding ? new Date() : null,
        rulesSignedAt: s.skipOnboarding ? new Date() : null,
        parentNom: s.skipOnboarding ? 'Martin' : null,
        parentPrenom: s.skipOnboarding ? 'Sophie' : null,
        parentEmail: s.skipOnboarding ? `parent.${s.email}` : null,
        lastActiveAt,
      },
    });
    byEmail[s.email] = {
      id: talent.id,
      nom: talent.nom,
      prenom: talent.prenom,
    };
  }
  return byEmail;
}

async function seedParents(
  talentByEmail: Record<string, { id: string; nom: string; prenom: string }>,
): Promise<string> {
  const parentEmail = 'sophie.martin@mail.com';
  await prisma.bauth_user.create({
    data: {
      email: parentEmail,
      name: 'Sophie Martin',
      role: 'parent',
      emailVerified: true,
    },
  });

  const child = talentByEmail['alice.martin@mail.com'];
  if (child) {
    await prisma.talent.update({
      where: { id: child.id },
      data: {
        parentEmail,
        parentNom: 'Martin',
        parentPrenom: 'Sophie',
      },
    });
  }

  return parentEmail;
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

  const byKey: Record<string, { id: string }> = {};

  // Official (campus-less) themes
  for (const nom of themeNames) {
    const t = await prisma.theme.create({ data: { nom, campusId: null } });
    byKey[`official:${nom}`] = t;
  }

  // Campus-scoped themes (Paris: all; Lyon: web/robotics/IA only)
  for (const nom of themeNames) {
    const t = await prisma.theme.create({
      data: { nom, campusId: campuses.Paris.id },
    });
    byKey[`Paris:${nom}`] = t;
  }
  for (const nom of [
    'Développement Web',
    'Robotique',
    'Intelligence Artificielle',
  ]) {
    const t = await prisma.theme.create({
      data: { nom, campusId: campuses.Lyon.id },
    });
    byKey[`Lyon:${nom}`] = t;
  }

  return byKey;
}

async function seedActivityTemplates(
  themesByKey: Record<string, { id: string }>,
  campuses: Record<string, { id: string }>,
) {
  const byName: Record<string, { id: string }> = {};
  for (const def of activityDefs) {
    const campusId = def.campus ? (campuses[def.campus]?.id ?? null) : null;
    const tpl = await prisma.activityTemplate.create({
      data: {
        nom: def.nom,
        description: def.description,
        difficulte: def.difficulte,
        activityType: def.activityType,
        isDynamic: def.isDynamic,
        contentStructure: def.isDynamic
          ? (contentStructures[def.nom] ?? undefined)
          : undefined,
        content: def.content,
        link: def.link,
        defaultDuration: def.defaultDuration,
        campusId,
        activityTemplateThemes: {
          create: def.themes
            .map((themeName) => {
              const themeId =
                (def.campus && themesByKey[`${def.campus}:${themeName}`]?.id) ||
                themesByKey[`official:${themeName}`]?.id;
              return themeId ? { themeId } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null),
        },
      },
    });
    byName[def.nom] = tpl;
  }
  return byName;
}

async function seedPlanningTemplate(
  templatesByName: Record<string, { id: string }>,
) {
  const tpl = await prisma.planningTemplate.create({
    data: {
      nom: 'Stage de seconde — 5 jours',
      description:
        'Modèle de planning sur 5 jours avec accueil/appel + ateliers thématiques par jour.',
      nbDays: 5,
    },
  });

  const byDay: [string, string][] = [
    ['Ma première page HTML', 'CSS : Styliser sa page'],
    ['Construis ton robot', 'Capteurs et actionneurs'],
    ["L'IA et moi", 'Entraîne ton modèle'],
    ['Initiation à la cybersécurité', 'Cryptographie : les secrets du code'],
    ['Crée ton jeu Scratch', 'Game Design avancé'],
  ];

  for (let i = 0; i < 5; i++) {
    const day = await prisma.planningTemplateDay.create({
      data: {
        planningTemplateId: tpl.id,
        dayIndex: i,
        label: `Jour ${i + 1}`,
      },
    });
    await prisma.planningTemplateSlot.create({
      data: {
        planningTemplateDayId: day.id,
        startTime: '13:00',
        endTime: '13:30',
        sortOrder: 0,
        nom: 'Appel',
        activityType: 'orga',
      },
    });
    for (let j = 0; j < byDay[i].length; j++) {
      const actName = byDay[i][j];
      await prisma.planningTemplateSlot.create({
        data: {
          planningTemplateDayId: day.id,
          startTime: '13:45',
          endTime: '16:30',
          sortOrder: 1 + j,
          activityTemplateId: templatesByName[actName]?.id ?? null,
          nom: templatesByName[actName] ? null : actName,
          activityType: 'atelier',
        },
      });
    }
  }
}

async function seedEvents(
  campuses: Record<string, { id: string }>,
  staffByKey: Record<string, { id: string; campusId: string }>,
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
        planning: { create: {} },
      },
      include: { planning: true },
    });
    eventIds.push(event.id);

    const planning = event.planning!;
    const activitiesCreated: { id: string; nom: string; type: ActivityType }[] =
      [];

    // Normalise single-day vs multi-day into a loop (empty when no slots/days)
    const dayList: DayBlueprint[] =
      blueprint.days ??
      (blueprint.slots ? [{ dayOffset: 0, slots: blueprint.slots }] : []);

    for (const day of dayList) {
      for (const slot of day.slots) {
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

        // 1 activity = 1 slot. Multi-activity blueprints write as parallel slots at same time.
        for (const act of slot.activities) {
          const timeSlot = await prisma.timeSlot.create({
            data: {
              planningId: planning.id,
              startTime: slotStart,
              endTime: slotEnd,
            },
          });

          const tpl = templatesByName[act.nom];
          const blueprintDef = activityDefs.find((d) => d.nom === act.nom);
          const activityType: ActivityType =
            act.activityType ?? blueprintDef?.activityType ?? 'atelier';
          const isDynamic = blueprintDef?.isDynamic ?? false;

          const created = await prisma.activity.create({
            data: {
              nom: act.nom,
              description: blueprintDef?.description ?? null,
              difficulte: blueprintDef?.difficulte ?? null,
              activityType,
              isDynamic,
              contentStructure:
                isDynamic && contentStructures[act.nom]
                  ? contentStructures[act.nom]
                  : undefined,
              templateId: tpl?.id ?? null,
              timeSlotId: timeSlot.id,
            },
          });

          for (const themeName of blueprintDef?.themes ?? []) {
            const themeId = themesByKey[`${blueprint.campus}:${themeName}`]?.id;
            if (themeId) {
              await prisma.activityTheme.create({
                data: { activityId: created.id, themeId },
              });
            }
          }

          activitiesCreated.push({
            id: created.id,
            nom: created.nom,
            type: activityType,
          });
        }
      }
    }

    // Participations
    for (let i = 0; i < blueprint.studentEmails.length; i++) {
      const email = blueprint.studentEmails[i];
      const talent = talentByEmail[email];
      if (!talent) continue;

      const isPresent = blueprint.presentEmails
        ? blueprint.presentEmails.includes(email)
        : false;

      const note = blueprint.notes_by_email?.[email];
      const noteAuthor = note ? staffByKey[note.authorKey] : undefined;

      const participation = await prisma.participation.create({
        data: {
          talentId: talent.id,
          eventId: event.id,
          campusId,
          isPresent,
          delay: blueprint.delays?.[email] ?? 0,
          bringPc: blueprint.bringPc ? blueprint.bringPc(email, i) : false,
          note: note?.text ?? null,
          noteAuthorId: noteAuthor?.id ?? null,
          camperRating: isPresent ? (blueprint.ratings?.[email] ?? null) : null,
          camperFeedback: isPresent
            ? (blueprint.feedback?.[email] ?? null)
            : null,
        },
      });

      // ParticipationActivity for every activity in the event
      for (const activity of activitiesCreated) {
        await prisma.participationActivity.create({
          data: {
            participationId: participation.id,
            activityId: activity.id,
            isPresent,
            delay: blueprint.delays?.[email] ?? 0,
          },
        });
      }

      // Stage compliance (only for stage_seconde events)
      if (blueprint.eventType === EVENT_TYPES.STAGE_SECONDE) {
        const fullySigned = blueprint.stageSigned?.includes(email) ?? false;
        const partiallySigned =
          blueprint.stageUnsigned?.includes(email) ?? false;
        if (fullySigned || partiallySigned) {
          await prisma.stageCompliance.create({
            data: {
              participationId: participation.id,
              charteSigned: fullySigned || Math.random() < 0.5,
              conventionSigned: fullySigned,
              imageRightsSigned: fullySigned || partiallySigned,
            },
          });
        }
      }
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
  for (let i = 0; i < presentEmails.length; i++) {
    const email = presentEmails[i];
    const talent = talentByEmail[email];
    if (!talent || !firstStep) continue;

    let status: 'active' | 'needs_help' | 'completed';
    let currentStepId = firstStep;
    let unlockedStepId = firstStep;

    // Distribution on 6 present students: 2 completed, 1 active, 3 needs_help
    if (i < 2) {
      status = 'completed';
      currentStepId = lastStep ?? firstStep;
      unlockedStepId = lastStep ?? firstStep;
    } else if (i < 3) {
      status = 'active';
      currentStepId = midStep ?? firstStep;
      unlockedStepId = midStep ?? firstStep;
    } else {
      status = 'needs_help';
      currentStepId = midStep ?? firstStep;
      unlockedStepId = midStep ?? firstStep;
      alertCount++;
    }

    await prisma.stepsProgress.create({
      data: {
        talentId: talent.id,
        eventId: liveEventId,
        activityId: targetActivity.id,
        currentStepId,
        unlockedStepId,
        status,
        lastUnlockSource: 'student',
      },
    });
  }

  // Past event completions for XP / progress history
  const pastEvents = EVENTS.filter((e) => e.daysOffset < 0);
  for (const evt of pastEvents) {
    const evtId = eventIds[EVENTS.indexOf(evt)];
    const evtActivities = await prisma.activity.findMany({
      where: {
        timeSlot: { planning: { eventId: evtId } },
        isDynamic: true,
      },
    });

    for (const activity of evtActivities) {
      const acs = contentStructures[activity.nom];
      const last = acs?.steps[acs.steps.length - 1]?.id;
      if (!last) continue;

      for (const email of evt.presentEmails ?? []) {
        const talent = talentByEmail[email];
        if (!talent) continue;
        await prisma.stepsProgress
          .create({
            data: {
              talentId: talent.id,
              eventId: evtId,
              activityId: activity.id,
              currentStepId: last,
              unlockedStepId: last,
              status: 'completed',
              lastUnlockSource: 'staff',
            },
          })
          .catch(() => {
            // Unique constraint violation is fine — skip
          });
      }
    }
  }

  return alertCount;
}

async function recomputeXp(): Promise<number> {
  const participations = await prisma.participation.findMany({
    where: { isPresent: true },
    include: { activities: { include: { activity: true } } },
  });

  const totals: Record<string, { xp: number; events: number }> = {};
  for (const p of participations) {
    if (!totals[p.talentId]) totals[p.talentId] = { xp: 0, events: 0 };
    totals[p.talentId].events++;
    for (const pa of p.activities) {
      if (!pa.isPresent || pa.activity.activityType === 'orga') continue;
      totals[p.talentId].xp += XP_MAP[pa.activity.difficulte ?? ''] ?? 10;
    }
  }

  await Promise.all(
    Object.entries(totals).map(([talentId, t]) =>
      prisma.talent.update({
        where: { id: talentId },
        data: {
          xp: t.xp,
          eventsCount: t.events,
          level: levelFromXp(t.xp),
        },
      }),
    ),
  );

  return Object.keys(totals).length;
}

async function seedInterviews(
  staffByKey: Record<string, { id: string; campusId: string }>,
  talentByEmail: Record<string, { id: string }>,
  campuses: Record<string, { id: string }>,
): Promise<number> {
  let count = 0;
  for (const iv of INTERVIEWS) {
    const talent = talentByEmail[iv.studentEmail];
    const staff = staffByKey[iv.staffKey];
    if (!talent || !staff) continue;
    // Interview campus follows the staff member's campus
    const campusId = staff.campusId;
    await prisma.interview.create({
      data: {
        talentId: talent.id,
        staffId: staff.id,
        campusId,
        date: dayAt(iv.daysOffset, 14, 0),
        status: iv.status,
        motivation: iv.notes?.motivation ?? null,
        globalNote: iv.notes?.globalNote ?? null,
        satisfaction: iv.notes?.satisfaction ?? null,
        influencers: iv.notes?.influencers ?? null,
      },
    });
    count++;
  }
  return count;
}

async function seedPortfolio(
  talentByEmail: Record<string, { id: string }>,
  eventIds: string[],
): Promise<number> {
  let count = 0;
  for (const p of PORTFOLIO) {
    const talent = talentByEmail[p.studentEmail];
    const eventId = eventIds[p.eventIndex];
    if (!talent || !eventId) continue;
    await prisma.portfolioItem.create({
      data: {
        talentId: talent.id,
        eventId,
        url: p.url ?? null,
        caption: p.caption,
      },
    });
    count++;
  }
  return count;
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

  const overdueInterviews = await prisma.interview.count({
    where: { status: 'planned', date: { lt: startOfToday } },
  });
  const todayInterviews = await prisma.interview.count({
    where: {
      status: 'planned',
      date: {
        gte: startOfToday,
        lt: dayAt(1, 0, 0),
      },
    },
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
  console.log(
    `   Dev task queue — today:        ${todayInterviews} interviews scheduled`,
  );
  console.log(
    `   Dev task queue — overdue:      ${overdueInterviews} overdue interviews`,
  );
  console.log(
    `   Task queue — missing mantas:   ${missingMantaCount} events ≤ 7 days`,
  );
  console.log(
    `   Task queue — missing planning: 1 event (Atelier Game Design, +4d)`,
  );
  console.log(
    '   Stage compliance:              2 stage_seconde events with mixed signed/unsigned',
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
