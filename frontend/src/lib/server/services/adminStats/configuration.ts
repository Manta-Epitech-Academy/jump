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
import {
  HIDDEN_PARTICIPATION_DEFINITION,
  SYNCED_PARTICIPATION_DEFINITION,
  VISIBLE_PARTICIPATION_DEFINITION,
} from '$lib/domain/sfMemberStatus';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import { CERTIFICATE_TOKENS } from '$lib/domain/diplomas';
import { WORKSHOP_XP_PER_MINUTE } from '$lib/domain/xp';
import type { WorkshopCoverKind } from '$lib/domain/workshops';
import { dbDateToKey } from '$lib/domain/eventPresence';
import { isHighlightOpen } from '$lib/domain/talentHome';
import { UnknownScopeError, type Scope } from '$lib/server/adminApi/scope';
import { handleProvenanceFr } from '$lib/server/adminApi/handles';
import { STRUCTURE_LOCKED_MESSAGE } from '$lib/domain/feedbackForms/authoring';
import {
  readFeedbackFormContent,
  type FeedbackFormContent,
} from '$lib/server/feedbackForms/content';
import { hiddenEnrolmentsByEvent, scopedEvents, scopeLabels } from './cohort';

// ── The certificate catalogue ────────────────────────────────────────────────

export type DiplomaTemplateRow = {
  templateId: string;
  code: string;
  label: string;
  pageWidthPx: number;
  pageHeightPx: number;
  attachedEvents: number;
};

/** The design itself, returned only when one certificate is asked for by code. */
export type DiplomaTemplateDesign = {
  styleCss: string;
  bodyHtml: string;
};

export type DiplomaTemplates = {
  templates: Metric<DiplomaTemplateRow[]>;
  design: Metric<DiplomaTemplateDesign | null>;
  placeholders: Metric<{ token: string; description: string }[]>;
  authoring: Metric<string[]>;
};

/**
 * What an author needs to know to write a design, returned rather than documented
 * elsewhere: the same reason `scopeVocabulary` ships the campus names, namely that
 * discovery should not have to be a deliberate error.
 */
const AUTHORING_CONTRACT = [
  "« bodyHtml » est le contenu d'UNE page, répété pour chaque inscrit ; « styleCss » est inséré une seule fois dans l'en-tête du document. Ne mettez pas de balise <style> dans bodyHtml : répéter la feuille de style à chaque page est ce qui a déjà fait expirer un rendu de 200 pages.",
  'Le document est rendu sans aucun accès réseau. Aucune image, police ou feuille de style distante ne peut être chargée : utilisez des data: URI. Les polices de la charte sont déjà là (Anton pour les titres, IBM Plex Sans pour le texte, en romain et en italique).',
  "Les éléments décoratifs (formes, cadres, sceaux, personnages, motifs) se dessinent en SVG, directement dans bodyHtml : tracés, dégradés, masques, filtres, <use> de ses propres id, et texte, qui reçoit les polices de la charte. Préférez-le aux formes construites en CSS (clip-path, ombres empilées, dégradés répétés) : c'est plus court à écrire et plus léger à imprimer. Pas de <foreignObject>, d'animation, de script ni de référence externe.",
  "Chaque enregistrement indique ce qu'une page ajoute au PDF exporté et le poids du fichier pour une grande cohorte. Rien n'est refusé sur ce poids, mais un effet que l'impression convertit en image (flou, filtre, ombre floue) se paie à chaque page : quand le rendu est équivalent, préférez un dégradé ou un SVG.",
  'Le logo Epitech est disponible en CSS via var(--epitech-logo), à utiliser comme background-image. Sa taille est à vous.',
  'Les signatures du campus sont posées par le repère {signatures}, qui produit un bloc par signataire avec les classes sig-block, sig-img, sig-img-0 (puis 1, 2...), sig-line, sig-name et sig-role. Le style de ces classes vous appartient ; les images, non.',
  'La pagination et la taille de page sont appliquées APRÈS votre CSS et ne peuvent pas être surchargées : réglez les dimensions avec pageWidthPx et pageHeightPx (1123x794 pour un A4 paysage). Utilisez la classe .page si vous devez peindre le fond de la page.',
  "Le titre du document fait partie du design : écrivez-le dans bodyHtml. Le champ « label » ne sert qu'à nommer le certificat pour les équipes et le fichier téléchargé.",
];

export async function getDiplomaTemplates(params: {
  code?: string;
}): Promise<DiplomaTemplates> {
  const rows = await prisma.diploma_Template.findMany({
    orderBy: { label: 'asc' },
    select: {
      id: true,
      code: true,
      label: true,
      pageWidthPx: true,
      pageHeightPx: true,
      _count: { select: { events: true } },
    },
  });

  // Asked for one certificate: hand back its design so it can be edited rather
  // than rewritten from scratch. Withheld from the list, where N designs would be
  // tens of kilobytes nobody asked for.
  let design: DiplomaTemplateDesign | null = null;
  if (params.code) {
    const wanted = await prisma.diploma_Template.findUnique({
      where: { code: params.code },
      select: { styleCss: true, bodyHtml: true },
    });
    if (!wanted) {
      throw new UnknownScopeError(
        `Certificat « ${params.code} » introuvable. Les codes existants sont : ${rows.map((r) => r.code).join(', ')}.`,
      );
    }
    design = wanted;
  }

  return {
    templates: metric(
      rows.map((t) => ({
        templateId: t.id,
        code: t.code,
        label: t.label,
        pageWidthPx: t.pageWidthPx,
        pageHeightPx: t.pageHeightPx,
        attachedEvents: t._count.events,
      })),
      "Les certificats que Jump sait délivrer. « label » est le nom que voient les équipes et qui nomme le fichier téléchargé, « code » la clé stable à passer à write_diploma_template pour le modifier, « templateId » l'identifiant à passer à write_event_diploma_template pour le rattacher à un événement, et « attachedEvents » le nombre d'événements qui le délivrent aujourd'hui.",
    ),
    design: metric(
      design,
      "Le design du certificat demandé par « code » : sa feuille de style et le contenu d'une page. Null si aucun code n'a été demandé. C'est ce qu'il faut relire avant de modifier un certificat existant, pour repartir de l'existant au lieu de le réécrire.",
    ),
    placeholders: metric(
      // A list rather than an object keyed by token name: a payload with a key
      // called `nom` or `prenom` is precisely what the no-PII guard flags, and
      // it is right to - a field with that name is where somebody's identity
      // would sit. Here they are values, which is also the shape every other
      // list in this tier uses.
      Object.entries(CERTIFICATE_TOKENS).map(([token, description]) => ({
        token,
        description,
      })),
      "Les repères utilisables dans « bodyHtml », sous la forme {nom_du_repère}, et ce que chacun remplace. Un repère mal orthographié fait refuser l'enregistrement, parce qu'il s'imprimerait tel quel sur le document.",
    ),
    authoring: metric(
      AUTHORING_CONTRACT,
      "Les contraintes du gabarit dans lequel un design est inséré. Un design qui les ignore est refusé à l'enregistrement, ou sort visuellement faux.",
    ),
  };
}

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
  certificate: Metric<{
    templateId: string;
    code: string;
    label: string;
  } | null>;
  shownStatuses: Metric<string[]>;
  participants: Metric;
  hiddenFromDevSpace: Metric;
  syncedEnrolments: Metric;
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

  const certificate = event.diplomaTemplateId
    ? await prisma.diploma_Template.findUnique({
        where: { id: event.diplomaTemplateId },
        select: { id: true, code: true, label: true },
      })
    : null;

  const hidden = (await hiddenEnrolmentsByEvent([event.id])).get(event.id) ?? 0;

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
    certificate: metric(
      certificate
        ? {
            templateId: certificate.id,
            code: certificate.code,
            label: certificate.label,
          }
        : null,
      "Le certificat que cet événement délivre depuis la page Inscrits, une page par inscrit, ou null s'il n'en délivre aucun : le bouton de génération est alors absent. « templateId » est l'identifiant à passer à write_event_diploma_template.",
    ),
    shownStatuses: metric(
      event.shownStatuses,
      "Les statuts Salesforce dont l'espace dev affiche les inscriptions sur cet événement. Les inscriptions aux autres statuts restent synchronisées et enregistrées dans Jump, seul l'espace dev les masque ; celles sans statut sont toujours affichées. Se règle avec write_event_config (« shownStatuses »).",
    ),
    participants: metric(
      event.participations,
      `Inscriptions à cet événement, ${VISIBLE_PARTICIPATION_DEFINITION}.`,
    ),
    hiddenFromDevSpace: metric(
      hidden,
      `Nombre d'${HIDDEN_PARTICIPATION_DEFINITION}`,
    ),
    syncedEnrolments: metric(
      event.participations + hidden,
      `Nombre d'${SYNCED_PARTICIPATION_DEFINITION}`,
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

export type FeedbackForms = {
  forms: Metric<FormRow[]>;
  form: Metric<FeedbackFormContent | null>;
  authoring: Metric<string[]>;
};

/**
 * What an author is told before writing a form, as rules the write applies.
 * Each one is enforced by `domain/feedbackForms/authoring.ts` or the question
 * schema; this is their statement, so a model reads them before its first
 * refusal rather than learning them one refusal at a time.
 */
const FEEDBACK_AUTHORING_CONTRACT = [
  "Un formulaire s'écrit en entier : relisez-le avec « formId », modifiez ce qui doit changer, renvoyez le tout. Ce qui n'est pas renvoyé est retiré, sauf l'icône du persona, qui n'est touchée que si « personaIconUrl » est donné.",
  "L'ordre des tableaux est l'ordre affiché : d'abord les questions hors section, puis chaque section avec ses questions.",
  "Une question est identifiée par sa clé, une section et une option par leur identifiant. Renvoyez « sectionId » et « optionId » tels que lus : renommer une option en gardant son identifiant garde les réponses déjà données, l'omettre crée une nouvelle option.",
  `${STRUCTURE_LOCKED_MESSAGE} Une fois des réponses reçues, seuls les textes (titres, intros, énoncés, libellés, réactions, persona) et les réglages du formulaire (statut, accès, relance) changent encore ; ajouter, retirer, déplacer ou réordonner une section, une question ou une option, ou changer la clé, le type ou le caractère obligatoire d'une question, est refusé. La sortie : write_feedback_form_copy, modifier la copie, archiver l'original. Un défaut que cette structure figée porte déjà ne bloque pas ce qui reste modifiable.`,
  "Une question à choix (single, multiple, scale) a au moins une option ; une question libre (text, textarea) n'en a aucune ; une option « extra » (hors échelle, comme « je ne sais pas ») n'existe que sur une question scale. Une question multiple ne demande pas plus de choix (minSelections) qu'elle n'a d'options. Deux options d'une même question ne portent jamais le même libellé.",
  "Une donnée d'identité (identityField) n'est collectée qu'une fois par formulaire, n'est posée qu'au public, et prend le type qui lui correspond : text pour email, phone, firstName et lastName, single pour civility et campus.",
  "Un formulaire publié et ouvert au public (allowsPublicAccess) doit demander l'e-mail ; la relance sur le tableau de bord (dashboardNudge) suppose l'accès des talents connectés (allowsAuthenticatedAccess).",
  'Les textes du persona peuvent citer {prenom}, {nom}, {campus} et {civilite}. Une intro ou une conclusion vide laisse le message par défaut.',
  "Retirer un formulaire, c'est l'archiver (status archived). Aucune opération ne supprime un formulaire.",
];

export async function getFeedbackForms(
  params: { formId?: string } = {},
): Promise<FeedbackForms> {
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

  // Asked for one form: hand it back whole so it can be edited rather than
  // rewritten. Withheld from the list, where every form's questions would be
  // pages nobody asked for.
  let content: FeedbackFormContent | null = null;
  if (params.formId) {
    content = await readFeedbackFormContent(prisma, params.formId);
    if (!content) {
      throw new UnknownScopeError(
        `Formulaire « ${params.formId} » introuvable. ${handleProvenanceFr('formId')}`,
      );
    }
  }

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
    form: metric(
      content,
      "Le formulaire demandé par « formId », en entier et dans la forme exacte que write_feedback_form accepte : ses réglages, son persona, puis ses questions hors section et ses sections, dans l'ordre où un répondant les rencontre. Null si aucun formulaire n'a été demandé. « locked » vaut vrai dès qu'il a reçu une réponse : sa structure est alors figée. « personaIcon » est null pour la mascotte par défaut ; son « sourceUrl » est l'adresse d'où l'icône a été copiée, ou null si elle a été déposée dans l'interface.",
    ),
    authoring: metric(
      FEEDBACK_AUTHORING_CONTRACT,
      "Ce qu'il faut savoir avant d'écrire un formulaire. Ce sont des règles appliquées : ce qui les enfreint est refusé à l'enregistrement, pas corrigé en silence.",
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
  shownStatuses: string[];
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
        shownStatuses: template.shownStatuses,
      })),
      "Les modèles de configuration enregistrés, et ce que chacun applique à un événement. Un modèle est une copie prise à un instant donné : l'appliquer recopie ces réglages, et l'événement ne reste pas lié au modèle ensuite. Le nom est ce qui l'identifie.",
    ),
  };
}

// ── The activity catalogue ───────────────────────────────────────────────────

export type WorkshopActivityRow = {
  slug: string;
  label: string;
  /** The slug of the instance serving it now. */
  instance: string;
  enabled: boolean;
  attachedEvents: number;
  talentsEntered: number;
  /** How it presents itself on the talent dashboard, as last written. */
  cover: {
    tagline: string | null;
    images: { kind: WorkshopCoverKind; sourceUrl: string }[];
  };
};

export type WorkshopInstanceRow = {
  slug: string;
  baseUrl: string;
  /** The slugs of every activity declared on it, retired ones included. */
  activities: string[];
};

export type Workshops = {
  activities: Metric<WorkshopActivityRow[]>;
  instances: Metric<WorkshopInstanceRow[]>;
  scale: Metric<string>;
};

/**
 * The activities Jump can send a talent to, the CTFd instances serving them,
 * and how much each activity is used.
 *
 * The subject itself (its steps, its wording) lives in CTFd. What Jump holds is
 * how the dashboard presents it, with the address each picture was copied from,
 * so an admin can restate a cover without having kept it anywhere. It also
 * carries the slugs every activity and instance write takes, and the two counts
 * that say whether an activity is still worth keeping in the catalogue.
 *
 * `talentsEntered` is a count and never a list: this tier returns no talent
 * identity, at any level.
 */
export async function getWorkshops(): Promise<Workshops> {
  const [activities, instances] = await Promise.all([
    prisma.workshop_Activity.findMany({
      orderBy: { label: 'asc' },
      select: {
        slug: true,
        label: true,
        enabled: true,
        instance: { select: { slug: true } },
        _count: { select: { events: true, participations: true } },
        tagline: true,
        coverImages: {
          select: { kind: true, sourceUrl: true },
          orderBy: { kind: 'asc' },
        },
      },
    }),
    prisma.workshop_Instance.findMany({
      orderBy: { slug: 'asc' },
      select: {
        slug: true,
        baseUrl: true,
        activities: { select: { slug: true }, orderBy: { slug: 'asc' } },
      },
    }),
  ]);

  return {
    activities: metric(
      activities.map((activity) => ({
        slug: activity.slug,
        label: activity.label,
        instance: activity.instance.slug,
        enabled: activity.enabled,
        attachedEvents: activity._count.events,
        talentsEntered: activity._count.participations,
        cover: {
          tagline: activity.tagline,
          images: activity.coverImages,
        },
      })),
      "Les activités en ligne que Jump sait proposer. Une activité est un contenu servi par une instance. « slug » est la clé stable que prennent les opérations d'écriture sur les activités, et le nom que l'instance donne à ce contenu, « label » le nom que lit un talent, « instance » l'instance qui le sert, « enabled » si l'activité est proposée aujourd'hui, « attachedEvents » le nombre d'événements qui la proposent et « talentsEntered » le nombre de talents qui y sont entrés au moins une fois. « cover » est la façon dont l'activité se présente sur l'accueil des talents, saisie par write_workshop_cover : son accroche (null si elle n'en a pas, l'accueil affiche alors « label ») et ses images, chacune avec l'adresse d'où Jump l'a copiée (« media » le visuel, « poster » l'image fixe, « mascot » la mascotte). Le sujet lui-même (étapes, énoncé) n'est pas ici : il vit dans l'instance.",
    ),
    instances: metric(
      instances.map((instance) => ({
        slug: instance.slug,
        baseUrl: instance.baseUrl,
        activities: instance.activities.map((a) => a.slug),
      })),
      "Les instances qui servent ces activités. « slug » est la clé de l'instance, celle que son administration affiche et que prend write_workshop_instance, « baseUrl » l'adresse vers laquelle un talent est envoyé, « activities » les activités qu'elle sert, y compris celles qui ne sont plus proposées. Une instance passe d'un contenu à l'autre au fil des demandes : chaque contenu reste une activité à part, et les XP d'un talent restent rangés sous celle qu'il a faite.",
    ),
    scale: metric(
      `Une activité déclarée à N minutes sur un événement vaut N x ${WORKSHOP_XP_PER_MINUTE} XP une fois entièrement terminée, au prorata des étapes validées. Le barème d'un talent est figé à sa première entrée : changer la durée ne reprend d'XP à personne et n'en ajoute pas rétroactivement.`,
      "Comment une activité se transforme en XP, et ce qu'un changement de durée fait aux talents déjà entrés.",
    ),
  };
}

// ─── Talent home content ───────────────────────────────────────────────────

/**
 * What each campus puts on its talents' home, as written: the note's Markdown
 * and the highlighted event. Campuses with neither are listed too, because the
 * question this answers is usually « which campuses are still empty ».
 */
export async function getTalentHomeContent(
  scope: Scope,
  now: Date = new Date(),
) {
  const rows = await prisma.campus.findMany({
    where: scope.campus ? { id: scope.campus.id } : undefined,
    orderBy: { name: 'asc' },
    select: {
      name: true,
      timezone: true,
      homeNote: { select: { markdown: true, updatedAt: true } },
      homeHighlight: {
        select: {
          title: true,
          summary: true,
          date: true,
          url: true,
          updatedAt: true,
          image: { select: { sourceUrl: true } },
        },
      },
    },
  });

  return {
    campuses: metric(
      rows.map(({ name, timezone, homeNote, homeHighlight }) => ({
        campus: name,
        note: homeNote,
        highlight: homeHighlight && {
          title: homeHighlight.title,
          summary: homeHighlight.summary,
          date: dbDateToKey(homeHighlight.date),
          url: homeHighlight.url,
          imageUrl: homeHighlight.image?.sourceUrl ?? null,
          updatedAt: homeHighlight.updatedAt,
          shown: isHighlightOpen(homeHighlight.date, timezone, now),
        },
      })),
      "Ce que chaque campus affiche sur l'accueil de ses talents, en plus de leurs propres inscriptions. « note » est le mot du campus tel qu'il a été écrit (Markdown, ses images écrites par l'adresse d'où Jump les a copiées), affiché dans la carte Actualités, ou null s'il n'y en a pas. « highlight » est l'événement mis en avant dans le bandeau bleu de l'accueil (en grand un jour sans activité, en une ligne sous l'activité un jour d'activité) : son titre, son texte, son jour, le lien du formulaire d'inscription, « imageUrl », l'adresse d'où son image a été copiée (null s'il n'en a pas), et « shown », qui dit s'il est encore affiché (il disparaît seul une fois son jour passé, à l'heure du campus), ou null s'il n'y en a pas. Un talent voit le campus de son événement le plus tardif, à venir compris.",
    ),
  };
}
