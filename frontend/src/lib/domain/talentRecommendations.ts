import {
  deriveOnboardingStatus,
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
 * Who the dev should reach out to, surfaced on the fiche as that person's
 * copyable contact. How it renders depends on the recommendation `kind`: a
 * `funnel` nudge shows the single fastest reach (phone, email as fallback),
 * while an `opportunity` shows both email and phone. `null` = no contact panel
 * (the action is the dev's own, e.g. plan an interview).
 */
export type TalentRecommendationContact = 'parent' | 'student' | null;

/**
 * Which of the two groups (see the module doc) this recommendation belongs to:
 * `funnel` = a readiness gate, an urgent single nudge to unblock the dossier;
 * `opportunity` = an action to engage the talent (plan the interview, invite to
 * an event). It drives how the contact panel renders — a funnel nudge wants the
 * one fastest way to reach the person, an opportunity surfaces every channel.
 */
export type TalentRecommendationKind = 'funnel' | 'opportunity';

export type TalentRecommendation = {
  id: string;
  kind: TalentRecommendationKind;
  severity: TalentRecommendationSeverity;
  /** Short bold lead, rendered inline before the message. */
  shortTitle: string;
  message: string;
  contact: TalentRecommendationContact;
};

export type TalentRecommendationInput = TalentOnboardingFields & {
  /** The talent's first name, already capitalized — used to address them by name. */
  prenom: string;
  /**
   * Student's login email — named in the "jamais connecté" reco when present.
   * Nullable: an SF-imported talent can lack one (and, having no auth identity,
   * can never log in), so the reco omits the clause rather than render a blank.
   */
  email: string | null;
  /** Guardian's email — named in the "signatures parents" reco. */
  parentEmail: string | null;
  /**
   * Public app origin (`env.ORIGIN`, e.g. https://jump.epiboost.fr in prod) —
   * named in the "jamais connecté" reco so the dev can point the student at it.
   * Passed in (not read from env) to keep this module pure/testable.
   */
  appUrl: string;
  /**
   * Configured sender address (parsed from `MAIL_FROM`) — named in the parent
   * reco so the dev can tell the parents which address the mail came from.
   */
  senderEmail: string;
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
      kind: 'funnel',
      severity: 'urgent',
      shortTitle: 'Jamais connecté',
      message: `Contactez ${t.prenom} car il/elle ne s'est jamais connecté(e)${t.email ? ` avec son email **${t.email}**` : ''} sur la plateforme ${t.appUrl}`,
      contact: 'student',
    };
  }

  if (deriveOnboardingStatus(t) !== 'done') {
    return {
      id: 'onboarding-blocked',
      kind: 'funnel',
      severity: 'urgent',
      shortTitle: '1ère connexion en cours',
      message: `Contactez ${t.prenom} pour lui conseiller d'utiliser le support de la plateforme, chat bleu en bas à droite, qui va l'accompagner pour finaliser sa première connexion : le parcours d'onboarding.`,
      contact: 'student',
    };
  }

  if (!(t.rulesCompliant && t.imageRightsDecided)) {
    return {
      id: 'parent-pending',
      kind: 'funnel',
      severity: 'urgent',
      shortTitle: 'Signatures parents',
      message: `Contactez les parents de ${t.prenom} pour les informer qu'ils ont reçu un mail sur leur adresse ${t.parentEmail ? `**${t.parentEmail}**` : 'e-mail'} de la part de **${t.senderEmail}** pour signer électroniquement les documents complémentaires du stage : le droit à l'image et le règlement intérieur.`,
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
      kind: 'opportunity',
      severity: 'info',
      shortTitle: 'Entretien à planifier',
      message: `Vous n'avez pas encore réalisé l'entretien d'orientation de ${t.prenom}. Pensez à le planifier dans votre calendrier.`,
      contact: null,
    });
  }

  // Event opportunities: naturally data-gated — only talents who reached the
  // interests step have any, so a never-connected talent surfaces none. The
  // action is "invite the student", so surface the student's contact to act on.
  t.techRecommendationMessages.forEach((message, i) => {
    recommendations.push({
      id: `event-opportunity:${i}`,
      kind: 'opportunity',
      severity: 'info',
      shortTitle: 'Opportunité',
      message: message.replaceAll('{prenom}', t.prenom),
      contact: 'student',
    });
  });

  return recommendations;
}
