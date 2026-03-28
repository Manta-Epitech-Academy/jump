// TekCamp/frontend/scripts/seed_subjects.ts
import PocketBase from 'pocketbase';
import { SubjectsDifficulteOptions } from '../src/lib/pocketbase-types';

// 1. Configuration
const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL; // Email du superuser
const PB_ADMIN_PASS = process.env.PB_ADMIN_PASS;

const pb = new PocketBase(PB_URL);

// Données extraites du Notion "Coding Club" avec les niveaux de difficulté
const rawData = [
  // --- DÉBUTANT ---
  {
    nom: 'Devine un nombre avec Python',
    description:
      'Nouveau sujet 2025-26. Initiation à la programmation Python (variables, if, while).',
    link: 'https://epitech-academy.notion.site/devine-le-nombre',
    domaines: ['Immersion', 'Python'],
    difficulte: SubjectsDifficulteOptions.Débutant,
  },
  {
    nom: 'Introduction à p5.js',
    description:
      'Tutoriel 2024-25. Découverte de la bibliothèque graphique JS.',
    link: 'https://epitech-academy.notion.site/tutoriel-p5-js',
    domaines: ['Javascript', 'p5js'],
    difficulte: SubjectsDifficulteOptions.Débutant,
  },
  {
    nom: 'Paperclip Factory',
    description:
      "Nouveau sujet 2025-26. Création d'un jeu 'idle' en HTML/CSS/JS.",
    link: 'https://epitech-academy.notion.site/paperclip-factory',
    domaines: ['HTML', 'Immersion', 'Javascript'],
    difficulte: SubjectsDifficulteOptions.Débutant,
  },
  {
    nom: 'Cadeaux Clicker',
    description:
      "Xmas Camp 2024-25. Création d'un 'Clicker Game' en Web (HTML/JS).",
    link: 'https://epitech-academy.notion.site/xmas-camp-2024-cadeaux-clicker',
    domaines: ['Web dev', 'HTML', 'Javascript'],
    difficulte: SubjectsDifficulteOptions.Débutant,
  },
  {
    nom: 'pyPong - Discover Python',
    description:
      'Nouveau sujet 2024-25. Recréer Pong pour apprendre Python sur TIC-80.',
    link: 'https://epitech-academy.notion.site/pypong',
    domaines: ['Python', 'Game dev', 'TIC80'],
    difficulte: SubjectsDifficulteOptions.Débutant,
  },
  {
    nom: 'Discover Linux',
    description:
      'Halloween Camp 2025-26. Initiation à la ligne de commande et Linux.',
    link: 'https://tinyurl.com/dislin0',
    domaines: ['Linux', 'Shell'],
    difficulte: SubjectsDifficulteOptions.Débutant,
  },

  // --- INTERMÉDIAIRE ---
  {
    nom: 'P@ssword! - CyberSec programming',
    description:
      'Nouveau sujet 2024-25. Programmation orientée sécurité (Brute force) en Python.',
    link: 'https://epitech-academy.notion.site/sujet-password',
    domaines: ['Python', 'Cybersécurité'],
    difficulte: SubjectsDifficulteOptions.Intermédiaire,
  },
  {
    nom: 'SnakeJS',
    description: 'Nouveau sujet 2024-25. Le classique jeu du serpent en JS.',
    link: 'https://epitech-academy.notion.site/snake-js',
    domaines: ['Javascript', 'Game dev', 'p5js'],
    difficulte: SubjectsDifficulteOptions.Intermédiaire,
  },
  {
    nom: "Don't Panic",
    description:
      'Nouveau sujet 2025-26. Résolution de puzzle algorithmique avec Python.',
    link: 'https://epitech-academy.notion.site/don-t-panic?pvs=73',
    domaines: ['Algorithme', 'Immersion', 'Python'],
    difficulte: SubjectsDifficulteOptions.Intermédiaire,
  },
  {
    nom: "Conway's Game of Life",
    description: 'Summer Camp 2024-25. Implémentation du jeu de la vie.',
    link: 'https://epitech-academy.notion.site/jeu-de-la-vie-de-conway',
    domaines: ['Javascript', 'p5js', 'Game dev'],
    difficulte: SubjectsDifficulteOptions.Intermédiaire,
  },
  {
    nom: 'Xmas Camp',
    description:
      "Xmas Camp 2025-26. Création d'une table de mixage mobile avec p5.js.",
    link: 'https://github.com/Manta-Epitech-Academy/p5js_dj',
    domaines: ['p5js', 'Javascript', 'Mobile'],
    difficulte: SubjectsDifficulteOptions.Intermédiaire,
  },
  {
    nom: 'CTFD',
    description:
      'Nouveau sujet 2025-26. Capture The Flag (Challenges de sécurité).',
    link: 'https://tinyurl.com/eactf',
    domaines: ['Cybersécurité', 'CTF'],
    difficulte: SubjectsDifficulteOptions.Intermédiaire,
  },

  // --- AVANCÉ ---
  {
    nom: 'Aventure Game',
    description:
      "Nouveau sujet 2025-26. Création d'un jeu d'aventure sur TIC-80.",
    link: 'https://epitech-academy.notion.site/aventure-game',
    domaines: ['Game dev', 'Lua', 'TIC80'],
    difficulte: SubjectsDifficulteOptions.Avancé,
  },
  {
    nom: 'Trick or treats',
    description:
      'Halloween Camp 2024-25. Création de jeux rétro avec Lua et TIC-80.',
    link: 'https://epitech-academy.notion.site/trick-or-treats',
    domaines: ['Game dev', 'Lua', 'TIC80'],
    difficulte: SubjectsDifficulteOptions.Avancé,
  },
  {
    nom: 'Arduinausore Hacker',
    description:
      'Nouveau sujet 2024-25. Hacker le jeu Chrome Dino via la console (Web et Hardware).',
    link: 'https://epitech-academy.notion.site/hacker-le-jeu-chrome-dino',
    domaines: ['Web dev', 'IOT', 'Cybersécurité'],
    difficulte: SubjectsDifficulteOptions.Avancé,
  },
  {
    nom: 'Winter Camp - Datascience',
    description:
      'Winter Camp 2025-26. Analyse de données avec Python et Pandas.',
    link: 'https://github.com/Manta-Epitech-Academy/dataviz_python',
    domaines: ['Python', 'datascience', 'pandas'],
    difficulte: SubjectsDifficulteOptions.Avancé,
  },
];

async function main() {
  try {
    if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASS) {
      throw new Error(
        "Les variables d'environnement PB_ADMIN_EMAIL ou PB_ADMIN_PASS sont manquantes.",
      );
    }

    // 1. Authentification Admin
    console.log('Authentification Admin...');
    await pb
      .collection('_superusers')
      .authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASS);
    console.log(`✅ Connecté en tant qu'admin.`);

    // 2. Traitement des Thèmes
    console.log('\n--- Traitement des Thèmes ---');
    const themeMap = new Map<string, string>(); // Map Nom -> ID

    const allThemes = new Set<string>();
    rawData.forEach((item) => item.domaines.forEach((d) => allThemes.add(d)));

    for (const themeName of allThemes) {
      try {
        const existingList = await pb.collection('themes').getList(1, 1, {
          filter: `nom = "${themeName}"`,
        });

        if (existingList.items.length > 0) {
          const themeId = existingList.items[0].id;
          themeMap.set(themeName, themeId);
          console.log(`✅ Thème existant trouvé: ${themeName} (${themeId})`);
        } else {
          // Création du thème sans campus (facultatif)
          const newTheme = await pb.collection('themes').create({
            nom: themeName,
          });
          themeMap.set(themeName, newTheme.id);
          console.log(`✨ Thème créé: ${themeName} (${newTheme.id})`);
        }
      } catch (err) {
        console.error(`❌ Erreur sur le thème "${themeName}":`, err);
      }
    }

    // 3. Traitement des Sujets (Subjects)
    console.log('\n--- Traitement des Sujets ---');

    for (const item of rawData) {
      try {
        const subjectThemeIds = item.domaines
          .map((name) => themeMap.get(name))
          .filter((id) => id !== undefined) as string[];

        const existingSubjects = await pb.collection('subjects').getList(1, 1, {
          filter: `nom = "${item.nom}"`,
        });

        // Mise à jour si le sujet existe déjà
        if (existingSubjects.items.length > 0) {
          const subjectId = existingSubjects.items[0].id;
          await pb.collection('subjects').update(subjectId, {
            description: item.description,
            difficulte: item.difficulte,
            themes: subjectThemeIds,
            link: item.link,
          });
          console.log(`🔄 Sujet mis à jour: ${item.nom} [${item.difficulte}]`);
        } else {
          // Création si le sujet n'existe pas
          await pb.collection('subjects').create({
            nom: item.nom,
            description: item.description,
            difficulte: item.difficulte,
            themes: subjectThemeIds,
            link: item.link,
          });
          console.log(`✨ Sujet créé: ${item.nom} [${item.difficulte}]`);
        }
      } catch (err) {
        console.error(
          `❌ Erreur lors de la création/mise à jour du sujet "${item.nom}":`,
          err,
        );
      }
    }

    console.log('\n--- Terminé ! ---');
  } catch (err) {
    console.error('Erreur générale:', err);
  }
}

main();
