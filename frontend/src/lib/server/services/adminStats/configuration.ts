/**
 * Configuration state, read back: one event in full, a campus at a glance, and
 * the two catalogues (feedback forms, event presets) whose ids the write
 * operations need.
 *
 * That last point is why the catalogues are here at all rather than "nice to
 * have". This tier hands out no ids a caller could not otherwise obtain, so a
 * write that takes a form id or a preset name is unusable until something
 * returns them. A read that exists to make a write addressable is part of the
 * write's design, not padding.
 *
 * Everything is built on `EventService.listAdminEvents`, the same view model the
 * admin events cockpit renders, so readiness means on this API exactly what it
 * means on the screen.
 */

import { prisma } from '$lib/server/db';
import { EventService } from '$lib/server/services/events';
import { EventConfigTemplateService } from '$lib/server/services/eventConfigTemplates';
import {
  EVENT_MODULE_DEFS,
  EVENT_MODULE_KEYS,
  type EventModuleKey,
} from '$lib/domain/eventModules';
import {
  EVENT_CONFIG_STATE_LABELS,
  EVENT_CONFIG_STATE_HINTS,
  eventMissingConfig,
  isEventToPrepare,
} from '$lib/domain/eventReadiness';
import { getStaffRoleLabel } from '$lib/domain/staff';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import { UnknownScopeError, type Scope } from '$lib/server/adminApi/scope';
import { handleProvenanceFr } from '$lib/server/adminApi/handles';
import { scopedEvents, scopeLabels } from './cohort';

// ── One event, in full ───────────────────────────────────────────────────────

export type ModuleState = {
  module: EventModuleKey;
  label: string;
  enabled: boolean;
  /** Sub-options as stored, defaulted; null when the module is off. */
  settings: unknown;
};

export type EventDetail = {
  event: Metric<{
    id: string;
    salesforceName: string;
    publicName: string;
    cohortNoun: string | null;
    campus: string;
    dateLabel: string;
    startTime: string;
    endDate: string;
    schoolYear: string;
    status: string;
    syncedFromSalesforce: boolean;
  }>;
  configState: Metric<{ state: string; label: string; hint: string }>;
  missing: Metric<string[]>;
  modules: Metric<ModuleState[]>;
  feedbackForm: Metric<{ id: string; title: string; status: string } | null>;
  participants: Metric;
};

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  const all = await EventService.listAdminEvents();
  const event = all.find((e) => e.id === eventId);
  if (!event) {
    throw new UnknownScopeError(
      `Événement « ${eventId} » introuvable. ${handleProvenanceFr('eventId')}`,
    );
  }

  const form = event.feedbackFormId
    ? await prisma.feedback_Form.findUnique({
        where: { id: event.feedbackFormId },
        select: { id: true, title: true, status: true },
      })
    : null;

  return {
    event: metric(
      {
        id: event.id,
        salesforceName: event.titre,
        publicName: event.publicName,
        cohortNoun: event.cohortNoun,
        campus: event.campusName,
        dateLabel: event.dateLabel,
        startTime: event.startTime,
        endDate: event.endDate,
        schoolYear: event.schoolYearLabel,
        status: event.status,
        syncedFromSalesforce: event.synced,
      },
      "Identité de l'événement. « salesforceName » est le nom de la campagne Salesforce, « publicName » celui que voient les équipes et les talents ; vide, ce dernier laisse place au premier. « startTime » et « endDate » appartiennent à Jump : Salesforce ne les fournit pas.",
    ),
    configState: metric(
      {
        state: event.configState,
        label: EVENT_CONFIG_STATE_LABELS[event.configState],
        hint: EVENT_CONFIG_STATE_HINTS[event.configState],
      },
      "État de configuration de l'événement, tel que l'affiche la page Événements de l'espace admin.",
    ),
    missing: metric(
      eventMissingConfig(event),
      "Ce qu'il reste à renseigner pour que l'événement soit visible dans l'espace dev. Liste vide = rien ne manque.",
    ),
    modules: metric(
      EVENT_MODULE_KEYS.map((key) => ({
        module: key,
        label: EVENT_MODULE_DEFS[key].label,
        enabled: event.modules.includes(key),
        settings: event.moduleSettings[key] ?? null,
      })),
      "Les sections de l'espace dev, activées ou non, avec leurs sous-options. Une section désactivée n'apparaît pas du tout pour les équipes sur cet événement.",
    ),
    feedbackForm: metric(
      form,
      "Le formulaire de bilan rattaché à cet événement, ou null s'il n'y en a pas : la section bilan reste alors masquée. Un formulaire en brouillon est rattaché mais ne peut pas encore recevoir de réponse.",
    ),
    participants: metric(
      event.participations,
      `Inscriptions à cet événement, ${VISIBLE_PARTICIPATION_DEFINITION}.`,
    ),
  };
}

// ── One campus, at a glance ──────────────────────────────────────────────────

export type CampusRow = {
  campus: string;
  events: number;
  visible: number;
  /**
   * Configured but hidden. Returned because without it the row does not add up:
   * `visible` needs both the activation gate and a section, while the `modules`
   * tally below counts the section alone, so a campus with 25 configured events
   * and 2 activated ones read as a contradiction with nothing naming the 23.
   */
  readyToPublish: number;
  unconfigured: number;
  toPrepare: number;
  participants: number;
  staff: { role: string; label: string; count: number }[];
  modules: { module: EventModuleKey; label: string; events: number }[];
};

export type CampusOverview = {
  filters: { schoolYear: string; campus: string };
  campuses: Metric<CampusRow[]>;
};

export async function getCampusOverview(
  scope: Scope = {},
): Promise<CampusOverview> {
  const [{ events }, staff, campuses] = await Promise.all([
    scopedEvents(scope),
    prisma.staffProfile.groupBy({
      by: ['campusId', 'staffRole'],
      _count: { _all: true },
    }),
    prisma.campus.findMany({
      where: scope.campus ? { id: scope.campus.id } : {},
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const rows: CampusRow[] = campuses.map((campus) => {
    const own = events.filter((e) => e.campusId === campus.id);
    const moduleCounts = new Map<EventModuleKey, number>();
    for (const event of own) {
      for (const key of event.modules) {
        moduleCounts.set(key, (moduleCounts.get(key) ?? 0) + 1);
      }
    }
    return {
      campus: campus.name,
      events: own.length,
      visible: own.filter((e) => e.configState === 'shown').length,
      readyToPublish: own.filter((e) => e.configState === 'ready').length,
      unconfigured: own.filter((e) => e.configState === 'unconfigured').length,
      // The shared predicate, not a fourth spelling of it: this was the only site
      // in the repository that rewrote it inline instead of importing it.
      toPrepare: own.filter(isEventToPrepare).length,
      participants: own.reduce((sum, e) => sum + e.participations, 0),
      staff: staff
        .filter((s) => s.campusId === campus.id && s.staffRole)
        .map((s) => ({
          role: s.staffRole as string,
          label: getStaffRoleLabel(s.staffRole),
          count: s._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      modules: EVENT_MODULE_KEYS.filter((key) => moduleCounts.has(key)).map(
        (key) => ({
          module: key,
          label: EVENT_MODULE_DEFS[key].label,
          events: moduleCounts.get(key) ?? 0,
        }),
      ),
    };
  });

  return {
    filters: {
      schoolYear: scopeLabels(scope).schoolYear,
      campus: scopeLabels(scope).campus,
    },
    campuses: metric(
      rows,
      "Par campus : ses événements sur le périmètre, répartis entre « visible » (activé et pourvu d'au moins une section), « readyToPublish » (configuré mais encore masqué) et « unconfigured » (aucune section activée) : la somme des trois fait le total. « toPrepare » compte, parmi eux, ceux qui ne sont pas passés et ne sont pas encore visibles : c'est ce qui demande une action, et ce n'est donc pas l'écart entre le total et « visible ». « modules » compte les événements où chaque section est activée, sans tenir compte de l'activation, donc il inclut les événements configurés mais masqués : c'est pourquoi ce décompte peut largement dépasser « visible ». Un événement pourvu de quatre sections compte une fois dans chacune des quatre lignes. Les effectifs d'équipe sont ceux d'aujourd'hui, ils ne dépendent pas de l'année scolaire demandée.",
    ),
  };
}

// ── Catalogues ───────────────────────────────────────────────────────────────

export type FormRow = {
  formId: string;
  title: string;
  status: string;
  questions: number;
  submissions: number;
  attachedEvents: number;
  openToPublic: boolean;
};

export type FeedbackForms = { forms: Metric<FormRow[]> };

export async function getFeedbackForms(): Promise<FeedbackForms> {
  const rows = await prisma.feedback_Form.findMany({
    orderBy: [{ status: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      title: true,
      status: true,
      allowsPublicAccess: true,
      _count: { select: { questions: true, submissions: true, events: true } },
    },
  });

  return {
    forms: metric(
      rows.map((form) => ({
        formId: form.id,
        title: form.title,
        status: form.status,
        questions: form._count.questions,
        submissions: form._count.submissions,
        attachedEvents: form._count.events,
        openToPublic: form.allowsPublicAccess,
      })),
      "Les formulaires de bilan existants. « status » vaut brouillon, publié ou archivé : seul un formulaire publié peut recevoir des réponses. « attachedEvents » compte les événements qui l'utilisent, « formId » est l'identifiant à passer aux opérations qui lisent ses résultats ou le rattachent à un événement.",
    ),
  };
}

export type TemplateRow = {
  name: string;
  description: string | null;
  publicName: string | null;
  cohortNoun: string | null;
  startTime: string;
  modules: EventModuleKey[];
  feedbackFormId: string | null;
};

export type EventTemplates = { templates: Metric<TemplateRow[]> };

export async function getEventTemplates(): Promise<EventTemplates> {
  const rows = await EventConfigTemplateService.list();

  return {
    templates: metric(
      rows.map((template) => ({
        name: template.name,
        description: template.description,
        publicName: template.publicName,
        cohortNoun: template.cohortNoun,
        startTime: template.startTime,
        modules: template.modules,
        feedbackFormId: template.feedbackFormId,
      })),
      "Les modèles de configuration enregistrés, et ce que chacun applique à un événement. Un modèle est une copie prise à un instant donné : l'appliquer recopie ces réglages, et l'événement ne reste pas lié au modèle ensuite. Le nom est ce qui l'identifie.",
    ),
  };
}
