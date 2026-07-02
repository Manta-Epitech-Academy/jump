# Carte de la base de données

> Généré automatiquement par `bun run db:erd` depuis `prisma/schema.prisma`.
> **Ne pas éditer à la main** — toute modification est écrasée à la régénération.
> Le diff git de ce fichier = le journal lisible des changements de schéma.

## Vue d'ensemble

- **82** modèles · **38** enums · **137** relations

| Domaine | Modèles |
| --- | ---: |
| Authentification & Profils | 12 |
| Cycle de vie talent & RGPD | 3 |
| Événements & Participations | 12 |
| Planning & Activités | 10 |
| Référentiel de compétences | 15 |
| Progression, Portfolio & XP | 3 |
| Minijeux | 3 |
| Feedback | 7 |
| Communication & Support | 8 |
| Contenus & Centres d'intérêt | 4 |
| Configuration & Système | 5 |

## 1 · Authentification & Profils

```mermaid
erDiagram
  bauth_user {
    String id PK
    String email UK
    Boolean emailVerified
    String name
    String image
    String role
    Boolean banned
    String banReason
    DateTime banExpires
    DateTime createdAt
    DateTime updatedAt
  }
  bauth_session {
    String id PK
    String userId FK
    String token UK
    DateTime expiresAt
    String ipAddress
    String userAgent
    DateTime createdAt
    DateTime updatedAt
    String impersonatedBy
  }
  bauth_account {
    String id PK
    String userId FK
    String accountId
    String providerId
    String accessToken
    String refreshToken
    DateTime accessTokenExpiresAt
    DateTime refreshTokenExpiresAt
    String scope
    String idToken
    String password
    DateTime createdAt
    DateTime updatedAt
  }
  bauth_verification {
    String id PK
    String identifier
    String value
    DateTime expiresAt
    DateTime createdAt
    DateTime updatedAt
  }
  OtpAttempt {
    String id PK
    String bucket
    String email
    DateTime createdAt
  }
  AuthIdentityRepair {
    String id PK
    String talentId
    String kind
    String toUserId
    String fromUserId
    String fromEmail
    String toEmail
    String resolvedBy
    DateTime resolvedAt
  }
  StaffProfile {
    String id PK
    String userId FK,UK
    String campusId FK
    StaffRole staffRole
    String discordId UK
    String[] devRedirectEmails
    String[] devRedirectPhones
    DateTime onboardingDocsExportedAt
    DateTime interviewDocsExportedAt
    DateTime sfExportedAt
    DateTime createdAt
    DateTime updatedAt
  }
  StaffInvitation {
    String id PK
    String email UK
    String campusId FK
    StaffRole staffRole
    String invitedByUserId FK
    DateTime createdAt
  }
  Talent {
    String id PK
    String userId FK,UK
    String email UK
    String nom
    String prenom
    String niveau
    Int xp
    Int eventsCount
    DateTime charterAcceptedAt
    DateTime techInterestsValidatedAt
    DateTime generalInterestsValidatedAt
    DateTime interestsRecapSeenAt
    DateTime rulesSignedAt
    ImageRightsDecision imageRightsDecision
    DateTime imageRightsDecidedAt
    String imageRightsSignerPrenom
    String imageRightsSignerNom
    String rulesSignedCity
    DateTime parentRulesSignedAt
    String parentRulesSignerPrenom
    String parentRulesSignerNom
    String parentRulesRelationship
    String parentRulesSignedCity
    DateTime infoValidatedAt
    DateTime highSchoolValidatedAt
    DateTime parentsValidatedAt
    DateTime processingCompletedAt
    String schoolId FK
    String highSchoolNameManual
    String charterFilePath
    String rulesFilePath
    String imageRightsFilePath
    Json badges
    String parentEmail
    String parentNom
    String parentPrenom
    String parentPhone
    String phone
    String civilite
    String parentType
    String parentCivilite
    String parent2Type
    String parent2Civilite
    String parent2Nom
    String parent2Prenom
    String parent2Email
    String parent2Phone
    Boolean hasLaptop
    String setupDescription
    DateTime equipmentValidatedAt
    String interestsFreeText
    String discordId UK
    String externalId UK
    DateTime lastSyncedAt
    DateTime lastActiveAt
    DateTime firstLoginAt
    DateTime welcomeSeenAt
    DateTime createdAt
    DateTime updatedAt
  }
  School {
    String id PK
    String uai UK
    String name
    String city
    String postalCode
    String inseeCode
    DateTime resolvedAt
    DateTime createdAt
    DateTime updatedAt
  }
  TalentSfImport {
    String talentId PK,FK
    String nom
    String prenom
    String phone
    String civilite
    String niveau
    String sfSchoolId FK
    DateTime syncedAt
  }
  Campus {
    String id PK
    String name UK
    String externalName UK
    String timezone
    String contactEmail
    DateTime createdAt
    DateTime updatedAt
  }
  bauth_user ||--o{ bauth_session : "sessions"
  bauth_user ||--o{ bauth_account : "accounts"
  bauth_user ||--|| StaffProfile : "staffProfile"
  bauth_user ||--o| Talent : "talent"
  bauth_user ||--o{ StaffInvitation : "invitationsIssued"
  Campus |o--o{ StaffProfile : "staffProfiles"
  Campus |o--o{ StaffInvitation : "invitations"
  School |o--o{ Talent : "talents"
  Talent ||--|| TalentSfImport : "sfImport"
  School |o--o{ TalentSfImport : "sfClaimedBy"
```

## 2 · Cycle de vie talent & RGPD

```mermaid
erDiagram
  TalentDeletionRequest {
    String id PK
    String talentId FK
    TalentDeletionRequestStatus status
    String reason
    DateTime requestedAt
    DateTime resolvedAt
    String resolvedBy
    String resolutionNote
    DateTime acknowledgedAt
  }
  ImageRightsDecisionRecord {
    String id PK
    String talentId FK
    ImageRightsDecision decision
    DateTime decidedAt
    String signerPrenom
    String signerNom
    String relationship
    String city
    ImageRightsDecisionSource source
    String recordedByStaffId FK
    String note
    DateTime createdAt
  }
  Note_TalentNote {
    String id PK
    String talentId FK
    String authorId FK
    String editedById FK
    String body
    String eventId FK
    DateTime presenceDay
    PresenceSlot presenceSlot
    DateTime createdAt
    DateTime updatedAt
  }
  StaffProfile {
  }
  Talent {
  }
  Event {
  }
  StaffProfile |o--o{ ImageRightsDecisionRecord : "imageRightsCorrections"
  StaffProfile |o--o{ Note_TalentNote : "notesAuthored"
  StaffProfile |o--o{ Note_TalentNote : "notesEdited"
  Talent ||--o{ TalentDeletionRequest : "deletionRequests"
  Talent ||--o{ ImageRightsDecisionRecord : "imageRightsRecords"
  Talent ||--o{ Note_TalentNote : "notes"
  Event |o--o{ Note_TalentNote : "talentNotes"
```

## 3 · Événements & Participations

```mermaid
erDiagram
  Event {
    String id PK
    String titre
    String publicName
    String cohortNoun
    DateTime date
    Int startMinutes
    DateTime endDate
    String eventType
    String campusId FK
    String themeId FK
    String feedbackFormId FK
    String pin
    String externalId UK
    DateTime devActivatedAt
    DateTime createdAt
    DateTime updatedAt
  }
  EventConfig_Module {
    String eventId PK,FK
    String moduleKey PK
    Json settings
    DateTime createdAt
  }
  EventConfig_Template {
    String id PK
    String name UK
    String description
    String forEventType
    String publicName
    String cohortNoun
    Int startMinutes
    String feedbackFormId FK
    String createdById FK
    DateTime createdAt
    DateTime updatedAt
  }
  EventConfig_TemplateModule {
    String templateId PK,FK
    String moduleKey PK
    Json settings
  }
  EventManta {
    String eventId PK,FK
    String staffProfileId PK,FK
  }
  Participation {
    String id PK
    String talentId FK,UK
    String eventId FK,UK
    String campusId FK
    Boolean isPresent
    Int delay
    Boolean bringPc
    Int camperRating
    String camperFeedback
    DateTime createdAt
    DateTime updatedAt
  }
  StageCompliance {
    String participationId PK,FK
    Boolean charteSigned
    DateTime createdAt
    DateTime updatedAt
  }
  ParticipationActivity {
    String participationId PK,FK
    String activityId PK,FK
    Boolean isPresent
    Int delay
    ParticipationVerdict verdict
    ParticipationContextTag contextTag
    String verdictAuthorId FK
    DateTime verdictAt
  }
  Interview {
    String id PK
    String talentId FK
    String staffId FK
    String campusId FK
    String participationId FK,UK
    InterviewStatus status
    DateTime conductedAt
    DiscoveryChannel discoveryChannel
    InterviewMotivation motivation
    OrientationTalkFrequency orientationTalkAtSchool
    PassionateTeacherAnswer passionateTeacher
    WantsMoreAnswer wantsMore
    InterviewRecommendation recommendation
    TechProjection[] techProjection
    Specialty[] specialties
    OtherJobDomain[] otherJobs
    InfoSource[] infoSources
    NextYearEvent[] nextYearEvents
    Int satisfactionStars
    String oneSentence
    String verdictNote
    String discoveryChannelNote
    String motivationNote
    String specialtiesNote
    String orientationTalkNote
    String passionateTeacherNote
    String techProjectionNote
    String otherJobsNote
    String infoSourcesNote
    String wantsMoreNote
    String satisfactionNote
    String nextYearEventsNote
    DateTime createdAt
    DateTime updatedAt
  }
  InterviewReset {
    String id PK
    String talentId FK
    String conductedByStaffId
    DateTime conductedAt
    String resetByStaffId FK
    String reason
    DateTime createdAt
  }
  EventPresence {
    String id PK
    String talentId FK,UK
    String eventId FK,UK
    DateTime day UK
    PresenceSlot slot UK
    PresenceStatus status
    PresenceSource source
    String markedById FK
    DateTime markedAt
    DateTime createdAt
    DateTime updatedAt
  }
  EventPresenceClosure {
    String id PK
    String eventId FK,UK
    DateTime day UK
    PresenceSlot slot UK
    String closedById FK
    DateTime closedAt
  }
  StaffProfile {
  }
  Talent {
  }
  Campus {
  }
  Theme {
  }
  Activity {
  }
  Feedback_Form {
  }
  StaffProfile ||--o{ EventManta : "eventMantas"
  StaffProfile |o--o{ ParticipationActivity : "verdictsAuthored"
  StaffProfile ||--o{ Interview : "interviewsConducted"
  StaffProfile |o--o{ EventPresence : "presencesMarked"
  StaffProfile |o--o{ EventPresenceClosure : "presenceClosuresMade"
  StaffProfile |o--o{ InterviewReset : "interviewResets"
  StaffProfile |o--o{ EventConfig_Template : "eventConfigTemplates"
  Talent ||--o{ Participation : "participations"
  Talent ||--o{ Interview : "interviews"
  Talent ||--o{ EventPresence : "eventPresences"
  Talent ||--o{ InterviewReset : "interviewResets"
  Campus ||--o{ Event : "events"
  Campus ||--o{ Participation : "participations"
  Campus ||--o{ Interview : "interviews"
  Theme |o--o{ Event : "events"
  Activity ||--o{ ParticipationActivity : "participationActivities"
  Feedback_Form |o--o{ Event : "events"
  Event ||--o{ EventManta : "mantas"
  Event ||--o{ Participation : "participations"
  Event ||--o{ EventPresenceClosure : "presenceClosures"
  Event ||--o{ EventPresence : "eventPresences"
  Event ||--o{ EventConfig_Module : "modules"
  Feedback_Form |o--o{ EventConfig_Template : "configTemplates"
  EventConfig_Template ||--o{ EventConfig_TemplateModule : "modules"
  Participation ||--o{ ParticipationActivity : "activities"
  Participation ||--|| StageCompliance : "stageCompliance"
  Participation ||--|| Interview : "interview"
```

## 4 · Planning & Activités

```mermaid
erDiagram
  Planning {
    String id PK
    String eventId FK,UK
    DateTime createdAt
    DateTime updatedAt
  }
  TimeSlot {
    String id PK
    String planningId FK
    DateTime startTime
    DateTime endTime
    DateTime createdAt
    DateTime updatedAt
  }
  Activity {
    String id PK
    String nom
    String description
    String difficulte
    ActivityType activityType
    Boolean isDynamic
    String link
    String content
    Json contentStructure
    String timeSlotId FK,UK
    String templateId
    String subjectVersionId FK
    DateTime createdAt
    DateTime updatedAt
  }
  ActivityTheme {
    String activityId PK,FK
    String themeId PK,FK
  }
  Theme {
    String id PK
    String nom UK
    String campusId FK,UK
    DateTime createdAt
    DateTime updatedAt
  }
  ActivityTemplate {
    String id PK
    String nom
    String description
    String difficulte
    ActivityType activityType
    Boolean isDynamic
    String campusId FK
    String link
    String content
    Json contentStructure
    Int defaultDuration
    String subjectId FK
    String subjectVersionId FK
    DateTime createdAt
    DateTime updatedAt
  }
  ActivityTemplateTheme {
    String activityTemplateId PK,FK
    String themeId PK,FK
  }
  PlanningTemplate {
    String id PK
    String nom UK
    String description
    Int nbDays
    DateTime createdAt
    DateTime updatedAt
  }
  PlanningTemplateDay {
    String id PK
    String planningTemplateId FK,UK
    Int dayIndex UK
    String label
    DateTime createdAt
    DateTime updatedAt
  }
  PlanningTemplateSlot {
    String id PK
    String planningTemplateDayId FK
    String startTime
    String endTime
    Int sortOrder
    String activityTemplateId FK
    String nom
    String description
    ActivityType activityType
    DateTime createdAt
    DateTime updatedAt
  }
  Campus {
  }
  Subject {
  }
  SubjectVersion {
  }
  Event {
  }
  Campus |o--o{ Theme : "themes"
  Campus |o--o{ ActivityTemplate : "activityTemplates"
  Theme ||--o{ ActivityTemplateTheme : "activityTemplateThemes"
  Theme ||--o{ ActivityTheme : "activityThemes"
  ActivityTemplate ||--o{ ActivityTemplateTheme : "activityTemplateThemes"
  ActivityTemplate |o--o{ PlanningTemplateSlot : "planningTemplateSlots"
  Subject |o--o{ ActivityTemplate : "templates"
  SubjectVersion |o--o{ ActivityTemplate : "templates"
  Event ||--|| Planning : "planning"
  Planning ||--o{ TimeSlot : "timeSlots"
  TimeSlot ||--|| Activity : "activity"
  Activity ||--o{ ActivityTheme : "activityThemes"
  SubjectVersion |o--o{ Activity : "activities"
  PlanningTemplate ||--o{ PlanningTemplateDay : "days"
  PlanningTemplateDay ||--o{ PlanningTemplateSlot : "slots"
```

## 5 · Référentiel de compétences

```mermaid
erDiagram
  RefCompSnapshot {
    String id PK
    String commitSha UK
    DateTime fetchedAt
    Boolean isCurrent
  }
  Competence {
    String id PK
    String snapshotId FK,UK
    String domain UK
    String desc
  }
  Skill {
    String id PK
    String snapshotId FK,UK
    String competenceId FK,UK
    Int numericId UK
    String shortName
  }
  SkillLevel {
    String id PK
    String snapshotId FK,UK
    String skillId FK,UK
    String level UK
    String name
    String desc
  }
  Observable {
    String id PK
    String snapshotId FK,UK
    String projectSlug UK
    Int externalId UK
    String desc
  }
  Subject {
    String id PK
    String repoUrl UK
    String slug UK
  }
  SubjectVersion {
    String id PK
    String subjectId FK,UK
    String repoCommitSha UK
    String refCompSnapshotId FK
    Json metadataJson
    DateTime importedAt
    String importedById FK
  }
  Document {
    String id PK
    String subjectVersionId FK,UK
    String path UK
    String rawMd
    String renderedHtml
    Int sortOrder
  }
  Section {
    String id PK
    String subjectVersionId FK,UK
    String documentId FK,UK
    Int level
    String anchor UK
    String title
    Int sortOrder
    String htmlSlice
  }
  SubjectObservable {
    String id PK
    String subjectVersionId FK
    String sectionId FK,UK
    String observableId FK,UK
    String skillLevelId FK
  }
  SubjectQuiz {
    String id PK
    String subjectVersionId FK,UK
    String documentId FK
    String fqn UK
    String type
    Int expectedCount
    String level
    Int externalIndex
    String title
    String question
    Json options
    Json canonicalAnswer
  }
  TalentObservableState {
    String id PK
    String talentId FK,UK
    String eventId FK,UK
    String observableId FK,UK
    String sourceSectionId FK
    String state
    String observedById FK
    DateTime observedAt
    DateTime createdAt
  }
  TalentCompetenceState {
    String id PK
    String talentId FK,UK
    String skillLevelId FK,UK
    String state
    DateTime certifiedAt
    DateTime updatedAt
  }
  TalentQuizAttempt {
    String id PK
    String talentId FK
    String quizId FK
    String eventId FK
    Json submitted
    Boolean correct
    DateTime attemptedAt
  }
  StepsProgress {
    String id PK
    String talentId FK,UK
    String eventId FK
    String activityId FK,UK
    String currentStepId
    String unlockedStepId
    StepStatus status
    UnlockSource lastUnlockSource
    DateTime createdAt
    DateTime updatedAt
  }
  StaffProfile {
  }
  Talent {
  }
  Activity {
  }
  Event {
  }
  StaffProfile ||--o{ SubjectVersion : "subjectVersionsImported"
  StaffProfile |o--o{ TalentObservableState : "observableValidations"
  Talent ||--o{ StepsProgress : "stepsProgress"
  Talent ||--o{ TalentObservableState : "observableStates"
  Talent ||--o{ TalentCompetenceState : "competenceStates"
  Talent ||--o{ TalentQuizAttempt : "quizAttempts"
  Activity |o--o{ StepsProgress : "stepsProgress"
  Event ||--o{ StepsProgress : "stepsProgress"
  Event ||--o{ TalentObservableState : "observableStates"
  Event ||--o{ TalentQuizAttempt : "quizAttempts"
  RefCompSnapshot ||--o{ Competence : "competences"
  RefCompSnapshot ||--o{ Skill : "skills"
  RefCompSnapshot ||--o{ SkillLevel : "skillLevels"
  RefCompSnapshot ||--o{ Observable : "observables"
  RefCompSnapshot ||--o{ SubjectVersion : "subjectVersions"
  Competence ||--o{ Skill : "skills"
  Skill ||--o{ SkillLevel : "levels"
  SkillLevel ||--o{ SubjectObservable : "subjectObservables"
  SkillLevel ||--o{ TalentCompetenceState : "competenceStates"
  Observable ||--o{ SubjectObservable : "subjectObservables"
  Observable ||--o{ TalentObservableState : "states"
  Subject ||--o{ SubjectVersion : "versions"
  SubjectVersion ||--o{ Document : "documents"
  SubjectVersion ||--o{ Section : "sections"
  SubjectVersion ||--o{ SubjectQuiz : "quizzes"
  SubjectVersion ||--o{ SubjectObservable : "observableLinks"
  Document ||--o{ Section : "sections"
  Document ||--o{ SubjectQuiz : "quizzes"
  Section ||--o{ SubjectObservable : "observableLinks"
  Section |o--o{ TalentObservableState : "observableStateSource"
  SubjectQuiz ||--o{ TalentQuizAttempt : "attempts"
```

## 6 · Progression, Portfolio & XP

```mermaid
erDiagram
  PortfolioItem {
    String id PK
    String talentId FK
    String eventId FK
    String activityId FK
    String file
    String url
    String caption
    DateTime createdAt
    DateTime updatedAt
  }
  XpGrant {
    String id PK
    String talentId FK
    String campusId FK
    XpGrantSource source UK
    String sourceId UK
    Int amount
    String note
    DateTime createdAt
    DateTime updatedAt
  }
  XpReward {
    String id PK
    String key UK
    String name
    Int xpAmount
    String campusId FK
    DateTime awardedOn
    DateTime createdAt
    DateTime updatedAt
  }
  Talent {
  }
  Campus {
  }
  Activity {
  }
  Event {
  }
  Talent ||--o{ PortfolioItem : "portfolioItems"
  Talent ||--o{ XpGrant : "xpGrants"
  Campus |o--o{ XpGrant : "xpGrants"
  Campus |o--o{ XpReward : "xpRewards"
  Activity |o--o{ PortfolioItem : "portfolioItems"
  Event ||--o{ PortfolioItem : "portfolioItems"
```

## 7 · Minijeux

```mermaid
erDiagram
  MinigameConfig {
    String game PK
    Int weight
    Boolean enabled
    DateTime createdAt
    DateTime updatedAt
  }
  MinigamePublication {
    String id PK
    String game
    String gameName
    Int level
    MinigameScoring scoringType
    DateTime publishedAt
    String forcedById
  }
  MinigameAttempt {
    String id PK
    String talentId FK,UK
    String publicationId FK,UK
    String eventId FK
    String campusId FK
    MinigameAttemptStatus status
    Int score
    Int chrono
    Boolean valid
    DateTime startedAt
    DateTime finishedAt
    String jti UK
    Int xpAwarded
    DateTime xpSeenAt
    Int rankXpAwarded
    DateTime rankXpSeenAt
  }
  Talent {
  }
  Campus {
  }
  Event {
  }
  Talent ||--o{ MinigameAttempt : "minigameAttempts"
  Campus |o--o{ MinigameAttempt : "minigameAttempts"
  Event |o--o{ MinigameAttempt : "minigameAttempts"
  MinigamePublication ||--o{ MinigameAttempt : "attempts"
```

## 8 · Feedback

```mermaid
erDiagram
  Feedback_Form {
    String id PK
    String slug UK
    String title
    String intro
    String personaName
    String personaIconKey
    Feedback_FormStatus status
    Boolean allowsAuthenticatedAccess
    Boolean allowsPublicAccess
    Boolean dashboardNudge
    String outro
    String defaultForEventType UK
    String createdById FK
    String updatedById FK
    DateTime createdAt
    DateTime updatedAt
  }
  Feedback_Section {
    String id PK
    String formId FK
    Int position
    String title
    String intro
  }
  Feedback_Question {
    String id PK
    String formId FK,UK
    String sectionId FK
    String key UK
    Int position
    String prompt
    Feedback_QuestionType type
    Boolean required
    Feedback_IdentityField identityField
    Feedback_InputKind inputKind
    Int minSelections
    Int maxSelections
    String placeholder
    DateTime createdAt
    DateTime updatedAt
  }
  Feedback_QuestionOption {
    String id PK
    String questionId FK
    Int position
    String label
    Feedback_OptionKind kind
    String reaction
    DateTime createdAt
    DateTime updatedAt
  }
  Feedback_Submission {
    String id PK
    String formId FK,UK
    Feedback_SubmissionSource source
    String talentId FK,UK
    String eventId FK,UK
    DateTime matchedAt
    String respondentEmail
    String respondentFirstName
    String respondentLastName
    String respondentPhone
    String respondentCivility
    String respondentCampusLabel
    DateTime submittedAt
    DateTime createdAt
  }
  Feedback_Answer {
    String id PK
    String submissionId FK,UK
    String questionId FK,UK
    String freeText
  }
  Feedback_AnswerOption {
    String answerId PK,FK
    String optionId PK,FK
  }
  StaffProfile {
  }
  Talent {
  }
  Event {
  }
  StaffProfile |o--o{ Feedback_Form : "feedbackFormsCreated"
  StaffProfile |o--o{ Feedback_Form : "feedbackFormsUpdated"
  Talent |o--o{ Feedback_Submission : "feedbackSubmissions"
  Event |o--o{ Feedback_Submission : "feedbackSubmissions"
  Feedback_Form ||--o{ Feedback_Section : "sections"
  Feedback_Form ||--o{ Feedback_Question : "questions"
  Feedback_Form ||--o{ Feedback_Submission : "submissions"
  Feedback_Section |o--o{ Feedback_Question : "questions"
  Feedback_Question ||--o{ Feedback_QuestionOption : "options"
  Feedback_Question ||--o{ Feedback_Answer : "answers"
  Feedback_QuestionOption ||--o{ Feedback_AnswerOption : "answerOptions"
  Feedback_Submission ||--o{ Feedback_Answer : "answers"
  Feedback_Answer ||--o{ Feedback_AnswerOption : "selectedOptions"
```

## 9 · Communication & Support

```mermaid
erDiagram
  Broadcast {
    String id PK
    String name
    BroadcastChannel channel
    String templateId FK
    String campusId FK
    BroadcastAudience audience
    String eventId FK
    String sourceBroadcastId FK
    BroadcastSourceFilter sourceFilter
    Json filters
    String subjectSnapshot
    String bodySnapshot
    BroadcastStatus status
    String createdById FK
    DateTime createdAt
    DateTime updatedAt
  }
  BroadcastRecipient {
    String id PK
    String broadcastId FK
    String talentId FK
    String staffUserId FK
    String parentOfTalentId FK
    String recipientEmail
    String recipientPhone
    BroadcastRecipientStatus status
    String errorMessage
    DateTime sentAt
    DateTime openedAt
    Int retryCount
    DateTime lastTriedAt
    DateTime createdAt
  }
  MessageTemplate {
    String id PK
    String seedKey UK
    String name
    BroadcastChannel channel
    String subject
    String body
    String createdById FK
    DateTime createdAt
    DateTime updatedAt
  }
  EmailActionMapping {
    String actionKey PK
    String templateId FK
    DateTime updatedAt
  }
  OnboardingReminder {
    String id PK
    String talentId FK
    String type
    String channel
    String subject
    String body
    DateTime sentAt
    String sentBy
  }
  OnboardingPdfJob {
    String id PK
    String talentId FK
    String documentType
    String status
    String filePath
    String errorMessage
    Json payload
    DateTime createdAt
    DateTime updatedAt
    DateTime processedAt
  }
  Ticket {
    String id PK
    String authorId FK
    String category
    String title
    String status
    DateTime lastMessageAt
    DateTime lastSeenByAuthorAt
    DateTime lastSeenByAdminAt
    DateTime closedAt
    DateTime createdAt
    DateTime updatedAt
  }
  TicketMessage {
    String id PK
    String ticketId FK
    String authorId FK
    String body
    DateTime createdAt
  }
  bauth_user {
  }
  Talent {
  }
  Campus {
  }
  Event {
  }
  bauth_user ||--o{ Ticket : "ticketsAuthored"
  bauth_user ||--o{ TicketMessage : "ticketMessages"
  bauth_user ||--o{ Broadcast : "broadcastsCreated"
  bauth_user ||--o{ MessageTemplate : "templatesCreated"
  bauth_user |o--o{ BroadcastRecipient : "broadcastsReceivedAsStaff"
  Talent ||--o{ OnboardingReminder : "reminders"
  Talent ||--o{ OnboardingPdfJob : "pdfJobs"
  Talent |o--o{ BroadcastRecipient : "broadcastsReceived"
  Talent |o--o{ BroadcastRecipient : "broadcastsAsParent"
  Campus ||--o{ Broadcast : "broadcasts"
  Event |o--o{ Broadcast : "broadcasts"
  Ticket ||--o{ TicketMessage : "messages"
  MessageTemplate ||--o{ Broadcast : "broadcasts"
  MessageTemplate ||--o{ EmailActionMapping : "emailActionMappings"
  Broadcast |o--o{ Broadcast : "retargets"
  Broadcast ||--o{ BroadcastRecipient : "recipients"
```

## 10 · Contenus & Centres d'intérêt

```mermaid
erDiagram
  CmsPage {
    String id PK
    String slug UK
    String eventId FK,UK
    String content
    DateTime updatedAt
    String updatedBy FK
  }
  CmsImage {
    String id PK
    String s3Key UK
    String contentType
    Int width
    Int height
    Int size
    String uploadedById FK
    DateTime createdAt
  }
  Interest {
    String id PK
    String nom UK
    String emoji
    String kind
    Int order
    String recommendationMessage
  }
  TalentInterest {
    String talentId PK,FK
    String interestId PK,FK
  }
  bauth_user {
  }
  StaffProfile {
  }
  Talent {
  }
  Event {
  }
  bauth_user ||--o{ CmsPage : "cmsPages"
  StaffProfile |o--o{ CmsImage : "cmsImages"
  Talent ||--o{ TalentInterest : "interests"
  Event ||--o{ CmsPage : "cmsPages"
  Interest ||--o{ TalentInterest : "talentInterests"
```

## 11 · Configuration & Système

```mermaid
erDiagram
  CampusFeatureFlag {
    String campusId PK,FK
    String flagKey PK
    Boolean enabled
    DateTime createdAt
    DateTime updatedAt
  }
  AppSetting {
    String key PK
    String value
    DateTime updatedAt
  }
  Signatory {
    String id PK
    String campusId FK
    String name
    String role
    String signatureKey UK
    String contentType
    Int position
    DateTime createdAt
    DateTime updatedAt
  }
  AdminFile {
    String id PK
    String name
    String s3Key UK
    String contentType
    Int size
    String uploadedById FK
    DateTime createdAt
  }
  SyncError {
    String id PK
    String errorType
    String email UK
    String attemptedExtId UK
    String existingExtId
    String talentName
    String eventExtId
    String message
    Boolean resolved
    DateTime resolvedAt
    Int occurrenceCount
    DateTime lastOccurredAt
    DateTime createdAt
    DateTime updatedAt
  }
  StaffProfile {
  }
  Campus {
  }
  StaffProfile ||--o{ AdminFile : "adminFiles"
  Campus ||--o{ CampusFeatureFlag : "featureFlags"
  Campus |o--o{ Signatory : "signatories"
```
