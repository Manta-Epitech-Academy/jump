import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = 'admin@tekcamp.fr';
const ADMIN_PASSWORD = 'admin1234';
const STAFF_PASSWORD = 'staff1234';
const STUDENT_PASSWORD = 'student1234';

// ─── Content Structure helpers ───

function makeSteps(
  steps: {
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
  }[],
) {
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
        'Chiffre le message suivant avec un décalage de 3 :\n\n> TEKCAMP EST GENIAL\n\nRésultat attendu : `WHNFDPS HVW JHQLDO`\n\nDéchiffre maintenant : `EUDYR` (décalage 3)',
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

async function main() {
  // ─── Campuses ───
  const paris = await prisma.campus.upsert({
    where: { name: 'Paris' },
    update: {},
    create: { name: 'Paris' },
  });

  const lyon = await prisma.campus.upsert({
    where: { name: 'Lyon' },
    update: {},
    create: { name: 'Lyon' },
  });

  const marseille = await prisma.campus.upsert({
    where: { name: 'Marseille' },
    update: {},
    create: { name: 'Marseille' },
  });

  console.log('✓ Campuses seeded');

  // ─── Admin user ───
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'admin' },
    create: {
      email: ADMIN_EMAIL,
      name: 'Admin TekCamp',
      role: 'admin',
      emailVerified: true,
    },
  });

  await upsertCredential(adminUser.id, ADMIN_PASSWORD);
  console.log(`✓ Admin seeded: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  // ─── Staff users ───
  const staffData = [
    { email: 'manta@epitech.eu', name: 'Marie Manta', campus: paris },
    { email: 'jdupont@epitech.eu', name: 'Jules Dupont', campus: paris },
    { email: 'lgarcia@epitech.eu', name: 'Laura Garcia', campus: lyon },
  ];

  const staffProfiles: Record<string, { id: string; campusId: string }> = {};

  for (const s of staffData) {
    const user = await prisma.user.upsert({
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
      create: { userId: user.id, campusId: s.campus.id },
    });

    staffProfiles[s.email] = { id: profile.id, campusId: s.campus.id };
    await upsertCredential(user.id, STAFF_PASSWORD);
  }

  console.log(
    `✓ Staff seeded: ${staffData.map((s) => s.email).join(', ')} / ${STAFF_PASSWORD}`,
  );

  // ─── Themes ───
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
    themes[nom] = await prisma.theme.upsert({
      where: { nom_campusId: { nom, campusId: paris.id } },
      update: {},
      create: { nom, campusId: paris.id },
    });
  }

  // Lyon themes (subset)
  const lyonThemes: Record<string, { id: string }> = {};
  for (const nom of [
    'Développement Web',
    'Robotique',
    'Intelligence Artificielle',
  ]) {
    lyonThemes[nom] = await prisma.theme.upsert({
      where: { nom_campusId: { nom, campusId: lyon.id } },
      update: {},
      create: { nom, campusId: lyon.id },
    });
  }

  console.log('✓ Themes seeded');

  // ─── Subjects ───
  const subjectsData = [
    {
      nom: 'Ma première page HTML',
      description:
        'Découvre les bases du HTML et crée ta toute première page web avec des titres, images et liens.',
      difficulte: 'Débutant',
      themes: ['Développement Web'],
    },
    {
      nom: 'CSS : Styliser sa page',
      description:
        'Apprends à utiliser CSS pour ajouter des couleurs, des polices et mettre en forme ta page web.',
      difficulte: 'Débutant',
      themes: ['Développement Web', 'Design & Création'],
    },
    {
      nom: 'JavaScript : Premiers pas',
      description:
        'Introduction au JavaScript : variables, conditions et interactions avec la page.',
      difficulte: 'Intermédiaire',
      themes: ['Développement Web'],
    },
    {
      nom: 'Construis ton robot',
      description:
        'Assemble et programme un petit robot à partir de composants de base.',
      difficulte: 'Débutant',
      themes: ['Robotique'],
    },
    {
      nom: 'Capteurs et actionneurs',
      description:
        'Apprends à utiliser des capteurs (lumière, distance) et moteurs pour rendre ton robot intelligent.',
      difficulte: 'Intermédiaire',
      themes: ['Robotique'],
    },
    {
      nom: 'Crée ton jeu Scratch',
      description:
        'Utilise Scratch pour concevoir un petit jeu interactif avec des personnages et des niveaux.',
      difficulte: 'Débutant',
      themes: ['Jeux Vidéo'],
    },
    {
      nom: 'Game Design avancé',
      description:
        'Conçois les mécaniques, niveaux et la boucle de gameplay de ton propre jeu vidéo.',
      difficulte: 'Avancé',
      themes: ['Jeux Vidéo', 'Design & Création'],
    },
    {
      nom: 'Initiation à la cybersécurité',
      description:
        'Découvre les bases de la sécurité informatique : mots de passe, phishing et bonnes pratiques.',
      difficulte: 'Débutant',
      themes: ['Cybersécurité'],
    },
    {
      nom: 'Cryptographie : les secrets du code',
      description:
        'Explore le chiffrement César, Vigenère et les bases de la cryptographie moderne.',
      difficulte: 'Intermédiaire',
      themes: ['Cybersécurité'],
    },
    {
      nom: "L'IA et moi",
      description:
        "Découvre comment fonctionne l'intelligence artificielle à travers des exemples concrets et interactifs.",
      difficulte: 'Débutant',
      themes: ['Intelligence Artificielle'],
    },
    {
      nom: 'Entraîne ton modèle',
      description:
        "Utilise Teachable Machine pour créer et entraîner un modèle d'IA qui reconnaît des images.",
      difficulte: 'Intermédiaire',
      themes: ['Intelligence Artificielle'],
    },
    {
      nom: 'Poster numérique',
      description:
        'Crée une affiche numérique percutante en utilisant les principes du design graphique.',
      difficulte: 'Débutant',
      themes: ['Design & Création'],
    },
  ];

  const subjectRecords: Record<string, { id: string }> = {};
  for (const s of subjectsData) {
    const existing = await prisma.subject.findFirst({
      where: { nom: s.nom, campusId: paris.id },
    });

    const subject = existing
      ? await prisma.subject.update({
          where: { id: existing.id },
          data: {
            description: s.description,
            difficulte: s.difficulte,
            contentStructure: contentStructures[s.nom] ?? undefined,
          },
        })
      : await prisma.subject.create({
          data: {
            nom: s.nom,
            description: s.description,
            difficulte: s.difficulte,
            campusId: paris.id,
            contentStructure: contentStructures[s.nom] ?? undefined,
          },
        });

    subjectRecords[s.nom] = subject;

    for (const themeName of s.themes) {
      const theme = themes[themeName];
      if (!theme) continue;
      await prisma.subjectTheme.upsert({
        where: {
          subjectId_themeId: { subjectId: subject.id, themeId: theme.id },
        },
        update: {},
        create: { subjectId: subject.id, themeId: theme.id },
      });
    }
  }

  console.log(
    `✓ Subjects seeded (${Object.keys(subjectRecords).length} with content structures)`,
  );

  // ─── Students ───
  const studentsData = [
    // Paris students
    {
      email: 'alice.martin@mail.com',
      prenom: 'Alice',
      nom: 'Martin',
      niveau: '4eme',
      niveauDifficulte: 'Débutant',
      campus: paris,
    },
    {
      email: 'lucas.dupont@mail.com',
      prenom: 'Lucas',
      nom: 'Dupont',
      niveau: '3eme',
      niveauDifficulte: 'Intermédiaire',
      campus: paris,
    },
    {
      email: 'emma.bernard@mail.com',
      prenom: 'Emma',
      nom: 'Bernard',
      niveau: '5eme',
      niveauDifficulte: 'Débutant',
      campus: paris,
    },
    {
      email: 'hugo.petit@mail.com',
      prenom: 'Hugo',
      nom: 'Petit',
      niveau: '6eme',
      niveauDifficulte: 'Débutant',
      campus: paris,
    },
    {
      email: 'lea.moreau@mail.com',
      prenom: 'Léa',
      nom: 'Moreau',
      niveau: '2nde',
      niveauDifficulte: 'Avancé',
      campus: paris,
    },
    {
      email: 'nathan.garcia@mail.com',
      prenom: 'Nathan',
      nom: 'Garcia',
      niveau: '4eme',
      niveauDifficulte: 'Intermédiaire',
      campus: paris,
    },
    {
      email: 'chloe.roux@mail.com',
      prenom: 'Chloé',
      nom: 'Roux',
      niveau: '3eme',
      niveauDifficulte: 'Intermédiaire',
      campus: paris,
    },
    {
      email: 'theo.fournier@mail.com',
      prenom: 'Théo',
      nom: 'Fournier',
      niveau: '5eme',
      niveauDifficulte: 'Débutant',
      campus: paris,
    },
    {
      email: 'jade.morel@mail.com',
      prenom: 'Jade',
      nom: 'Morel',
      niveau: '6eme',
      niveauDifficulte: 'Débutant',
      campus: paris,
    },
    {
      email: 'louis.simon@mail.com',
      prenom: 'Louis',
      nom: 'Simon',
      niveau: '1ere',
      niveauDifficulte: 'Avancé',
      campus: paris,
    },
    // Lyon students
    {
      email: 'ines.durand@mail.com',
      prenom: 'Inès',
      nom: 'Durand',
      niveau: '4eme',
      niveauDifficulte: 'Débutant',
      campus: lyon,
    },
    {
      email: 'adam.leroy@mail.com',
      prenom: 'Adam',
      nom: 'Leroy',
      niveau: '3eme',
      niveauDifficulte: 'Intermédiaire',
      campus: lyon,
    },
    {
      email: 'manon.david@mail.com',
      prenom: 'Manon',
      nom: 'David',
      niveau: '5eme',
      niveauDifficulte: 'Débutant',
      campus: lyon,
    },
  ];

  const studentProfiles: {
    id: string;
    nom: string;
    prenom: string;
    campusId: string;
  }[] = [];

  for (const s of studentsData) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        name: `${s.prenom} ${s.nom}`,
        role: 'student',
        emailVerified: true,
      },
    });

    const profile = await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        nom: s.nom,
        prenom: s.prenom,
        campusId: s.campus.id,
        niveau: s.niveau,
        niveauDifficulte: s.niveauDifficulte,
        charterAcceptedAt: new Date(),
      },
    });

    studentProfiles.push({
      id: profile.id,
      nom: s.nom,
      prenom: s.prenom,
      campusId: s.campus.id,
    });
    await upsertCredential(user.id, STUDENT_PASSWORD);
  }

  console.log(`✓ Students seeded (${studentProfiles.length})`);

  // ─── Events ───
  const parisStaff1 = staffProfiles['manta@epitech.eu'];
  const parisStaff2 = staffProfiles['jdupont@epitech.eu'];
  const lyonStaff = staffProfiles['lgarcia@epitech.eu'];
  const parisStudents = studentProfiles.filter((s) => s.campusId === paris.id);
  const lyonStudents = studentProfiles.filter((s) => s.campusId === lyon.id);

  const now = new Date();

  // --- Past event 1: 3 weeks ago (Web) ---
  const pastDate1 = new Date(now);
  pastDate1.setDate(pastDate1.getDate() - 21);

  const pastEvent1 = await upsertEvent({
    id: 'seed-past-event-1',
    titre: 'Atelier Découverte Web',
    date: pastDate1,
    campusId: paris.id,
    themeId: themes['Développement Web'].id,
    pin: '1234',
    notes: 'Premier atelier de la saison. Très bon accueil des campers.',
    mantaIds: [parisStaff1.id],
  });

  // Past event 1 participations: all Paris students, most present
  for (let i = 0; i < parisStudents.length; i++) {
    const sp = parisStudents[i];
    const isPresent = i < 8; // 8 out of 10 present
    const subjectName =
      i % 2 === 0 ? 'Ma première page HTML' : 'CSS : Styliser sa page';

    await upsertParticipation({
      studentProfileId: sp.id,
      eventId: pastEvent1.id,
      campusId: paris.id,
      isPresent,
      delay: i === 3 ? 15 : i === 5 ? 5 : 0,
      bringPc: i % 3 !== 0,
      subjectId: subjectRecords[subjectName].id,
      note:
        isPresent && i === 0
          ? 'Très motivée, a aidé ses camarades.'
          : undefined,
      noteAuthorId: isPresent && i === 0 ? parisStaff1.id : undefined,
      camperRating: isPresent ? [3, 2, 3, 3, 2, 3, 3, 2][i] : undefined,
      camperFeedback:
        isPresent && i === 0 ? "J'ai adoré créer ma page web !" : undefined,
    });
  }

  // --- Past event 2: 2 weeks ago (Robotique) ---
  const pastDate2 = new Date(now);
  pastDate2.setDate(pastDate2.getDate() - 14);

  const pastEvent2 = await upsertEvent({
    id: 'seed-past-event-2',
    titre: 'Atelier Robotique Découverte',
    date: pastDate2,
    campusId: paris.id,
    themeId: themes['Robotique'].id,
    pin: '4321',
    notes: null,
    mantaIds: [parisStaff1.id, parisStaff2.id],
  });

  for (let i = 0; i < parisStudents.length; i++) {
    const sp = parisStudents[i];
    const isPresent = i < 6;

    await upsertParticipation({
      studentProfileId: sp.id,
      eventId: pastEvent2.id,
      campusId: paris.id,
      isPresent,
      delay: i === 1 ? 10 : 0,
      bringPc: false,
      subjectId: subjectRecords['Construis ton robot'].id,
      camperRating: isPresent ? [3, 3, 2, 3, 2, 3][i] : undefined,
      camperFeedback:
        isPresent && i === 1 ? 'Le robot était trop cool !' : undefined,
    });
  }

  // --- Past event 3: 1 week ago (Cybersécurité) ---
  const pastDate3 = new Date(now);
  pastDate3.setDate(pastDate3.getDate() - 7);

  const pastEvent3 = await upsertEvent({
    id: 'seed-past-event-3',
    titre: 'Atelier Cyber & Sécurité',
    date: pastDate3,
    campusId: paris.id,
    themeId: themes['Cybersécurité'].id,
    pin: '9999',
    notes: 'Sujet phishing très apprécié.',
    mantaIds: [parisStaff2.id],
  });

  for (let i = 0; i < 7; i++) {
    const sp = parisStudents[i];
    const isPresent = i < 5;

    await upsertParticipation({
      studentProfileId: sp.id,
      eventId: pastEvent3.id,
      campusId: paris.id,
      isPresent,
      delay: 0,
      bringPc: true,
      subjectId:
        i % 2 === 0
          ? subjectRecords['Initiation à la cybersécurité'].id
          : subjectRecords['Cryptographie : les secrets du code'].id,
      camperRating: isPresent ? 3 : undefined,
    });
  }

  // --- Today's event (so the camper dashboard shows something) ---
  const todayDate = new Date(now);
  todayDate.setHours(14, 0, 0, 0);

  const todayEvent = await upsertEvent({
    id: 'seed-today-event',
    titre: "Atelier IA : L'intelligence artificielle",
    date: todayDate,
    campusId: paris.id,
    themeId: themes['Intelligence Artificielle'].id,
    pin: '7777',
    notes: null,
    mantaIds: [parisStaff1.id, parisStaff2.id],
  });

  // Register 8 students for today's event
  for (let i = 0; i < 8; i++) {
    const sp = parisStudents[i];
    const subjectName = i % 2 === 0 ? "L'IA et moi" : 'Entraîne ton modèle';

    await upsertParticipation({
      studentProfileId: sp.id,
      eventId: todayEvent.id,
      campusId: paris.id,
      isPresent: false, // not checked in yet
      delay: 0,
      bringPc: i % 2 === 0,
      subjectId: subjectRecords[subjectName].id,
    });
  }

  // --- Upcoming event: next week ---
  const upcomingDate = new Date(now);
  upcomingDate.setDate(upcomingDate.getDate() + 7);
  upcomingDate.setHours(14, 0, 0, 0);

  const upcomingEvent = await upsertEvent({
    id: 'seed-upcoming-event',
    titre: 'Atelier Jeux Vidéo',
    date: upcomingDate,
    campusId: paris.id,
    themeId: themes['Jeux Vidéo'].id,
    pin: '5678',
    notes: null,
    mantaIds: [parisStaff1.id],
  });

  for (const sp of parisStudents) {
    await upsertParticipation({
      studentProfileId: sp.id,
      eventId: upcomingEvent.id,
      campusId: paris.id,
      isPresent: false,
      delay: 0,
      bringPc: true,
      subjectId: subjectRecords['Crée ton jeu Scratch'].id,
    });
  }

  // --- Lyon past event ---
  const lyonPastDate = new Date(now);
  lyonPastDate.setDate(lyonPastDate.getDate() - 10);

  const lyonEvent = await upsertEvent({
    id: 'seed-lyon-event',
    titre: 'Atelier Web Lyon',
    date: lyonPastDate,
    campusId: lyon.id,
    themeId: lyonThemes['Développement Web'].id,
    pin: '3333',
    notes: null,
    mantaIds: [lyonStaff.id],
  });

  for (let i = 0; i < lyonStudents.length; i++) {
    const sp = lyonStudents[i];
    await upsertParticipation({
      studentProfileId: sp.id,
      eventId: lyonEvent.id,
      campusId: lyon.id,
      isPresent: true,
      delay: 0,
      bringPc: true,
      subjectId: subjectRecords['Ma première page HTML'].id,
      camperRating: 3,
    });
  }

  console.log('✓ Events seeded (4 Paris + 1 Lyon)');

  // ─── XP & eventsCount for present students ───
  const allParticipations = await prisma.participation.findMany({
    where: { isPresent: true },
    include: { subjects: true },
  });

  // Group by student
  const xpByStudent: Record<string, { events: number; xp: number }> = {};
  const XP_MAP: Record<string, number> = {
    Débutant: 20,
    Intermédiaire: 45,
    Avancé: 75,
  };

  for (const p of allParticipations) {
    if (!xpByStudent[p.studentProfileId]) {
      xpByStudent[p.studentProfileId] = { events: 0, xp: 0 };
    }
    xpByStudent[p.studentProfileId].events++;

    for (const ps of p.subjects) {
      const subject = await prisma.subject.findUnique({
        where: { id: ps.subjectId },
      });
      if (subject) {
        xpByStudent[p.studentProfileId].xp += XP_MAP[subject.difficulte] ?? 10;
      }
    }
  }

  for (const [profileId, data] of Object.entries(xpByStudent)) {
    const level =
      data.xp >= 200 ? 'Expert' : data.xp >= 80 ? 'Apprentice' : 'Novice';
    await prisma.studentProfile.update({
      where: { id: profileId },
      data: { xp: data.xp, eventsCount: data.events, level },
    });
  }

  console.log('✓ XP & levels computed');

  // ─── StepsProgress (completed subjects for past events) ───
  const pastEvents = [pastEvent1, pastEvent2, pastEvent3, lyonEvent];

  for (const event of pastEvents) {
    const participations = await prisma.participation.findMany({
      where: { eventId: event.id, isPresent: true },
      include: { subjects: { include: { subject: true } } },
    });

    for (const p of participations) {
      for (const ps of p.subjects) {
        const cs = ps.subject.contentStructure as {
          steps: { id: string }[];
        } | null;
        if (!cs?.steps?.length) continue;

        const lastStepId = cs.steps[cs.steps.length - 1].id;

        await prisma.stepsProgress.upsert({
          where: {
            studentProfileId_subjectId_eventId: {
              studentProfileId: p.studentProfileId,
              subjectId: ps.subjectId,
              eventId: event.id,
            },
          },
          update: {},
          create: {
            studentProfileId: p.studentProfileId,
            subjectId: ps.subjectId,
            eventId: event.id,
            currentStepId: lastStepId,
            unlockedStepId: lastStepId,
            status: 'completed',
            lastUnlockSource: 'staff',
          },
        });
      }
    }
  }

  console.log('✓ StepsProgress seeded');

  // ─── Portfolio items for some students ───
  const portfolioData = [
    {
      studentIndex: 0, // Alice
      eventId: pastEvent1.id,
      url: 'https://codepen.io/example/pen/demo-html',
      caption: 'Ma toute première page web !',
    },
    {
      studentIndex: 1, // Lucas
      eventId: pastEvent2.id,
      url: null,
      caption: 'Mon robot qui évite les obstacles',
    },
    {
      studentIndex: 4, // Léa
      eventId: pastEvent3.id,
      url: 'https://example.com/crypto-challenge',
      caption: "J'ai résolu le défi de cryptographie César",
    },
    {
      studentIndex: 0, // Alice
      eventId: pastEvent2.id,
      url: null,
      caption: 'Robot assemblé avec Emma',
    },
    {
      studentIndex: 2, // Emma
      eventId: pastEvent1.id,
      url: 'https://codepen.io/example/pen/demo-css',
      caption: 'Ma page CSS colorée',
    },
  ];

  for (const p of portfolioData) {
    const sp = parisStudents[p.studentIndex];
    const existing = await prisma.portfolioItem.findFirst({
      where: {
        studentProfileId: sp.id,
        eventId: p.eventId,
        caption: p.caption,
      },
    });
    if (!existing) {
      await prisma.portfolioItem.create({
        data: {
          studentProfileId: sp.id,
          eventId: p.eventId,
          url: p.url,
          caption: p.caption,
        },
      });
    }
  }

  console.log('✓ Portfolio items seeded');

  // ─── Summary ───
  const origin = process.env.ORIGIN || 'http://localhost:3030';

  console.log('\n══════════════════════════════════');
  console.log('        SEED COMPLETE');
  console.log('══════════════════════════════════');
  console.log(`\nAdmin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(
    `Staff:    ${staffData.map((s) => s.email).join(', ')} / ${STAFF_PASSWORD}`,
  );
  console.log(`Students: any student email / ${STUDENT_PASSWORD}`);
  console.log(
    `\nCampuses: Paris (${parisStudents.length} students), Lyon (${lyonStudents.length} students), Marseille (empty)`,
  );
  console.log(
    `Subjects: ${Object.keys(subjectRecords).length} (all with step content)`,
  );
  console.log(`Themes:   ${themeNames.length} (Paris) + 3 (Lyon)`);
  console.log(
    `Events:   4 Paris (1 past-3w, 1 past-2w, 1 past-1w, 1 today, 1 upcoming) + 1 Lyon`,
  );
  console.log(`\n${origin}/tekcamp/admin    — Admin panel`);
  console.log(`${origin}/tekcamp/         — Staff app`);
  console.log(`${origin}/tekcamp/camper   — Camper app`);
  console.log(
    `${origin}/tekcamp/p/${parisStudents[0].id} — Public profile (Alice)`,
  );
  console.log('══════════════════════════════════\n');
}

// ─── Helpers ───

async function upsertCredential(userId: string, password: string) {
  const hashed = await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2,
  });
  const existing = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
  });
  if (!existing) {
    await prisma.account.create({
      data: {
        userId,
        accountId: userId,
        providerId: 'credential',
        password: hashed,
      },
    });
  }
}

async function upsertEvent(data: {
  id: string;
  titre: string;
  date: Date;
  campusId: string;
  themeId: string;
  pin: string;
  notes: string | null;
  mantaIds: string[];
}) {
  const event = await prisma.event.upsert({
    where: { id: data.id },
    update: {},
    create: {
      id: data.id,
      titre: data.titre,
      date: data.date,
      campusId: data.campusId,
      themeId: data.themeId,
      pin: data.pin,
      notes: data.notes,
      mantas: {
        create: data.mantaIds.map((id) => ({ staffProfileId: id })),
      },
    },
  });
  return event;
}

async function upsertParticipation(data: {
  studentProfileId: string;
  eventId: string;
  campusId: string;
  isPresent: boolean;
  delay: number;
  bringPc: boolean;
  subjectId: string;
  note?: string;
  noteAuthorId?: string;
  camperRating?: number;
  camperFeedback?: string;
}) {
  await prisma.participation.upsert({
    where: {
      studentProfileId_eventId: {
        studentProfileId: data.studentProfileId,
        eventId: data.eventId,
      },
    },
    update: {},
    create: {
      studentProfileId: data.studentProfileId,
      eventId: data.eventId,
      campusId: data.campusId,
      isPresent: data.isPresent,
      delay: data.delay,
      bringPc: data.bringPc,
      note: data.note,
      noteAuthorId: data.noteAuthorId,
      camperRating: data.camperRating,
      camperFeedback: data.camperFeedback,
      subjects: {
        create: [{ subjectId: data.subjectId }],
      },
    },
  });
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
