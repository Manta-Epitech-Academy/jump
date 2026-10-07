// Authoring feedback forms over the API: writing one whole, and copying one.
//
// The builder at /staff/admin/feedback-forms edits a form one field at a time;
// this states it whole, which is the shape a conversation produces ("the same
// form as last year, with these two questions reworded"). Both doors apply the
// same rules, read from `domain/feedbackForms/authoring.ts`: once a form has
// responses, what its questions MEAN is frozen and what they READ is not.
//
// There is deliberately no delete. The catalogue read returns form ids, so a
// delete tool would be something a model could aim on its own, which is class C.
// A form is retired by archiving it; deleting an unanswered draft stays in the
// builder, a click away.
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  formIntegrityProblems,
  referenceProblems,
  structuralChanges,
  STRUCTURE_LOCKED_MESSAGE,
  allQuestions,
  type AuthoredForm,
  type AuthoredQuestion,
} from '$lib/domain/feedbackForms/authoring';
import type {
  IdentityField,
  InputKind,
  QuestionType,
} from '$lib/domain/feedbackForms/schema';
import type { FormStatusValue } from '$lib/domain/feedbackForms/status';
import {
  readFeedbackFormContent,
  authoredFormOf,
  type FeedbackFormContent,
} from '$lib/server/feedbackForms/content';
import {
  copyRemotePersonaIcon,
  newPersonaIconKey,
} from '$lib/server/feedbackForms/personaIcon';
import { createForm, duplicateForm } from '$lib/server/feedbackFormsAdmin';
import {
  RemoteImageRefusal,
  swapStoredImages,
} from '$lib/server/images/remote';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import { UnknownScopeError } from '../scope';
import {
  planDigest,
  runTwoStep,
  StalePlanError,
  type WriteOutcome,
} from '../plan';

type OptionInput = {
  optionId?: string | null;
  label: string;
  kind: 'choice' | 'extra';
  reaction?: string | null;
};

type QuestionInput = {
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  identityField?: IdentityField | null;
  inputKind?: InputKind | null;
  minSelections?: number | null;
  maxSelections?: number | null;
  placeholder?: string | null;
  options: OptionInput[];
};

export type FeedbackFormWrite = {
  formId?: string;
  title: string;
  intro?: string | null;
  outro?: string | null;
  personaName?: string | null;
  /** Absent: the icon stays as it is. Null: back to the default mascot. */
  personaIconUrl?: string | null;
  status: FormStatusValue;
  allowsAuthenticatedAccess: boolean;
  allowsPublicAccess: boolean;
  dashboardNudge: boolean;
  questions: QuestionInput[];
  sections: {
    sectionId?: string | null;
    title: string;
    intro?: string | null;
    questions: QuestionInput[];
  }[];
  planDigest?: string;
};

/** The persona icon columns a write sets, or nothing when the icon stays. */
type IconChange = {
  personaIconKey?: string | null;
  personaIconSourceUrl?: string | null;
};

/** An omitted optional field and an explicit null mean the same: none. */
const orNull = <T>(value: T | null | undefined): T | null => value ?? null;

function authoredQuestion(q: QuestionInput): AuthoredQuestion {
  return {
    key: q.key,
    prompt: q.prompt,
    type: q.type,
    required: q.required,
    identityField: orNull(q.identityField),
    inputKind: orNull(q.inputKind),
    minSelections: orNull(q.minSelections),
    maxSelections: orNull(q.maxSelections),
    placeholder: orNull(q.placeholder),
    options: q.options.map((o) => ({
      optionId: orNull(o.optionId),
      label: o.label,
      kind: o.kind,
      reaction: orNull(o.reaction),
    })),
  };
}

function authoredForm(params: FeedbackFormWrite): AuthoredForm {
  return {
    title: params.title,
    intro: orNull(params.intro),
    outro: orNull(params.outro),
    personaName: orNull(params.personaName),
    status: params.status,
    allowsAuthenticatedAccess: params.allowsAuthenticatedAccess,
    allowsPublicAccess: params.allowsPublicAccess,
    dashboardNudge: params.dashboardNudge,
    questions: params.questions.map(authoredQuestion),
    sections: params.sections.map((s) => ({
      sectionId: orNull(s.sectionId),
      title: s.title,
      intro: orNull(s.intro),
      questions: s.questions.map(authoredQuestion),
    })),
  };
}

/** Every refusal of one kind in one message, so a single retry can fix them all. */
function refuse(opening: string, problems: string[]): never {
  throw new OperationRefusedError(`${opening} ${problems.join(' ')}`);
}

/**
 * The staff profile behind the call, for the form's author and last editor. Null
 * when the token belongs to no profile: those two columns are a courtesy shown
 * in the builder, and the audit row names the caller whatever happens here.
 */
async function staffIdOf(actorUserId: string): Promise<string | null> {
  const staff = await prisma.staffProfile.findUnique({
    where: { userId: actorUserId },
    select: { id: true },
  });
  return staff?.id ?? null;
}

type FormPlan = {
  /** The form as it stands, or null for a form this call creates. */
  replaces: FeedbackFormContent | null;
  /** What it will be: the authored form, and where its icon will come from. */
  writes: AuthoredForm & { personaIcon: { sourceUrl: string | null } | null };
};

async function buildFormPlan(
  params: FeedbackFormWrite,
  wanted: AuthoredForm,
): Promise<FormPlan> {
  const current = params.formId
    ? await readFeedbackFormContent(prisma, params.formId)
    : null;
  if (params.formId && !current) {
    throw new UnknownScopeError(
      `Formulaire « ${params.formId} » introuvable. ${handleProvenanceFr('formId')}`,
    );
  }

  const references = referenceProblems(
    current && authoredFormOf(current),
    wanted,
  );
  if (references.length > 0) {
    refuse(
      'Des identifiants ne désignent rien dans ce formulaire.',
      references,
    );
  }

  if (current?.locked) {
    const changes = structuralChanges(authoredFormOf(current), wanted);
    if (changes.length > 0) {
      throw new OperationRefusedError(
        `${STRUCTURE_LOCKED_MESSAGE} Il en a ${current.submissions}, et cette écriture changerait le sens de celles-ci : ${changes.join(' ; ')}. ` +
          "Pour faire évoluer sa structure, copiez-le avec write_feedback_form_copy, écrivez la copie, puis archivez l'original. Les textes et les réglages, eux, restent modifiables ici.",
      );
    }
  }

  const personaIcon =
    params.personaIconUrl === undefined
      ? (current?.personaIcon ?? null)
      : params.personaIconUrl === null
        ? null
        : { sourceUrl: params.personaIconUrl };

  return { replaces: current, writes: { ...wanted, personaIcon } };
}

/**
 * Write the form's settings and structure to exactly `wanted`, inside the
 * caller's transaction. Rows are matched by identity (a question by its key, a
 * section and an option by their id); positions are recomputed from the order
 * of the arrays, the way the builder lays a form out.
 */
async function writeContent(
  tx: Prisma.TransactionClient,
  formId: string,
  wanted: AuthoredForm,
  current: FeedbackFormContent,
  icon: IconChange,
  staffId: string | null,
): Promise<void> {
  await tx.feedback_Form.update({
    where: { id: formId },
    data: {
      title: wanted.title,
      intro: wanted.intro,
      outro: wanted.outro,
      personaName: wanted.personaName,
      status: wanted.status,
      allowsAuthenticatedAccess: wanted.allowsAuthenticatedAccess,
      allowsPublicAccess: wanted.allowsPublicAccess,
      dashboardNudge: wanted.dashboardNudge,
      updatedById: staffId,
      ...icon,
    },
  });

  // Sections first, so every question below has a section id to point at.
  const keptSections = new Set(
    wanted.sections.map((s) => s.sectionId).filter((id) => id !== null),
  );
  await tx.feedback_Section.deleteMany({
    where: {
      formId,
      id: {
        in: current.sections
          .map((s) => s.sectionId!)
          .filter((id) => !keptSections.has(id)),
      },
    },
  });
  const sectionIds: string[] = [];
  for (const [position, s] of wanted.sections.entries()) {
    const data = { position, title: s.title, intro: s.intro };
    if (s.sectionId) {
      await tx.feedback_Section.update({ where: { id: s.sectionId }, data });
      sectionIds.push(s.sectionId);
    } else {
      const created = await tx.feedback_Section.create({
        data: { formId, ...data },
        select: { id: true },
      });
      sectionIds.push(created.id);
    }
  }

  // Questions dropped from the form go before any is written, which frees their
  // keys for a question that takes one over.
  const wantedKeys = new Set(allQuestions(wanted).map((q) => q.key));
  await tx.feedback_Question.deleteMany({
    where: { formId, key: { notIn: [...wantedKeys] } },
  });

  const placed = [
    ...wanted.questions.map((q) => ({ q, sectionId: null as string | null })),
    ...wanted.sections.flatMap((s, i) =>
      s.questions.map((q) => ({ q, sectionId: sectionIds[i] })),
    ),
  ];
  for (const [position, { q, sectionId }] of placed.entries()) {
    const fields = {
      position,
      sectionId,
      prompt: q.prompt,
      type: q.type,
      required: q.required,
      identityField: q.identityField,
      inputKind: q.inputKind,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      placeholder: q.placeholder,
    };
    const question = await tx.feedback_Question.upsert({
      where: { formId_key: { formId, key: q.key } },
      update: fields,
      create: { formId, key: q.key, ...fields },
      select: { id: true },
    });

    const keptOptions = q.options
      .map((o) => o.optionId)
      .filter((id) => id !== null);
    await tx.feedback_QuestionOption.deleteMany({
      where: { questionId: question.id, id: { notIn: keptOptions } },
    });
    for (const [optionPosition, o] of q.options.entries()) {
      const data = {
        position: optionPosition,
        label: o.label,
        kind: o.kind,
        reaction: o.reaction,
      };
      if (o.optionId) {
        await tx.feedback_QuestionOption.update({
          where: { id: o.optionId },
          data,
        });
      } else {
        await tx.feedback_QuestionOption.create({
          data: { questionId: question.id, ...data },
        });
      }
    }
  }
}

/**
 * Create a form or replace one whole, under the dry-run-then-apply contract.
 *
 * Two-step for the reason a closing grid is: the form is replaced whole, so an
 * apply built on a stale read would carry it back over a colleague's edit, or
 * over a response that arrived in between and locked the structure. The plan is
 * also the preview a human validates before talents see the change.
 *
 * All or nothing. A persona icon that cannot be copied refuses the whole write
 * before anything is stored; the form and its icon then change in one
 * transaction (`swapStoredImages`); and a form this call created is removed
 * again if what follows its creation fails, so a retry never leaves a second,
 * half-written copy behind.
 */
export async function writeFeedbackForm(
  params: FeedbackFormWrite,
  actorUserId: string,
): Promise<WriteOutcome> {
  const wanted = authoredForm(params);
  const problems = formIntegrityProblems(wanted);
  if (problems.length > 0) {
    refuse("Ce formulaire n'est pas enregistrable en l'état.", problems);
  }

  return runTwoStep({
    requestedDigest: params.planDigest,
    buildPlan: () => buildFormPlan(params, wanted),
    apply: async (plan) => {
      const staffId = await staffIdOf(actorUserId);

      // Downloaded before anything is written, and only when the address is
      // not the one the stored icon came from, so restating it costs nothing.
      const iconUrl = params.personaIconUrl;
      let iconBytes: Uint8Array | null = null;
      if (iconUrl && iconUrl !== plan.replaces?.personaIcon?.sourceUrl) {
        try {
          iconBytes = await copyRemotePersonaIcon(new URL(iconUrl));
        } catch (err) {
          if (!(err instanceof RemoteImageRefusal)) throw err;
          throw new OperationRefusedError(
            `L'icône du persona (${iconUrl}) ${err.message}. Le formulaire n'a pas changé.`,
          );
        }
      }

      const created = plan.replaces
        ? null
        : await createForm(staffId, { title: wanted.title });
      const formId = plan.replaces?.formId ?? created!.id;
      const iconKey = iconBytes ? newPersonaIconKey(formId) : null;

      try {
        const after = await swapStoredImages({
          next:
            iconBytes && iconKey
              ? [{ key: iconKey, bytes: iconBytes, contentType: 'image/webp' }]
              : [],
          commit: async (tx) => {
            // Serialises writers of this form, then checks nobody changed it
            // since the plan was shown: the digest was compared before this
            // transaction opened, and a response arriving in the gap would
            // otherwise let a structural edit through on a locked form.
            await tx.$executeRaw`SELECT 1 FROM "Feedback_Form" WHERE id = ${formId} FOR UPDATE`;
            const live = (await readFeedbackFormContent(tx, formId))!;
            if (
              plan.replaces &&
              planDigest(live) !== planDigest(plan.replaces)
            ) {
              throw new StalePlanError(
                "Le formulaire a changé pendant l'application : rien n'a été écrit. Relancez la simulation, vérifiez ce qui a bougé, puis appliquez avec la nouvelle empreinte.",
              );
            }

            const { personaIconKey: previousKey } =
              await tx.feedback_Form.findUniqueOrThrow({
                where: { id: formId },
                select: { personaIconKey: true },
              });
            const icon: IconChange =
              iconUrl === undefined
                ? {}
                : iconUrl === null
                  ? { personaIconKey: null, personaIconSourceUrl: null }
                  : iconKey
                    ? { personaIconKey: iconKey, personaIconSourceUrl: iconUrl }
                    : {};
            const replaced =
              previousKey && 'personaIconKey' in icon ? [previousKey] : [];

            await writeContent(tx, formId, wanted, live, icon, staffId);
            return {
              replaced,
              result: (await readFeedbackFormContent(tx, formId))!,
            };
          },
        });
        return {
          before: plan.replaces,
          after,
          answer: { formId, form: after },
        };
      } catch (err) {
        if (created) {
          await prisma.feedback_Form
            .delete({ where: { id: created.id } })
            .catch(() => {});
        }
        throw err;
      }
    },
  });
}

/**
 * Copy a form whole into a new draft, persona icon included, with none of its
 * responses. What the builder's « Dupliquer » does, and the way out of the
 * structural lock: a copy has no responses, so it can be restructured freely.
 */
export async function copyFeedbackForm(
  params: { formId: string },
  actorUserId: string,
): Promise<WriteOutcome> {
  const source = await prisma.feedback_Form.findUnique({
    where: { id: params.formId },
    select: { id: true },
  });
  if (!source) {
    throw new UnknownScopeError(
      `Formulaire « ${params.formId} » introuvable. ${handleProvenanceFr('formId')}`,
    );
  }

  const staffId = await staffIdOf(actorUserId);
  const copy = await duplicateForm(staffId, source.id);
  const after = (await readFeedbackFormContent(prisma, copy.id))!;
  return {
    applied: true,
    before: null,
    after,
    answer: { formId: copy.id, copiedFrom: source.id, form: after },
  };
}
