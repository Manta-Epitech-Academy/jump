import {
  deriveOnboardingStatus,
  describeOnboardingProgress,
  ONBOARDING_STEP_LABELS,
  type TalentOnboardingFields,
} from './talentOnboarding';

/**
 * The dev-facing "Recommandations" list on a talent fiche. Pure derivation from
 * the talent's current state — each recommendation is a short bold title plus a
 * one-sentence suggested action (call the student, contact the parents, plan the
 * interview, invite to an event). Kept in `domain/` so it is testable without
 * prisma and shared between the page load and any future cohort-level view.
 *
 * Recommendations auto-appear and auto-disappear: there is no stored state, the
 * list is recomputed from the talent on every load, so the moment a condition
 * stops holding (règlement signed, interview done) its recommendation drops off.
 *
 * Two INDEPENDENT groups make up the list:
 *   1. The readiness funnel (never connected → onboarding not done → parent
 *      signatures pending) — mutually exclusive: a talent sits at exactly one
 *      rung, so we surface only the first unmet gate, or none once ready.
 *   2. Opportunity / action recommendations (plan the interview, invite to an
 *      event for an interest) — each shows on its own condition, regardless of
 *      where the talent is in the funnel. An event opportunity is actionable the
 *      moment the talent picks the interest; it is not blocked by a missing
 *      parent signature, so it must not hide behind the funnel.
 */

export type TalentRecommendationSeverity = 'urgent' | 'info';

/**
 * Who the dev should reach out to. The fiche surfaces that person's phone (or
 * email as a fallback) as a copyable value, so the recommendation only needs to
 * name the audience, not carry the contact details. `null` = no contact panel
 * (the action is the dev's own, e.g. plan an interview, invite to an event).
 */
export type TalentRecommendationContact = 'parent' | 'student' | null;

export type TalentRecommendation = {
  id: string;
  severity: TalentRecommendationSeverity;
  /** Short bold lead, rendered inline before the message. */
  shortTitle: string;
  message: string;
  contact: TalentRecommendationContact;
};

export type TalentRecommendationInput = TalentOnboardingFields & {
  /** The talent's first name, already capitalized — used to address them by name. */
  prenom: string;
  /** Whether the talent ever logged in (an oldest `bauth_session` exists). */
  connected: boolean;
  /**
   * Règlement intérieur compliance: guardian co-signed online
   * (`parentRulesSignedAt`) or staff attested the offline equivalent
   * (`stageCompliance.charteSigned`). See `isRulesCompliant`.
   */
  rulesCompliant: boolean;
  /** Image-rights decision settled by the guardian (accepted or refused). */
  imageRightsDecided: boolean;
  /** A completed orientation interview exists for this talent. */
  hasCompletedInterview: boolean;
  /**
   * Verbatim event-opportunity messages: one per tech interest the student
   * picked that carries an `Interest.recommendationMessage`. Each may contain a
   * `{prenom}` token, substituted here. Capped at 2 by the onboarding form's
   * tech-interest limit.
   */
  techRecommendationMessages: string[];
};

/**
 * The readiness funnel rung the talent is on, or `null` once they are fully
 * ready. The three rungs are successive onboarding steps, so only the first
 * unmet one is ever surfaced.
 */
function deriveFunnelRecommendation(
  t: TalentRecommendationInput,
): TalentRecommendation | null {
  if (!t.connected) {
    return {
      id: 'never-connected',
      severity: 'urgent',
      shortTitle: 'Jamais connecté',
      message: `${t.prenom} ne s'est jamais connecté sur la plateforme. Vous pouvez l'appeler pour lui signaler qu'on lui a envoyé un mail.`,
      contact: 'student',
    };
  }

  if (deriveOnboardingStatus(t) !== 'done') {
    const { step, completed, total, phase } = describeOnboardingProgress(t);
    const where =
      phase === 'not-started'
        ? ' (onboarding non démarré)'
        : step
          ? ` (à l'étape ${completed + 1}/${total} · ${ONBOARDING_STEP_LABELS[step]})`
          : '';
    return {
      id: 'onboarding-blocked',
      severity: 'urgent',
      shortTitle: 'Onboarding non finalisé',
      message: `${t.prenom} s'est connecté mais n'a pas finalisé son onboarding${where}. Il y a peut-être un blocage, vous pouvez le contacter pour identifier le problème.`,
      contact: 'student',
    };
  }

  if (!(t.rulesCompliant && t.imageRightsDecided)) {
    // The two parent acts are independent booleans, so name exactly the one(s)
    // still outstanding. Today the parent flow gates the image decision behind
    // the règlement signature, so "rules pending while image done" should not
    // occur, but this stays correct without relying on that distant invariant.
    const message =
      !t.rulesCompliant && !t.imageRightsDecided
        ? "Les parents doivent encore signer le règlement intérieur et le droit à l'image. Vous pouvez les contacter."
        : t.rulesCompliant
          ? "Le règlement intérieur est signé, mais le droit à l'image n'a pas encore été signé par les parents. Vous pouvez les contacter."
          : "Le droit à l'image est signé, mais le règlement intérieur n'a pas encore été signé par les parents. Vous pouvez les contacter.";
    return {
      id: 'parent-pending',
      severity: 'urgent',
      shortTitle: 'Signatures parents en attente',
      message,
      contact: 'parent',
    };
  }

  return null;
}

export function deriveTalentRecommendations(
  t: TalentRecommendationInput,
): TalentRecommendation[] {
  const recommendations: TalentRecommendation[] = [];

  // Readiness funnel: at most one rung (urgent), surfaced first.
  const funnelRec = deriveFunnelRecommendation(t);
  if (funnelRec) recommendations.push(funnelRec);

  // Opportunities: evaluated independently of the funnel. The interview only
  // needs the talent to be reachable (connected), not the dossier complete — a
  // parent signature has no bearing on planning an orientation interview.
  if (t.connected && !t.hasCompletedInterview) {
    recommendations.push({
      id: 'interview-todo',
      severity: 'info',
      shortTitle: 'Entretien à planifier',
      message:
        "Vous n'avez pas encore réalisé l'entretien d'orientation pour ce stagiaire. Pensez à le planifier dans votre calendrier.",
      contact: null,
    });
  }

  // Event opportunities: naturally data-gated — only talents who reached the
  // interests step have any, so a never-connected talent surfaces none. The
  // action is "invite the student", so surface the student's contact to act on.
  t.techRecommendationMessages.forEach((message, i) => {
    recommendations.push({
      id: `event-opportunity:${i}`,
      severity: 'info',
      shortTitle: 'Opportunité événement',
      message: message.replaceAll('{prenom}', t.prenom),
      contact: 'student',
    });
  });

  return recommendations;
}
