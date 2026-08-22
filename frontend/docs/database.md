# Carte de la base de données

> Généré automatiquement par `bun run db:erd` depuis `prisma/schema.prisma`.
> **Ne pas éditer à la main** — toute modification est écrasée à la régénération.
> Le diff git de ce fichier = le journal lisible des changements de schéma.

## Vue d'ensemble

- **58** modèles · **35** enums · **85** relations

| Domaine | Modèles |
| --- | ---: |
| Authentification & Profils | 12 |
| Cycle de vie talent & RGPD | 6 |
| Événements & Participations | 10 |
| Planning & Activités | 3 |
| Progression, Portfolio & XP | 2 |
| Minijeux | 3 |
| Feedback | 7 |
| Communication & Support | 5 |
| Contenus & Centres d'intérêt | 4 |
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
    Boolean hasLaptop
    String setupDescription
    DateTime equipmentValidatedAt
    String interestsFreeText
    String externalId UK
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
    String id PK
    String titre
    String publicName
    String cohortNoun
    DateTime date
    Int startMinutes
    DateTime endDate
    String campusId FK
    String feedbackFormId FK
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
    Boolean bringPc
    String sfMemberStatus
    DateTime createdAt
    DateTime updatedAt
  }
  StageCompliance {
    String participationId PK,FK
    Boolean charteSigned
    DateTime createdAt
    DateTime updatedAt
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
  Feedback_Form {
  }
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
  Feedback_Form |o--o{ Event : "events"
  Event ||--o{ Participation : "participations"
  Event ||--o{ EventPresenceClosure : "presenceClosures"
  Event ||--o{ EventPresence : "eventPresences"
  Event ||--o{ EventConfig_Module : "modules"
  Feedback_Form |o--o{ EventConfig_Template : "configTemplates"
  EventConfig_Template ||--o{ EventConfig_TemplateModule : "modules"
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
    ActivityType activityType
    String timeSlotId FK,UK
    DateTime createdAt
    DateTime updatedAt
  }
  Event {
  }
  Event ||--|| Planning : "planning"
  Planning ||--o{ TimeSlot : "timeSlots"
  TimeSlot ||--|| Activity : "activity"
```

## 5 · Progression, Portfolio & XP

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

## 6 · Minijeux

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

## 7 · Feedback

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

## 8 · Communication & Support

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
    Json payload
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
  bauth_user ||--o{ Broadcast : "broadcastsCreated"
  bauth_user ||--o{ MessageTemplate : "templatesCreated"
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

## 9 · Contenus & Centres d'intérêt

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

## 10 · Configuration & Système

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
  StaffProfile ||--o{ AdminFile : "adminFiles"
  Campus |o--o{ Signatory : "signatories"
  AdminApi_Token |o--o{ AdminApi_Call : "calls"
```
