/**
 * The catalogue of Jump features whose usage is recorded.
 *
 * This answers one question and only one: "who uses what", so a surface nobody
 * opens can be retired and a surface everybody leans on can be invested in.
 * Before this existed, Jump knew who was enrolled, who had signed and who was
 * present, and nothing at all about which of its own screens were used.
 *
 * ADMISSION RULE: a key enters this catalogue only if a product decision depends
 * on it. Micro-interactions (a theme toggle, confetti seen, a collapsible
 * opened) do not qualify and stay with Umami in aggregate. The boundary between
 * the two tools decides where a new measurement belongs: Umami answers "how much
 * traffic", this catalogue answers "which campus adopted which feature". Only
 * the second can be joined to `Participation`, `Campus` and `Event`, which is
 * the whole reason it lives in our own database.
 *
 * A key is NOT added for a fact the database already records. Minigame plays, QR
 * check-ins, presence, feedback submissions, closings conducted, the three
 * signed documents and onboarding progression are already rows somewhere, each
 * with its own curated aggregate. Duplicating one buys two numbers that can
 * disagree. `USAGE_MEASURED_ELSEWHERE` names them and the API carries that list,
 * so a consumer is told where to look instead of being told nothing.
 *
 * Keys stay plain strings, validated here rather than as a DB enum, so adding
 * one needs no migration. Same call as `EVENT_MODULES`, for the same reason.
 *
 * WHEN A USE IS RECORDED, because the answer is not the same everywhere and the
 * difference is a decision rather than drift:
 *   - an endpoint that PRODUCES AN ARTIFACT records once the artifact exists (a
 *     badge sheet, a certificate, an xlsx, a QR image). The artifact either was
 *     produced or it was not, and an event that issues no certificate must not
 *     count a 404 as a render.
 *   - everything else records when the CONTROL IS INVOKED. A form somebody
 *     deliberately submitted is a use of the feature whether or not the server
 *     accepted the payload, and it keeps the count from depending on one
 *     judgement call per action across sixty-odd call sites.
 *
 * Naming: `space_object_action`.
 */

export const USAGE_FEATURES = {
  // ── Dev space (staff) ─────────────────────────────────────────────
  DEV_SESSION: 'dev_session',
  DEV_DASHBOARD_VIEW: 'dev_dashboard_view',
  DEV_INSCRITS_VIEW: 'dev_inscrits_view',
  DEV_INSCRITS_EXPORT: 'dev_inscrits_export',
  DEV_BADGES_RENDER: 'dev_badges_render',
  DEV_DIPLOMAS_RENDER: 'dev_diplomas_render',
  DEV_EMARGEMENT_VIEW: 'dev_emargement_view',
  DEV_EMARGEMENT_MARK: 'dev_emargement_mark',
  DEV_EMARGEMENT_MARK_ALL: 'dev_emargement_mark_all',
  DEV_EMARGEMENT_SLOT_CLOSE: 'dev_emargement_slot_close',
  DEV_EMARGEMENT_SLOT_REOPEN: 'dev_emargement_slot_reopen',
  DEV_EMARGEMENT_EXPORT: 'dev_emargement_export',
  DEV_EMARGEMENT_QR_DISPLAY: 'dev_emargement_qr_display',
  DEV_EMARGEMENT_QR_PRINT: 'dev_emargement_qr_print',
  DEV_EMARGEMENT_CONTACT_OPEN: 'dev_emargement_contact_open',
  DEV_BILAN_VIEW: 'dev_bilan_view',
  DEV_BILAN_EXPORT: 'dev_bilan_export',
  DEV_BILAN_QR_DISPLAY: 'dev_bilan_qr_display',
  DEV_CLOSINGS_ROSTER_VIEW: 'dev_closings_roster_view',
  DEV_CLOSING_CONDUCT_VIEW: 'dev_closing_conduct_view',
  DEV_PLANNING_VIEW: 'dev_planning_view',
  DEV_TALENT_FICHE_VIEW: 'dev_talent_fiche_view',
  DEV_TALENT_NOTE_CREATE: 'dev_talent_note_create',
  DEV_TALENT_NOTE_EDIT: 'dev_talent_note_edit',
  DEV_TALENT_NOTE_DELETE: 'dev_talent_note_delete',
  DEV_IMAGE_RIGHTS_CORRECT: 'dev_image_rights_correct',

  // ── Admin space, views ────────────────────────────────────────────
  ADMIN_SESSION: 'admin_session',
  ADMIN_DASHBOARD_VIEW: 'admin_dashboard_view',
  ADMIN_EVENTS_VIEW: 'admin_events_view',
  ADMIN_TALENTS_VIEW: 'admin_talents_view',
  ADMIN_NOTES_VIEW: 'admin_notes_view',
  ADMIN_SYNC_ERRORS_VIEW: 'admin_sync_errors_view',
  ADMIN_SF_CONFLICTS_VIEW: 'admin_sf_conflicts_view',
  ADMIN_ONBOARDING_PDFS_VIEW: 'admin_onboarding_pdfs_view',
  ADMIN_CLOSING_PDFS_VIEW: 'admin_closing_pdfs_view',
  ADMIN_BROADCASTS_VIEW: 'admin_broadcasts_view',
  ADMIN_FEEDBACK_FORMS_VIEW: 'admin_feedback_forms_view',
  ADMIN_FEEDBACK_RESPONSES_VIEW: 'admin_feedback_responses_view',
  ADMIN_CAMPUSES_VIEW: 'admin_campuses_view',
  ADMIN_USERS_VIEW: 'admin_users_view',
  ADMIN_SIGNATURES_VIEW: 'admin_signatures_view',
  ADMIN_INTERESTS_VIEW: 'admin_interests_view',
  ADMIN_MINIGAMES_VIEW: 'admin_minigames_view',
  ADMIN_FILES_VIEW: 'admin_files_view',
  ADMIN_ACCOUNT_DELETIONS_VIEW: 'admin_account_deletions_view',
  ADMIN_COMMUNICATION_VIEW: 'admin_communication_view',
  ADMIN_EMAIL_ACTIONS_VIEW: 'admin_email_actions_view',
  ADMIN_WELCOME_PAGES_VIEW: 'admin_welcome_pages_view',

  // ── Admin space, actions, exports and documents ───────────────────
  ADMIN_EVENT_CONFIG_SAVE: 'admin_event_config_save',
  ADMIN_EVENT_BULK_MODULES: 'admin_event_bulk_modules',
  ADMIN_EVENT_BULK_ACTIVATION: 'admin_event_bulk_activation',
  ADMIN_EVENT_TEMPLATE_SAVE: 'admin_event_template_save',
  ADMIN_EVENT_TEMPLATE_DELETE: 'admin_event_template_delete',
  ADMIN_TALENTS_EXPORT: 'admin_talents_export',
  ADMIN_TALENT_RESET_TO_IMPORT: 'admin_talent_reset_to_import',
  ADMIN_SYNC_ERROR_RESOLVE: 'admin_sync_error_resolve',
  ADMIN_SYNC_ERROR_REBIND: 'admin_sync_error_rebind',
  ADMIN_SF_CONFLICT_ADOPT: 'admin_sf_conflict_adopt',
  ADMIN_SF_AUTH_REPAIR: 'admin_sf_auth_repair',
  ADMIN_SF_CONFLICTS_EXPORT: 'admin_sf_conflicts_export',
  ADMIN_ONBOARDING_PDF_RETRY: 'admin_onboarding_pdf_retry',
  ADMIN_ONBOARDING_PDFS_EXPORT: 'admin_onboarding_pdfs_export',
  ADMIN_CLOSING_PDF_SINGLE: 'admin_closing_pdf_single',
  ADMIN_CLOSING_PDFS_EXPORT: 'admin_closing_pdfs_export',
  ADMIN_CLOSING_RESET: 'admin_closing_reset',
  ADMIN_BROADCAST_TEST_SEND: 'admin_broadcast_test_send',
  ADMIN_BROADCAST_ENQUEUE: 'admin_broadcast_enqueue',
  ADMIN_BROADCAST_RETRY: 'admin_broadcast_retry',
  ADMIN_BROADCAST_RECIPIENTS_EXPORT: 'admin_broadcast_recipients_export',
  ADMIN_TEMPLATE_SAVE: 'admin_template_save',
  ADMIN_FEEDBACK_FORM_WRITE: 'admin_feedback_form_write',
  ADMIN_FEEDBACK_RESPONSES_EXPORT: 'admin_feedback_responses_export',
  ADMIN_CAMPUS_WRITE: 'admin_campus_write',
  ADMIN_USER_INVITE: 'admin_user_invite',
  ADMIN_USER_ROLE_UPDATE: 'admin_user_role_update',
  ADMIN_USER_CAMPUS_UPDATE: 'admin_user_campus_update',
  ADMIN_USER_DELETE: 'admin_user_delete',
  ADMIN_IMPERSONATE_PERSON: 'admin_impersonate_person',
  ADMIN_EXPLORE_CAMPUS: 'admin_explore_campus',
  ADMIN_API_TOKEN_MINT: 'admin_api_token_mint',
  ADMIN_API_TOKEN_REVOKE: 'admin_api_token_revoke',
  ADMIN_SIGNATORY_WRITE: 'admin_signatory_write',
  ADMIN_INTEREST_WRITE: 'admin_interest_write',
  ADMIN_MINIGAME_WRITE: 'admin_minigame_write',
  ADMIN_WELCOME_PAGE_SAVE: 'admin_welcome_page_save',
  ADMIN_EMAIL_ACTIONS_SAVE: 'admin_email_actions_save',
  ADMIN_ACCOUNT_DELETION_FULFIL: 'admin_account_deletion_fulfil',
  ADMIN_ACCOUNT_DELETION_REJECT: 'admin_account_deletion_reject',
  ADMIN_FILE_UPLOAD: 'admin_file_upload',
  ADMIN_FILE_DOWNLOAD: 'admin_file_download',
  ADMIN_FILE_DELETE: 'admin_file_delete',
  ADMIN_NOTE_DELETE: 'admin_note_delete',
  ADMIN_TALENT_PARENT_EMAIL_UPDATE: 'admin_talent_parent_email_update',
  ADMIN_USER_INVITE_CANCEL: 'admin_user_invite_cancel',
  ADMIN_ONBOARDING_PDF_OPEN: 'admin_onboarding_pdf_open',

  // ── Talent space (pseudonymous) ───────────────────────────────────
  TALENT_SESSION: 'talent_session',
  TALENT_DASHBOARD_VIEW: 'talent_dashboard_view',
  TALENT_XP_HISTORY_VIEW: 'talent_xp_history_view',
  TALENT_EVENTS_VIEW: 'talent_events_view',
  TALENT_CALENDAR_VIEW: 'talent_calendar_view',
  TALENT_LEADERBOARD_VIEW: 'talent_leaderboard_view',
  TALENT_SETTINGS_VIEW: 'talent_settings_view',
  TALENT_DOCUMENT_VIEW: 'talent_document_view',
  TALENT_MINIGAME_OPEN: 'talent_minigame_open',
  TALENT_DELETION_REQUEST: 'talent_deletion_request',
} as const;

export type UsageFeatureKey =
  (typeof USAGE_FEATURES)[keyof typeof USAGE_FEATURES];

/** Catalogue order, for anything that lists features. */
export const USAGE_FEATURE_KEYS = Object.values(
  USAGE_FEATURES,
) as UsageFeatureKey[];

export type UsageAudience = 'talent' | 'staff';
export type UsageSpace = 'talent' | 'dev' | 'admin';
export type UsageKind = 'session' | 'view' | 'action' | 'export' | 'document';

/**
 * What a use belongs to, and therefore which columns the recorder populates:
 * `event` stamps the campus and the event, `campus` stamps the campus only,
 * `global` stamps neither. That last one is not laziness: the admin space is
 * national, so a per-campus breakdown of it would invite a reading of the
 * campus-by-feature matrix that the data does not support.
 */
export type UsageScope = 'event' | 'campus' | 'global';

/**
 * How many rows one feature is allowed to produce.
 *
 *  - `bucket`: one row per actor per 30-minute slice. For anything a page emits
 *    repeatedly without the person doing anything more: emargement invalidates
 *    every 5 s, the feedback editor autosaves across eleven endpoints, a QR
 *    dialog refetches its image on every open. One row per occurrence there
 *    measures repaints, not adoption. It is also what makes SvelteKit's
 *    hover-preload harmless: a preload and the click behind it fall in the same
 *    slice and collapse into one row.
 *  - `each`: one row per occurrence, because the occurrence IS the fact. Every
 *    export, every badge sheet, every slot closure counts on its own.
 *
 * A session is neither: it keys on the session id, so it yields exactly one row
 * per real login with no slice arithmetic.
 */
export type UsageDedupe = 'bucket' | 'each';

/** One 30-minute slice: the `bucket` granularity. */
export const USAGE_BUCKET_MS = 30 * 60 * 1000;

/**
 * How long a raw `Usage_FeatureUse` row lives, in days.
 *
 * Sixty, not the thirteen months usually quoted around web analytics: those are
 * the lifetime of a TRACKER under the CNIL's audience-measurement exemption, a
 * regime this does not qualify for, so they are no authority for keeping
 * behavioural logs. The closest applicable guidance is the logging
 * recommendation, a rolling six months to a year, and this sits well inside it
 * because the long-lived answer never needs the raw rows: it is the actor-free
 * monthly cube. Long enough to cover a stage plus its debrief, and to answer
 * "what has this member been doing lately" on the staff page.
 *
 * Lives here rather than beside the purge because two surfaces have to agree on
 * it or we breach our own notice: the purge in `server/usage/rollup.ts`, and the
 * charte informatique a minor accepts. Exactly why `DATA_RETENTION_MONTHS` lives
 * in `domain/retention.ts`.
 */
export const USAGE_RAW_RETENTION_DAYS = 60;

export interface UsageFeatureDef {
  key: UsageFeatureKey;
  /** Short FR name, in the audience's register (vous for staff, tu for talent). */
  label: string;
  /**
   * FR, quoted verbatim by the curated API. It must say what counts as ONE use,
   * because that is the part a reader cannot infer and the part that makes the
   * figure comparable between campuses.
   */
  definition: string;
  audience: UsageAudience;
  space: UsageSpace;
  kind: UsageKind;
  scope: UsageScope;
  dedupe: UsageDedupe;
}

const def = (d: UsageFeatureDef): UsageFeatureDef => d;

/**
 * Appended to every bucketed definition, so the granularity travels with the
 * figure instead of sitting in a doc nobody reads next to the number.
 */
const BUCKET_NOTE =
  'Compté une fois par demi-heure et par personne, donc un onglet laissé ouvert ne gonfle pas le chiffre.';

export const USAGE_FEATURE_DEFS: Record<UsageFeatureKey, UsageFeatureDef> = {
  // ── Dev space (staff) ─────────────────────────────────────────────
  [USAGE_FEATURES.DEV_SESSION]: def({
    key: USAGE_FEATURES.DEV_SESSION,
    label: 'Connexions à l’espace dev',
    definition:
      'Ouvertures de session réelles sur l’espace dev. Une par session, jamais par page, donc le chiffre compte des venues et non des clics.',
    audience: 'staff',
    space: 'dev',
    kind: 'session',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_DASHBOARD_VIEW]: def({
    key: USAGE_FEATURES.DEV_DASHBOARD_VIEW,
    label: 'Tableau de bord dev',
    definition: `Consultations de l’accueil de l’espace dev. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_INSCRITS_VIEW]: def({
    key: USAGE_FEATURES.DEV_INSCRITS_VIEW,
    label: 'Liste des inscrits',
    definition: `Consultations de la liste des inscrits d’un événement. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_INSCRITS_EXPORT]: def({
    key: USAGE_FEATURES.DEV_INSCRITS_EXPORT,
    label: 'Export xlsx des inscrits',
    definition:
      'Exports xlsx de la liste des inscrits. Un par téléchargement demandé, quel que soit le filtre appliqué au moment de l’export.',
    audience: 'staff',
    space: 'dev',
    kind: 'export',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_BADGES_RENDER]: def({
    key: USAGE_FEATURES.DEV_BADGES_RENDER,
    label: 'Génération des badges',
    definition:
      'Générations de la planche de badges. Une par PDF produit, les deux formats confondus.',
    audience: 'staff',
    space: 'dev',
    kind: 'document',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_DIPLOMAS_RENDER]: def({
    key: USAGE_FEATURES.DEV_DIPLOMAS_RENDER,
    label: 'Génération des diplômes',
    definition:
      'Générations du PDF de certificats. Une par document produit ; un événement qui n’en délivre aucun ne peut pas en produire, donc il ne compte pas.',
    audience: 'staff',
    space: 'dev',
    kind: 'document',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_VIEW]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_VIEW,
    label: 'Feuille d’émargement',
    definition: `Consultations de la feuille de présence. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_MARK]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_MARK,
    label: 'Pointage d’un jeune',
    definition:
      'Pointages individuels enregistrés. Un par changement de statut validé, y compris un retour en attente.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_MARK_ALL]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_MARK_ALL,
    label: 'Tout marquer présent',
    definition:
      'Utilisations du pointage en masse sur un créneau. Une par déclenchement, quel que soit le nombre de jeunes concernés.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_SLOT_CLOSE]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_SLOT_CLOSE,
    label: 'Clôture d’un créneau',
    definition: 'Clôtures manuelles d’un créneau de présence.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_SLOT_REOPEN]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_SLOT_REOPEN,
    label: 'Réouverture d’un créneau',
    definition:
      'Réouvertures d’un créneau déjà clôturé. Un chiffre haut dit que la clôture tombe trop tôt.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_EXPORT]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_EXPORT,
    label: 'Export xlsx de l’émargement',
    definition:
      'Exports xlsx de la feuille de présence. Un par téléchargement demandé.',
    audience: 'staff',
    space: 'dev',
    kind: 'export',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_QR_DISPLAY]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_QR_DISPLAY,
    label: 'Affichage du QR de présence',
    definition: `Affichages à l’écran du code de pointage autonome. L’image est redemandée à chaque ouverture de la fenêtre et à chaque rechargement. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_QR_PRINT]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_QR_PRINT,
    label: 'Impression du QR de présence',
    definition:
      'Générations de la feuille imprimable du code de pointage. Une par PDF produit.',
    audience: 'staff',
    space: 'dev',
    kind: 'document',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_EMARGEMENT_CONTACT_OPEN]: def({
    key: USAGE_FEATURES.DEV_EMARGEMENT_CONTACT_OPEN,
    label: 'Coordonnées d’un jeune',
    definition: `Ouvertures de la fiche de contact d’un jeune depuis l’émargement. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_BILAN_VIEW]: def({
    key: USAGE_FEATURES.DEV_BILAN_VIEW,
    label: 'Réponses au questionnaire',
    definition: `Consultations des réponses au questionnaire de fin. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_BILAN_EXPORT]: def({
    key: USAGE_FEATURES.DEV_BILAN_EXPORT,
    label: 'Export xlsx du questionnaire',
    definition:
      'Exports xlsx des réponses au questionnaire de fin. Un par téléchargement demandé.',
    audience: 'staff',
    space: 'dev',
    kind: 'export',
    scope: 'event',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_BILAN_QR_DISPLAY]: def({
    key: USAGE_FEATURES.DEV_BILAN_QR_DISPLAY,
    label: 'Affichage du QR du questionnaire',
    definition: `Affichages du code à partager pour remplir le questionnaire de fin. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_CLOSINGS_ROSTER_VIEW]: def({
    key: USAGE_FEATURES.DEV_CLOSINGS_ROSTER_VIEW,
    label: 'Liste des closings',
    definition: `Consultations de la liste des closings d’un événement. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_CLOSING_CONDUCT_VIEW]: def({
    key: USAGE_FEATURES.DEV_CLOSING_CONDUCT_VIEW,
    label: 'Grille de closing',
    definition: `Ouvertures de la grille de closing d’un jeune. Le closing lui-même est un fait enregistré ailleurs ; ce chiffre compte les ouvertures, y compris celles qui n’aboutissent pas. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_PLANNING_VIEW]: def({
    key: USAGE_FEATURES.DEV_PLANNING_VIEW,
    label: 'Planning',
    definition: `Consultations du planning d’un événement. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'event',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_TALENT_FICHE_VIEW]: def({
    key: USAGE_FEATURES.DEV_TALENT_FICHE_VIEW,
    label: 'Fiche d’un jeune',
    definition: `Consultations de la fiche individuelle d’un jeune. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'dev',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.DEV_TALENT_NOTE_CREATE]: def({
    key: USAGE_FEATURES.DEV_TALENT_NOTE_CREATE,
    label: 'Note ajoutée',
    definition: 'Notes ajoutées sur la fiche d’un jeune.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'campus',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_TALENT_NOTE_EDIT]: def({
    key: USAGE_FEATURES.DEV_TALENT_NOTE_EDIT,
    label: 'Note modifiée',
    definition: 'Modifications d’une note existante.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'campus',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_TALENT_NOTE_DELETE]: def({
    key: USAGE_FEATURES.DEV_TALENT_NOTE_DELETE,
    label: 'Note supprimée',
    definition:
      'Suppressions d’une note depuis la fiche d’un jeune. À lire avec les ajouts : beaucoup de suppressions pour peu d’ajouts dit que le fil sert de brouillon.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'campus',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.DEV_IMAGE_RIGHTS_CORRECT]: def({
    key: USAGE_FEATURES.DEV_IMAGE_RIGHTS_CORRECT,
    label: 'Correction du droit à l’image',
    definition:
      'Corrections de la décision de droit à l’image saisies par l’équipe. Un chiffre haut dit que la famille n’arrive pas à la saisir elle-même.',
    audience: 'staff',
    space: 'dev',
    kind: 'action',
    scope: 'campus',
    dedupe: 'each',
  }),

  // ── Admin space, views ────────────────────────────────────────────
  [USAGE_FEATURES.ADMIN_SESSION]: def({
    key: USAGE_FEATURES.ADMIN_SESSION,
    label: 'Connexions à l’espace admin',
    definition:
      'Ouvertures de session réelles sur l’espace admin. Une par session, jamais par page.',
    audience: 'staff',
    space: 'admin',
    kind: 'session',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_DASHBOARD_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_DASHBOARD_VIEW,
    label: 'Tableau de bord admin',
    definition: `Consultations de l’accueil de l’espace admin. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_EVENTS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_EVENTS_VIEW,
    label: 'Événements',
    definition: `Consultations du pilotage des événements. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_TALENTS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_TALENTS_VIEW,
    label: 'Répertoire des talents',
    definition: `Consultations du répertoire des talents. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_NOTES_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_NOTES_VIEW,
    label: 'Notes',
    definition: `Consultations du fil des notes. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_SYNC_ERRORS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_SYNC_ERRORS_VIEW,
    label: 'Erreurs de synchronisation',
    definition: `Consultations des erreurs de synchronisation Salesforce. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_SF_CONFLICTS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_SF_CONFLICTS_VIEW,
    label: 'Divergences Salesforce',
    definition: `Consultations des divergences entre Jump et Salesforce. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_ONBOARDING_PDFS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_ONBOARDING_PDFS_VIEW,
    label: 'Documents d’inscription',
    definition: `Consultations de l’archive des documents d’inscription. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_CLOSING_PDFS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_CLOSING_PDFS_VIEW,
    label: 'Synthèses de closing',
    definition: `Consultations de l’archive des synthèses de closing. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_BROADCASTS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_BROADCASTS_VIEW,
    label: 'Campagnes',
    definition: `Consultations des campagnes de messages. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_FEEDBACK_FORMS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_FEEDBACK_FORMS_VIEW,
    label: 'Questionnaires',
    definition: `Consultations de la liste des questionnaires. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_FEEDBACK_RESPONSES_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_FEEDBACK_RESPONSES_VIEW,
    label: 'Réponses aux questionnaires',
    definition: `Consultations des réponses à un questionnaire depuis l’espace admin. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_CAMPUSES_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_CAMPUSES_VIEW,
    label: 'Campus',
    definition: `Consultations de la liste des campus. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_USERS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_USERS_VIEW,
    label: 'Membres de l’équipe',
    definition: `Consultations du répertoire des membres de l’équipe. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_SIGNATURES_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_SIGNATURES_VIEW,
    label: 'Signataires',
    definition: `Consultations des signataires des documents. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_INTERESTS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_INTERESTS_VIEW,
    label: 'Centres d’intérêt',
    definition: `Consultations du catalogue des centres d’intérêt. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_MINIGAMES_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_MINIGAMES_VIEW,
    label: 'Jeux',
    definition: `Consultations du catalogue des jeux. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_FILES_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_FILES_VIEW,
    label: 'Fichiers',
    definition: `Consultations de la bibliothèque de fichiers. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_ACCOUNT_DELETIONS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_ACCOUNT_DELETIONS_VIEW,
    label: 'Demandes de suppression',
    definition: `Consultations des demandes de suppression de compte. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_COMMUNICATION_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_COMMUNICATION_VIEW,
    label: 'Communication',
    definition: `Consultations de l’espace communication. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_EMAIL_ACTIONS_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_EMAIL_ACTIONS_VIEW,
    label: 'Actions dans les emails',
    definition: `Consultations de la configuration des actions proposées dans les emails. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_WELCOME_PAGES_VIEW]: def({
    key: USAGE_FEATURES.ADMIN_WELCOME_PAGES_VIEW,
    label: 'Pages d’accueil',
    definition: `Consultations de l’éditeur des pages d’accueil. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'view',
    scope: 'global',
    dedupe: 'bucket',
  }),

  // ── Admin space, actions, exports and documents ───────────────────
  [USAGE_FEATURES.ADMIN_EVENT_CONFIG_SAVE]: def({
    key: USAGE_FEATURES.ADMIN_EVENT_CONFIG_SAVE,
    label: 'Configuration d’un événement',
    definition: 'Enregistrements de la configuration d’un événement.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_EVENT_BULK_MODULES]: def({
    key: USAGE_FEATURES.ADMIN_EVENT_BULK_MODULES,
    label: 'Modules en masse',
    definition:
      'Applications en masse de modules à plusieurs événements. Une par opération, quel que soit le nombre d’événements touchés.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_EVENT_BULK_ACTIVATION]: def({
    key: USAGE_FEATURES.ADMIN_EVENT_BULK_ACTIVATION,
    label: 'Activation dev en masse',
    definition:
      'Activations ou désactivations en masse de l’espace dev sur plusieurs événements.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_EVENT_TEMPLATE_SAVE]: def({
    key: USAGE_FEATURES.ADMIN_EVENT_TEMPLATE_SAVE,
    label: 'Preset de configuration enregistré',
    definition: 'Enregistrements d’un preset de configuration d’événement.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_EVENT_TEMPLATE_DELETE]: def({
    key: USAGE_FEATURES.ADMIN_EVENT_TEMPLATE_DELETE,
    label: 'Preset de configuration supprimé',
    definition: 'Suppressions d’un preset de configuration d’événement.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_TALENTS_EXPORT]: def({
    key: USAGE_FEATURES.ADMIN_TALENTS_EXPORT,
    label: 'Export du répertoire des talents',
    definition:
      'Exports du répertoire des talents. Un par téléchargement demandé.',
    audience: 'staff',
    space: 'admin',
    kind: 'export',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_TALENT_RESET_TO_IMPORT]: def({
    key: USAGE_FEATURES.ADMIN_TALENT_RESET_TO_IMPORT,
    label: 'Remise à l’import d’un talent',
    definition: 'Remises d’un talent à son état d’import Salesforce.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_SYNC_ERROR_RESOLVE]: def({
    key: USAGE_FEATURES.ADMIN_SYNC_ERROR_RESOLVE,
    label: 'Erreur de synchronisation traitée',
    definition: 'Résolutions d’une erreur de synchronisation.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_SYNC_ERROR_REBIND]: def({
    key: USAGE_FEATURES.ADMIN_SYNC_ERROR_REBIND,
    label: 'Réassociation d’un identifiant externe',
    definition: 'Réassociations manuelles d’un identifiant Salesforce.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_SF_CONFLICT_ADOPT]: def({
    key: USAGE_FEATURES.ADMIN_SF_CONFLICT_ADOPT,
    label: 'Divergence arbitrée',
    definition:
      'Arbitrages d’une divergence Salesforce, acceptation comme refus confondus.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_SF_AUTH_REPAIR]: def({
    key: USAGE_FEATURES.ADMIN_SF_AUTH_REPAIR,
    label: 'Réparation d’identité',
    definition: 'Réparations d’identité déclenchées depuis les divergences.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_SF_CONFLICTS_EXPORT]: def({
    key: USAGE_FEATURES.ADMIN_SF_CONFLICTS_EXPORT,
    label: 'Export des divergences',
    definition: 'Exports CSV des divergences Salesforce.',
    audience: 'staff',
    space: 'admin',
    kind: 'export',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_ONBOARDING_PDF_RETRY]: def({
    key: USAGE_FEATURES.ADMIN_ONBOARDING_PDF_RETRY,
    label: 'Relance d’un rendu de document',
    definition:
      'Relances manuelles d’un rendu de document d’inscription bloqué.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_ONBOARDING_PDFS_EXPORT]: def({
    key: USAGE_FEATURES.ADMIN_ONBOARDING_PDFS_EXPORT,
    label: 'Archive des documents d’inscription',
    definition: 'Téléchargements de l’archive des documents d’inscription.',
    audience: 'staff',
    space: 'admin',
    kind: 'export',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_CLOSING_PDF_SINGLE]: def({
    key: USAGE_FEATURES.ADMIN_CLOSING_PDF_SINGLE,
    label: 'Synthèse de closing unitaire',
    definition: 'Générations de la synthèse PDF d’un closing.',
    audience: 'staff',
    space: 'admin',
    kind: 'document',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_CLOSING_PDFS_EXPORT]: def({
    key: USAGE_FEATURES.ADMIN_CLOSING_PDFS_EXPORT,
    label: 'Archive des synthèses de closing',
    definition: 'Téléchargements de l’archive des synthèses de closing.',
    audience: 'staff',
    space: 'admin',
    kind: 'export',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_CLOSING_RESET]: def({
    key: USAGE_FEATURES.ADMIN_CLOSING_RESET,
    label: 'Closing remis à zéro',
    definition: 'Remises à zéro d’un closing déjà conduit.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_BROADCAST_TEST_SEND]: def({
    key: USAGE_FEATURES.ADMIN_BROADCAST_TEST_SEND,
    label: 'Envoi de test',
    definition:
      'Envois de test d’une campagne, avant tout envoi réel. À lire face aux campagnes lancées : peu de tests pour beaucoup d’envois est un risque, pas une économie.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_BROADCAST_ENQUEUE]: def({
    key: USAGE_FEATURES.ADMIN_BROADCAST_ENQUEUE,
    label: 'Campagne lancée',
    definition:
      'Lancements d’une campagne. Un par campagne mise en file, quel que soit le nombre de destinataires.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_BROADCAST_RETRY]: def({
    key: USAGE_FEATURES.ADMIN_BROADCAST_RETRY,
    label: 'Campagne relancée',
    definition: 'Relances des destinataires en échec d’une campagne.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_BROADCAST_RECIPIENTS_EXPORT]: def({
    key: USAGE_FEATURES.ADMIN_BROADCAST_RECIPIENTS_EXPORT,
    label: 'Export des destinataires',
    definition: 'Exports de la liste des destinataires d’une campagne.',
    audience: 'staff',
    space: 'admin',
    kind: 'export',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_TEMPLATE_SAVE]: def({
    key: USAGE_FEATURES.ADMIN_TEMPLATE_SAVE,
    label: 'Modèle de message enregistré',
    definition:
      'Créations, modifications, duplications et suppressions d’un modèle de message.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE]: def({
    key: USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE,
    label: 'Questionnaire édité',
    definition: `Sessions d’édition d’un questionnaire. L’éditeur enregistre en continu, donc ce chiffre compte des sessions d’édition et non des enregistrements. ${BUCKET_NOTE}`,
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.ADMIN_FEEDBACK_RESPONSES_EXPORT]: def({
    key: USAGE_FEATURES.ADMIN_FEEDBACK_RESPONSES_EXPORT,
    label: 'Export des réponses',
    definition:
      'Exports des réponses à un questionnaire depuis l’espace admin.',
    audience: 'staff',
    space: 'admin',
    kind: 'export',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_CAMPUS_WRITE]: def({
    key: USAGE_FEATURES.ADMIN_CAMPUS_WRITE,
    label: 'Campus créé ou modifié',
    definition: 'Créations, modifications et suppressions d’un campus.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_USER_INVITE]: def({
    key: USAGE_FEATURES.ADMIN_USER_INVITE,
    label: 'Membre invité',
    definition: 'Invitations d’un membre de l’équipe.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_USER_ROLE_UPDATE]: def({
    key: USAGE_FEATURES.ADMIN_USER_ROLE_UPDATE,
    label: 'Rôle modifié',
    definition: 'Changements de rôle d’un membre de l’équipe.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_USER_CAMPUS_UPDATE]: def({
    key: USAGE_FEATURES.ADMIN_USER_CAMPUS_UPDATE,
    label: 'Campus d’un membre modifié',
    definition: 'Changements de campus d’un membre de l’équipe.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_USER_DELETE]: def({
    key: USAGE_FEATURES.ADMIN_USER_DELETE,
    label: 'Membre supprimé',
    definition: 'Suppressions d’un membre de l’équipe.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_IMPERSONATE_PERSON]: def({
    key: USAGE_FEATURES.ADMIN_IMPERSONATE_PERSON,
    label: 'Connexion en tant que',
    definition: 'Prises de session au nom d’une personne précise.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_EXPLORE_CAMPUS]: def({
    key: USAGE_FEATURES.ADMIN_EXPLORE_CAMPUS,
    label: 'Exploration d’un campus',
    definition:
      'Explorations d’un campus, distinctes d’une prise de session visant une personne précise.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_API_TOKEN_MINT]: def({
    key: USAGE_FEATURES.ADMIN_API_TOKEN_MINT,
    label: 'Token créé',
    definition: 'Créations d’un token de l’API admin.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_API_TOKEN_REVOKE]: def({
    key: USAGE_FEATURES.ADMIN_API_TOKEN_REVOKE,
    label: 'Token révoqué',
    definition: 'Révocations d’un token de l’API admin.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_SIGNATORY_WRITE]: def({
    key: USAGE_FEATURES.ADMIN_SIGNATORY_WRITE,
    label: 'Signataire créé ou modifié',
    definition: 'Créations, modifications et suppressions d’un signataire.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_INTEREST_WRITE]: def({
    key: USAGE_FEATURES.ADMIN_INTEREST_WRITE,
    label: 'Centre d’intérêt créé ou modifié',
    definition:
      'Créations, modifications et suppressions d’un centre d’intérêt.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_MINIGAME_WRITE]: def({
    key: USAGE_FEATURES.ADMIN_MINIGAME_WRITE,
    label: 'Jeu créé ou modifié',
    definition:
      'Créations, modifications, retraits et publications forcées d’un jeu au catalogue.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_WELCOME_PAGE_SAVE]: def({
    key: USAGE_FEATURES.ADMIN_WELCOME_PAGE_SAVE,
    label: 'Page d’accueil enregistrée',
    definition: 'Enregistrements d’une page d’accueil.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_EMAIL_ACTIONS_SAVE]: def({
    key: USAGE_FEATURES.ADMIN_EMAIL_ACTIONS_SAVE,
    label: 'Actions dans les emails enregistrées',
    definition:
      'Enregistrements de la configuration des actions proposées dans les emails.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_ACCOUNT_DELETION_FULFIL]: def({
    key: USAGE_FEATURES.ADMIN_ACCOUNT_DELETION_FULFIL,
    label: 'Suppression de compte exécutée',
    definition: 'Exécutions d’une demande de suppression de compte.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_ACCOUNT_DELETION_REJECT]: def({
    key: USAGE_FEATURES.ADMIN_ACCOUNT_DELETION_REJECT,
    label: 'Suppression de compte refusée',
    definition: 'Refus d’une demande de suppression de compte.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_FILE_UPLOAD]: def({
    key: USAGE_FEATURES.ADMIN_FILE_UPLOAD,
    label: 'Fichier déposé',
    definition: 'Dépôts d’un fichier dans la bibliothèque.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_FILE_DOWNLOAD]: def({
    key: USAGE_FEATURES.ADMIN_FILE_DOWNLOAD,
    label: 'Fichier téléchargé',
    definition: 'Téléchargements d’un fichier de la bibliothèque.',
    audience: 'staff',
    space: 'admin',
    kind: 'export',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_FILE_DELETE]: def({
    key: USAGE_FEATURES.ADMIN_FILE_DELETE,
    label: 'Fichier supprimé',
    definition: 'Suppressions d’un fichier de la bibliothèque.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_NOTE_DELETE]: def({
    key: USAGE_FEATURES.ADMIN_NOTE_DELETE,
    label: 'Note supprimée depuis l’admin',
    definition:
      'Suppressions d’une note depuis le fil admin. C’est la seule action de cette page, donc le seul chiffre qui dit si elle sert à modérer et pas seulement à lire.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_TALENT_PARENT_EMAIL_UPDATE]: def({
    key: USAGE_FEATURES.ADMIN_TALENT_PARENT_EMAIL_UPDATE,
    label: 'Email du parent corrigé',
    definition:
      'Corrections de l’adresse du représentant légal saisies par l’équipe. Un chiffre haut dit que l’adresse arrive mal, pas que la correction est mal faite.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_USER_INVITE_CANCEL]: def({
    key: USAGE_FEATURES.ADMIN_USER_INVITE_CANCEL,
    label: 'Invitation annulée',
    definition:
      'Annulations d’une invitation en attente, à l’unité comme en masse. Une par opération.',
    audience: 'staff',
    space: 'admin',
    kind: 'action',
    scope: 'global',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.ADMIN_ONBOARDING_PDF_OPEN]: def({
    key: USAGE_FEATURES.ADMIN_ONBOARDING_PDF_OPEN,
    label: 'Document d’inscription ouvert',
    definition:
      'Ouvertures d’un document d’inscription à l’unité depuis l’archive, distinctes du téléchargement de l’archive entière.',
    audience: 'staff',
    space: 'admin',
    kind: 'document',
    scope: 'global',
    dedupe: 'each',
  }),

  // ── Talent space (pseudonymous) ───────────────────────────────────
  [USAGE_FEATURES.TALENT_SESSION]: def({
    key: USAGE_FEATURES.TALENT_SESSION,
    label: 'Tes connexions',
    definition:
      'Ouvertures de session réelles sur l’espace talent. Une par session, jamais par page.',
    audience: 'talent',
    space: 'talent',
    kind: 'session',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.TALENT_DASHBOARD_VIEW]: def({
    key: USAGE_FEATURES.TALENT_DASHBOARD_VIEW,
    label: 'Ton accueil',
    definition: `Consultations de l’accueil talent. ${BUCKET_NOTE}`,
    audience: 'talent',
    space: 'talent',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.TALENT_XP_HISTORY_VIEW]: def({
    key: USAGE_FEATURES.TALENT_XP_HISTORY_VIEW,
    label: 'Ton historique d’XP',
    definition: `Consultations de l’historique d’XP. ${BUCKET_NOTE}`,
    audience: 'talent',
    space: 'talent',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.TALENT_EVENTS_VIEW]: def({
    key: USAGE_FEATURES.TALENT_EVENTS_VIEW,
    label: 'Tes événements',
    definition: `Consultations de la liste des événements côté talent. ${BUCKET_NOTE}`,
    audience: 'talent',
    space: 'talent',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.TALENT_CALENDAR_VIEW]: def({
    key: USAGE_FEATURES.TALENT_CALENDAR_VIEW,
    label: 'Ton calendrier',
    definition: `Consultations du calendrier talent. ${BUCKET_NOTE}`,
    audience: 'talent',
    space: 'talent',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.TALENT_LEADERBOARD_VIEW]: def({
    key: USAGE_FEATURES.TALENT_LEADERBOARD_VIEW,
    label: 'Le classement d’un jeu',
    definition: `Consultations du classement d’un jeu. ${BUCKET_NOTE}`,
    audience: 'talent',
    space: 'talent',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.TALENT_SETTINGS_VIEW]: def({
    key: USAGE_FEATURES.TALENT_SETTINGS_VIEW,
    label: 'Tes réglages',
    definition: `Consultations des réglages talent. ${BUCKET_NOTE}`,
    audience: 'talent',
    space: 'talent',
    kind: 'view',
    scope: 'campus',
    dedupe: 'bucket',
  }),
  [USAGE_FEATURES.TALENT_DOCUMENT_VIEW]: def({
    key: USAGE_FEATURES.TALENT_DOCUMENT_VIEW,
    label: 'Un de tes documents',
    definition:
      'Ouvertures d’un document signé depuis les réglages. Une par ouverture.',
    audience: 'talent',
    space: 'talent',
    kind: 'document',
    scope: 'campus',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.TALENT_MINIGAME_OPEN]: def({
    key: USAGE_FEATURES.TALENT_MINIGAME_OPEN,
    label: 'L’ouverture d’un jeu',
    definition:
      'Lancements d’un jeu, comptés à l’ouverture et non à la partie terminée. La partie elle-même est un fait enregistré ailleurs ; ce chiffre est le seul qui distingue un jeu ouvert une fois sans être fini d’un jeu ouvert neuf fois sans être fini.',
    audience: 'talent',
    space: 'talent',
    kind: 'action',
    scope: 'campus',
    dedupe: 'each',
  }),
  [USAGE_FEATURES.TALENT_DELETION_REQUEST]: def({
    key: USAGE_FEATURES.TALENT_DELETION_REQUEST,
    label: 'Ta demande de suppression',
    definition:
      'Demandes de suppression de compte ouvertes par le talent lui-même.',
    audience: 'talent',
    space: 'talent',
    kind: 'action',
    scope: 'campus',
    dedupe: 'each',
  }),
};

/**
 * Route id to feature key, for the views and sessions counted in
 * `hooks.server.ts`.
 *
 * EVERY `*_view` key comes from this map and from nowhere else. No view is
 * recorded inside a `load`, which is one rule rather than a judgement call per
 * page, and it keeps writes out of `load` functions that SvelteKit also runs on
 * speculative hover-preload (the reason spelled out at the top of
 * `(talent)/minigames/[publicationId]/+page.server.ts`).
 *
 * Route ids carry the group prefix, which is what `guards.ts` already branches
 * on. `usage.test.ts` walks `src/routes` and fails when a key here names a route
 * that does not exist, so a renamed folder cannot silently stop being measured.
 */
export const USAGE_VIEW_ROUTES: Record<string, UsageFeatureKey> = {
  // Dev space
  '/(staff)/staff/dev': USAGE_FEATURES.DEV_DASHBOARD_VIEW,
  '/(staff)/staff/dev/events/[id]/inscrits': USAGE_FEATURES.DEV_INSCRITS_VIEW,
  '/(staff)/staff/dev/events/[id]/emargement':
    USAGE_FEATURES.DEV_EMARGEMENT_VIEW,
  '/(staff)/staff/dev/events/[id]/bilan': USAGE_FEATURES.DEV_BILAN_VIEW,
  '/(staff)/staff/dev/events/[id]/closings':
    USAGE_FEATURES.DEV_CLOSINGS_ROSTER_VIEW,
  '/(staff)/staff/dev/events/[id]/closings/[participationId]':
    USAGE_FEATURES.DEV_CLOSING_CONDUCT_VIEW,
  '/(staff)/staff/dev/events/[id]/planning': USAGE_FEATURES.DEV_PLANNING_VIEW,
  '/(staff)/staff/dev/students/[id]': USAGE_FEATURES.DEV_TALENT_FICHE_VIEW,

  // Admin space
  '/(staff)/staff/admin': USAGE_FEATURES.ADMIN_DASHBOARD_VIEW,
  '/(staff)/staff/admin/events': USAGE_FEATURES.ADMIN_EVENTS_VIEW,
  '/(staff)/staff/admin/talents': USAGE_FEATURES.ADMIN_TALENTS_VIEW,
  '/(staff)/staff/admin/notes': USAGE_FEATURES.ADMIN_NOTES_VIEW,
  '/(staff)/staff/admin/sync-errors': USAGE_FEATURES.ADMIN_SYNC_ERRORS_VIEW,
  '/(staff)/staff/admin/sf-conflicts': USAGE_FEATURES.ADMIN_SF_CONFLICTS_VIEW,
  '/(staff)/staff/admin/onboarding-pdfs':
    USAGE_FEATURES.ADMIN_ONBOARDING_PDFS_VIEW,
  '/(staff)/staff/admin/closing-pdfs': USAGE_FEATURES.ADMIN_CLOSING_PDFS_VIEW,
  '/(staff)/staff/admin/broadcasts': USAGE_FEATURES.ADMIN_BROADCASTS_VIEW,
  '/(staff)/staff/admin/feedback-forms':
    USAGE_FEATURES.ADMIN_FEEDBACK_FORMS_VIEW,
  '/(staff)/staff/admin/feedback-forms/[id]/responses':
    USAGE_FEATURES.ADMIN_FEEDBACK_RESPONSES_VIEW,
  '/(staff)/staff/admin/campuses': USAGE_FEATURES.ADMIN_CAMPUSES_VIEW,
  '/(staff)/staff/admin/users': USAGE_FEATURES.ADMIN_USERS_VIEW,
  '/(staff)/staff/admin/signatures': USAGE_FEATURES.ADMIN_SIGNATURES_VIEW,
  '/(staff)/staff/admin/interests': USAGE_FEATURES.ADMIN_INTERESTS_VIEW,
  '/(staff)/staff/admin/minigames': USAGE_FEATURES.ADMIN_MINIGAMES_VIEW,
  '/(staff)/staff/admin/files': USAGE_FEATURES.ADMIN_FILES_VIEW,
  '/(staff)/staff/admin/account-deletions':
    USAGE_FEATURES.ADMIN_ACCOUNT_DELETIONS_VIEW,
  '/(staff)/staff/admin/communication': USAGE_FEATURES.ADMIN_COMMUNICATION_VIEW,
  '/(staff)/staff/admin/email-actions': USAGE_FEATURES.ADMIN_EMAIL_ACTIONS_VIEW,
  '/(staff)/staff/admin/welcome-pages': USAGE_FEATURES.ADMIN_WELCOME_PAGES_VIEW,

  // Talent space
  '/(talent)': USAGE_FEATURES.TALENT_DASHBOARD_VIEW,
  '/(talent)/xp': USAGE_FEATURES.TALENT_XP_HISTORY_VIEW,
  '/(talent)/events': USAGE_FEATURES.TALENT_EVENTS_VIEW,
  '/(talent)/calendar': USAGE_FEATURES.TALENT_CALENDAR_VIEW,
  '/(talent)/minigames/[publicationId]/leaderboard':
    USAGE_FEATURES.TALENT_LEADERBOARD_VIEW,
  '/(talent)/settings': USAGE_FEATURES.TALENT_SETTINGS_VIEW,
};

/**
 * The session key for a space, from the route being visited. One row per real
 * session per space: a member who works in both spaces on one login is counted
 * in each, because "do the admins ever open the dev space" is a real question.
 */
export function usageSessionFeature(routeId: string): UsageFeatureKey | null {
  if (routeId.startsWith('/(staff)/staff/admin')) {
    return USAGE_FEATURES.ADMIN_SESSION;
  }
  if (routeId.startsWith('/(staff)/staff/dev'))
    return USAGE_FEATURES.DEV_SESSION;
  if (routeId.startsWith('/(talent)')) return USAGE_FEATURES.TALENT_SESSION;
  return null;
}

export function isUsageFeatureKey(value: string): value is UsageFeatureKey {
  return (USAGE_FEATURE_KEYS as string[]).includes(value);
}

/**
 * Facts this catalogue deliberately does NOT record, and the operation that owns
 * each one. Carried in the API answer so a consumer asking "how many minigames
 * were played" is pointed at the figure that exists, instead of reading a zero
 * here and concluding nobody plays.
 *
 * Adding a key for any of these would create a second number for one fact, and
 * the two would drift the first time one path changed.
 */
export const USAGE_MEASURED_ELSEWHERE: Readonly<Record<string, string>> = {
  'Parties de jeu jouées': 'stats_engagement',
  'Pointages de présence et check-in par QR': 'ops_emargement_coverage',
  'Questionnaires de fin remplis': 'stats_feedback_results',
  'Closings conduits': 'stats_closing_insights',
  'Charte, règlement intérieur et droit à l’image signés':
    'stats_compliance_status',
  'Avancement des dossiers d’inscription': 'stats_onboarding_funnel',
};
