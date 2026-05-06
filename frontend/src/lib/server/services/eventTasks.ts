import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import type { LifecycleBounds } from '$lib/domain/eventLifecycle';
import { EVENT_TYPES } from '$lib/domain/event';

/**
 * Single source of truth for actionable items derived from event state.
 *
 * Used by:
 *   - the dev workspace dashboard ("À traiter" panel) — aggregated across
 *     events overlapping the current week
 *   - the per-event Vue d'ensemble Alerts panel — single event scope
 *
 * Each alert is self-describing: title, description, count, severity, href.
 * Callers render them as `TaskQueueItem` rows.
 */

export type AlertSeverity = 'info' | 'warning' | 'danger';

export type EventAlertKind =
  | 'missing-mantas'
  | 'missing-planning'
  | 'unassigned-slots'
  | 'interviews-today'
  | 'interviews-overdue'
  | 'conventions-to-chase'
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

/**
 * Derive every actionable alert for a single event.
 *
 * Returns an empty array when the event has nothing pressing. Coding-club
 * events skip the stage-specific document/onboarding checks; stage_seconde
 * events surface the full set.
 */
export async function deriveEventAlerts(
  db: ScopedPrismaClient,
  event: EventForAlerts,
  ctx: DeriveAlertsContext,
): Promise<EventAlert[]> {
  const alerts: EventAlert[] = [];
  const eventBase = `${ctx.basePath}/events/${event.id}`;
  const isStage = event.eventType === EVENT_TYPES.STAGE_SECONDE;

  // — Generic event-state alerts (apply to both stage and coding-club) —

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

  if (mantaCount === 0) {
    alerts.push({
      key: `missing-mantas-${event.id}`,
      kind: 'missing-mantas',
      eventId: event.id,
      eventTitre: event.titre,
      title: 'Équipe pédagogique non assignée',
      description: `${event.titre} — aucun manta`,
      severity: 'warning',
      href: `${eventBase}/team`,
    });
  }

  const slotCount = planningWithCounts?._count.timeSlots ?? 0;
  if (slotCount === 0) {
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
  } else {
    const unassigned = planningWithCounts?.timeSlots.length ?? 0;
    if (unassigned > 0) {
      alerts.push({
        key: `unassigned-slots-${event.id}`,
        kind: 'unassigned-slots',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Créneaux à assigner',
        description: `${event.titre} — créneaux sans activité`,
        count: unassigned,
        severity: 'warning',
        href: `${eventBase}/planning`,
      });
    }
  }

  // — Stage-specific alerts —

  if (isStage && totalParticipations > 0) {
    const [
      conventionsToChase,
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
            { stageCompliance: { conventionSigned: false } },
          ],
        },
      }),
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
          participation: { eventId: event.id },
          status: 'planned',
          date: { gte: ctx.bounds.startOfDay, lte: ctx.bounds.endOfDay },
          ...(ctx.forStaffProfileId ? { staffId: ctx.forStaffProfileId } : {}),
        },
      }),
      db.interview.count({
        where: {
          participation: { eventId: event.id },
          status: 'planned',
          date: { lt: ctx.bounds.startOfDay },
        },
      }),
    ]);

    const suiviHref = `${eventBase}/suivi-adm`;
    const interviewsHref = `${eventBase}/interviews`;
    const inscritsHref = `${eventBase}/inscrits`;

    if (conventionsToChase > 0) {
      alerts.push({
        key: `conventions-${event.id}`,
        kind: 'conventions-to-chase',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Conventions de stage à signer',
        description: 'Relancer les inscrits sans convention reçue',
        count: conventionsToChase,
        severity: 'warning',
        href: suiviHref,
      });
    }
    if (chartesToChase > 0) {
      alerts.push({
        key: `chartes-${event.id}`,
        kind: 'chartes-to-chase',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Chartes informatiques à signer',
        description: 'Relancer les inscrits sans charte signée',
        count: chartesToChase,
        severity: 'info',
        href: suiviHref,
      });
    }
    if (imageRightsToChase > 0) {
      alerts.push({
        key: `image-rights-${event.id}`,
        kind: 'image-rights-to-chase',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Droits à l’image à recueillir',
        description: 'Relancer les parents pour la signature',
        count: imageRightsToChase,
        severity: 'info',
        href: suiviHref,
      });
    }
    if (pcMissing > 0) {
      alerts.push({
        key: `pc-${event.id}`,
        kind: 'pc-missing',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Ordinateurs à confirmer',
        description: 'Inscrits sans PC personnel confirmé',
        count: pcMissing,
        severity: 'info',
        href: suiviHref,
      });
    }
    if (talentsNeverLogged > 0) {
      alerts.push({
        key: `never-logged-${event.id}`,
        kind: 'talents-never-logged',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Inscrits jamais connectés',
        description: 'Talents qui ne se sont pas encore connectés à Jump',
        count: talentsNeverLogged,
        severity: 'danger',
        href: `${inscritsHref}?filter=never-logged`,
      });
    }
    if (talentsProfileIncomplete > 0) {
      alerts.push({
        key: `profile-incomplete-${event.id}`,
        kind: 'talents-profile-incomplete',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Onboarding plateforme incomplet',
        description: 'Talents bloqués avant le tableau de bord élève',
        count: talentsProfileIncomplete,
        severity: 'warning',
        href: `${inscritsHref}?filter=profile-incomplete`,
      });
    }
    if (overdueInterviews > 0) {
      alerts.push({
        key: `interviews-overdue-${event.id}`,
        kind: 'interviews-overdue',
        eventId: event.id,
        eventTitre: event.titre,
        title: 'Entretiens en retard',
        description: 'Reprogrammer ou marquer comme terminés',
        count: overdueInterviews,
        severity: 'danger',
        href: interviewsHref,
      });
    }
    if (interviewsToday > 0) {
      alerts.push({
        key: `interviews-today-${event.id}`,
        kind: 'interviews-today',
        eventId: event.id,
        eventTitre: event.titre,
        title: ctx.forStaffProfileId
          ? 'Vos entretiens du jour'
          : 'Entretiens à mener aujourd’hui',
        description: 'Préparer la grille avant chaque entretien',
        count: interviewsToday,
        severity: 'info',
        href: interviewsHref,
      });
    }
  }

  return alerts;
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
