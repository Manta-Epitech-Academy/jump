import PocketBase from 'pocketbase';

// 1. Configuration
const PB_URL = 'https://milkyway.strasbourg.epitech.eu/tekcamp/pb';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL; // Email du superuser
const PB_ADMIN_PASS = process.env.PB_ADMIN_PASS;

const pb = new PocketBase(PB_URL);

// Données extraites du Notion "Coding Club"
const rawData = [
  {
    nom: "Trick or treats",
    description: "Halloween Camp 2024-25. Création de jeux rétro avec Lua et TIC-80.",
    link: "https://epitech-academy.notion.site/Trick-or-treats",
    domaines: ["Game dev", "Lua", "TIC80"],
    niveaux: ["6eme", "5eme", "4eme", "3eme", "2nde"]
  },
  {
    nom: "Aventure Game",
    description: "Nouveau sujet 2025-26. Création d'un jeu d'aventure sur TIC-80.",
    link: "https://epitech-academy.notion.site/Aventure-Game",
    domaines: ["Game dev", "Lua", "TIC80"],
    niveaux: ["6eme", "5eme", "4eme", "3eme", "2nde"]
  },
  {
    nom: "pyPong - Discover Python",
    description: "Nouveau sujet 2024-25. Recréer Pong pour apprendre Python sur TIC-80.",
    link: "https://epitech-academy.notion.site/pyPong",
    domaines: ["Python", "Game dev", "TIC80"],
    niveaux: ["4eme", "3eme", "2nde", "1ere"]
  },
  {
    nom: "Cadeaux Clicker",
    description: "Xmas Camp 2024-25. Création d'un 'Clicker Game' en Web (HTML/JS).",
    link: "https://epitech-academy.notion.site/Cadeaux-Clicker",
    domaines: ["Web dev", "HTML", "Javascript"],
    niveaux: ["4eme", "3eme", "2nde", "1ere", "Terminale"]
  },
  {
    nom: "Xmas Camp",
    description: "Xmas Camp 2025-26. Création d'une table de mixage mobile avec p5.js.",
    link: "https://github.com/Manta-Epitech-Academy/p5js_dj",
    domaines: ["p5js", "Javascript", "Mobile"],
    niveaux: ["4eme", "3eme", "2nde", "1ere", "Terminale"]
  },
  {
    nom: "SnakeJS",
    description: "Nouveau sujet 2024-25. Le classique jeu du serpent en JS.",
    link: "https://epitech-academy.notion.site/SnakeJS",
    domaines: ["Javascript", "Game dev", "p5js"],
    niveaux: ["3eme", "2nde", "1ere", "Terminale"]
  },
  {
    nom: "Introduction à p5.js",
    description: "Tutoriel 2024-25. Découverte de la bibliothèque graphique JS.",
    link: "https://epitech-academy.notion.site/Intro-p5js",
    domaines: ["Javascript", "p5js"],
    niveaux: ["6eme", "5eme", "4eme", "3eme", "2nde"]
  },
  {
    nom: "Conway’s Game of Life",
    description: "Summer Camp 2024-25. Implémentation du jeu de la vie.",
    link: "https://epitech-academy.notion.site/Game-of-Life",
    domaines: ["Javascript", "p5js", "Game dev"],
    niveaux: ["2nde", "1ere", "Terminale", "Sup"]
  },
  {
    nom: "Arduinausore Hacker",
    description: "Nouveau sujet 2024-25. Hacker le jeu Chrome Dino via la console.",
    link: "https://epitech-academy.notion.site/Arduinausore",
    domaines: ["Web dev", "IOT", "Cybersécurité"],
    niveaux: ["4eme", "3eme", "2nde", "1ere", "Terminale"]
  },
  {
    nom: "P@ssword! - CyberSec programming",
    description: "Nouveau sujet 2024-25. Programmation orientée sécurité (Brute force) en Python.",
    link: "https://epitech-academy.notion.site/Password",
    domaines: ["Python", "Cybersécurité"],
    niveaux: ["3eme", "2nde", "1ere", "Terminale", "Sup"]
  },
  {
    nom: "CTFD",
    description: "Nouveau sujet 2025-26. Capture The Flag (Challenges de sécurité).",
    link: "https://tinyurl.com/eactf",
    domaines: ["Cybersécurité", "CTF"],
    niveaux: ["2nde", "1ere", "Terminale", "Sup"]
  },
  {
    nom: "Winter Camp - Datascience",
    description: "Winter Camp 2025-26. Analyse de données avec Python et Pandas.",
    link: "https://github.com/Manta-Epitech-Academy/dataviz_pytho",
    domaines: ["Python", "datascience", "pandas"],
    niveaux: ["1ere", "Terminale", "Sup"]
  },
  {
    nom: "Discover Linux",
    description: "Halloween Camp 2025-26. Initiation à la ligne de commande et Linux.",
    link: "https://tinyurl.com/dislin0",
    domaines: ["Linux", "Shell"],
    niveaux: ["3eme", "2nde", "1ere", "Terminale", "Sup"]
  }
];

async function main() {
  try {
    // 1. Authentification Admin
    console.log("Authentification Admin...");
    await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASS);
    console.log(`✅ Connecté en tant qu'admin.`);

    // 2. Traitement des Thèmes
    console.log("\n--- Traitement des Thèmes ---");
    const themeMap = new Map<string, string>(); // Map Nom -> ID

    const allThemes = new Set<string>();
    rawData.forEach(item => item.domaines.forEach(d => allThemes.add(d)));

    for (const themeName of allThemes) {
      try {
        const existingList = await pb.collection('themes').getList(1, 1, {
          filter: `nom = "${themeName}"`
        });

        if (existingList.items.length > 0) {
          const themeId = existingList.items[0].id;
          themeMap.set(themeName, themeId);
          console.log(`✅ Thème existant trouvé: ${themeName} (${themeId})`);
        } else {
          // Création du thème sans campus (facultatif)
          const newTheme = await pb.collection('themes').create({
            nom: themeName
          });
          themeMap.set(themeName, newTheme.id);
          console.log(`✨ Thème créé: ${themeName} (${newTheme.id})`);
        }
      } catch (err) {
        console.error(`❌ Erreur sur le thème "${themeName}":`, err);
      }
    }

    // 3. Traitement des Sujets (Subjects)
    console.log("\n--- Traitement des Sujets ---");

    for (const item of rawData) {
      try {
        const subjectThemeIds = item.domaines
          .map(name => themeMap.get(name))
          .filter(id => id !== undefined) as string[];

        const existingSubjects = await pb.collection('subjects').getList(1, 1, {
          filter: `nom = "${item.nom}"`
        });

        if (existingSubjects.items.length > 0) {
          console.log(`⏩ Sujet déjà existant (ignoré): ${item.nom}`);
          continue;
        }

        // Création du sujet sans campus (facultatif)
        await pb.collection('subjects').create({
          nom: item.nom,
          description: item.description,
          niveaux: item.niveaux,
          themes: subjectThemeIds,
          link: item.link
        });

        console.log(`✨ Sujet créé: ${item.nom}`);

      } catch (err) {
        console.error(`❌ Erreur lors de la création du sujet "${item.nom}":`, err);
      }
    }

    console.log("\n--- Terminé ! ---");

  } catch (err) {
    console.error("Erreur générale:", err);
  }
}

main();
