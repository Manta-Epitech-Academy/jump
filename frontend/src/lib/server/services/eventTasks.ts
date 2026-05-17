import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import type { LifecycleBounds } from '$lib/domain/eventLifecycle';
import { EVENT_TYPES } from '$lib/domain/event';

/**
 * Single source of truth for event-state items derived from DB facts.
 *
 * Two output models on top of the same fact-loader:
 *   - `deriveEventAlerts` — actionable items only (count > 0). Used by the
 *     ongoing-stage panel and the workspace "À traiter" weekly aggregator.
 *   - `deriveEventChecklist` — exhaustive preparation items with done/undone
 *     state. Used by the pre-stage `PreparationView`.
 *
 * Auto-resolution: an item flips to `done` as soon as the underlying count
 * drops to zero (Salesforce/Jump remain the single source of truth — devs
 * never check items manually).
 */

export type AlertSeverity = 'info' | 'warning' | 'danger';

export type EventAlertKind =
  | 'missing-mantas'
  | 'missing-planning'
  | 'unassigned-slots'
  | 'interviews-today'
  | 'interviews-overdue'
  | 'chartes-to-chase'
  | 'image-rights-to-chase'
  | 'pc-missing'
  | 'talents-never-logged'
  | 'talents-profile-incomplete';

export type EventAlert = {
  key: string;
  kind: EventAlertKind;
  eventId: string;
  eventTitre: string;
  title: string;
  description: string;
  count?: number;
  severity: AlertSeverity;
  href: string;
};

export type ChecklistItemKind = Exclude<
  EventAlertKind,
  'interviews-today' | 'interviews-overdue'
>;

export type ChecklistGroup = 'team' | 'onboarding' | 'documents';

export type ChecklistItem = {
  key: string;
  kind: ChecklistItemKind;
  group: ChecklistGroup;
  title: string;
  meta: string;
  done: boolean;
  severity: AlertSeverity;
  href: string;
};

export type DeriveAlertsContext = {
  /** Workspace base path — e.g. `/staff/dev`. Used to build hrefs. */
  basePath: string;
  /** Lifecycle bounds (today's start/end + now). */
  bounds: LifecycleBounds;
  /**
   * Optional staffProfileId — when set, "interviews today" only counts
   * interviews assigned to that staff member (per-user inbox view).
   * When omitted, counts all today's planned interviews on the event.
   */
  forStaffProfileId?: string;
};

type EventForAlerts = {
  id: string;
  titre: string;
  eventType: string;
};

type EventFacts = {
  isStage: boolean;
  totalParticipations: number;
  mantaCount: number;
  slotCount: number;
  unassignedSlots: number;
  chartesToChase: number;
  imageRightsToChase: number;
  pcMissing: number;
  talentsNeverLogged: number;
  talentsProfileIncomplete: number;
  interviewsToday: number;
  overdueInterviews: number;
};

/**
 * Load all the counts that drive both alerts and checklist in one pass.
 * Stage-only counts default to 0 for non-stages and empty cohorts so callers
 * never need to branch on event type.
 */
async function loadEventFacts(
  db: ScopedPrismaClient,
  event: EventForAlerts,
  ctx: DeriveAlertsContext,
): Promise<EventFacts> {
  const isStage = event.eventType === EVENT_TYPES.STAGE_SECONDE;

  const [mantaCount, planningWithCounts, totalParticipations] =
    await Promise.all([
      db.eventManta.count({ where: { eventId: event.id } }),
      db.planning.findUnique({
        where: { eventId: event.id },
        select: {
          _count: { select: { timeSlots: true } },
          timeSlots: {
            where: { activity: { is: null } },
            select: { id: true },
          },
        },
      }),
      db.participation.count({ where: { eventId: event.id } }),
    ]);

  const slotCount = planningWithCounts?._count.timeSlots ?? 0;
  const unassignedSlots =
    slotCount === 0 ? 0 : (planningWithCounts?.timeSlots.length ?? 0);

  const baseFacts = {
    isStage,
    totalParticipations,
    mantaCount,
    slotCount,
    unassignedSlots,
    chartesToChase: 0,
    imageRightsToChase: 0,
    pcMissing: 0,
    talentsNeverLogged: 0,
    talentsProfileIncomplete: 0,
    interviewsToday: 0,
    overdueInterviews: 0,
  };

  if (!isStage || totalParticipations === 0) return baseFacts;

  // `forStaffProfileId` narrows both interview counts to the actor's own
  // assignments. Applied symmetrically so that when the event dashboard
  // renders the per-staff lens ("Vos entretiens du jour"), the sibling
  // "Entretiens en retard" alert doesn't suddenly switch back to an
  // event-wide tally — staff would see "2 today / 47 overdue" and parse
  // it as their own 47.
  const interviewBaseWhere = {
    participation: { eventId: event.id },
    status: 'planned' as const,
    ...(ctx.forStaffProfileId ? { staffId: ctx.forStaffProfileId } : {}),
  };

  const [
    chartesToChase,
    imageRightsToChase,
    pcMissing,
    talentsNeverLogged,
    talentsProfileIncomplete,
    interviewsToday,
    overdueInterviews,
  ] = await Promise.all([
    db.participation.count({
      where: {
        eventId: event.id,
        OR: [
          { stageCompliance: null },
          { stageCompliance: { charteSigned: false } },
        ],
      },
    }),
    db.participation.count({
      where: {
        eventId: event.id,
        OR: [
          { stageCompliance: null },
          { stageCompliance: { imageRightsSigned: false } },
        ],
      },
    }),
    db.participation.count({
      where: { eventId: event.id, bringPc: false },
    }),
    db.participation.count({
      where: { eventId: event.id, talent: { lastActiveAt: null } },
    }),
    db.participation.count({
      where: {
        eventId: event.id,
        OR: [
          { talent: { infoValidatedAt: null } },
          { talent: { rulesSignedAt: null } },
          { talent: { charterAcceptedAt: null } },
        ],
      },
    }),
    db.interview.count({
      where: {
        ...interviewBaseWhere,
        date: { gte: ctx.bounds.startOfDay, lte: ctx.bounds.endOfDay },
      },
    }),
    db.interview.count({
      where: {
        ...interviewBaseWhere,
        date: { lt: ctx.bounds.startOfDay },
      },
    }),
  ]);

  return {
    ...baseFacts,
    chartesToChase,
    imageRightsToChase,
    pcMissing,
    talentsNeverLogged,
    talentsProfileIncomplete,
    interviewsToday,
    overdueInterviews,
  };
}

/**
 * Derive every actionable alert for a single event (count > 0 only).
 * Coding-club events skip the stage-specific document/onboarding checks.
 */
export async function deriveEventAlerts(
  db: ScopedPrismaClient,
  event: EventForAlerts,
  ctx: DeriveAlertsContext,
): Promise<EventAlert[]> {
  const facts = await loadEventFacts(db, event, ctx);
  const eventBase = `${ctx.basePath}/events/${event.id}`;
  const alerts: EventAlert[] = [];

  if (facts.mantaCount === 0) {
    alerts.push({
      key: `missing-mantas-${event.id}`,
      kind: 'missing-mantas',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Intervenants non assignés',
      description: `${event.titre} — aucun manta`,
      severity: 'warning',
      href: `${eventBase}/team`,
    });
  }

  if (facts.slotCount === 0) {
    alerts.push({
      key: `missing-planning-${event.id}`,
      kind: 'missing-planning',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Planning à construire',
      description: `${event.titre} — aucun créneau`,
      severity: 'warning',
      href: `${eventBase}/planning`,
    });
  } else if (facts.unassignedSlots > 0) {
    alerts.push({
      key: `unassigned-slots-${event.id}`,
      kind: 'unassigned-slots',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Créneaux à assigner',
      description: `${event.titre} — créneaux sans activité`,
      count: facts.unassignedSlots,
      severity: 'warning',
      href: `${eventBase}/planning`,
    });
  }

  if (!facts.isStage || facts.totalParticipations === 0) return alerts;

  const interviewsHref = `${eventBase}/interviews`;
  const inscritsHref = `${eventBase}/inscrits`;
  const onboardingHref = `${eventBase}/onboarding`;

  if (facts.chartesToChase > 0) {
    alerts.push({
      key: `chartes-${event.id}`,
      kind: 'chartes-to-chase',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Règlements intérieurs à valider',
      description: 'Cocher dans Onboarding dès réception du document signé',
      count: facts.chartesToChase,
      severity: 'info',
      href: `${onboardingHref}?filter=charte-missing`,
    });
  }
  if (facts.imageRightsToChase > 0) {
    alerts.push({
      key: `image-rights-${event.id}`,
      kind: 'image-rights-to-chase',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Droits à l’image à valider',
      description:
        'Cocher dans Onboarding dès réception du document signé par les parents',
      count: facts.imageRightsToChase,
      severity: 'info',
      href: `${onboardingHref}?filter=image-rights-missing`,
    });
  }
  if (facts.pcMissing > 0) {
    alerts.push({
      key: `pc-${event.id}`,
      kind: 'pc-missing',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Matériel à prévoir',
      description:
        'Inscrits sans PC personnel — prévoir un poste pour le stage',
      count: facts.pcMissing,
      severity: 'info',
      href: `${onboardingHref}?filter=pc-missing`,
    });
  }
  if (facts.talentsNeverLogged > 0) {
    alerts.push({
      key: `never-logged-${event.id}`,
      kind: 'talents-never-logged',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Inscrits jamais connectés',
      description: 'Talents qui ne se sont pas encore connectés à Jump',
      count: facts.talentsNeverLogged,
      severity: 'danger',
      href: `${inscritsHref}?filter=never-logged`,
    });
  }
  if (facts.talentsProfileIncomplete > 0) {
    alerts.push({
      key: `profile-incomplete-${event.id}`,
      kind: 'talents-profile-incomplete',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Onboarding plateforme incomplet',
      description: 'Talents bloqués avant le tableau de bord élève',
      count: facts.talentsProfileIncomplete,
      severity: 'warning',
      href: `${inscritsHref}?filter=profile-incomplete`,
    });
  }
  if (facts.overdueInterviews > 0) {
    alerts.push({
      key: `interviews-overdue-${event.id}`,
      kind: 'interviews-overdue',
      eventId: event.id,
      eventTitre: event.titre,
      title: ctx.forStaffProfileId
        ? 'Vos entretiens en retard'
        : 'Entretiens en retard',
      description: 'Reprogrammer ou marquer comme terminés',
      count: facts.overdueInterviews,
      severity: 'danger',
      href: interviewsHref,
    });
  }
  if (facts.interviewsToday > 0) {
    alerts.push({
      key: `interviews-today-${event.id}`,
      kind: 'interviews-today',
      eventId: event.id,
      eventTitre: event.titre,
      title: ctx.forStaffProfileId
        ? 'Vos entretiens du jour'
        : 'Entretiens à mener aujourd’hui',
      description: 'Préparer la grille avant chaque entretien',
      count: facts.interviewsToday,
      severity: 'info',
      href: interviewsHref,
    });
  }

  return alerts;
}

/**
 * Derive the exhaustive pre-stage checklist for a single event.
 *
 * Items are emitted regardless of state, with `done` flipping to true as soon
 * as the underlying count resolves. Callers render done items struck through
 * (closure feedback) and undone items as actionable rows.
 *
 * Coding-club events get only the team/planning trio — the stage-specific
 * document and onboarding checks don't apply.
 */
export async function deriveEventChecklist(
  db: ScopedPrismaClient,
  event: EventForAlerts,
  ctx: DeriveAlertsContext,
): Promise<ChecklistItem[]> {
  const facts = await loadEventFacts(db, event, ctx);
  const eventBase = `${ctx.basePath}/events/${event.id}`;
  const items: ChecklistItem[] = [];

  // — Group: équipe & planning —

  items.push({
    key: `missing-mantas-${event.id}`,
    kind: 'missing-mantas',
    group: 'team',
    title: 'Intervenants assignés',
    meta:
      facts.mantaCount > 0
        ? `${facts.mantaCount} manta${facts.mantaCount > 1 ? 's' : ''} confirmé${facts.mantaCount > 1 ? 's' : ''}`
        : 'Aucun manta — assigner depuis Intervenants',
    done: facts.mantaCount > 0,
    severity: 'warning',
    href: `${eventBase}/team`,
  });

  items.push({
    key: `missing-planning-${event.id}`,
    kind: 'missing-planning',
    group: 'team',
    title: 'Planning du stage publié',
    meta:
      facts.slotCount > 0
        ? `${facts.slotCount} créneau${facts.slotCount > 1 ? 'x' : ''} planifié${facts.slotCount > 1 ? 's' : ''}`
        : 'Aucun créneau — construire le planning',
    done: facts.slotCount > 0,
    severity: 'warning',
    href: `${eventBase}/planning`,
  });

  items.push({
    key: `unassigned-slots-${event.id}`,
    kind: 'unassigned-slots',
    group: 'team',
    title: 'Tous les créneaux ont une activité',
    meta:
      facts.slotCount === 0
        ? 'En attente du planning'
        : facts.unassignedSlots === 0
          ? `${facts.slotCount} créneau${facts.slotCount > 1 ? 'x' : ''} avec activité`
          : `${facts.unassignedSlots} créneau${facts.unassignedSlots > 1 ? 'x' : ''} sans activité`,
    done: facts.slotCount > 0 && facts.unassignedSlots === 0,
    severity: 'warning',
    href: `${eventBase}/planning`,
  });

  if (!facts.isStage || facts.totalParticipations === 0) return items;

  const inscritsHref = `${eventBase}/inscrits`;
  const onboardingHref = `${eventBase}/onboarding`;
  const total = facts.totalParticipations;

  // — Group: onboarding plateforme —

  items.push({
    key: `never-logged-${event.id}`,
    kind: 'talents-never-logged',
    group: 'onboarding',
    title: 'Tous les inscrits se sont connectés à Jump',
    meta:
      facts.talentsNeverLogged === 0
        ? `${total}/${total} actifs sur la plateforme`
        : `${facts.talentsNeverLogged} jamais connecté${facts.talentsNeverLogged > 1 ? 's' : ''}`,
    done: facts.talentsNeverLogged === 0,
    severity: 'danger',
    href: `${inscritsHref}?filter=never-logged`,
  });

  items.push({
    key: `profile-incomplete-${event.id}`,
    kind: 'talents-profile-incomplete',
    group: 'onboarding',
    title: 'Onboarding plateforme complet',
    meta:
      facts.talentsProfileIncomplete === 0
        ? `${total}/${total} profils complets`
        : `${facts.talentsProfileIncomplete} profil${facts.talentsProfileIncomplete > 1 ? 's' : ''} incomplet${facts.talentsProfileIncomplete > 1 ? 's' : ''}`,
    done: facts.talentsProfileIncomplete === 0,
    severity: 'warning',
    href: `${inscritsHref}?filter=profile-incomplete`,
  });

  // — Group: documents administratifs —

  items.push({
    key: `chartes-${event.id}`,
    kind: 'chartes-to-chase',
    group: 'documents',
    title: 'Règlements intérieurs validés dans Onboarding',
    meta:
      facts.chartesToChase === 0
        ? `${total}/${total} cochées`
        : `${facts.chartesToChase} à cocher dans Onboarding`,
    done: facts.chartesToChase === 0,
    severity: 'info',
    href: `${onboardingHref}?filter=charte-missing`,
  });

  items.push({
    key: `image-rights-${event.id}`,
    kind: 'image-rights-to-chase',
    group: 'documents',
    title: 'Droits à l’image validés dans Onboarding',
    meta:
      facts.imageRightsToChase === 0
        ? `${total}/${total} cochés`
        : `${facts.imageRightsToChase} à cocher dans Onboarding`,
    done: facts.imageRightsToChase === 0,
    severity: 'info',
    href: `${onboardingHref}?filter=image-rights-missing`,
  });

  items.push({
    key: `pc-${event.id}`,
    kind: 'pc-missing',
    group: 'documents',
    title: 'Matériel prévu pour les inscrits sans PC',
    meta:
      facts.pcMissing === 0
        ? `${total}/${total} ont un PC personnel`
        : `${facts.pcMissing} sans PC personnel — prévoir un poste`,
    done: facts.pcMissing === 0,
    severity: 'info',
    href: `${onboardingHref}?filter=pc-missing`,
  });

  return items;
}

/**
 * Aggregate alerts across every event overlapping the current week.
 * Used by the workspace dashboard's "À traiter" panel.
 */
export async function deriveWorkspaceAlerts(
  db: ScopedPrismaClient,
  events: EventForAlerts[],
  ctx: DeriveAlertsContext,
): Promise<EventAlert[]> {
  const perEvent = await Promise.all(
    events.map((ev) => deriveEventAlerts(db, ev, ctx)),
  );
  return perEvent.flat();
}
