/**
 * The closing grids, and the bank of questions they are composed from.
 *
 * The read half of authoring. A grid is written over the API rather than in a
 * migration, so everything an author needs has to be returnable: which questions
 * exist, what each offers, which grids ask them, and the closed vocabularies a
 * new option may use. Same reasoning as the certificate authoring contract - and
 * as `scopeVocabulary` shipping the campus names - namely that discovery should
 * not have to be a deliberate error.
 */

import { prisma } from '$lib/server/db';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import { UnknownScopeError } from '$lib/server/adminApi/scope';
import { CHOICE_ICON_TOKENS, CHOICE_TONES } from '$lib/domain/closing';

const AUTHORING_CONTRACT = [
  "Une question appartient à la banque, pas à une grille : la même question posée par un stage et par un Coding Club est UNE seule question, et c'est ce qui permet d'agréger les deux ensemble. Pour poser une question existante dans une nouvelle grille, référencez sa clé ; n'en créez pas une deuxième avec un libellé différent.",
  "« label » est le nom canonique sous lequel le chiffre est cité. Si une grille doit la formuler autrement (« Satisfaction globale du stage » plutôt que « Satisfaction globale »), c'est « labelOverride » sur la grille qui le fait : la formulation change, le chiffre garde un seul nom.",
  "Une clé publiée ne se renomme pas et ne se réutilise pas pour autre chose. Changer le sens d'une question, c'est créer une nouvelle clé ; corriger sa formulation se fait sur place et se répercute sur les documents déjà rendus, ce qui est voulu.",
  `« tone » ne se met que sur une question ordinale (oui / un peu / pas du tout), où la couleur dit une valence. Sur des options catégorielles, la couleur laisserait croire à un classement qui n'existe pas. Valeurs acceptées : ${CHOICE_TONES.join(', ')}.`,
  `« icon » ne se met que là où un pictogramme existe déjà. Valeurs acceptées : ${CHOICE_ICON_TOKENS.join(', ')}.`,
  "Une seule question par grille peut porter « testimonial » : c'est celle dont la réponse est destinée à être citée telle quelle.",
  'Une question déjà répondue ne peut plus changer de type, ni perdre une de ses options : ce sont des réponses enregistrées qui deviendraient illisibles. Sa formulation, elle, reste modifiable.',
];

export type ClosingQuestions = {
  questions: Metric<
    {
      key: string;
      label: string;
      kind: string;
      max: number | null;
      maxLength: number | null;
      testimonial: boolean;
      retired: boolean;
      answerCount: number;
      usedByGrids: number;
      options: {
        value: string;
        label: string;
        tone: string | null;
        icon: string | null;
      }[];
    }[]
  >;
  authoring: Metric<string[]>;
};

export async function getClosingQuestions(): Promise<ClosingQuestions> {
  const rows = await prisma.closing_Question.findMany({
    orderBy: { key: 'asc' },
    select: {
      key: true,
      label: true,
      kind: true,
      max: true,
      maxLength: true,
      testimonial: true,
      retiredAt: true,
      options: {
        orderBy: { position: 'asc' },
        select: { value: true, label: true, tone: true, icon: true },
      },
      _count: { select: { answers: true, templateQuestions: true } },
    },
  });

  return {
    questions: metric(
      rows.map((q) => ({
        key: q.key,
        label: q.label,
        kind: q.kind,
        max: q.max,
        maxLength: q.maxLength,
        testimonial: q.testimonial,
        retired: q.retiredAt !== null,
        answerCount: q._count.answers,
        usedByGrids: q._count.templateQuestions,
        options: q.options,
      })),
      'La banque de questions de closing. « key » est la clé stable à passer à write_closing_question pour la modifier et à write_closing_template pour la poser dans une grille. « answerCount » dit combien de réponses existent déjà : au-delà de zéro, le type et les options sont verrouillés. « retired » signale une question qui reste lisible sur les closings passés mais ne peut plus entrer dans une nouvelle grille.',
    ),
    authoring: metric(
      AUTHORING_CONTRACT,
      "Ce qu'il faut savoir avant d'écrire une question ou une grille. Ce sont des règles appliquées : ce qui les enfreint est refusé à l'enregistrement, pas corrigé en silence.",
    ),
  };
}

export type ClosingTemplates = {
  templates: Metric<
    {
      closingTemplateId: string;
      templateKey: string;
      label: string;
      questionCount: number;
      attachedEvents: number;
      closingCount: number;
    }[]
  >;
  composition: Metric<{
    templateKey: string;
    label: string;
    sections: {
      title: string;
      synthesisPosition: number | null;
      questions: {
        questionKey: string;
        label: string;
        labelOverride: string | null;
        withNote: boolean;
      }[];
    }[];
  } | null>;
  authoring: Metric<string[]>;
};

export async function getClosingTemplates(params: {
  templateKey?: string;
}): Promise<ClosingTemplates> {
  const rows = await prisma.closing_Template.findMany({
    orderBy: { label: 'asc' },
    select: {
      id: true,
      key: true,
      label: true,
      _count: { select: { questions: true, events: true, records: true } },
    },
  });

  // Asked for one grid: hand back its composition so it can be edited rather
  // than rewritten from scratch. Withheld from the list, where N compositions
  // would be pages nobody asked for.
  let composition: ClosingTemplates['composition']['value'] = null;
  if (params.templateKey) {
    const wanted = await prisma.closing_Template.findUnique({
      where: { key: params.templateKey },
      select: {
        key: true,
        label: true,
        sections: {
          orderBy: { position: 'asc' },
          select: {
            title: true,
            synthesisPosition: true,
            questions: {
              orderBy: { position: 'asc' },
              select: {
                labelOverride: true,
                withNote: true,
                question: { select: { key: true, label: true } },
              },
            },
          },
        },
      },
    });
    if (!wanted) {
      throw new UnknownScopeError(
        `Grille de closing « ${params.templateKey} » introuvable. Les clés existantes sont : ${rows.map((r) => r.key).join(', ')}.`,
      );
    }
    composition = {
      templateKey: wanted.key,
      label: wanted.label,
      sections: wanted.sections.map((s) => ({
        title: s.title,
        synthesisPosition: s.synthesisPosition,
        questions: s.questions.map((q) => ({
          questionKey: q.question.key,
          label: q.question.label,
          labelOverride: q.labelOverride,
          withNote: q.withNote,
        })),
      })),
    };
  }

  return {
    templates: metric(
      rows.map((t) => ({
        closingTemplateId: t.id,
        templateKey: t.key,
        label: t.label,
        questionCount: t._count.questions,
        attachedEvents: t._count.events,
        closingCount: t._count.records,
      })),
      "Les grilles de closing existantes. « templateKey » est la clé stable à passer à write_closing_template pour composer la grille, « closingTemplateId » l'identifiant à passer à write_event_closing_template pour la rattacher à un événement, et « closingCount » le nombre de closings déjà menés avec elle.",
    ),
    composition: metric(
      composition,
      "La composition de la grille demandée par « templateKey » : ses sections, et dans chacune les questions posées, dans l'ordre. Null si aucune clé n'a été demandée. C'est ce qu'il faut relire avant de modifier une grille, pour repartir de l'existant au lieu de la réécrire. « synthesisPosition » est la place de la section dans la relecture (le PDF de synthèse) quand elle diffère de l'ordre où elle est menée.",
    ),
    authoring: metric(
      AUTHORING_CONTRACT,
      "Ce qu'il faut savoir avant d'écrire une question ou une grille. Ce sont des règles appliquées : ce qui les enfreint est refusé à l'enregistrement, pas corrigé en silence.",
    ),
  };
}
