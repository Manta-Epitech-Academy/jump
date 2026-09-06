# Carte de la base de données

> Généré automatiquement par `bun run db:erd` depuis `prisma/schema.prisma`.
> **Ne pas éditer à la main** : toute modification est écrasée à la régénération.
> Le diff git de ce fichier = le journal lisible des changements de schéma.

## Vue d'ensemble

- **65** modèles · **27** enums · **97** relations

| Domaine | Modèles |
| --- | ---: |
| Authentification & Profils | 12 |
| Cycle de vie talent & RGPD | 6 |
| Événements & Participations | 8 |
| Closings | 9 |
| Planning & Activités | 1 |
| Progression, Portfolio & XP | 2 |
| Minijeux | 3 |
| Feedback | 7 |
| Communication & Support | 5 |
| Contenus & Centres d'intérêt | 4 |
| Analytique d'usage | 2 |
| Configuration & Système | 6 |

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
    String issuer UK
    String accountId UK
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
    String[] devRedirectEmails
    String[] devRedirectPhones
    DateTime onboardingDocsExportedAt
    DateTime closingDocsExportedAt
    DateTime sfExportedAt
    DateTime lastActiveAt
    DateTime firstLoginAt
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
    String reglementVersion
    DateTime parentRulesSignedAt
    String parentRulesSignerPrenom
    String parentRulesSignerNom
    String parentRulesRelationship
    String parentRulesSignedCity
    DateTime infoValidatedAt
    DateTime highSchoolValidatedAt
    DateTime parentsValidatedAt
    DateTime processingCompletedAt
    String onboardingSchoolYear
    String schoolId FK
    String highSchoolNameManual
    String rulesFilePath
    String imageRightsFilePath
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
    String setupDescription
    DateTime equipmentValidatedAt
    String interestsFreeText
    String externalId UK
    DateTime lastActiveAt
    DateTime firstLoginAt
    DateTime usageAnalyticsOptOutAt
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
    String sfEmail
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
    String schoolYear
    String version
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
  Schooling_YearRecord {
    String id PK
    String talentId FK,UK
    String schoolYear UK
    String niveau
    String schoolId FK
    String source
    DateTime createdAt
    DateTime updatedAt
  }
  Onboarding_Record {
    String id PK
    String talentId FK,UK
    String schoolYear UK
    DateTime infoValidatedAt
    DateTime highSchoolValidatedAt
    DateTime parentsValidatedAt
    DateTime techInterestsValidatedAt
    DateTime generalInterestsValidatedAt
    DateTime interestsRecapSeenAt
    DateTime equipmentValidatedAt
    DateTime processingCompletedAt
    DateTime rulesSignedAt
    String rulesFilePath
    String rulesSignedCity
    String reglementVersion
    DateTime parentRulesSignedAt
    String parentRulesSignerPrenom
    String parentRulesSignerNom
    String parentRulesRelationship
    String parentRulesSignedCity
    ImageRightsDecision imageRightsDecision
    DateTime imageRightsDecidedAt
    String imageRightsSignerPrenom
    String imageRightsSignerNom
    String imageRightsRelationship
    String imageRightsSignedCity
    String imageRightsVersion
    String imageRightsFilePath
    DateTime createdAt
    DateTime updatedAt
  }
  Audit_ImpersonationEvent {
    String id PK
    String adminUserId
    String targetUserId
    String targetKind
    DateTime startedAt
    DateTime endedAt
  }
  StaffProfile {
  }
  Talent {
  }
  School {
  }
  Event {
  }
  StaffProfile |o--o{ ImageRightsDecisionRecord : "imageRightsCorrections"
  StaffProfile |o--o{ Note_TalentNote : "notesAuthored"
  StaffProfile |o--o{ Note_TalentNote : "notesEdited"
  Talent ||--o{ TalentDeletionRequest : "deletionRequests"
  Talent ||--o{ ImageRightsDecisionRecord : "imageRightsRecords"
  Talent ||--o{ Schooling_YearRecord : "schoolingRecords"
  Talent ||--o{ Onboarding_Record : "onboardingRecords"
  Talent ||--o{ Note_TalentNote : "notes"
  School |o--o{ Schooling_YearRecord : "schoolingRecords"
  Event |o--o{ Note_TalentNote : "talentNotes"
```

## 3 · Événements & Participations

```mermaid
erDiagram
  Event {
    String id PK,UK
    String titre
    String publicName
    String cohortNoun
    DateTime date
    Int startMinutes
    DateTime endDate
    String campusId FK,UK
    String feedbackFormId FK
    String diplomaTemplateId FK
    String closingTemplateId FK
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
    String publicName
    String cohortNoun
    Int startMinutes
    String feedbackFormId FK
    String diplomaTemplateId FK
    String closingTemplateId FK
    String createdById FK
    DateTime createdAt
    DateTime updatedAt
  }
  EventConfig_TemplateModule {
    String templateId PK,FK
    String moduleKey PK
    Json settings
  }
  Participation {
    String id PK
    String talentId FK,UK
    String eventId FK,UK
    String campusId FK
    String sfMemberStatus
    DateTime createdAt
    DateTime updatedAt
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
  Diploma_Template {
    String id PK
    String code UK
    String label
    String styleCss
    String bodyHtml
    Int pageWidthPx
    Int pageHeightPx
    DateTime createdAt
    DateTime updatedAt
  }
  StaffProfile {
  }
  Talent {
  }
  Campus {
  }
  Feedback_Form {
  }
  Closing_Template {
  }
  StaffProfile |o--o{ EventPresence : "presencesMarked"
  StaffProfile |o--o{ EventPresenceClosure : "presenceClosuresMade"
  StaffProfile |o--o{ EventConfig_Template : "eventConfigTemplates"
  Talent ||--o{ Participation : "participations"
  Talent ||--o{ EventPresence : "eventPresences"
  Campus ||--o{ Event : "events"
  Campus ||--o{ Participation : "participations"
  Feedback_Form |o--o{ Event : "events"
  Diploma_Template |o--o{ Event : "events"
  Closing_Template |o--o{ Event : "events"
  Event ||--o{ Participation : "participations"
  Event ||--o{ EventPresenceClosure : "presenceClosures"
  Event ||--o{ EventPresence : "eventPresences"
  Event ||--o{ EventConfig_Module : "modules"
  Feedback_Form |o--o{ EventConfig_Template : "configTemplates"
  Diploma_Template |o--o{ EventConfig_Template : "configTemplates"
  Closing_Template |o--o{ EventConfig_Template : "configTemplates"
  EventConfig_Template ||--o{ EventConfig_TemplateModule : "modules"
```

## 4 · Closings

```mermaid
erDiagram
  Closing_Question {
    String id PK
    String key UK
    String label
    String hint
    Closing_QuestionKind kind
    Int max
    Int maxLength
    String placeholder
    String notePlaceholder
    Boolean testimonial
    DateTime retiredAt
    DateTime createdAt
    DateTime updatedAt
  }
  Closing_Option {
    String id PK
    String questionId FK,UK
    Int position
    String value UK
    String label
    String tone
    String icon
    DateTime createdAt
    DateTime updatedAt
  }
  Closing_Template {
    String id PK
    String key UK
    String label
    DateTime createdAt
    DateTime updatedAt
  }
  Closing_TemplateSection {
    String id PK
    String templateId FK
    Int position
    Int synthesisPosition
    String title
  }
  Closing_TemplateQuestion {
    String id PK
    String templateId FK,UK
    String sectionId FK
    String questionId FK,UK
    Int position
    String labelOverride
    Boolean withNote
  }
  Closing_Record {
    String id PK
    String talentId FK,UK
    String eventId FK,UK
    String staffId FK
    String campusId FK
    String templateId FK
    ClosingStatus status
    DateTime conductedAt
    ClosingRecommendation recommendation
    String verdictNote
    DateTime createdAt
    DateTime updatedAt
  }
  Closing_Answer {
    String id PK
    String recordId FK,UK
    String questionId FK,UK
    Int ratingValue
    String freeText
    String note
  }
  Closing_AnswerOption {
    String answerId PK,FK
    String optionId PK,FK
  }
  Closing_ResetEvent {
    String id PK
    String talentId FK
    String conductedByStaffId
    DateTime conductedAt
    String resetByStaffId FK
    String reason
    DateTime createdAt
  }
  StaffProfile {
  }
  Talent {
  }
  Campus {
  }
  Event {
  }
  StaffProfile |o--o{ Closing_Record : "closingsConducted"
  StaffProfile |o--o{ Closing_ResetEvent : "closingResets"
  Talent ||--o{ Closing_Record : "closings"
  Talent ||--o{ Closing_ResetEvent : "closingResets"
  Campus ||--o{ Closing_Record : "closings"
  Event ||--o{ Closing_Record : "closings"
  Closing_Question ||--o{ Closing_Option : "options"
  Closing_Question ||--o{ Closing_TemplateQuestion : "templateQuestions"
  Closing_Question ||--o{ Closing_Answer : "answers"
  Closing_Option ||--o{ Closing_AnswerOption : "answerOptions"
  Closing_Template ||--o{ Closing_TemplateSection : "sections"
  Closing_Template ||--o{ Closing_TemplateQuestion : "questions"
  Closing_Template ||--o{ Closing_Record : "records"
  Closing_TemplateSection ||--o{ Closing_TemplateQuestion : "questions"
  Closing_Record ||--o{ Closing_Answer : "answers"
  Closing_Answer ||--o{ Closing_AnswerOption : "selectedOptions"
```

## 5 · Planning & Activités

```mermaid
erDiagram
  Planning_Slot {
    String id PK
    String eventId FK
    DateTime startTime
    DateTime endTime
    String nom
    ActivityType activityType
    DateTime createdAt
    DateTime updatedAt
  }
  Event {
  }
  Event ||--o{ Planning_Slot : "planningSlots"
```

## 6 · Progression, Portfolio & XP

```mermaid
erDiagram
  XpGrant {
    String id PK
    String talentId FK
    String campusId FK
    XpGrantSource source UK
    String sourceId UK
    Int amount
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
  Talent ||--o{ XpGrant : "xpGrants"
  Campus |o--o{ XpGrant : "xpGrants"
  Campus |o--o{ XpReward : "xpRewards"
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
  OnboardingPdfJob {
    String id PK
    String talentId FK
    String documentType
    String schoolYear
    String status
    String filePath
    String errorMessage
    DateTime createdAt
    DateTime updatedAt
    DateTime processedAt
  }
  bauth_user {
  }
  Talent {
  }
  Campus {
  }
  Event {
  }
  bauth_user |o--o{ Broadcast : "broadcastsCreated"
  bauth_user |o--o{ MessageTemplate : "templatesCreated"
  bauth_user |o--o{ BroadcastRecipient : "broadcastsReceivedAsStaff"
  Talent ||--o{ OnboardingPdfJob : "pdfJobs"
  Talent |o--o{ BroadcastRecipient : "broadcastsReceived"
  Talent |o--o{ BroadcastRecipient : "broadcastsAsParent"
  Campus ||--o{ Broadcast : "broadcasts"
  Event |o--o{ Broadcast : "broadcasts"
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
  bauth_user |o--o{ CmsPage : "cmsPages"
  StaffProfile |o--o{ CmsImage : "cmsImages"
  Talent ||--o{ TalentInterest : "interests"
  Event ||--o{ CmsPage : "cmsPages"
  Interest ||--o{ TalentInterest : "talentInterests"
```

## 11 · Analytique d'usage

```mermaid
erDiagram
  Usage_FeatureUse {
    String id PK
    String feature UK
    UsageActorKind actorKind
    String staffProfileId FK
    String actorHash
    String campusId
    String eventId
    Boolean impersonated
    String dedupeKey UK
    DateTime occurredAt
  }
  Usage_FeatureMonthly {
    String id PK
    String feature UK
    UsageActorKind actorKind UK
    String campusId UK
    String month UK
    Int uses
    Int distinctActors
    DateTime computedAt
  }
  StaffProfile {
  }
  StaffProfile |o--o{ Usage_FeatureUse : "featureUses"
```

## 12 · Configuration & Système

```mermaid
erDiagram
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
  AdminApi_Token {
    String id PK
    String staffUserId FK
    String label
    AdminApi_TokenTier tier
    Boolean writeEnabled
    String tokenHash UK
    DateTime createdAt
    DateTime lastUsedAt
    DateTime revokedAt
    String revokedByUserId
  }
  AdminApi_Call {
    String id PK
    String tokenId FK
    String actorUserId
    String operation
    Json params
    Int status
    Json before
    Json after
    DateTime createdAt
  }
  bauth_user {
  }
  StaffProfile {
  }
  Campus {
  }
  bauth_user ||--o{ AdminApi_Token : "adminApiTokens"
  StaffProfile |o--o{ AdminFile : "adminFiles"
  Campus |o--o{ Signatory : "signatories"
  AdminApi_Token |o--o{ AdminApi_Call : "calls"
```
