import type { ImageRightsDecision } from './imageRights';
import { isImageRightsCompliant, isRulesCompliant } from './stageCompliance';
import {
  deriveOnboardingStatus,
  describeOnboardingProgress,
  ONBOARDING_STEP_LABELS,
  type TalentOnboardingFields,
} from './talentOnboarding';

/**
 * The dev-facing "à faire" list on a talent fiche. Pure derivation from the
 * talent's current state — each todo names a concrete gap plus the action that
 * closes it (call the parent, relance the talent). Kept in `domain/` so it is
 * testable without prisma and shared between the page load and any future
 * cohort-level "who needs chasing" view.
 *
 * This is intentionally a SECONDARY surface on the fiche: the talent (banner +
 * interests) is the star; the todo list is the utilitarian "if anything is
 * missing, here's what to do" panel.
 */

export type TalentTodoSeverity = 'urgent' | 'info';

/**
 * Who the dev should reach out to. The fiche surfaces that person's email +
 * phone as copyable values (no canned-relance button), so the action only
 * needs to name the audience, not carry the contact details.
 */
export type TalentTodoContact = 'parent' | 'student' | null;

export type TalentTodo = {
  id: string;
  severity: TalentTodoSeverity;
  title: string;
  detail?: string;
  contact: TalentTodoContact;
};

export type TalentTodoInput = TalentOnboardingFields & {
  parentRulesSignedAt: Date | string | null;
  imageRightsDecision: ImageRightsDecision | null;
  /** Offline-attested règlement signature on the active stage participation. */
  charteSigned: boolean | null | undefined;
  /** Number of mails actually sent to this talent (broadcast channel). */
  mailsSent: number;
  /** Whether any sent mail was opened. */
  hasOpenedAnyMail: boolean;
};

export function deriveTalentTodos(t: TalentTodoInput): TalentTodo[] {
  const todos: TalentTodo[] = [];

  // Dossier blockers (readiness gaps) — the legal guardian is the actor.
  if (!isRulesCompliant(t.parentRulesSignedAt, t.charteSigned)) {
    todos.push({
      id: 'rules',
      severity: 'urgent',
      title: "Le règlement intérieur n'est pas signé",
      detail: 'Co-signature du représentant légal en attente.',
      contact: 'parent',
    });
  }

  if (!isImageRightsCompliant(t.imageRightsDecision)) {
    todos.push({
      id: 'image-rights',
      severity: 'urgent',
      title: "Le droit à l'image n'est pas tranché",
      detail: 'Le parent doit autoriser ou refuser la captation.',
      contact: 'parent',
    });
  }

  // Engagement nudges — reach out to the talent.
  if (deriveOnboardingStatus(t) !== 'done') {
    const { step, completed, total, phase } = describeOnboardingProgress(t);
    const detail =
      phase === 'not-started'
        ? 'Onboarding non démarré.'
        : step
          ? `Bloqué à l'étape ${completed + 1}/${total} · ${ONBOARDING_STEP_LABELS[step]}.`
          : undefined;
    todos.push({
      id: 'onboarding',
      severity: 'info',
      title: "Le talent n'a pas terminé son onboarding",
      detail,
      contact: 'student',
    });
  }

  if (t.mailsSent > 0 && !t.hasOpenedAnyMail) {
    todos.push({
      id: 'unopened-mail',
      severity: 'info',
      title: "Le talent n'a jamais ouvert nos mails",
      detail: `${t.mailsSent} mail${t.mailsSent > 1 ? 's' : ''} envoyé${
        t.mailsSent > 1 ? 's' : ''
      }, aucun ouvert.`,
      contact: 'student',
    });
  }

  // Urgent (dossier blockers) before info (nudges); stable within a tier.
  return todos.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'urgent' ? -1 : 1,
  );
}
