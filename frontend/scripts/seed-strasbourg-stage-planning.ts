/**
 * TEST-ONLY: seed a realistic two-week planning for Strasbourg's "stage de
 * seconde" event so the dev read-only planning viewer has something to show.
 *
 * Models the schedule shape from the reference calendar: a morning conférence,
 * an "activité campus", an afternoon activité/atelier and the méridienne break,
 * with the Friday "remote" days running several parallel ateliers.
 *
 * Content rules:
 *   - ONLY static activities (`isDynamic = false`, no `subjectVersion`).
 *     Dynamic activities aren't ready yet (June 2026).
 *   - Conférences are talks: a real description, an agenda, sometimes an
 *     illustration. They do NOT link to a subject.
 *   - Ateliers / activités are the actual subjects students work on: objectives,
 *     prerequisites, a deliverable, and a link to the full subject, all inlined
 *     in the activity's static HTML `content` (not the `link` field).
 *   - This is local test data, NOT prod. The script refuses to run against a
 *     non-local DATABASE_URL unless `--force` is passed.
 *
 * Idempotent: clears the event's existing time slots (cascades to their
 * activities) and rebuilds, and stretches the event's endDate to cover week 2
 * so the viewer can actually page across both weeks.
 *
 * Run:  bun scripts/seed-strasbourg-stage-planning.ts
 */
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient, type ActivityType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CAMPUS_NAME = 'Strasbourg';
const EVENT_TYPE = 'stage_seconde';
const SUBJECT_BASE = 'https://stage-seconde.epitech.eu/strasbourg/2026-06';
const subject = (slug: string) => `${SUBJECT_BASE}/ateliers/${slug}`;

// ─── Time helpers ───────────────────────────────────────────────────────────
// June 2026 is CEST (+02:00); build instants from Paris wall-clock explicitly so
// the stored UTC is unambiguous regardless of where the script runs.
const TZ_OFFSET = '+02:00';
function at(dateISO: string, hm: string): Date {
  return new Date(`${dateISO}T${hm}:00${TZ_OFFSET}`);
}

// ─── Content builders ─────────────────────────────────────────────────────────
const ul = (items: string[]) =>
  `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

// A conférence: lede, optional illustration + speaker, then the agenda. No
// subject link (it's a talk, not something to "open").
function conf(opts: {
  lede: string;
  agenda: string[];
  speaker?: string;
  image?: { url: string; alt: string };
}): string {
  const img = opts.image
    ? `<p><img src="${opts.image.url}" alt="${opts.image.alt}" /></p>`
    : '';
  const speaker = opts.speaker
    ? `<p><em>Intervenant·e : ${opts.speaker}</em></p>`
    : '';
  return `<p>${opts.lede}</p>${img}${speaker}<h3>Au programme</h3>${ul(opts.agenda)}`;
}

// An atelier/activité: lede, objectives, optional prerequisites, deliverable,
// and (when it has one) a link to the full subject inlined in the body.
function lab(opts: {
  lede: string;
  objectifs: string[];
  prerequis?: string;
  livrable: string;
  subjectSlug?: string;
}): string {
  const pre = opts.prerequis
    ? `<p><strong>Prérequis :</strong> ${opts.prerequis}</p>`
    : '';
  const link = opts.subjectSlug
    ? `<p><a href="${subject(opts.subjectSlug)}" target="_blank" rel="noopener noreferrer">Ouvrir le sujet complet</a></p>`
    : '';
  return `<p>${opts.lede}</p><h3>Objectifs</h3>${ul(opts.objectifs)}${pre}<h3>Livrable</h3><p>${opts.livrable}</p>${link}`;
}

const img = (seed: string, alt: string) => ({
  url: `https://picsum.photos/seed/${seed}/960/420`,
  alt,
});

// ─── Conférence catalogue (keyed by slug) ──────────────────────────────────────
const CONFERENCES: Record<string, { nom: string; content: string }> = {
  'presentation-du-stage': {
    nom: 'Conférence : présentation du stage',
    content: conf({
      lede: 'Bienvenue dans le stage de seconde Epitech ! Tour d’horizon des deux semaines : ce que tu vas découvrir, comment se déroulent les journées et ce qu’on attend de toi.',
      image: img('epitech-stage-strasbourg', 'Le campus Epitech de Strasbourg'),
      speaker: 'L’équipe pédagogique Epitech Strasbourg',
      agenda: [
        'Le planning des deux semaines : journées sur le campus et journées en remote',
        'Comment fonctionnent les conférences, les ateliers et les activités',
        'Le rôle des intervenants et des entretiens d’orientation',
        'Règles de vie, accès aux locaux et matériel fourni',
      ],
    }),
  },
  campus: {
    nom: 'Conférence Campus',
    content: conf({
      lede: 'Découverte d’Epitech et de l’écosystème du numérique : le métier de développeur, les parcours possibles après le bac et la pédagogie par projet.',
      agenda: [
        'Qu’est-ce qu’Epitech et la pédagogie par projet',
        'Les grands métiers du numérique aujourd’hui',
        'Témoignages d’étudiants et d’anciens',
        'Questions / réponses avec l’équipe',
      ],
    }),
  },
  cybersecurite: {
    nom: 'Conférence Cybersécurité',
    content: conf({
      lede: 'Pourquoi nos données valent de l’or, comment les attaques fonctionnent et comment s’en protéger au quotidien.',
      image: img('cyber-strasbourg', 'Illustration cybersécurité'),
      agenda: [
        'Panorama des menaces : phishing, rançongiciels, fuites de données',
        'Démonstration : casser un mot de passe trop faible',
        'Les bons réflexes d’hygiène numérique',
        'Les métiers de la cybersécurité',
      ],
    }),
  },
  programmation: {
    nom: 'Conférence Programmation',
    content: conf({
      lede: 'Comment parle-t-on à une machine ? Introduction au code, aux algorithmes et à la logique qui anime tous les programmes.',
      agenda: [
        'Ce qu’est un langage de programmation',
        'Variables, boucles et conditions expliquées simplement',
        'Live coding : un petit programme du début à la fin',
        'Comment continuer à apprendre à coder par soi-même',
      ],
    }),
  },
  opensource: {
    nom: 'Conférence Open Source',
    content: conf({
      lede: 'Le logiciel libre fait tourner le web, ton téléphone et même les serveurs de la NASA. Découvre la culture open source et comment des milliers de personnes construisent ensemble.',
      agenda: [
        'Une brève histoire du logiciel libre',
        'Git & GitHub : collaborer à plusieurs sur du code',
        'Comment contribuer à un projet open source',
        'Licences, communautés et bonnes pratiques',
      ],
    }),
  },
  'travail-a-distance': {
    nom: 'Conférence : travailler à distance',
    content: conf({
      lede: 'Les journées en remote se passent sur Discord. Petit guide pour bien s’organiser, communiquer et rester efficace à distance.',
      agenda: [
        'S’organiser et gérer son temps en autonomie',
        'Bien communiquer sur Discord (salons, micro, partage d’écran)',
        'Les outils de collaboration à distance',
        'Les pièges classiques et comment les éviter',
      ],
    }),
  },
  'web-aujourdhui': {
    nom: 'Conférence : le Web aujourd’hui',
    content: conf({
      lede: 'Du tout premier site en 1991 aux applications web modernes : comment fonctionne le Web, et ce qui se passe vraiment quand tu tapes une adresse.',
      image: img('web-strasbourg', 'Illustration du Web'),
      agenda: [
        'Client, serveur, navigateur : qui fait quoi',
        'HTML, CSS, JavaScript : les trois piliers du Web',
        'Le voyage d’une requête, de ton clic à l’écran',
        'Démos de sites qui repoussent les limites',
      ],
    }),
  },
  'data-ia': {
    nom: 'Conférence : Data & Intelligence Artificielle',
    content: conf({
      lede: 'L’IA est partout : recommandations, assistants vocaux, images générées. Comprendre ce qu’est vraiment l’intelligence artificielle, sans la magie.',
      image: img('data-ia-strasbourg', 'Illustration data et IA'),
      agenda: [
        'Les données : le carburant de l’IA',
        'Comment une machine « apprend »',
        'Démonstration : reconnaissance d’images en direct',
        'Limites, biais et éthique de l’IA',
      ],
    }),
  },
  'mobile-ux': {
    nom: 'Conférence : applications mobiles & UX',
    content: conf({
      lede: 'Ce qui fait qu’une appli est agréable… ou insupportable. Introduction au design d’expérience utilisateur et au développement mobile.',
      agenda: [
        'Anatomie d’une application mobile',
        'Les principes d’un bon design (UX / UI)',
        'Étude de cas : on refond un écran ensemble',
        'De l’idée au prototype',
      ],
    }),
  },
  'jeu-video': {
    nom: 'Conférence : créer un jeu vidéo',
    content: conf({
      lede: 'Derrière chaque jeu se cachent du code, des maths et beaucoup de créativité. Découvre comment naît un jeu vidéo, du concept au gameplay.',
      image: img('game-dev-strasbourg', 'Illustration jeu vidéo'),
      agenda: [
        'Les briques d’un jeu : boucle de jeu, sprites, collisions',
        'Game design : qu’est-ce qui rend un jeu amusant',
        'Démonstration : coder le déplacement d’un personnage',
        'Les métiers du jeu vidéo',
      ],
    }),
  },
  'et-apres-le-stage': {
    nom: 'Conférence : et après le stage ?',
    content: conf({
      lede: 'Bilan de ces deux semaines et ouverture : comment continuer à progresser, les ressources gratuites et le chemin vers les études supérieures en informatique.',
      agenda: [
        'Récapitulatif des compétences acquises',
        'Continuer à apprendre gratuitement : les bonnes ressources',
        'Les voies d’accès à Epitech et aux métiers du numérique',
        'Mot de la fin et cérémonie de clôture',
      ],
    }),
  },
};

// ─── Atelier / activité catalogue (keyed by slug) ──────────────────────────────
type Diff = 'Débutant' | 'Intermédiaire' | 'Avancé';
const ATELIERS: Record<
  string,
  { nom: string; difficulte: Diff; content: string }
> = {
  'activite-campus': {
    nom: 'Activité Campus',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Une activité d’accueil en équipe pour découvrir le campus, l’équipe et les autres participants à travers une série de défis.',
      objectifs: [
        'Rencontrer les autres stagiaires et les intervenants',
        'Se repérer dans les locaux et les outils du stage',
        'Apprendre à travailler en équipe',
      ],
      prerequis: 'Aucun.',
      livrable: 'Participation aux défis d’équipe (pas de rendu écrit).',
      subjectSlug: 'activite-campus',
    }),
  },
  'osint-enquete': {
    nom: 'Activité OSINT & Enquête',
    difficulte: 'Intermédiaire',
    content: lab({
      lede: 'Mène l’enquête comme un analyste : à partir d’indices publics, retrouve des informations en ligne… de façon éthique et légale (OSINT).',
      objectifs: [
        'Comprendre ce qu’est l’OSINT et son cadre légal',
        'Rechercher des informations à partir d’une image ou d’un pseudo',
        'Recouper plusieurs sources pour valider une piste',
        'Prendre conscience de sa propre empreinte numérique',
      ],
      prerequis: 'Un navigateur web, pas de connaissance préalable.',
      livrable:
        'Un mini-rapport d’enquête retraçant les étapes et les sources.',
      subjectSlug: 'osint-enquete',
    }),
  },
  'snake-js': {
    nom: 'Activité Snake.JS',
    difficulte: 'Intermédiaire',
    content: lab({
      lede: 'Recode le célèbre jeu Snake en JavaScript, pas à pas, et découvre les bases de la programmation de jeux dans le navigateur.',
      objectifs: [
        'Manipuler une grille et un système de coordonnées',
        'Gérer les déplacements au clavier',
        'Détecter les collisions et calculer le score',
        'Ajouter ta propre touche au jeu',
      ],
      prerequis: 'Aucune expérience requise, on part de zéro.',
      livrable: 'Une version jouable de Snake, personnalisée à ton goût.',
      subjectSlug: 'snake-js',
    }),
  },
  'discover-git': {
    nom: 'Activité Discover Git & GitHub',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Apprends à sauvegarder l’historique de ton code et à collaborer comme les pros, avec Git et GitHub.',
      objectifs: [
        'Comprendre l’intérêt du versioning',
        'Créer un dépôt et faire ses premiers commits',
        'Pousser son code sur GitHub',
        'Collaborer à plusieurs : branches et pull requests',
      ],
      prerequis: 'Un compte GitHub (créé en début de séance).',
      livrable: 'Un dépôt GitHub avec plusieurs commits et un README soigné.',
      subjectSlug: 'discover-git',
    }),
  },
  'web-html-css': {
    nom: 'Activité HTML & CSS : ma première page',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Construis ta toute première page web de A à Z, puis mets-la en forme avec du CSS.',
      objectifs: [
        'Structurer une page en HTML',
        'Mettre en forme avec le CSS (couleurs, polices, mise en page)',
        'Ajouter des images, des liens et des listes',
        'Rendre la page lisible et agréable',
      ],
      prerequis: 'Aucun.',
      livrable: 'Une page web personnelle : profil, passion ou mini-portfolio.',
      subjectSlug: 'web-html-css',
    }),
  },
  'data-decouverte-python': {
    nom: 'Activité Découverte de la Data (Python)',
    difficulte: 'Intermédiaire',
    content: lab({
      lede: 'Explore un vrai jeu de données avec Python et fais parler les chiffres à travers des graphiques.',
      objectifs: [
        'Charger et explorer un jeu de données',
        'Calculer des statistiques simples (moyenne, min, max)',
        'Créer un premier graphique',
        'Tirer une conclusion à partir des données',
      ],
      prerequis: 'Avoir suivi la conférence et l’activité de programmation.',
      livrable: 'Un notebook avec une analyse et un graphique commentés.',
      subjectSlug: 'data-decouverte-python',
    }),
  },
  'mobile-prototype': {
    nom: 'Activité Prototype d’app mobile',
    difficulte: 'Intermédiaire',
    content: lab({
      lede: 'Conçois l’interface d’une application mobile et transforme-la en prototype cliquable, sans écrire une ligne de code.',
      objectifs: [
        'Définir un besoin et les écrans clés',
        'Maquetter une interface mobile',
        'Relier les écrans en prototype cliquable',
        'Recueillir les retours d’autres participants',
      ],
      prerequis: 'Aucun.',
      livrable: 'Un prototype cliquable d’application mobile.',
      subjectSlug: 'mobile-prototype',
    }),
  },
  'game-pong-js': {
    nom: 'Activité Mini-jeu Pong (JS)',
    difficulte: 'Avancé',
    content: lab({
      lede: 'Programme le mythique Pong en JavaScript : la balle, les raquettes, les rebonds et le score.',
      objectifs: [
        'Dessiner sur un canvas',
        'Animer une balle et gérer la physique des rebonds',
        'Contrôler deux raquettes au clavier',
        'Gérer le score et la fin de partie',
      ],
      prerequis: 'Avoir suivi un atelier de programmation cette semaine.',
      livrable: 'Un Pong jouable à deux joueurs.',
      subjectSlug: 'game-pong-js',
    }),
  },
  'fake-news-ads': {
    nom: 'Atelier Fake News & Pub ciblée',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Comment repérer une fausse information, et comprendre pourquoi les publicités semblent lire dans tes pensées.',
      objectifs: [
        'Identifier les signaux d’alerte d’une fake news',
        'Comprendre le ciblage publicitaire',
        'Mieux protéger ses données personnelles',
      ],
      livrable: 'Ta checklist personnelle « à vérifier avant de partager ».',
      subjectSlug: 'fake-news-ads',
    }),
  },
  'logique-logiciel': {
    nom: 'Atelier Logique de logiciel',
    difficulte: 'Intermédiaire',
    content: lab({
      lede: 'Entraîne ton cerveau d’algorithmicien avec des énigmes de logique et de la programmation visuelle.',
      objectifs: [
        'Décomposer un problème en étapes simples',
        'Raisonner avec des conditions et des boucles',
        'Résoudre une série de puzzles algorithmiques',
      ],
      livrable: 'Les solutions commentées des défis résolus.',
      subjectSlug: 'logique-logiciel',
    }),
  },
  'test-personnalite': {
    nom: 'Atelier Test de personnalité tech',
    difficulte: 'Avancé',
    content: lab({
      lede: 'Quel profil tech te ressemble ? Un atelier ludique pour découvrir les métiers du numérique qui te correspondent.',
      objectifs: [
        'Découvrir la diversité des métiers de la tech',
        'Identifier tes centres d’intérêt et tes forces',
        'Faire le lien avec des parcours d’études',
      ],
      livrable: 'Ton profil et trois métiers à explorer après le stage.',
      subjectSlug: 'test-personnalite',
    }),
  },
  'dev-nombres-python': {
    nom: 'Atelier Dev : les nombres (Python)',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Joue avec les nombres en Python : pair / impair, multiples, suites… et découvre la beauté des maths en code.',
      objectifs: [
        'Manipuler des nombres et des opérations',
        'Utiliser des boucles et des conditions',
        'Écrire de petites fonctions utiles',
      ],
      livrable: 'Un script qui résout quelques défis numériques.',
      subjectSlug: 'dev-nombres-python',
    }),
  },
  'maths-shapes-python': {
    nom: 'Atelier Maths : les shapes (Python)',
    difficulte: 'Intermédiaire',
    content: lab({
      lede: 'Dessine des formes géométriques avec du code et redécouvre la géométrie autrement, avec le module turtle.',
      objectifs: [
        'Dessiner avec une « tortue » (turtle)',
        'Jouer avec les angles et les répétitions',
        'Composer des figures de plus en plus complexes',
      ],
      livrable: 'Une œuvre géométrique entièrement générée par ton code.',
      subjectSlug: 'maths-shapes-python',
    }),
  },
  'programming-with-ia-js': {
    nom: 'Atelier Programming with IA (JS)',
    difficulte: 'Avancé',
    content: lab({
      lede: 'Code assisté par l’IA : apprends à utiliser un assistant pour aller plus vite… tout en gardant ton esprit critique.',
      objectifs: [
        'Formuler une demande claire à une IA',
        'Comprendre et corriger le code généré',
        'Mesurer les limites et les erreurs de l’IA',
      ],
      livrable: 'Une petite page web réalisée avec l’aide d’une IA.',
      subjectSlug: 'programming-with-ia-js',
    }),
  },
  portfolio: {
    nom: 'Atelier Portfolio',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Rassemble tes réalisations du stage dans un portfolio en ligne dont tu seras fier·e.',
      objectifs: [
        'Choisir et présenter ses meilleures réalisations',
        'Soigner la mise en forme et les textes',
        'Publier son portfolio en ligne',
      ],
      livrable: 'Un portfolio en ligne, prêt à être partagé.',
      subjectSlug: 'portfolio',
    }),
  },
  'pitch-projet': {
    nom: 'Atelier Pitch de projet',
    difficulte: 'Intermédiaire',
    content: lab({
      lede: 'Apprends à présenter un projet en deux minutes, de façon claire et convaincante.',
      objectifs: [
        'Structurer un pitch : problème, solution, démonstration',
        'Travailler sa posture et sa voix',
        'S’entraîner devant le groupe et s’améliorer',
      ],
      livrable: 'Un pitch de deux minutes prêt pour la restitution.',
      subjectSlug: 'pitch-projet',
    }),
  },
  'culture-tech': {
    nom: 'Atelier Culture Tech (quiz)',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Un grand quiz en équipe pour tester et compléter ta culture numérique, dans la bonne humeur.',
      objectifs: [
        'Réviser les notions vues pendant le stage',
        'Découvrir des anecdotes de l’histoire de la tech',
        'Jouer et coopérer en équipe',
      ],
      livrable: 'Le classement final du quiz (pour la gloire).',
      subjectSlug: 'culture-tech',
    }),
  },
  'restitution-projets': {
    nom: 'Atelier Restitution des projets',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Le grand moment : chaque équipe présente ce qu’elle a réalisé pendant ces deux semaines.',
      objectifs: [
        'Présenter son projet devant le groupe',
        'Donner et recevoir des retours bienveillants',
        'Célébrer le travail accompli',
      ],
      livrable: 'Une présentation orale de ton projet (3 à 5 minutes).',
      subjectSlug: 'restitution-projets',
    }),
  },
  'photo-cloture': {
    nom: 'Atelier Photo de groupe & clôture',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Photo de groupe, remise des attestations et derniers mots avant de se quitter.',
      objectifs: [
        'Immortaliser ces deux semaines',
        'Recevoir son attestation de stage',
        'Garder le contact avec le campus',
      ],
      livrable: 'Aucun rendu, profite simplement du moment !',
    }),
  },
  'bilan-questions': {
    nom: 'Atelier Bilan & questions',
    difficulte: 'Débutant',
    content: lab({
      lede: 'Un temps d’échange pour faire le bilan du stage, poser toutes tes questions et donner ton avis.',
      objectifs: [
        'Faire le point sur ce qu’on a appris',
        'Poser ses questions sur la suite',
        'Donner son retour pour améliorer le stage',
      ],
      livrable: 'Un questionnaire de satisfaction rempli.',
    }),
  },
};

// ─── Slot shape ──────────────────────────────────────────────────────────────
type Slot = {
  start: string; // "HH:MM" Paris
  end: string;
  nom: string;
  type: ActivityType;
  content?: string;
  difficulte?: Diff;
};
type Day = { date: string; slots: Slot[] };

// ─── Slot fragments ────────────────────────────────────────────────────────────
const PAUSE_CAMPUS = `<p>Une heure pour souffler, manger un morceau et recharger les batteries. On se retrouve juste après, l’estomac plein et le cerveau prêt à coder !</p><h3>Nos recos du midi (testées et approuvées 😋)</h3>${ul(
  [
    '<strong>Flammekueche / tarte flambée</strong> : le classique alsacien. On ne jugera pas le nombre de parts.',
    '<strong>Bretzel + boisson</strong> pour les pressé·es qui veulent finir leur projet.',
    '<strong>La boulangerie du coin</strong> : sandwich, quiche, et une pâtisserie « pour le moral ».',
    '<strong>Team kebab / tacos</strong> : la valeur sûre qui n’a jamais trahi personne.',
    '<strong>Cafèt’ du campus</strong> : pas loin, pas cher, et on peut continuer à papoter code.',
  ],
)}<p>Conseils du chef 👨‍🍳 : pense à boire de l’eau, évite le quatrième café, et reviens à l’heure (sinon on démarre l’après-midi sans toi 😏).</p>`;

const PAUSE_REMOTE = `<p>Journée en remote : aujourd’hui, la cantine c’est ta cuisine ! Une heure pour décoller de l’écran et manger un <em>vrai</em> repas (pas juste des chips).</p><h3>Le menu du jour (suggestions 🍝)</h3>${ul(
  [
    '<strong>Opération frigo</strong> : un plat à partir de 3 ingrédients trouvés. Niveau MasterChef.',
    '<strong>Pâtes</strong> : le plat officiel du développeur. Indétrônable.',
    '<strong>Le grand classique</strong> : restes d’hier réchauffés, c’est toujours meilleur le lendemain.',
  ],
)}<p>Règles d’or : on s’éloigne de l’écran, on s’étire un peu 🧘, on boit de l’eau, et on revient frais pour l’après-midi. (Et pas de miettes dans le clavier, ça colle.)</p>`;

function pause(kind: 'campus' | 'remote'): Slot {
  return {
    start: '12:30',
    end: '13:30',
    nom: 'Pause Méridienne',
    type: 'break',
    content: kind === 'campus' ? PAUSE_CAMPUS : PAUSE_REMOTE,
  };
}
function conference(start: string, end: string, slug: string): Slot {
  const c = CONFERENCES[slug];
  if (!c) throw new Error(`Unknown conference slug: ${slug}`);
  return { start, end, nom: c.nom, type: 'conference', content: c.content };
}
function atelier(start: string, end: string, slug: string): Slot {
  const a = ATELIERS[slug];
  if (!a) throw new Error(`Unknown atelier slug: ${slug}`);
  return {
    start,
    end,
    nom: a.nom,
    type: 'atelier',
    difficulte: a.difficulte,
    content: a.content,
  };
}

// A standard on-campus day: morning conférence, an "activité campus", the
// méridienne break, then an afternoon activité.
function campusDay(opts: {
  date: string;
  confSlug: string;
  afternoonSlug: string;
}): Day {
  return {
    date: opts.date,
    slots: [
      conference('10:00', '11:00', opts.confSlug),
      atelier('11:00', '12:30', 'activite-campus'),
      pause('campus'),
      atelier('13:30', '17:00', opts.afternoonSlug),
    ],
  };
}

// A "remote" day on Discord: a short conférence plus several parallel ateliers
// morning and afternoon. No campus interviews.
function remoteDay(opts: {
  date: string;
  confSlug: string;
  morning: string[];
  afternoon: string[];
}): Day {
  return {
    date: opts.date,
    slots: [
      conference('10:00', '10:45', opts.confSlug),
      ...opts.morning.map((slug) => atelier('10:00', '12:30', slug)),
      pause('remote'),
      ...opts.afternoon.map((slug) => atelier('13:30', '17:00', slug)),
    ],
  };
}

// ─── The two-week schedule ───────────────────────────────────────────────────
const DAYS: Day[] = [
  // ── Week 1 (from the reference calendar) ──
  // Day 01 (Mon 15): welcome day, two morning conférences, no afternoon split.
  {
    date: '2026-06-15',
    slots: [
      {
        start: '10:00',
        end: '10:30',
        nom: 'Accueil + Petit Déjeuner',
        type: 'orga',
        content:
          '<p>On t’accueille autour d’un petit déjeuner pour bien démarrer le stage : récupération du badge, présentation de l’équipe et tour de table.</p>',
      },
      conference('10:30', '11:00', 'presentation-du-stage'),
      conference('11:00', '12:30', 'campus'),
      pause('campus'),
      atelier('13:30', '17:00', 'activite-campus'),
    ],
  },
  campusDay({
    date: '2026-06-16',
    confSlug: 'cybersecurite',
    afternoonSlug: 'osint-enquete',
  }),
  campusDay({
    date: '2026-06-17',
    confSlug: 'programmation',
    afternoonSlug: 'snake-js',
  }),
  campusDay({
    date: '2026-06-18',
    confSlug: 'opensource',
    afternoonSlug: 'discover-git',
  }),
  remoteDay({
    date: '2026-06-19',
    confSlug: 'travail-a-distance',
    morning: ['fake-news-ads', 'logique-logiciel', 'test-personnalite'],
    afternoon: [
      'dev-nombres-python',
      'maths-shapes-python',
      'programming-with-ia-js',
    ],
  }),

  // ── Week 2 (invented, same shape) ──
  campusDay({
    date: '2026-06-22',
    confSlug: 'web-aujourdhui',
    afternoonSlug: 'web-html-css',
  }),
  campusDay({
    date: '2026-06-23',
    confSlug: 'data-ia',
    afternoonSlug: 'data-decouverte-python',
  }),
  campusDay({
    date: '2026-06-24',
    confSlug: 'mobile-ux',
    afternoonSlug: 'mobile-prototype',
  }),
  campusDay({
    date: '2026-06-25',
    confSlug: 'jeu-video',
    afternoonSlug: 'game-pong-js',
  }),
  remoteDay({
    date: '2026-06-26',
    confSlug: 'et-apres-le-stage',
    morning: ['portfolio', 'pitch-projet', 'culture-tech'],
    afternoon: ['restitution-projets', 'photo-cloture', 'bilan-questions'],
  }),
];

// endDate must cover the last day so the viewer's week-nav can reach week 2.
const EVENT_END = at('2026-06-26', '17:30');

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal && !process.argv.includes('--force')) {
    throw new Error(
      `Refusing to seed: DATABASE_URL is not local. This script is test-only.\n` +
        `Re-run with --force if you really mean to target this database.`,
    );
  }

  const campus = await prisma.campus.findFirst({
    where: { name: CAMPUS_NAME },
  });
  if (!campus)
    throw new Error(`${CAMPUS_NAME} campus not found, run the seed first.`);

  const event = await prisma.event.findFirst({
    where: { campusId: campus.id, eventType: EVENT_TYPE },
    orderBy: { date: 'asc' },
    include: { planning: true },
  });
  if (!event) {
    throw new Error(
      `No ${EVENT_TYPE} event found for ${CAMPUS_NAME}. Create the stage event first.`,
    );
  }

  const planning =
    event.planning ??
    (await prisma.planning.create({ data: { eventId: event.id } }));

  const slotCount = DAYS.reduce((n, d) => n + d.slots.length, 0);
  console.log(
    `Seeding ${slotCount} slots across ${DAYS.length} days into planning ${planning.id}\n` +
      `  campus=${campus.name} event="${event.titre}" (${event.id})`,
  );

  await prisma.$transaction([
    // Wipe and rebuild so the script is idempotent (cascades to activities).
    prisma.timeSlot.deleteMany({ where: { planningId: planning.id } }),
    // Stretch the event to span both weeks; keep its existing start date.
    prisma.event.update({
      where: { id: event.id },
      data: { endDate: EVENT_END },
    }),
    ...DAYS.flatMap((day) =>
      day.slots.map((s) =>
        prisma.timeSlot.create({
          data: {
            planningId: planning.id,
            startTime: at(day.date, s.start),
            endTime: at(day.date, s.end),
            activity: {
              create: {
                nom: s.nom,
                activityType: s.type,
                isDynamic: false,
                content: s.content ?? null,
                difficulte: s.difficulte ?? null,
              },
            },
          },
        }),
      ),
    ),
  ]);

  console.log(
    `Done. Event "${event.titre}" now runs ${event.date
      .toISOString()
      .slice(
        0,
        10,
      )} → ${EVENT_END.toISOString().slice(0, 10)} with ${slotCount} static activities.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
