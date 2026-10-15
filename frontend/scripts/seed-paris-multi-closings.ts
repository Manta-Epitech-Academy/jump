import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient, type ClosingRecommendation } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CAMPUS_ID = 'sd_cmp_paris';

// Staff on Paris
const STAFF_IDS = [
  'sd_stf_pauline_martin',
  'sd_stf_eliot_thomas',
  'sd_stf_nadia_petit',
];

// Paris events in chronological order
const PARIS_EVENTS = [
  {
    id: 'sd_evt_paris_evt_15',
    title: 'Coding Club - Juin 2026 (Aventure Game)',
    date: new Date('2026-06-10T09:00:00.000Z'),
    endDate: new Date('2026-06-10T17:00:00.000Z'),
    templateId: 'sd_clt_coding_club',
    isClub: true,
  },
  {
    id: 'sd_evt_paris_coding_club_1',
    title: 'Coding Club - Juillet 2026 (Summer Camp)',
    date: new Date('2026-07-03T09:00:00.000Z'),
    endDate: new Date('2026-07-03T17:00:00.000Z'),
    templateId: 'sd_clt_coding_club',
    isClub: true,
  },
  {
    id: 'sd_evt_paris_coding_club_2',
    title: 'Coding Club - Août 2026',
    date: new Date('2026-08-03T09:00:00.000Z'),
    endDate: new Date('2026-08-03T17:00:00.000Z'),
    templateId: 'sd_clt_coding_club',
    isClub: true,
  },
  {
    id: 'sd_evt_paris_stage_2nde',
    title: 'Stage de Seconde - Août 2026',
    date: new Date('2026-08-10T09:00:00.000Z'),
    endDate: new Date('2026-08-21T17:00:00.000Z'),
    templateId: 'clt_stage_seconde',
    isClub: false,
  },
  {
    id: 'sd_evt_paris_coding_club_3',
    title: 'Coding Club - Septembre 2026',
    date: new Date('2026-09-07T09:00:00.000Z'),
    endDate: new Date('2026-09-07T17:00:00.000Z'),
    templateId: 'sd_clt_coding_club',
    isClub: true,
  },
];

type TalentSpec = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  niveau: string;
  schoolId: string;
  closings: {
    eventId: string;
    recommendation: ClosingRecommendation;
    verdictNote: string;
    quote: string;
    satisfaction: number;
    staffId: string;
    noteQuestion?: string;
  }[];
};

const TALENTS: TalentSpec[] = [
  {
    id: 'sd_tal_paris_maxime_girard',
    prenom: 'Maxime',
    nom: 'Girard',
    email: 'maxime.girard@seed.invalid',
    niveau: '1ere',
    schoolId: 'sd_sch_0751001b', // Lycée Montesquieu
    closings: [
      {
        eventId: 'sd_evt_paris_evt_15',
        recommendation: 'bon_profil',
        verdictNote:
          "Très curieux, a déjà fait du Python seul au collège. Pose d'excellentes questions sur la méthodologie.",
        quote:
          "J'ai adoré l'atelier Aventure Game, coder un jeu en groupe est vraiment gratifiant.",
        satisfaction: 4,
        staffId: STAFF_IDS[0],
        noteQuestion:
          "A découvert l'événement via un ami déjà passionné d'informatique.",
      },
      {
        eventId: 'sd_evt_paris_coding_club_1',
        recommendation: 'tres_compatible',
        verdictNote:
          'Progression très rapide, autonome sur les exercices de programmation. Très sociable avec ses camarades.',
        quote:
          'Le format en équipe était top, on a réussi à intégrer des animations complexes.',
        satisfaction: 5,
        staffId: STAFF_IDS[1],
        noteQuestion: 'Très déterminé à participer au stage intensif en août.',
      },
      {
        eventId: 'sd_evt_paris_coding_club_2',
        recommendation: 'tres_compatible',
        verdictNote:
          'Toujours en tête des projets, il aide spontanément les autres élèves en difficulté.',
        quote:
          "Chaque atelier me donne envie d'apprendre de nouveaux langages.",
        satisfaction: 5,
        staffId: STAFF_IDS[2],
        noteQuestion: 'Projette de faire de la cybersécurité ou du dev web.',
      },
      {
        eventId: 'sd_evt_paris_stage_2nde',
        recommendation: 'tres_compatible',
        verdictNote:
          'Major de promotion du stage de 2nde. Projet final remarquable, leadership naturel et rigueur exemplaire. Futur candidat idéal pour Epitech !',
        quote:
          "Le stage de deux semaines m'a totalement convaincu, l'apprentissage par projet est fait pour moi.",
        satisfaction: 5,
        staffId: STAFF_IDS[0],
        noteQuestion:
          'Dossier prioritaire pour la prochaine rentrée et invitations JPO.',
      },
      {
        eventId: 'sd_evt_paris_coding_club_3',
        recommendation: 'tres_compatible',
        verdictNote:
          'Fidèle au campus, il continue de participer activement. Ambassadeur parfait auprès des nouveaux venus.',
        quote:
          'Je reviens pour perfectionner mes projets et échanger avec les encadrants.',
        satisfaction: 5,
        staffId: STAFF_IDS[1],
        noteQuestion:
          'A déjà bloqué la date de la première Journée Portes Ouvertes.',
      },
    ],
  },
  {
    id: 'sd_tal_paris_ines_benali',
    prenom: 'Inès',
    nom: 'Benali',
    email: 'ines.benali@seed.invalid',
    niveau: '2nde',
    schoolId: 'sd_sch_0759001s', // Lycée Charlemagne
    closings: [
      {
        eventId: 'sd_evt_paris_coding_club_1',
        recommendation: 'indecis',
        verdictNote:
          "Première expérience avec la programmation. Un peu réservée au début mais s'est détendue au fil de la journée.",
        quote:
          "J'hésitais entre le design, la com et le web, l'atelier m'a permis de voir le côté création graphique.",
        satisfaction: 4,
        staffId: STAFF_IDS[1],
        noteQuestion: 'Ne connaissait pas Epitech, découverte sur Instagram.',
      },
      {
        eventId: 'sd_evt_paris_coding_club_2',
        recommendation: 'bon_profil',
        verdictNote:
          "A pris beaucoup d'assurance. A bien accroché à l'interface web et à la structuration CSS.",
        quote:
          "Créer une interface qui réagit aux clics en direct, c'était super concret.",
        satisfaction: 4,
        staffId: STAFF_IDS[0],
        noteQuestion: 'A confirmé sa présence pour le stage de deux semaines.',
      },
      {
        eventId: 'sd_evt_paris_stage_2nde',
        recommendation: 'bon_profil',
        verdictNote:
          "Stage très positif : bonne maîtrise des concepts de base, excellent esprit d'équipe et persévérance.",
        quote:
          "C'était parfois difficile quand le code ne marchait pas, mais trouver l'erreur donne trop de satisfaction.",
        satisfaction: 5,
        staffId: STAFF_IDS[2],
        noteQuestion:
          "Hésite encore un peu avec une filière artistique/design, mais la tech l'attire beaucoup.",
      },
      {
        eventId: 'sd_evt_paris_coding_club_3',
        recommendation: 'tres_compatible',
        verdictNote:
          "Profil épanoui, projet d'orientation stabilisé vers le développement et l'UX design. Très bon closing.",
        quote:
          "Je me sens désormais totalement capable de continuer l'informatique au lycée et après le bac.",
        satisfaction: 5,
        staffId: STAFF_IDS[0],
        noteQuestion: 'A choisi la spécialité NSI pour son année de 1ère.',
      },
    ],
  },
  {
    id: 'sd_tal_00209', // Lucas Legrand
    prenom: 'Lucas',
    nom: 'Legrand',
    email: 'lucas.legrand.00209@seed.invalid',
    niveau: '1ere',
    schoolId: 'sd_sch_0751000a',
    closings: [
      {
        eventId: 'sd_evt_paris_evt_15',
        recommendation: 'indecis',
        verdictNote:
          "Vient surtout par curiosité, n'a pas de vision claire des métiers du numérique.",
        quote:
          "Je voulais juste voir comment marchait un jeu vidéo de l'intérieur.",
        satisfaction: 3,
        staffId: STAFF_IDS[2],
        noteQuestion: 'Projection tech encore floue.',
      },
      {
        eventId: 'sd_evt_paris_coding_club_1',
        recommendation: 'bon_profil',
        verdictNote:
          "S'est beaucoup plus investi que lors du premier atelier. A bien compris les bases de la logique booléenne.",
        quote:
          "Ça m'a rassuré, c'est moins abstrait que les cours de maths au lycée.",
        satisfaction: 4,
        staffId: STAFF_IDS[0],
        noteQuestion:
          "A apprécié l'accompagnement personnalisé des animateurs.",
      },
      {
        eventId: 'sd_evt_paris_stage_2nde',
        recommendation: 'bon_profil',
        verdictNote:
          "Très sérieux et ponctuel tout au long du stage. Bon esprit d'entraide.",
        quote:
          "La semaine est passée super vite, on a appris énormément de choses sans s'ennuyer.",
        satisfaction: 4,
        staffId: STAFF_IDS[1],
        noteQuestion: 'A envie de revenir aux sessions du samedi.',
      },
      {
        eventId: 'sd_evt_paris_coding_club_3',
        recommendation: 'tres_compatible',
        verdictNote:
          "Motivation confirmée. Souhaite s'orienter vers le développement logiciel.",
        quote:
          'Je sais ce que je veux faire maintenant : faire mes études dans la tech.',
        satisfaction: 5,
        staffId: STAFF_IDS[2],
        noteQuestion: "À inviter aux sessions d'immersion cet hiver.",
      },
    ],
  },
  {
    id: 'sd_tal_00210', // Capucine Petit
    prenom: 'Capucine',
    nom: 'Petit',
    email: 'capucine.petit.00210@seed.invalid',
    niveau: '2nde',
    schoolId: 'sd_sch_0759001s',
    closings: [
      {
        eventId: 'sd_evt_paris_coding_club_1',
        recommendation: 'bon_profil',
        verdictNote: 'Bonne participation en atelier, attentive et appliquée.',
        quote: "J'ai bien aimé tester plusieurs petits défis de programmation.",
        satisfaction: 4,
        staffId: STAFF_IDS[0],
      },
      {
        eventId: 'sd_evt_paris_stage_2nde',
        recommendation: 'tres_compatible',
        verdictNote:
          'Excellente progression pendant le stage. Très autonome sur son projet.',
        quote:
          'Le stage de seconde a été une révélation pour moi, je ne pensais pas pouvoir coder une app aussi vite.',
        satisfaction: 5,
        staffId: STAFF_IDS[1],
      },
      {
        eventId: 'sd_evt_paris_coding_club_3',
        recommendation: 'tres_compatible',
        verdictNote: 'Régularité exemplaire, très bonne intégration au groupe.',
        quote: "L'ambiance est toujours super bienveillante et stimulante.",
        satisfaction: 5,
        staffId: STAFF_IDS[0],
      },
    ],
  },
  {
    id: 'sd_tal_00201', // Sarah Mercier
    prenom: 'Sarah',
    nom: 'Mercier',
    email: 'sarah.mercier.00201@seed.invalid',
    niveau: 'Terminale',
    schoolId: 'sd_sch_0759002t',
    closings: [
      {
        eventId: 'sd_evt_paris_evt_15',
        recommendation: 'bon_profil',
        verdictNote: 'Profil scientifique très carré, grande aisance logique.',
        quote:
          "L'atelier était très bien expliqué, bonne dynamique avec les tuteurs.",
        satisfaction: 4,
        staffId: STAFF_IDS[1],
      },
      {
        eventId: 'sd_evt_paris_coding_club_1',
        recommendation: 'indecis',
        verdictNote:
          "Hésite entre des études de médecine / biologie et l'informatique.",
        quote:
          "J'aime l'informatique comme outil, mais je ne sais pas si je veux en faire mon métier exclusif.",
        satisfaction: 4,
        staffId: STAFF_IDS[2],
      },
      {
        eventId: 'sd_evt_paris_stage_2nde',
        recommendation: 'pas_interesse',
        verdictNote:
          "Discussion d'orientation franche et très utile : elle a compris que sa passion reste le secteur médical / santé.",
        quote:
          "Le stage était génial pour tester concrètement, et ça m'a permis de valider que mon vrai choix est la santé.",
        satisfaction: 4,
        staffId: STAFF_IDS[0],
      },
    ],
  },
];

async function main() {
  console.log('Seeding Paris talents with multi-events and multi-closings...');

  // 1. Ensure all Paris events are configured
  for (const evt of PARIS_EVENTS) {
    await prisma.event.update({
      where: { id: evt.id },
      data: {
        devActivatedAt: new Date(),
        endDate: evt.endDate,
        closingTemplateId: evt.templateId,
      },
    });

    await prisma.eventConfig_Module.upsert({
      where: {
        eventId_moduleKey: { eventId: evt.id, moduleKey: 'closings' },
      },
      create: {
        eventId: evt.id,
        moduleKey: 'closings',
        settings: { enabled: true, seededBy: 'paris-multi-closings' },
      },
      update: {
        settings: { enabled: true, seededBy: 'paris-multi-closings' },
      },
    });
  }

  // 2. Process each talent
  for (const t of TALENTS) {
    // Upsert bauth_user
    const user = await prisma.bauth_user.upsert({
      where: { email: t.email },
      create: {
        id: `usr_${t.id}`,
        email: t.email,
        name: `${t.prenom} ${t.nom}`,
        role: 'student',
        emailVerified: true,
      },
      update: {
        name: `${t.prenom} ${t.nom}`,
      },
    });

    // Upsert talent
    const talent = await prisma.talent.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        userId: user.id,
        prenom: t.prenom,
        nom: t.nom,
        niveau: t.niveau,
        schoolId: t.schoolId,
        charterAcceptedAt: new Date('2026-06-01T00:00:00Z'),
        firstLoginAt: new Date('2026-06-01T00:00:00Z'),
      },
      update: {
        prenom: t.prenom,
        nom: t.nom,
        niveau: t.niveau,
        schoolId: t.schoolId,
      },
    });

    // Schooling record
    await prisma.schooling_YearRecord.upsert({
      where: {
        talentId_schoolYear: { talentId: talent.id, schoolYear: '2025-2026' },
      },
      create: {
        talentId: talent.id,
        schoolYear: '2025-2026',
        niveau: t.niveau,
        schoolId: t.schoolId,
        source: 'salesforce',
      },
      update: {
        niveau: t.niveau,
        schoolId: t.schoolId,
      },
    });

    // Upsert each event participation & closing
    for (const cl of t.closings) {
      const evt = PARIS_EVENTS.find((e) => e.id === cl.eventId)!;

      // Participation
      await prisma.participation.upsert({
        where: {
          talentId_eventId: { talentId: talent.id, eventId: evt.id },
        },
        create: {
          talentId: talent.id,
          eventId: evt.id,
          campusId: CAMPUS_ID,
          sfMemberStatus: 'MEET', // Confirmed attended
        },
        update: {
          sfMemberStatus: 'MEET',
        },
      });

      // Clear any existing closing on this event to avoid duplicate/stale answers
      await prisma.closing_Record.deleteMany({
        where: { talentId: talent.id, eventId: evt.id },
      });

      // Conducted date 1 day after event
      const conductedAt = new Date(evt.endDate.getTime() + 24 * 3600 * 1000);

      // Create Closing_Record
      const record = await prisma.closing_Record.create({
        data: {
          talentId: talent.id,
          eventId: evt.id,
          campusId: CAMPUS_ID,
          staffId: cl.staffId,
          templateId: evt.templateId,
          status: 'done',
          conductedAt,
          createdAt: conductedAt,
          recommendation: cl.recommendation,
          verdictNote: cl.verdictNote,
        },
      });

      // Common question: satisfaction (rating)
      await prisma.closing_Answer.create({
        data: {
          recordId: record.id,
          questionId: 'clq_satisfaction',
          ratingValue: cl.satisfaction,
        },
      });

      // Common question: one_sentence (quote/testimonial)
      await prisma.closing_Answer.create({
        data: {
          recordId: record.id,
          questionId: 'clq_one_sentence',
          freeText: cl.quote,
        },
      });

      // Common question: motivation
      const ansMotiv = await prisma.closing_Answer.create({
        data: {
          recordId: record.id,
          questionId: 'clq_motivation',
          note: cl.noteQuestion ?? 'Bon échange sur la motivation globale.',
        },
      });
      await prisma.closing_AnswerOption.create({
        data: {
          answerId: ansMotiv.id,
          optionId: 'clo_motivation_passion',
        },
      });

      // Common question: discovery_channel
      const ansDisc = await prisma.closing_Answer.create({
        data: {
          recordId: record.id,
          questionId: 'clq_discovery_channel',
        },
      });
      await prisma.closing_AnswerOption.create({
        data: {
          answerId: ansDisc.id,
          optionId: 'clo_discovery_channel_entourage',
        },
      });

      // Common question: tech_projection
      const ansTech = await prisma.closing_Answer.create({
        data: {
          recordId: record.id,
          questionId: 'clq_tech_projection',
        },
      });
      await prisma.closing_AnswerOption.createMany({
        data: [
          { answerId: ansTech.id, optionId: 'clo_tech_projection_dev' },
          { answerId: ansTech.id, optionId: 'clo_tech_projection_jeux_video' },
        ],
      });

      // If stage: also answer specialties and wants_more
      if (!evt.isClub) {
        const ansSpec = await prisma.closing_Answer.create({
          data: {
            recordId: record.id,
            questionId: 'clq_specialties',
          },
        });
        await prisma.closing_AnswerOption.createMany({
          data: [
            { answerId: ansSpec.id, optionId: 'clo_specialties_maths' },
            { answerId: ansSpec.id, optionId: 'clo_specialties_nsi' },
          ],
        });

        const ansWants = await prisma.closing_Answer.create({
          data: {
            recordId: record.id,
            questionId: 'clq_wants_more',
          },
        });
        await prisma.closing_AnswerOption.create({
          data: {
            answerId: ansWants.id,
            optionId:
              cl.recommendation === 'pas_interesse'
                ? 'clo_wants_more_pas_maintenant'
                : 'clo_wants_more_oui',
          },
        });
      }
    }

    console.log(
      `✓ Talent ${t.prenom} ${t.nom} (${t.id}): ${t.closings.length} events & closings configured`,
    );
  }

  console.log('\nAll Paris multi-closing talents seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
