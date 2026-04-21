import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient, type ActivityType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Constants ───

const ADMIN_EMAIL = 'admin@jump.fr';
const ADMIN_PASSWORD = 'admin1234';
const STAFF_PASSWORD = 'staff1234';
const STUDENT_PASSWORD = 'student1234';

const XP_MAP: Record<string, number> = {
  Débutant: 20,
  Intermédiaire: 45,
  Avancé: 75,
};

// ─── Content Structures (activity step definitions) ───

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

function makeSteps(steps: StepDef[]) {
  return { steps };
}

const contentStructures: Record<string, ReturnType<typeof makeSteps>> = {
  'Ma première page HTML': makeSteps([
    {
      id: 'html-1',
      title: "Qu'est-ce que le HTML ?",
      content_markdown:
        'Le **HTML** (HyperText Markup Language) est le langage qui structure les pages web.\n\nChaque page est composée de **balises** comme `<h1>`, `<p>`, `<img>` qui décrivent le contenu.',
      type: 'theory',
    },
    {
      id: 'html-2',
      title: 'Ta première balise',
      content_markdown:
        "Crée un fichier `index.html` et écris :\n```html\n<h1>Bonjour le monde !</h1>\n<p>Je suis en train d'apprendre le HTML.</p>\n```\nOuvre-le dans ton navigateur. Que vois-tu ?",
      type: 'exercise',
    },
    {
      id: 'html-3',
      title: 'Quiz HTML',
      content_markdown: 'Vérifie tes connaissances sur les balises HTML.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Quelle balise sert à afficher un titre principal ?',
          options: ['<p>', '<h1>', '<img>', '<div>'],
          correct_index: 1,
        },
      },
    },
    {
      id: 'html-4',
      title: 'Images et liens',
      content_markdown:
        'Ajoute une image et un lien à ta page :\n```html\n<img src="photo.jpg" alt="Ma photo">\n<a href="https://example.com">Clique ici</a>\n```',
      type: 'exercise',
    },
    {
      id: 'html-5',
      title: 'Validation Manta',
      content_markdown:
        'Montre ta page HTML à ton Manta pour valider cette étape.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'CSS : Styliser sa page': makeSteps([
    {
      id: 'css-1',
      title: 'Introduction au CSS',
      content_markdown:
        "Le **CSS** (Cascading Style Sheets) permet de donner du style à tes pages HTML : couleurs, polices, disposition.\n\nOn l'écrit dans un fichier `.css` ou dans une balise `<style>`.",
      type: 'theory',
    },
    {
      id: 'css-2',
      title: 'Tes premières propriétés',
      content_markdown:
        'Ajoute ce CSS à ta page :\n```css\nh1 {\n  color: #e74c3c;\n  font-family: Arial, sans-serif;\n}\nbody {\n  background-color: #f0f0f0;\n}\n```',
      type: 'exercise',
    },
    {
      id: 'css-3',
      title: 'Quiz CSS',
      content_markdown: 'Teste tes connaissances en CSS.',
      type: 'checkpoint',
      validation: {
        type: 'auto_qcm',
        qcm_data: {
          question: 'Quelle propriété CSS change la couleur du texte ?',
          options: ['background-color', 'font-size', 'color', 'margin'],
          correct_index: 2,
        },
      },
    },
  ]),
  'JavaScript : Premiers pas': makeSteps([
    {
      id: 'js-1',
      title: "C'est quoi JavaScript ?",
      content_markdown:
        "**JavaScript** rend les pages web interactives. C'est le langage qui permet de réagir aux clics, modifier la page en temps réel, et communiquer avec des serveurs.",
      type: 'theory',
    },
    {
      id: 'js-2',
      title: 'Variables et conditions',
      content_markdown:
        "Ouvre la console de ton navigateur (F12) et essaie :\n```js\nlet age = 14;\nif (age >= 13) {\n  console.log('Tu peux participer !');\n}\n```",
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
          question: 'Comment déclare-t-on une variable en JavaScript moderne ?',
          options: ['var x = 1', 'let x = 1', 'int x = 1', 'x := 1'],
          correct_index: 1,
        },
      },
    },
    {
      id: 'js-4',
      title: 'Interagir avec la page',
      content_markdown:
        "Crée un bouton qui change le texte d'un paragraphe :\n```html\n<p id=\"msg\">Clique le bouton !</p>\n<button onclick=\"document.getElementById('msg').textContent='Bravo !'\">Clique</button>\n```",
      type: 'exercise',
    },
    {
      id: 'js-5',
      title: 'Validation finale',
      content_markdown: 'Montre ton mini-projet interactif à ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Construis ton robot': makeSteps([
    {
      id: 'robot-1',
      title: 'Les composants de base',
      content_markdown:
        "Un robot est composé de :\n- Un **microcontrôleur** (le cerveau)\n- Des **moteurs** (les muscles)\n- Des **capteurs** (les sens)\n- Une **batterie** (l'énergie)\n\nAujourd'hui, tu vas assembler ton premier robot !",
      type: 'theory',
    },
    {
      id: 'robot-2',
      title: 'Assemblage',
      content_markdown:
        'Suis les instructions pour assembler le châssis et connecter les moteurs au microcontrôleur.\n\n⚠️ Attention à la polarité des câbles !',
      type: 'exercise',
    },
    {
      id: 'robot-3',
      title: 'Premier programme',
      content_markdown:
        "Programme ton robot pour qu'il avance pendant 2 secondes, puis s'arrête.\n\n```python\nimport robot\nrobot.avancer(vitesse=50)\nrobot.attendre(2)\nrobot.stop()\n```",
      type: 'exercise',
    },
    {
      id: 'robot-4',
      title: 'Validation du robot',
      content_markdown: 'Fais rouler ton robot devant ton Manta pour valider.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Capteurs et actionneurs': makeSteps([
    {
      id: 'capteur-1',
      title: 'Types de capteurs',
      content_markdown:
        "Les capteurs permettent au robot de percevoir son environnement :\n- **Ultrason** : mesure la distance\n- **Infrarouge** : détecte les obstacles\n- **Lumière** : mesure la luminosité\n- **Gyroscope** : mesure l'orientation",
      type: 'theory',
    },
    {
      id: 'capteur-2',
      title: "Évitement d'obstacles",
      content_markdown:
        "Programme ton robot pour qu'il s'arrête quand un obstacle est à moins de 15 cm.\n\n```python\nwhile True:\n  distance = robot.capteur_ultrason()\n  if distance < 15:\n    robot.stop()\n  else:\n    robot.avancer(40)\n```",
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
  'Crée ton jeu Scratch': makeSteps([
    {
      id: 'scratch-1',
      title: "L'interface Scratch",
      content_markdown:
        "**Scratch** est un outil de programmation visuelle. Tu assembles des blocs pour créer des programmes.\n\nOuvre [scratch.mit.edu](https://scratch.mit.edu) et explore l'interface : scène, sprites, blocs.",
      type: 'theory',
    },
    {
      id: 'scratch-2',
      title: 'Ton premier sprite',
      content_markdown:
        'Fais bouger ton personnage avec les flèches du clavier :\n1. Ajoute le bloc **quand touche flèche droite pressée**\n2. Ajoute **avancer de 10 pas**\n3. Répète pour les 4 directions !',
      type: 'exercise',
    },
    {
      id: 'scratch-3',
      title: 'Ajoute un ennemi',
      content_markdown:
        "Crée un deuxième sprite qui se déplace aléatoirement. Si ton personnage le touche, c'est perdu !",
      type: 'exercise',
    },
    {
      id: 'scratch-4',
      title: 'Validation',
      content_markdown: 'Montre ton jeu à ton Manta.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Initiation à la cybersécurité': makeSteps([
    {
      id: 'cyber-1',
      title: "C'est quoi la cybersécurité ?",
      content_markdown:
        'La **cybersécurité** protège les systèmes informatiques contre les attaques.\n\nLes 3 piliers : **Confidentialité**, **Intégrité**, **Disponibilité** (CIA).',
      type: 'theory',
    },
    {
      id: 'cyber-2',
      title: 'Les mots de passe',
      content_markdown:
        'Un bon mot de passe doit :\n- Avoir au moins **12 caractères**\n- Mélanger majuscules, minuscules, chiffres, symboles\n- Ne pas être un mot du dictionnaire\n\nExercice : évalue la force de différents mots de passe sur [howsecureismypassword.net](https://howsecureismypassword.net).',
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
            'Une technique pour voler des identifiants via un faux site',
            'Un pare-feu',
            'Un mot de passe fort',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
  "L'IA et moi": makeSteps([
    {
      id: 'ia-1',
      title: "Qu'est-ce que l'IA ?",
      content_markdown:
        "L'**Intelligence Artificielle** permet aux machines d'apprendre et de prendre des décisions.\n\nExemples : reconnaissance d'images, assistants vocaux, recommandations YouTube.",
      type: 'theory',
    },
    {
      id: 'ia-2',
      title: 'IA au quotidien',
      content_markdown:
        "Liste 5 situations où tu utilises de l'IA sans le savoir dans ta journée.\n\nDiscute avec ton groupe et compare vos réponses !",
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
          question:
            'Quel est le processus par lequel une IA apprend à partir de données ?',
          options: [
            'Le codage',
            "L'apprentissage automatique (Machine Learning)",
            'La compilation',
            'Le débogage',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
  'Entraîne ton modèle': makeSteps([
    {
      id: 'ml-1',
      title: 'Teachable Machine',
      content_markdown:
        "**Teachable Machine** de Google te permet d'entraîner un modèle d'IA directement dans ton navigateur.\n\nOuvre [teachablemachine.withgoogle.com](https://teachablemachine.withgoogle.com) et choisis **Image Project**.",
      type: 'theory',
    },
    {
      id: 'ml-2',
      title: 'Collecte tes données',
      content_markdown:
        "Crée 3 classes d'images (ex: main ouverte, poing fermé, pouce levé).\nPour chaque classe, enregistre au moins **30 images** avec la webcam.\n\nAstuce : varie les angles et la distance !",
      type: 'exercise',
    },
    {
      id: 'ml-3',
      title: 'Entraîne et teste',
      content_markdown:
        'Clique sur **Train Model** et attends la fin.\n\nTeste ton modèle en temps réel avec la webcam. Est-il précis ? Quelles erreurs fait-il ?',
      type: 'exercise',
    },
    {
      id: 'ml-4',
      title: 'Validation Manta',
      content_markdown:
        'Montre ton modèle entraîné à ton Manta et explique les classes que tu as choisies.',
      type: 'checkpoint',
      validation: { type: 'manual_manta' },
    },
  ]),
  'Poster numérique': makeSteps([
    {
      id: 'poster-1',
      title: 'Les bases du design',
      content_markdown:
        'Les 4 principes fondamentaux du design :\n- **Contraste** : faire ressortir les éléments importants\n- **Alignement** : organiser les éléments de manière cohérente\n- **Répétition** : créer une unité visuelle\n- **Proximité** : grouper les éléments liés',
      type: 'theory',
    },
    {
      id: 'poster-2',
      title: 'Crée ton poster',
      content_markdown:
        "Utilise [Canva](https://www.canva.com) pour créer une affiche sur le thème de ton choix.\n\nInclus :\n- Un titre accrocheur\n- Au moins une image\n- Un appel à l'action",
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
  'Game Design avancé': makeSteps([
    {
      id: 'gd-1',
      title: 'La boucle de gameplay',
      content_markdown:
        "La **boucle de gameplay** (core loop) est le cycle d'actions que le joueur répète :\n\n1. **Action** → le joueur fait quelque chose\n2. **Récompense** → il obtient un résultat\n3. **Progression** → il débloque du contenu\n\nExemple (Mario) : sauter sur des ennemis → gagner des pièces → avancer dans les niveaux.",
      type: 'theory',
    },
    {
      id: 'gd-2',
      title: 'Conçois ton game design document',
      content_markdown:
        'Rédige un **GDD** (Game Design Document) pour ton jeu :\n- Concept en une phrase\n- Mécaniques principales\n- Boucle de gameplay\n- 3 niveaux de difficulté croissante',
      type: 'exercise',
    },
    {
      id: 'gd-3',
      title: 'Prototype papier',
      content_markdown:
        'Crée un **prototype papier** de ton premier niveau.\nDessine les obstacles, ennemis et récompenses.\nFais tester par un camarade !',
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
          question: "Qu'est-ce que la boucle de gameplay (core loop) ?",
          options: [
            'Le menu principal du jeu',
            "Le cycle d'actions répétées par le joueur",
            'La boucle de rendu graphique',
            'Le code source du jeu',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
  'Cryptographie : les secrets du code': makeSteps([
    {
      id: 'crypto-1',
      title: "L'histoire de la cryptographie",
      content_markdown:
        "La **cryptographie** permet de rendre un message illisible sauf pour son destinataire.\n\nDepuis l'Antiquité, les humains ont inventé des systèmes de chiffrement : le **chiffre de César**, la **machine Enigma**, et aujourd'hui le **chiffrement RSA**.",
      type: 'theory',
    },
    {
      id: 'crypto-2',
      title: 'Le chiffre de César',
      content_markdown:
        'Chiffre le message suivant avec un décalage de 3 :\n\n> JUMP EST GENIAL\n\nRésultat attendu : `MXPS HVW JHQLDO`\n\nDéchiffre maintenant : `EUDYR` (décalage 3)',
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
          question: 'Quel est le principe du chiffre de César ?',
          options: [
            'Remplacer chaque lettre par un symbole',
            "Décaler chaque lettre d'un nombre fixe dans l'alphabet",
            'Inverser le message',
            'Supprimer les voyelles',
          ],
          correct_index: 1,
        },
      },
    },
  ]),
};

// ─── Activity definitions (blueprint for templates + concrete activities) ───

type ActivityDef = {
  nom: string;
  description: string;
  difficulte: string;
  activityType: ActivityType;
  isDynamic: boolean;
  themes: string[];
  link?: string;
  content?: string;
};

const activityDefs: ActivityDef[] = [
  {
    nom: 'Ma première page HTML',
    description:
      'Découvre les bases du HTML et crée ta toute première page web avec des titres, images et liens.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Développement Web'],
  },
  {
    nom: 'CSS : Styliser sa page',
    description:
      'Apprends à utiliser CSS pour ajouter des couleurs, des polices et mettre en forme ta page web.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Développement Web', 'Design & Création'],
  },
  {
    nom: 'JavaScript : Premiers pas',
    description:
      'Introduction au JavaScript : variables, conditions et interactions avec la page.',
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Développement Web'],
  },
  {
    nom: 'Construis ton robot',
    description:
      'Assemble et programme un petit robot à partir de composants de base.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Robotique'],
  },
  {
    nom: 'Capteurs et actionneurs',
    description:
      'Apprends à utiliser des capteurs (lumière, distance) et moteurs pour rendre ton robot intelligent.',
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Robotique'],
  },
  {
    nom: 'Crée ton jeu Scratch',
    description:
      'Utilise Scratch pour concevoir un petit jeu interactif avec des personnages et des niveaux.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Jeux Vidéo'],
  },
  {
    nom: 'Game Design avancé',
    description:
      'Conçois les mécaniques, niveaux et la boucle de gameplay de ton propre jeu vidéo.',
    difficulte: 'Avancé',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Jeux Vidéo', 'Design & Création'],
  },
  {
    nom: 'Initiation à la cybersécurité',
    description:
      'Découvre les bases de la sécurité informatique : mots de passe, phishing et bonnes pratiques.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Cybersécurité'],
  },
  {
    nom: 'Cryptographie : les secrets du code',
    description:
      'Explore le chiffrement César, Vigenère et les bases de la cryptographie moderne.',
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Cybersécurité'],
  },
  {
    nom: "L'IA et moi",
    description:
      "Découvre comment fonctionne l'intelligence artificielle à travers des exemples concrets et interactifs.",
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Intelligence Artificielle'],
  },
  {
    nom: 'Entraîne ton modèle',
    description:
      "Utilise Teachable Machine pour créer et entraîner un modèle d'IA qui reconnaît des images.",
    difficulte: 'Intermédiaire',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Intelligence Artificielle'],
  },
  {
    nom: 'Poster numérique',
    description:
      'Crée une affiche numérique percutante en utilisant les principes du design graphique.',
    difficulte: 'Débutant',
    activityType: 'atelier',
    isDynamic: true,
    themes: ['Design & Création'],
  },
];

const activityDefsByName = new Map(activityDefs.map((d) => [d.nom, d]));

// ─── Event planning definitions ───

type SlotDef = {
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  label?: string;
  activities: {
    nom: string;
    activityType?: ActivityType;
    isDynamic?: boolean;
    content?: string;
    link?: string;
  }[];
};

type EventDef = {
  id: string;
  titre: string;
  daysOffset: number; // from now
  campusKey: string;
  themeKey: string;
  pin: string;
  notes: string | null;
  mantaKeys: string[];
  slots: SlotDef[];
  participations: {
    studentIndices: number[];
    presentCount: number;
    delays?: Record<number, number>; // studentIndex → delay minutes
    notes?: Record<number, { text: string; authorKey: string }>;
    ratings?: Record<number, number>;
    feedback?: Record<number, string>;
    bringPcFn?: (i: number) => boolean;
  };
};

const eventDefs: EventDef[] = [
  {
    id: 'seed-past-event-1',
    titre: 'Atelier Découverte Web',
    daysOffset: -21,
    campusKey: 'Paris',
    themeKey: 'Développement Web',
    pin: '1234',
    notes: 'Premier atelier de la saison. Très bon accueil des campers.',
    mantaKeys: ['manta@epitech.eu'],
    slots: [
      {
        startHour: 13,
        endHour: 13,
        endMinute: 30,
        label: 'Accueil',
        activities: [{ nom: 'Appel & accueil', activityType: 'orga' }],
      },
      {
        startHour: 14,
        endHour: 16,
        label: 'Après-midi',
        activities: [
          { nom: 'Ma première page HTML' },
          { nom: 'CSS : Styliser sa page' },
        ],
      },
    ],
    participations: {
      studentIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      presentCount: 8,
      delays: { 3: 15, 5: 5 },
      notes: {
        0: {
          text: 'Très motivée, a aidé ses camarades.',
          authorKey: 'manta@epitech.eu',
        },
      },
      ratings: { 0: 3, 1: 2, 2: 3, 3: 3, 4: 2, 5: 3, 6: 3, 7: 2 },
      feedback: { 0: "J'ai adoré créer ma page web !" },
      bringPcFn: (i) => i % 3 !== 0,
    },
  },
  {
    id: 'seed-past-event-2',
    titre: 'Atelier Robotique Découverte',
    daysOffset: -14,
    campusKey: 'Paris',
    themeKey: 'Robotique',
    pin: '4321',
    notes: null,
    mantaKeys: ['manta@epitech.eu', 'jdupont@epitech.eu'],
    slots: [
      {
        startHour: 13,
        endHour: 13,
        endMinute: 30,
        label: 'Accueil',
        activities: [{ nom: 'Appel & accueil', activityType: 'orga' }],
      },
      {
        startHour: 14,
        endHour: 17,
        label: 'Après-midi',
        activities: [{ nom: 'Construis ton robot' }],
      },
    ],
    participations: {
      studentIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      presentCount: 6,
      delays: { 1: 10 },
      ratings: { 0: 3, 1: 3, 2: 2, 3: 3, 4: 2, 5: 3 },
      feedback: { 1: 'Le robot était trop cool !' },
      bringPcFn: () => false,
    },
  },
  {
    id: 'seed-past-event-3',
    titre: 'Atelier Cyber & Sécurité',
    daysOffset: -7,
    campusKey: 'Paris',
    themeKey: 'Cybersécurité',
    pin: '9999',
    notes: 'Sujet phishing très apprécié.',
    mantaKeys: ['jdupont@epitech.eu'],
    slots: [
      {
        startHour: 13,
        endHour: 13,
        endMinute: 30,
        label: 'Accueil',
        activities: [{ nom: 'Appel & accueil', activityType: 'orga' }],
      },
      {
        startHour: 14,
        endHour: 16,
        label: 'Après-midi',
        activities: [
          { nom: 'Initiation à la cybersécurité' },
          { nom: 'Cryptographie : les secrets du code' },
        ],
      },
    ],
    participations: {
      studentIndices: [0, 1, 2, 3, 4, 5, 6],
      presentCount: 5,
      ratings: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3 },
      bringPcFn: () => true,
    },
  },
  {
    id: 'seed-today-event',
    titre: "Atelier IA : L'intelligence artificielle",
    daysOffset: 0,
    campusKey: 'Paris',
    themeKey: 'Intelligence Artificielle',
    pin: '7777',
    notes: null,
    mantaKeys: ['manta@epitech.eu', 'jdupont@epitech.eu'],
    slots: [
      {
        startHour: 13,
        endHour: 14,
        label: 'Conférence',
        activities: [
          {
            nom: "Bienvenue à l'atelier IA",
            activityType: 'conference',
            isDynamic: false,
            content:
              "## Bienvenue !\n\nAujourd'hui nous allons explorer **l'intelligence artificielle**.\n\n### Programme\n1. Conférence d'introduction (13h-14h)\n2. Ateliers pratiques (14h-16h)\n\n### Liens utiles\n- [Teachable Machine](https://teachablemachine.withgoogle.com/)\n- [Scratch](https://scratch.mit.edu/)",
            link: 'https://teachablemachine.withgoogle.com/',
          },
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
        endHour: 16,
        label: 'Ateliers',
        activities: [{ nom: "L'IA et moi" }, { nom: 'Entraîne ton modèle' }],
      },
    ],
    participations: {
      studentIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      presentCount: 0, // not checked in yet
      bringPcFn: (i) => i % 2 === 0,
    },
  },
  {
    id: 'seed-upcoming-event',
    titre: 'Atelier Jeux Vidéo',
    daysOffset: 7,
    campusKey: 'Paris',
    themeKey: 'Jeux Vidéo',
    pin: '5678',
    notes: null,
    mantaKeys: ['manta@epitech.eu'],
    slots: [
      {
        startHour: 13,
        endHour: 13,
        endMinute: 30,
        label: 'Accueil',
        activities: [{ nom: 'Appel & accueil', activityType: 'orga' }],
      },
      {
        startHour: 14,
        endHour: 17,
        label: 'Après-midi',
        activities: [{ nom: 'Crée ton jeu Scratch' }],
      },
    ],
    participations: {
      studentIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      presentCount: 0,
      bringPcFn: () => true,
    },
  },
  {
    id: 'seed-lyon-event',
    titre: 'Atelier Web Lyon',
    daysOffset: -10,
    campusKey: 'Lyon',
    themeKey: 'Développement Web',
    pin: '3333',
    notes: null,
    mantaKeys: ['lgarcia@epitech.eu'],
    slots: [
      {
        startHour: 13,
        endHour: 13,
        endMinute: 30,
        label: 'Accueil',
        activities: [{ nom: 'Appel & accueil', activityType: 'orga' }],
      },
      {
        startHour: 14,
        endHour: 16,
        label: 'Après-midi',
        activities: [{ nom: 'Ma première page HTML' }],
      },
    ],
    participations: {
      studentIndices: [10, 11, 12], // Lyon student indices
      presentCount: 3,
      ratings: { 10: 3, 11: 3, 12: 3 },
      bringPcFn: () => true,
    },
  },
];

// ─── Main ───

async function main() {
  const now = new Date();

  // ── 1. Campuses ──
  const [paris, lyon, marseille] = await Promise.all(
    ['Paris', 'Lyon', 'Marseille'].map((name) =>
      prisma.campus.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );
  const campusByName: Record<string, { id: string }> = {
    Paris: paris,
    Lyon: lyon,
    Marseille: marseille,
  };
  console.log('✓ Campuses');

  // ── 2. Users & profiles (admin, staff, students) ──
  const adminUser = await prisma.bauth_user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'admin' },
    create: {
      email: ADMIN_EMAIL,
      name: 'Admin Jump',
      role: 'admin',
      emailVerified: true,
    },
  });
  await upsertCredential(adminUser.id, ADMIN_PASSWORD);

  const staffData = [
    { email: 'manta@epitech.eu', name: 'Marie Manta', campusKey: 'Paris' },
    { email: 'jdupont@epitech.eu', name: 'Jules Dupont', campusKey: 'Paris' },
    { email: 'lgarcia@epitech.eu', name: 'Laura Garcia', campusKey: 'Lyon' },
  ];

  const staffProfiles: Record<string, { id: string; campusId: string }> = {};
  for (const s of staffData) {
    const user = await prisma.bauth_user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        name: s.name,
        role: 'staff',
        emailVerified: true,
      },
    });
    const profile = await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, campusId: campusByName[s.campusKey].id },
    });
    staffProfiles[s.email] = { id: profile.id, campusId: profile.campusId! };
    await upsertCredential(user.id, STAFF_PASSWORD);
  }

  const studentsData = [
    // Paris (indices 0-9)
    {
      email: 'alice.martin@mail.com',
      prenom: 'Alice',
      nom: 'Martin',
      niveau: '4eme',
      niveauDifficulte: 'Débutant',
    },
    {
      email: 'lucas.dupont@mail.com',
      prenom: 'Lucas',
      nom: 'Dupont',
      niveau: '3eme',
      niveauDifficulte: 'Intermédiaire',
    },
    {
      email: 'emma.bernard@mail.com',
      prenom: 'Emma',
      nom: 'Bernard',
      niveau: '5eme',
      niveauDifficulte: 'Débutant',
    },
    {
      email: 'hugo.petit@mail.com',
      prenom: 'Hugo',
      nom: 'Petit',
      niveau: '6eme',
      niveauDifficulte: 'Débutant',
    },
    {
      email: 'lea.moreau@mail.com',
      prenom: 'Léa',
      nom: 'Moreau',
      niveau: '2nde',
      niveauDifficulte: 'Avancé',
    },
    {
      email: 'nathan.garcia@mail.com',
      prenom: 'Nathan',
      nom: 'Garcia',
      niveau: '4eme',
      niveauDifficulte: 'Intermédiaire',
    },
    {
      email: 'chloe.roux@mail.com',
      prenom: 'Chloé',
      nom: 'Roux',
      niveau: '3eme',
      niveauDifficulte: 'Intermédiaire',
    },
    {
      email: 'theo.fournier@mail.com',
      prenom: 'Théo',
      nom: 'Fournier',
      niveau: '5eme',
      niveauDifficulte: 'Débutant',
    },
    {
      email: 'jade.morel@mail.com',
      prenom: 'Jade',
      nom: 'Morel',
      niveau: '6eme',
      niveauDifficulte: 'Débutant',
    },
    {
      email: 'louis.simon@mail.com',
      prenom: 'Louis',
      nom: 'Simon',
      niveau: '1ere',
      niveauDifficulte: 'Avancé',
    },
    // Lyon (indices 10-12)
    {
      email: 'ines.durand@mail.com',
      prenom: 'Inès',
      nom: 'Durand',
      niveau: '4eme',
      niveauDifficulte: 'Débutant',
    },
    {
      email: 'adam.leroy@mail.com',
      prenom: 'Adam',
      nom: 'Leroy',
      niveau: '3eme',
      niveauDifficulte: 'Intermédiaire',
    },
    {
      email: 'manon.david@mail.com',
      prenom: 'Manon',
      nom: 'David',
      niveau: '5eme',
      niveauDifficulte: 'Débutant',
    },
  ];

  const talents: {
    id: string;
    nom: string;
    prenom: string;
  }[] = [];
  for (const s of studentsData) {
    const user = await prisma.bauth_user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        name: `${s.prenom} ${s.nom}`,
        role: 'student',
        emailVerified: true,
      },
    });
    const profile = await prisma.talent.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        nom: s.nom,
        prenom: s.prenom,
        niveau: s.niveau,
        niveauDifficulte: s.niveauDifficulte,
        charterAcceptedAt: new Date(),
      },
    });
    talents.push({
      id: profile.id,
      nom: s.nom,
      prenom: s.prenom,
    });
    await upsertCredential(user.id, STUDENT_PASSWORD);
  }

  // ── Parent accounts (for testing parent portal) ──
  const parentEmail = 'sophie.martin@mail.com';
  const parentUser = await prisma.bauth_user.upsert({
    where: { email: parentEmail },
    update: {},
    create: {
      email: parentEmail,
      name: 'Sophie Martin',
      role: 'parent',
      emailVerified: true,
    },
  });

  // Link Alice to this parent (unsigned image rights)
  await prisma.talent.update({
    where: { id: talents[0].id },
    data: {
      parentEmail,
      parentNom: 'Martin',
      parentPrenom: 'Sophie',
    },
  });

  console.log(`✓ Parent account: ${parentEmail} (child: ${talents[0].prenom})`);

  console.log(
    `✓ Users (1 admin, ${staffData.length} staff, ${studentsData.length} students, 1 parent)`,
  );

  // ── 3. Themes ──
  const themeNames = [
    'Développement Web',
    'Robotique',
    'Jeux Vidéo',
    'Cybersécurité',
    'Intelligence Artificielle',
    'Design & Création',
  ];

  const themes: Record<string, { id: string }> = {};
  for (const nom of themeNames) {
    themes[`Paris:${nom}`] = await prisma.theme.upsert({
      where: { nom_campusId: { nom, campusId: paris.id } },
      update: {},
      create: { nom, campusId: paris.id },
    });
  }
  for (const nom of [
    'Développement Web',
    'Robotique',
    'Intelligence Artificielle',
  ]) {
    themes[`Lyon:${nom}`] = await prisma.theme.upsert({
      where: { nom_campusId: { nom, campusId: lyon.id } },
      update: {},
      create: { nom, campusId: lyon.id },
    });
  }

  // Official (global) themes for activity templates (campusId = null)
  const officialThemes: Record<string, { id: string }> = {};
  for (const nom of themeNames) {
    const existing = await prisma.theme.findFirst({
      where: { nom, campusId: null },
    });
    officialThemes[nom] = existing
      ? existing
      : await prisma.theme.create({ data: { nom, campusId: null } });
  }

  console.log('✓ Themes');

  function resolveThemeId(campusKey: string, themeName: string): string {
    return (themes[`${campusKey}:${themeName}`] ?? themes[`Paris:${themeName}`])
      .id;
  }

  // ── 4. Activity Templates (global reusable blueprints) ──
  const templatesByName: Record<string, { id: string }> = {};
  for (const def of activityDefs) {
    const template = await prisma.activityTemplate.upsert({
      where: {
        id: `seed-tpl-${def.nom.substring(0, 30).replace(/\s/g, '-').toLowerCase()}`,
      },
      update: {},
      create: {
        id: `seed-tpl-${def.nom.substring(0, 30).replace(/\s/g, '-').toLowerCase()}`,
        nom: def.nom,
        description: def.description,
        difficulte: def.difficulte,
        activityType: def.activityType,
        isDynamic: def.isDynamic,
        contentStructure: contentStructures[def.nom] ?? undefined,
        defaultDuration: 120,
        campusId: null,
      },
    });

    // Link official themes
    for (const themeName of def.themes) {
      const themeId = officialThemes[themeName]?.id;
      if (!themeId) continue;
      await prisma.activityTemplateTheme.upsert({
        where: {
          activityTemplateId_themeId: {
            activityTemplateId: template.id,
            themeId,
          },
        },
        update: {},
        create: { activityTemplateId: template.id, themeId },
      });
    }

    templatesByName[def.nom] = template;
  }
  console.log(`✓ Activity templates (${activityDefs.length})`);

  // ── 5. Planning Template (multi-day "Stage de seconde" example) ──
  const stageTemplate = await prisma.planningTemplate.upsert({
    where: { nom: 'Stage de seconde — 5 jours' },
    update: {},
    create: {
      nom: 'Stage de seconde — 5 jours',
      description:
        'Modèle de planning sur 5 jours pour le stage de seconde. Chaque journée contient un créneau accueil/appel (orga) + un créneau atelier.',
      nbDays: 5,
    },
  });

  // Create 5 days with morning orga + afternoon atelier slots
  const stageActivitiesByDay: [string, string][] = [
    ['Ma première page HTML', 'CSS : Styliser sa page'],
    ['Construis ton robot', 'Capteurs et actionneurs'],
    ["L'IA et moi", 'Entraîne ton modèle'],
    ['Initiation à la cybersécurité', 'Cryptographie : les secrets du code'],
    ['Crée ton jeu Scratch', 'Game Design avancé'],
  ];

  // Clear existing template days on re-run (cascades to slots + items)
  await prisma.planningTemplateDay.deleteMany({
    where: { planningTemplateId: stageTemplate.id },
  });

  for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
    const day = await prisma.planningTemplateDay.upsert({
      where: {
        planningTemplateId_dayIndex: {
          planningTemplateId: stageTemplate.id,
          dayIndex: dayIdx,
        },
      },
      update: {},
      create: {
        planningTemplateId: stageTemplate.id,
        dayIndex: dayIdx,
        label: `Jour ${dayIdx + 1}`,
      },
    });

    // Orga slot
    const orgaSlot = await prisma.planningTemplateSlot.create({
      data: {
        planningTemplateDayId: day.id,
        startTime: '13:30',
        endTime: '14:00',
        label: 'Accueil & appel',
        sortOrder: 0,
      },
    });
    await prisma.planningTemplateSlotItem.create({
      data: {
        planningTemplateSlotId: orgaSlot.id,
        nom: 'Appel',
        activityType: 'orga',
      },
    });

    // Atelier slot with 2 parallel tracks
    const atelierSlot = await prisma.planningTemplateSlot.create({
      data: {
        planningTemplateDayId: day.id,
        startTime: '14:00',
        endTime: '16:30',
        label: 'Ateliers',
        sortOrder: 1,
      },
    });
    for (const actName of stageActivitiesByDay[dayIdx]) {
      const tpl = templatesByName[actName];
      await prisma.planningTemplateSlotItem.create({
        data: {
          planningTemplateSlotId: atelierSlot.id,
          activityTemplateId: tpl?.id ?? null,
          nom: tpl ? null : actName,
          activityType: 'atelier',
        },
      });
    }
  }
  console.log('✓ Planning template (Stage de seconde — 5 jours)');

  // ── 6. Events + Planning + TimeSlots + Activities ──
  // Track created activity IDs per event for linking participations later
  const eventActivities: Record<
    string,
    {
      id: string;
      nom: string;
      activityType: ActivityType;
      difficulte: string | null;
    }[]
  > = {};

  for (const evtDef of eventDefs) {
    const campusId = campusByName[evtDef.campusKey].id;
    const eventDate = new Date(now);
    eventDate.setDate(eventDate.getDate() + evtDef.daysOffset);
    if (evtDef.daysOffset === 0) eventDate.setHours(14, 0, 0, 0);

    const event = await prisma.event.upsert({
      where: { id: evtDef.id },
      update: {},
      create: {
        id: evtDef.id,
        titre: evtDef.titre,
        date: eventDate,
        campusId,
        themeId: resolveThemeId(evtDef.campusKey, evtDef.themeKey),
        pin: evtDef.pin,
        notes: evtDef.notes,
        mantas: {
          create: evtDef.mantaKeys.map((key) => ({
            staffProfileId: staffProfiles[key].id,
          })),
        },
      },
    });

    // Planning (clear existing slots on re-run — cascades to activities)
    const existingPlanning = await prisma.planning.findUnique({
      where: { eventId: event.id },
    });
    if (existingPlanning) {
      await prisma.timeSlot.deleteMany({
        where: { planningId: existingPlanning.id },
      });
    }
    const planning = await prisma.planning.upsert({
      where: { eventId: event.id },
      update: {},
      create: { eventId: event.id },
    });

    const activities: (typeof eventActivities)[string] = [];

    for (const slotDef of evtDef.slots) {
      const startTime = new Date(eventDate);
      startTime.setHours(slotDef.startHour, slotDef.startMinute ?? 0, 0, 0);
      const endTime = new Date(eventDate);
      endTime.setHours(slotDef.endHour, slotDef.endMinute ?? 0, 0, 0);

      const timeSlot = await prisma.timeSlot.create({
        data: {
          planningId: planning.id,
          startTime,
          endTime,
          label: slotDef.label,
        },
      });

      for (const actDef of slotDef.activities) {
        const blueprintDef = activityDefsByName.get(actDef.nom);
        const activityType: ActivityType =
          actDef.activityType ?? blueprintDef?.activityType ?? 'atelier';
        const isDynamic = actDef.isDynamic ?? blueprintDef?.isDynamic ?? false;
        const difficulte = blueprintDef?.difficulte ?? null;

        const activity = await prisma.activity.create({
          data: {
            nom: actDef.nom,
            description: blueprintDef?.description ?? null,
            difficulte,
            activityType,
            isDynamic,
            content: actDef.content ?? null,
            link: actDef.link ?? blueprintDef?.link ?? null,
            contentStructure: isDynamic
              ? (contentStructures[actDef.nom] ?? undefined)
              : undefined,
            templateId: templatesByName[actDef.nom]?.id ?? null,
            timeSlotId: timeSlot.id,
          },
        });

        // Link themes
        const themeNames = blueprintDef?.themes ?? [];
        for (const themeName of themeNames) {
          const themeId = resolveThemeId(evtDef.campusKey, themeName);
          await prisma.activityTheme
            .create({
              data: { activityId: activity.id, themeId },
            })
            .catch(() => {}); // skip if theme doesn't exist for this campus
        }

        activities.push({
          id: activity.id,
          nom: activity.nom,
          activityType,
          difficulte,
        });
      }
    }

    eventActivities[event.id] = activities;

    // Participations
    const pDef = evtDef.participations;
    for (let idx = 0; idx < pDef.studentIndices.length; idx++) {
      const globalIdx = pDef.studentIndices[idx];
      const sp = talents[globalIdx];
      const isPresent = idx < pDef.presentCount;
      const delay = pDef.delays?.[globalIdx] ?? 0;

      await prisma.participation.upsert({
        where: {
          talentId_eventId: {
            talentId: sp.id,
            eventId: event.id,
          },
        },
        update: {},
        create: {
          talentId: sp.id,
          eventId: event.id,
          campusId,
          isPresent,
          delay,
          bringPc: pDef.bringPcFn?.(globalIdx) ?? false,
          note: pDef.notes?.[globalIdx]?.text,
          noteAuthorId: pDef.notes?.[globalIdx]
            ? staffProfiles[pDef.notes[globalIdx].authorKey].id
            : undefined,
          camperRating: isPresent ? pDef.ratings?.[globalIdx] : undefined,
          camperFeedback: isPresent ? pDef.feedback?.[globalIdx] : undefined,
        },
      });
    }
  }

  console.log(`✓ Events (${eventDefs.length}) with planning + activities`);

  // ── 7. ParticipationActivity records (link participations to activities) ──
  let paCount = 0;
  for (const evtDef of eventDefs) {
    const eventId = evtDef.id;
    const activities = eventActivities[eventId];

    const participations = await prisma.participation.findMany({
      where: { eventId },
    });

    const paData = participations.flatMap((p) =>
      activities.map((a) => ({
        participationId: p.id,
        activityId: a.id,
        isPresent: p.isPresent,
        delay: p.delay ?? 0,
      })),
    );

    if (paData.length > 0) {
      await prisma.participationActivity.createMany({
        data: paData,
        skipDuplicates: true,
      });
      paCount += paData.length;
    }
  }
  console.log(`✓ ParticipationActivity (${paCount} records)`);

  // ── 8. XP & levels ──
  const allParticipations = await prisma.participation.findMany({
    where: { isPresent: true },
    include: { activities: { include: { activity: true } } },
  });

  const xpByStudent: Record<string, { events: number; xp: number }> = {};
  for (const p of allParticipations) {
    if (!xpByStudent[p.talentId]) {
      xpByStudent[p.talentId] = { events: 0, xp: 0 };
    }
    xpByStudent[p.talentId].events++;

    for (const pa of p.activities) {
      if (!pa.isPresent || pa.activity.activityType === 'orga') continue;
      xpByStudent[p.talentId].xp += XP_MAP[pa.activity.difficulte ?? ''] ?? 10;
    }
  }

  await Promise.all(
    Object.entries(xpByStudent).map(([profileId, data]) => {
      const level =
        data.xp >= 200 ? 'Expert' : data.xp >= 80 ? 'Apprentice' : 'Novice';
      return prisma.talent.update({
        where: { id: profileId },
        data: { xp: data.xp, eventsCount: data.events, level },
      });
    }),
  );
  console.log('✓ XP & levels');

  // ── 9. StepsProgress (completed dynamic activities for past events) ──
  const pastEventIds = eventDefs
    .filter((e) => e.daysOffset < 0)
    .map((e) => e.id);

  let progressCount = 0;
  for (const eventId of pastEventIds) {
    const participations = await prisma.participation.findMany({
      where: { eventId, isPresent: true },
    });

    const dynamicActivities = (eventActivities[eventId] ?? []).filter(
      (a) => a.activityType !== 'orga',
    );

    for (const activity of dynamicActivities) {
      const cs = contentStructures[activity.nom];
      if (!cs?.steps?.length) continue;
      const lastStepId = cs.steps[cs.steps.length - 1].id;

      const progressData = participations.map((p) => ({
        talentId: p.talentId,
        activityId: activity.id,
        eventId,
        currentStepId: lastStepId,
        unlockedStepId: lastStepId,
        status: 'completed' as const,
        lastUnlockSource: 'staff' as const,
      }));

      await prisma.stepsProgress.createMany({
        data: progressData,
        skipDuplicates: true,
      });
      progressCount += progressData.length;
    }
  }
  console.log(`✓ StepsProgress (${progressCount} records)`);

  // ── 10. Portfolio items ──
  const portfolioData = [
    {
      studentIndex: 0,
      eventId: 'seed-past-event-1',
      url: 'https://codepen.io/example/pen/demo-html',
      caption: 'Ma toute première page web !',
    },
    {
      studentIndex: 1,
      eventId: 'seed-past-event-2',
      url: null,
      caption: 'Mon robot qui évite les obstacles',
    },
    {
      studentIndex: 4,
      eventId: 'seed-past-event-3',
      url: 'https://example.com/crypto-challenge',
      caption: "J'ai résolu le défi de cryptographie César",
    },
    {
      studentIndex: 0,
      eventId: 'seed-past-event-2',
      url: null,
      caption: 'Robot assemblé avec Emma',
    },
    {
      studentIndex: 2,
      eventId: 'seed-past-event-1',
      url: 'https://codepen.io/example/pen/demo-css',
      caption: 'Ma page CSS colorée',
    },
  ];

  for (const p of portfolioData) {
    const sp = talents[p.studentIndex];
    const exists = await prisma.portfolioItem.findFirst({
      where: {
        talentId: sp.id,
        eventId: p.eventId,
        caption: p.caption,
      },
    });
    if (!exists) {
      await prisma.portfolioItem.create({
        data: {
          talentId: sp.id,
          eventId: p.eventId,
          url: p.url,
          caption: p.caption,
        },
      });
    }
  }
  console.log(`✓ Portfolio (${portfolioData.length} items)`);

  // ── Summary ──
  const origin = process.env.ORIGIN || 'http://localhost:3030';
  const [parisStudentCount, lyonStudentCount] = await Promise.all([
    prisma.participation
      .groupBy({ by: ['talentId'], where: { campusId: paris.id } })
      .then((r) => r.length),
    prisma.participation
      .groupBy({ by: ['talentId'], where: { campusId: lyon.id } })
      .then((r) => r.length),
  ]);

  console.log('\n══════════════════════════════════');
  console.log('        SEED COMPLETE');
  console.log('══════════════════════════════════');
  console.log(`\nAdmin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(
    `Staff:    ${staffData.map((s) => s.email).join(', ')} / ${STAFF_PASSWORD}`,
  );
  console.log(`Students: any student email / ${STUDENT_PASSWORD}`);
  console.log(`Parent:   ${parentEmail} (OTP via email)`);
  console.log(
    `\nCampuses: Paris (${parisStudentCount} talents), Lyon (${lyonStudentCount} talents), Marseille (empty)`,
  );
  console.log(`Templates: ${activityDefs.length} activity + 1 planning`);
  console.log(
    `Themes:   ${themeNames.length} (Paris) + 3 (Lyon) + ${themeNames.length} (official)`,
  );
  console.log(
    `Events:   ${eventDefs.length} (${eventDefs.filter((e) => e.campusKey === 'Paris').length} Paris + ${eventDefs.filter((e) => e.campusKey === 'Lyon').length} Lyon)`,
  );
  console.log(`\n${origin}/staff/admin — Admin panel`);
  console.log(`${origin}/staff/dev   — Staff app`);
  console.log(`${origin}/            — Talent app`);
  console.log(`${origin}/parent/login — Parent portal`);
  console.log(`${origin}/p/${talents[0].id} — Public profile (Alice)`);
  console.log('══════════════════════════════════\n');
}

// ─── Helpers ───

async function upsertCredential(userId: string, password: string) {
  const hashed = await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2,
  });
  const existing = await prisma.bauth_account.findFirst({
    where: { userId, providerId: 'credential' },
  });
  if (!existing) {
    await prisma.bauth_account.create({
      data: {
        userId,
        accountId: userId,
        providerId: 'credential',
        password: hashed,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
