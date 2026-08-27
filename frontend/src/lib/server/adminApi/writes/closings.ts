// The class A writes for closings: authoring a bank question, composing a grid
// out of those questions, and pointing an event at a grid. Bounded to named rows,
// reversible, and nothing leaves the platform.
//
// There is deliberately no delete, for the reason certificates have none: the
// configuration reads return keys, so a delete tool would be something a model
// could aim on its own, which is class C. A question is retired by flagging it,
// which keeps every answer already recorded readable; a grid is retired by
// leaving it unreferenced, and the FK is `Restrict` so a hand-deletion of one
// still in use fails loudly.
//
// Every refusal below names the construct and says why, because the author is
// usually a language model relaying to a human: "refusé" with no reason produces
// another attempt at the same thing.
import { prisma } from '$lib/server/db';
import {
  isChoiceIconToken,
  isChoiceTone,
  CHOICE_ICON_TOKENS,
  CHOICE_TONES,
} from '$lib/domain/closing';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import { runTwoStep, type WriteOutcome } from '../plan';

type OptionInput = {
  value: string;
  label: string;
  tone?: string;
  icon?: string;
};

/**
 * What a question write reports, before and after: the whole question including
 * its options, because a bad edit is only recoverable if the previous state is in
 * the audit row.
 */
const QUESTION_STATE_SELECT = {
  key: true,
  label: true,
  hint: true,
  kind: true,
  max: true,
  maxLength: true,
  placeholder: true,
  notePlaceholder: true,
  testimonial: true,
  retiredAt: true,
  options: {
    orderBy: { position: 'asc' },
    select: { value: true, label: true, tone: true, icon: true },
  },
} as const;

function questionState(row: unknown) {
  return row as Record<string, unknown> | null;
}

export async function writeClosingQuestion(params: {
  questionKey: string;
  label: string;
  kind?: 'single' | 'multi' | 'rating' | 'text';
  hint?: string;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  notePlaceholder?: string;
  testimonial?: boolean;
  retired?: boolean;
  options?: OptionInput[];
}): Promise<WriteOutcome> {
  const key = params.questionKey.trim();
  const label = params.label.trim();
  if (!key || !label) {
    throw new OperationRefusedError(
      "Une question a besoin d'une clé stable et d'un libellé français (le nom sous lequel le chiffre sera cité).",
    );
  }

  const before = await prisma.closing_Question.findUnique({
    where: { key },
    select: {
      ...QUESTION_STATE_SELECT,
      id: true,
      _count: { select: { answers: true } },
    },
  });

  const kind = params.kind ?? before?.kind;
  if (!kind) {
    throw new OperationRefusedError(
      `La question « ${key} » n'existe pas encore : précisez son type (single, multi, rating ou text) pour la créer.`,
    );
  }

  // The structural-edit lock, the same line `feedbackFormsAdmin.ts` draws: what a
  // question MEANS is frozen once it has been answered, what it READS is not.
  // Wording stays editable on purpose, so a typo can be corrected on documents
  // already rendered.
  const answered = before?._count.answers ?? 0;
  if (before && answered > 0 && params.kind && params.kind !== before.kind) {
    throw new OperationRefusedError(
      `« ${key} » a déjà ${answered} réponse(s) enregistrée(s) : son type ne peut plus changer, sinon ces réponses deviennent illisibles. Créez une nouvelle question sous une autre clé.`,
    );
  }

  const options = params.options ?? null;
  if (options) {
    if (kind === 'rating' || kind === 'text') {
      throw new OperationRefusedError(
        `Une question de type « ${kind} » ne prend pas d'options.`,
      );
    }
    const seen = new Set<string>();
    for (const o of options) {
      const value = o.value.trim();
      if (!value || !o.label.trim()) {
        throw new OperationRefusedError(
          'Chaque option a besoin de sa valeur stable et de son libellé français.',
        );
      }
      if (seen.has(value)) {
        throw new OperationRefusedError(
          `L'option « ${value} » est déclarée deux fois dans « ${key} ».`,
        );
      }
      seen.add(value);
      if (o.tone && !isChoiceTone(o.tone)) {
        throw new OperationRefusedError(
          `« ${o.tone} » n'est pas une valence connue. Valeurs acceptées : ${CHOICE_TONES.join(', ')}. Une option catégorielle n'en prend pas.`,
        );
      }
      if (o.icon && !isChoiceIconToken(o.icon)) {
        throw new OperationRefusedError(
          `« ${o.icon} » n'est pas un pictogramme connu. Valeurs acceptées : ${CHOICE_ICON_TOKENS.join(', ')}.`,
        );
      }
    }
    if (before && answered > 0) {
      const kept = new Set(options.map((o) => o.value.trim()));
      const answeredValues = await prisma.closing_Option.findMany({
        where: { questionId: before.id, answerOptions: { some: {} } },
        select: { value: true },
      });
      const lost = answeredValues
        .map((o) => o.value)
        .filter((v) => !kept.has(v));
      if (lost.length > 0) {
        throw new OperationRefusedError(
          `Ces options de « ${key} » ont déjà été choisies par des élèves et ne peuvent pas disparaître : ${lost.join(', ')}. Renommer leur libellé est possible ; retirer la valeur ne l'est pas.`,
        );
      }
    }
  }

  if (kind === 'rating' && (params.max ?? before?.max ?? 0) < 1) {
    throw new OperationRefusedError(
      `Une question de type « rating » a besoin de « max », le haut de son barème.`,
    );
  }

  // The same lock again, on the one field of a rating that carries meaning: a
  // barème may be raised, and may be lowered, but never below a note already
  // given. A 4 recorded on 5 does not become a 4 on 3 - it becomes a note
  // outside its own scale, which the conduct form then refuses on every
  // autosave, so the closing holding it can no longer be saved or clôturé.
  if (kind === 'rating' && before && answered > 0) {
    const highest = await prisma.closing_Answer.aggregate({
      where: { questionId: before.id },
      _max: { ratingValue: true },
    });
    const recorded = highest._max.ratingValue ?? 0;
    const max = params.max ?? before.max ?? 0;
    if (max < recorded) {
      throw new OperationRefusedError(
        `« ${key} » a déjà reçu la note ${recorded} : son barème ne peut pas descendre à ${max}, sinon cette réponse sort de son échelle. Créez une nouvelle question sous une autre clé pour changer d'échelle.`,
      );
    }
  }

  const data = {
    label,
    kind,
    hint: params.hint?.trim() || null,
    max: kind === 'rating' ? (params.max ?? before?.max ?? null) : null,
    maxLength:
      kind === 'text' ? (params.maxLength ?? before?.maxLength ?? null) : null,
    placeholder: params.placeholder?.trim() || null,
    notePlaceholder: params.notePlaceholder?.trim() || null,
    testimonial: params.testimonial ?? before?.testimonial ?? false,
    retiredAt: params.retired ? (before?.retiredAt ?? new Date()) : null,
  };

  await prisma.$transaction(async (tx) => {
    const row = await tx.closing_Question.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
      select: { id: true },
    });
    if (!options) return;
    const kept = options.map((o) => o.value.trim());
    await tx.closing_Option.deleteMany({
      where: {
        questionId: row.id,
        ...(kept.length ? { value: { notIn: kept } } : {}),
      },
    });
    for (const [position, o] of options.entries()) {
      const value = o.value.trim();
      const optionData = {
        position,
        label: o.label.trim(),
        tone: o.tone?.trim() || null,
        icon: o.icon?.trim() || null,
      };
      await tx.closing_Option.upsert({
        where: { questionId_value: { questionId: row.id, value } },
        create: { questionId: row.id, value, ...optionData },
        update: optionData,
      });
    }
  });

  const after = await prisma.closing_Question.findUnique({
    where: { key },
    select: QUESTION_STATE_SELECT,
  });

  return {
    applied: true,
    before: questionState(
      before && { ...before, id: undefined, _count: undefined },
    ),
    after: questionState(after),
  };
}

type SectionInput = {
  title: string;
  synthesisPosition?: number;
  questions: {
    questionKey: string;
    labelOverride?: string;
    withNote?: boolean;
  }[];
};

const TEMPLATE_STATE_SELECT = {
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
          question: { select: { key: true } },
        },
      },
    },
  },
} as const;

/**
 * Compose a grid, under the dry-run-then-apply contract.
 *
 * Two-step because the composition is replaced wholesale, and nothing else
 * checks what it is replacing. Two authors edited grids within the same hour on
 * one database during the MCP recette, and the model working from a read taken
 * seven minutes earlier said so itself: its next write would have carried that
 * stale composition back over the other author's, silently, with only the audit
 * row to say it ever happened.
 *
 * `runTwoStep` recomputes the plan from live data and compares digests, so the
 * apply is refused when the grid has moved since the plan was shown - and the
 * refusal names the fresh digest, so the recovery is to look again rather than
 * to retry. It also earns its keep on the first authoring: the plan IS the
 * preview a human validates before the questions every future closing asks
 * change under them.
 *
 * `write_closing_question` is deliberately NOT two-step. It edits one bank row
 * by key, its `options` are patch-like (omit them and they stand), and the edits
 * that would destroy meaning are already refused once answers exist. What is
 * left to overwrite is a label, which re-renders everywhere and is visible.
 */
export async function writeClosingTemplate(params: {
  templateKey: string;
  label: string;
  sections: SectionInput[];
  planDigest?: string;
}): Promise<WriteOutcome> {
  const key = params.templateKey.trim();
  const label = params.label.trim();
  if (!key || !label) {
    throw new OperationRefusedError(
      "Une grille a besoin d'une clé stable et d'un libellé français.",
    );
  }
  if (params.sections.length === 0) {
    throw new OperationRefusedError(
      'Une grille sans section ne pose aucune question. Donnez-lui au moins une section avec une question.',
    );
  }

  const wanted = params.sections.flatMap((s) =>
    s.questions.map((q) => q.questionKey.trim()),
  );
  if (wanted.length === 0) {
    throw new OperationRefusedError(
      'Une grille sans question ne peut pas être menée.',
    );
  }
  const duplicates = wanted.filter((k, i) => wanted.indexOf(k) !== i);
  if (duplicates.length > 0) {
    throw new OperationRefusedError(
      `Une grille ne peut poser deux fois la même question : ${[...new Set(duplicates)].join(', ')}.`,
    );
  }

  const bank = await prisma.closing_Question.findMany({
    where: { key: { in: wanted } },
    select: { id: true, key: true, testimonial: true, retiredAt: true },
  });
  const byKey = new Map(bank.map((q) => [q.key, q]));
  const missing = wanted.filter((k) => !byKey.has(k));
  if (missing.length > 0) {
    throw new OperationRefusedError(
      `Ces questions n'existent pas dans la banque : ${missing.join(', ')}. Créez-les avec write_closing_question, ou reprenez une clé existante. ${handleProvenanceFr('closingQuestionKey')}`,
    );
  }
  const retired = wanted.filter((k) => byKey.get(k)?.retiredAt);
  if (retired.length > 0) {
    throw new OperationRefusedError(
      `Ces questions ont été retirées et ne peuvent plus entrer dans une grille : ${retired.join(', ')}. Elles restent lisibles sur les closings passés.`,
    );
  }
  const testimonials = wanted.filter((k) => byKey.get(k)?.testimonial);
  if (testimonials.length > 1) {
    throw new OperationRefusedError(
      `Une grille ne peut destiner qu'une seule question à être citée, et celle-ci en compte ${testimonials.length} : ${testimonials.join(', ')}.`,
    );
  }

  // What the grid would become, in the shape the stored one reads back in, so
  // the dry run's `writes` and the apply's `after` are the same document.
  const writes = {
    key,
    label,
    sections: params.sections.map((s) => ({
      title: s.title.trim(),
      synthesisPosition: s.synthesisPosition ?? null,
      questions: s.questions.map((q) => ({
        labelOverride: q.labelOverride?.trim() || null,
        withNote: q.withNote ?? false,
        question: { key: q.questionKey.trim() },
      })),
    })),
  };

  return runTwoStep({
    requestedDigest: params.planDigest,
    // Read inside the plan, never before it: the digest has to describe the grid
    // as it stands at the moment of the call, which is what makes a concurrent
    // edit between the two calls fail instead of being overwritten.
    buildPlan: async () => ({
      replaces: await prisma.closing_Template.findUnique({
        where: { key },
        select: TEMPLATE_STATE_SELECT,
      }),
      writes,
    }),
    apply: async (plan) => {
      await applyComposition();
      const after = await prisma.closing_Template.findUnique({
        where: { key },
        select: TEMPLATE_STATE_SELECT,
      });
      return { before: plan.replaces, after };
    },
  });

  async function applyComposition() {
    await prisma.$transaction(async (tx) => {
      const template = await tx.closing_Template.upsert({
        where: { key },
        create: { key, label },
        update: { label },
        select: { id: true },
      });
      // The composition is replaced wholesale rather than diffed: it is a handful
      // of rows, a diff would only add a way to get it wrong, and the answers do
      // not hang off these rows - they reference the bank question, so nothing a
      // student said is touched by recomposing a grid.
      await tx.closing_TemplateSection.deleteMany({
        where: { templateId: template.id },
      });
      for (const [position, s] of params.sections.entries()) {
        const section = await tx.closing_TemplateSection.create({
          data: {
            templateId: template.id,
            position,
            synthesisPosition: s.synthesisPosition ?? null,
            title: s.title.trim(),
          },
          select: { id: true },
        });
        for (const [qPosition, q] of s.questions.entries()) {
          const bankQuestion = byKey.get(q.questionKey.trim());
          if (!bankQuestion) continue;
          await tx.closing_TemplateQuestion.create({
            data: {
              templateId: template.id,
              sectionId: section.id,
              questionId: bankQuestion.id,
              position: qPosition,
              labelOverride: q.labelOverride?.trim() || null,
              withNote: q.withNote ?? false,
            },
          });
        }
      }
    });
  }
}

async function eventClosingState(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      titre: true,
      closingTemplate: { select: { key: true, label: true } },
    },
  });
  if (!event) return null;
  return {
    event: event.titre,
    grid: event.closingTemplate
      ? {
          templateKey: event.closingTemplate.key,
          label: event.closingTemplate.label,
        }
      : null,
  };
}

export async function writeEventClosingTemplate(params: {
  eventId: string;
  closingTemplateId?: string;
}): Promise<WriteOutcome> {
  const before = await eventClosingState(params.eventId);
  if (!before) {
    throw new OperationRefusedError(
      `Événement « ${params.eventId} » introuvable. ${handleProvenanceFr('eventId')}`,
    );
  }

  // `?? null` on a possibly-empty string would keep "" and fail the FK; the
  // intent of an omitted or blank id is "this event holds no closings".
  const templateId = params.closingTemplateId?.trim() || null;
  if (templateId) {
    const exists = await prisma.closing_Template.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (!exists) {
      throw new OperationRefusedError(
        `Grille de closing « ${templateId} » introuvable. ${handleProvenanceFr('closingTemplateId')}`,
      );
    }
  }

  await prisma.event.update({
    where: { id: params.eventId },
    data: { closingTemplateId: templateId },
  });

  return {
    applied: true,
    before,
    after: await eventClosingState(params.eventId),
  };
}
