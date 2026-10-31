---
paths:
  - "frontend/**/*{closing,Closing}*"
  - "frontend/**/*{closing,Closing}*/**"
---

# Closings: a question bank, composed per event

A **closing** is the 1:1 a dev-team member conducts with a talent at the end of an
event. It is what the codebase used to call an _entretien_; the July 2026 seminar
renamed it, and real PGE admission interviews stay out of Jump for good. Every
event format has them: a stage closing runs ten minutes, a Coding Club one five,
a camp asks about the format itself.

The questionnaire is **data in two layers**, and the split is the whole design.

- **A bank** (`Closing_Question` + `Closing_Option`) holds every question that
  exists, once, globally.
- **A composition** (`Closing_Template` + `Closing_TemplateSection` +
  `Closing_TemplateQuestion`) says which of them a grid asks, in what order, and
  with what wording. `Event.closingTemplateId` names the grid, and that null IS
  the gate, exactly as a null `feedbackFormId` hides the bilan.

**The bank is global, and that is the one deliberate inversion of `Feedback_*`,**
where a question belongs to a single form and `adminStats/feedbackResults.ts`
documents that a `key` "identifies nothing" outside it. A feedback form is
authored per form in talent-facing wording; closing questions are one
institutional vocabulary reused across formats. So "comment as-tu connu cet
événement" asked at a stage and at a Coding Club is ONE row, which is what lets a
distribution span both. Four copies of a question could never legitimately be
added up, and `stats_closing_insights` groups by bank question for that reason,
carrying `asked` beside `answered` so a question only some grids pose is never
read against the wrong base.

**And the comparison that makes legitimate is RETURNED, never left to be
composed.** A shared bank buys nothing if reading a stage against a Coding Club
means one call per event and a fold the consumer does by hand, which is what it
meant until `stats_closing_question` existed: one bank question, grouped by
campus, by event or by grid, ranked server-side on what the question actually
declares (a rating on its average, a valence-carrying scale on its favourable
share, a plain set not at all). `stats_campus_comparison` carries the two
campus-level closing figures for the same reason. This is the general rule of the
tier applied to closings, not a closings feature: a figure a director would
otherwise compute is a figure this platform owes.

Rules, each of which a reasonable-looking change breaks quietly rather than loudly:

- **A grid is composed over the API, never in a migration.** `write_closing_question`
  and `write_closing_template` are the authoring surface, and there is deliberately
  no builder UI: composing is the team's job and a form would never fit it. The
  seed migration exists to carry the one grid that predates this across, not to be
  the catalogue.
- **A closing figure is taken over the events that run closings, never over the
  whole périmètre.** An event whose section is off or that names no grid holds no
  closing, so its enrolments belong to no coverage rate: `eventRunsClosings` is
  the one spelling of that pair, and the dev sidebar's own gate calls it too. This
  is written down because the denominator was wrong for a release and nothing
  could have caught it: the figure read 18 % where it should have read 78 %, and
  the definition travelling with it already claimed the narrow reading, which is
  what made it quotable and false at the same time. The configuration gap it was
  hiding is now its own figure.
- **A published key is never renamed and never reused.** Changing what a question
  MEANS is a new key; changing how it READS is an edit, and it re-renders on
  documents already produced, which is what you want for a typo. That line is
  enforced, not hoped for: a kind change or a dropped option is refused once
  answers exist (the same lock a feedback form's write draws with
  `STRUCTURAL_QUESTION_FIELDS` in `domain/feedbackForms/authoring.ts`, where
  `prompt` is deliberately not structural).
- **`labelOverride` changes the prompt, never the identity.** A grid reads a
  question aloud in its own words ("Satisfaction globale du stage"); every figure
  keeps the bank's label, so the wording can fit the format and the number stays
  comparable.
- **An answer references the BANK question, never the composition row.** Drop a
  question from a grid and its answers still resolve, and every renderer prints
  them under an explicit "Questions retirées" heading. Removing something from a
  composition must never be able to hide what was recorded.
- **The grid is pinned on the record, not re-read off the event.**
  `Closing_Record.templateId` is a fact; `Event.closingTemplateId` is
  configuration. Retargeting an event cannot rewrite a closing already conducted.
- **The verdict is not a bank question.** `recommendation` + `verdictNote` are
  typed columns: a grid describes what is asked OF the student, the verdict is the
  team's conclusion ABOUT them, and it is Jump-wide, closed, and what the fiche,
  the admin archive and the school-year review all group on.
- **Student words and staff words live in different columns, and that split is
  what the API tier's no-PII rule rests on.** `Closing_Answer.freeText` is the
  student's, `.note` is the team's. Aggregates select the option join and
  `ratingValue`; a testimonial selects `freeText` of the one question a grid flags
  `testimonial`; nothing selects `note`. On the talent fiche the same split is
  visible rather than documented: the talent's words get the pull-quote treatment
  (`PullQuote`), staff prose stays plain behind a neutral rule, the rule
  `TalentNoteCard` already drew.
- **A closing is 1:1 with a participation, and a regular has many.** Eight to ten
  a year is the expected shape, deliberately: the successive verdicts and how they
  moved are what "Son parcours" on the fiche is for, which is also why that list
  is bounded against the viewport rather than at a pixel cap.
- **It is keyed on `(talentId, eventId)`, though, never on the participation's
  id.** That pair IS `Participation`'s natural key, so the line above still holds
  as a statement about the domain; what does not is a foreign key. `syncTalents`
  ends by deleting every participation the Salesforce payload omits, so a cascade
  from one let the CRM destroy a conducted closing - answers, verdict,
  testimonial - with none of the trace `Closing_ResetEvent` exists to guarantee,
  and a truncated payload took a whole cohort's worth at once. Every sibling
  artifact had already drawn this line for the same reason and said so
  (`EventPresence`, `Note_TalentNote`, `Feedback_Submission`,
  `EventPresenceClosure`); closings were the last to be brought over. The roster
  is still READ from `Participation`, exactly as émargement reads it: only the
  storage is decoupled. Two consequences to keep. The conduct route is addressed
  `/closings/[talentId]` under its event, because a closing whose enrolment has
  been pruned has to stay reachable. And the visibility clause
  `participationWhere` carries can no longer travel as a relation filter, so a
  figure whose denominator is enrolments applies it against
  `scopedEnrolments`' pairs instead - `closingInsights` and `campusComparison`
  both do, and dropping it is what pushes a coverage rate past 100 %.
- **`conductedAt` means FINALISED**, re-stamped at clôture, with `createdAt` beside
  it. The admin archive's ordering and windowing, each admin's export high-water
  mark, testimonial recency and the reset snapshot all read it.
- **`db/scoped.ts` must carry `closing_Record`.** A delegate with no handler there
  is not an error, it is simply unscoped, so answers are only ever reached through
  their record's relation.

Naming: the concept is a **closing** everywhere new. `entretien` survives on
purpose in two places, and neither is an oversight: as a search keyword in the
admin palette, because staff who learnt the old word still type it, and inside
`AdminApi_Call` history, because an audit row records what was actually called.
