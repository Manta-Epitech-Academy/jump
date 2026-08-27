# AGENTS.md — Vendor-Neutral AI Agent Instructions

This document is the primary entrypoint and source of truth for all AI coding agents (Claude Code, Gemini, Cursor, Copilot, Codex, etc.) working in this repository.

**It lives at the repo root on purpose.** That is the path agents look for without being told, so `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` are one-line pointers here and hold no content of their own. If you are reading a pointer, read this file.

**Process is not optional here.** [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) is a protocol, not advice: parts of it are enforced by a CI check that blocks the merge, and it opens with a table saying which parts. Read it before your first commit on a branch, not before your PR.

@.github/CONTRIBUTING.md
@.github/JARGON.md

> **Visual work: read [`DESIGN.md`](./DESIGN.md) at the repo root first.** It is
> the visual contract (tokens, per-space skins, brand primitives, and the
> argument behind every deviation from the charte). It is referenced rather than
> `@`-imported on purpose: it is 700+ lines that only matter when you are
> touching the interface, and unlike the two files above it does not have to be
> in context to be enforced. Two guards do that instead, and both fail the build:
> `bun run test` checks the token values and every documented contrast pair
> against `frontend/src/routes/layout.css`, and `bun run lint:design` refuses an
> off-palette class. If you break the contract without having read it, you find
> out from a red test, not from a reviewer.

---

## Project Overview

Jump — an internal Epitech Academy platform for managing training events, student progress, and certifications. French-language UI. Built with SvelteKit + Prisma + PostgreSQL.

## Philosophy

**Cleanest, not quickest.** Always prefer the cleanest, most maintainable solution over the fastest shortcut. A local hotfix or a duplicated component that "works" is an anti-pattern here. Take the time to do it right.

**Modularity before optimisation.** Don't optimise prematurely. Code must first be clear and well-decomposed; optimise only when a measurable need justifies it.

**DRY everywhere.** No repetitions in code, no repetitions in documentation. If something is true in two places, it must live in one.

See [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) for the full feature pipeline and Definition of Done, and [`JARGON.md`](.github/JARGON.md) for shared vocabulary.

## Commands

All commands run from `frontend/` using **Bun**. The shell's cwd often already IS `frontend/` (it persists between commands), so a reflexive `cd frontend` fails with "No such file or directory". Anchor on the repo root instead: `cd "$(git rev-parse --show-toplevel)/frontend"` works from anywhere, including worktrees.

Task-to-script mapping lives in `frontend/package.json`.

**`bun run verify` is the gate, and it is the same gate CI runs.** It chains `lint`, `lint:design`, `lint:tests`, `check`, `test`, `test:integration`, `test:schema-drift` and `test:e2e`, in that order, through the same scripts the required checks call. Run it before you say you verified something: the point is that the claim is recontrollable by somebody else, and a green `verify` is the artifact that makes it so. Anything needing a real database provisions itself (`scripts/with-test-db.sh`), so there is no `docker compose up` and no `migrate deploy` to remember. See `frontend/TESTING.md` for the individual links in the chain and for what each CI job actually executes.

**Docker** (from repo root): `docker-compose up` starts PostgreSQL + SvelteKit.

**Git worktrees:** a freshly-added worktree has no `.env` (untracked) and no `node_modules`. The `.githooks/post-checkout` hook auto-provisions it on creation — links `.env` from the main checkout and runs `bun install`. If your editor adds worktrees without firing git hooks, run `bun run setup:worktree` once to do the same. It also has no `.env.test`: copy it from `.env.test.example` once, and note that it deliberately carries no `DATABASE_URL`.

**A worktree gets its own test database, and that is not a nicety.** `scripts/with-test-db.sh` derives the name from the worktree (`jump_test` in the main checkout, `jump_test_<worktree>` elsewhere) on the one container from `docker-compose.test.yml`, and derives the E2E server's port and `ORIGIN` from that same discriminant: a value that is per-worktree in one layer and shared in the other is not isolated, and the port being the shared half let one worktree's gate run green against another's build. They used to share the single `jump_test`, so a `migrate deploy` run from one branch left every other worktree's integration suite red against a schema it was never written for, with nothing to say so. Two traps the script exists to absorb: `prisma.config.ts` loads the repo-root `.env`, which points at the shared DEV database, and an already-set `DATABASE_URL` only wins because the script exports its own last; and the test container is not clean per launch (the postgres image declares its own volume, so a restart keeps its data - only `docker compose -f docker-compose.test.yml down -v` resets it).

**Testing Philosophy:** Prefer high-value, critical-path tests over sheer test volume. Never create redundant or useless placeholder tests. Focus exclusively on core domain logic, security & role permissions, bug-regression edge cases, and critical end-to-end user flows.

**`.svelte-kit/` belongs to the dev server, and to nothing else.** Anything that loads the SvelteKit vite plugin regenerates that directory when it runs, `generated/root.svelte` and `generated/client/app.js` included, so doing it while a dev server is live blanks the page in the browser until that server is restarted. Every other command therefore gets its own directory through `KIT_OUTDIR`, which `svelte.config.js` reads: `bun run check` uses `.svelte-kit-check/` (set in the script, since `svelte-check` has no config file of its own), vitest uses `.svelte-kit-test/` (set in `vitest.config.ts`, so an editor's test runner obeys it too), and the E2E suite's build uses `.svelte-kit-e2e/` (set in the `webServer` command in `playwright.config.ts`). A new command that touches the plugin needs the same treatment, plus an entry in `server.watch.ignored`.

**When a `package.json` script exists for the task, use `bun run <script>` rather than invoking the tool directly.** The scripts often set env vars (`KIT_OUTDIR=.svelte-kit-check`) or flags (`--tsconfig ./tsconfig.check.json`) that a bare `bun svelte-check` or `bunx svelte-check` will silently skip — leading to types being written to the default `.svelte-kit/` dir or the wrong strictness. For one-shots without a matching script, `bun <tool>` is fine; reach for `bunx` only when the tool isn't installed locally.

## Architecture

### Workspaces

The app splits into four workspaces, each serving a distinct audience and business goal:

| Workspace  | Path           | Audience          | Objective                                              |
| ---------- | -------------- | ----------------- | ------------------------------------------------------ |
| **Dev**    | `/staff/dev/`  | `superdev`, `dev` | Talent Acquisition & Recruitment (admissions pipeline) |
| **Admin**  | `/staff/admin/`| `admin`           | Global system overview; account impersonation          |
| **Talent** | `(talent)/`    | students          | Student experience: gamification, progression          |
| **Parent** | `(parent)/`    | legal guardians   | Règlement co-signature, image-rights decision          |

**Terminology:** See [`JARGON.md`](.github/JARGON.md) for shared vocabulary. Critical for reading this codebase: `dev` roles and `/dev/` routes refer to the recruitment team (Business Development), not software engineers.

### Auth System

Uses **BetterAuth** (`src/lib/server/auth.ts`) with two methods:

- **Microsoft OAuth** for staff and admins (must be `@epitech.eu`)
- **Email OTP** (6-digit, sent via Resend) for students and parents

Route guards in `src/lib/server/auth/guards.ts` enforce role-based access. Session data is loaded in `hooks.server.ts` into `event.locals` (user, session, staffProfile, talent).

Staff are routed by `StaffProfile.staffRole` (Prisma `StaffRole` enum: `admin`, `superdev`, `dev`). After login, staff redirect to their role-specific space. Guards block cross-space access and redirect to correct space. Role-to-path mapping lives in `src/lib/domain/staff.ts` (`getStaffRoleRedirectPath`).

| StaffRole         | Space                                |
| ----------------- | ------------------------------------ |
| `admin`           | `/staff/admin/`                      |
| `superdev`, `dev` | `/staff/dev/`                        |
| `null`            | blocked, shown "contact admin" error |

Client-side auth at `src/lib/auth-client.ts` (browser-side BetterAuth).

### Role gating

Inside a workspace, role-based gating goes through **one table** of named role groups in `src/lib/domain/permissions.ts`:

| Group            | Roles             | Use for                                                    |
| ---------------- | ----------------- | ---------------------------------------------------------- |
| `devMember`      | `superdev`, `dev` | Dev workspace daily ops (participants, closings, update) |
| `realSendArmers` | `admin`           | Arming real outbound sends / login-redirect pin            |

- **Client:** `const canEdit = $derived(can('devMember', page.data.staffProfile?.staffRole))`, then apply one of the UI patterns below. Import: `$lib/domain/permissions`.
- **Server:** `requireStaffGroup(locals, 'devMember')`. Import: `$lib/server/auth/guards`. Call it in every mutating action, or at the top of a `load` to gate a whole route.

**There is no superdev-only group today.** `superdev` and `dev` are permission-identical; the only thing the enum still separates is which roles a superdev may invite (`INVITABLE_STAFF_ROLES`, a catalogue, not a gate). Add a group back to `STAFF_GROUPS` the day a lead-only action exists. Never inline a `['superdev']` array at a call site.

**UI pattern rule — pick one per site, do not mix:**

| Pattern           | When                                                       |
| ----------------- | ---------------------------------------------------------- |
| Hide              | Nav entries to restricted destinations (sidebar, menus)    |
| Disable + tooltip | Mutating controls visible on shared screens                |
| Redirect / 403    | Direct URL access, via `requireStaffGroup` in the `load`   |

### Event modules

Dev surfaces are enabled **per event**, not per campus. There is no feature-flag
subsystem: the per-campus `CampusFeatureFlag` table, `domain/featureFlags.ts`,
`requireFlag` and `locals.featureFlags` were all removed in favour of this.

- **Catalogue:** `EVENT_MODULES` / `EVENT_MODULE_DEFS` in `src/lib/domain/eventModules.ts`.
- **Storage:** one `EventConfig_Module` row per `(eventId, moduleKey)`, with an optional `settings` Json bag validated app-side by a per-module Zod schema. Typed FKs (e.g. `Event.feedbackFormId`) stay columns on `Event`, never in the bag.
- **Presets:** `EventConfig_Template` is a named, point-in-time seed applied by the config wizard. Applying one copies modules + settings; there is no live link afterwards.
- **Routing:** `reachableSurfaces` / `firstReachableSurface` decide which surface the dev dashboard lands on.
- **A document an event issues is a nullable FK on `Event`, never a sub-option.** `Event.diplomaTemplateId` names which certificate the Inscrits export renders, and `null` means it issues none. That nullness IS the gate: there is no companion boolean, because "does this event issue one" and "which one" are the same question. It replaced exactly such a boolean (`inscrits.diplomas`), which could only ever turn the one hardcoded document on or off.

  The certificate itself is a `Diploma_Template` row whose CSS and markup are **authored at runtime** over the API, because the set of documents grows with the business and their wording belongs to the team, not to a developer. Two consequences worth stating. **A stored design is outside the `DESIGN.md` contract**, which guards code: `lint:design` cannot see it, and that is an accepted trade, not an oversight. And **the shell is not**: `templates/certificate.html` keeps the pagination and the once-in-`<head>` hoisting of logo, signature and font bytes, because repeating those per page is what timed out a 200-page render. Since a stored design is handed to a real Chrome inside the cluster, `server/diplomaSanitize.ts` refuses it and sanitises it, and `infra/documentRenderer.ts` renders it with script execution and the network both off. The script switch is the one that actually contains the damage, and the two are not interchangeable: Puppeteer's request interception never sees a `ws://` handshake, so a design that got as far as running could still reach every internal service the pod reaches.

Don't hardcode module keys.

### Closings: a question bank, composed per event

A **closing** is the 1:1 a dev-team member conducts with a talent at the end of an
event. It is what the codebase used to call an *entretien*; the July 2026 seminar
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

Rules, each of which a reasonable-looking change breaks quietly rather than loudly:

- **A grid is composed over the API, never in a migration.** `write_closing_question`
  and `write_closing_template` are the authoring surface, and there is deliberately
  no builder UI: composing is the team's job and a form would never fit it. The
  seed migration exists to carry the one grid that predates this across, not to be
  the catalogue.
- **A published key is never renamed and never reused.** Changing what a question
  MEANS is a new key; changing how it READS is an edit, and it re-renders on
  documents already produced, which is what you want for a typo. That line is
  enforced, not hoped for: a kind change or a dropped option is refused once
  answers exist (the same lock `feedbackFormsAdmin.ts` draws with
  `STRUCTURAL_QUESTION_FIELDS`, where `prompt` is deliberately not structural).
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

### Data Layer

Prisma schema at `frontend/prisma/schema.prisma`. Data is campus-scoped.

### Data modeling: facts as rows, state as projection

Several domain tables are append-only fact/log records — `MinigameAttempt`, `BroadcastRecipient`, `XpGrant`, `ImageRightsDecisionRecord`. Current values that derive from them are **cached projections** recomputed transactionally on each write, not independently mutated (e.g. `Talent.xp` = `SUM(XpGrant.amount)`).

When persisting a new domain fact, follow this shape rather than a mutable counter or a `Json` blob: the fact gets a row, and any aggregate is a projection refreshed in the same transaction. A bare counter is lossy — you can't explain, audit, or timestamp the value, and ad-hoc `Math.max(0, x - n)` adjustments drift. The XP ledger is the reference implementation (see below).

**Not for polled external state.** The ledger shape fits discrete domain facts that happen once. Do *not* append a row per poll of a mutable external system — the Salesforce sync runs every ~30 min, so an append-only log would bloat with no payoff. Mirror the external system's current state in a 1:1 typed row, upserted only when the inbound payload differs (see `TalentSfImport` under Salesforce reconciliation).

### Relational modeling

Model relationships and entities by their real shape. These are deliberate calls, not defaults to reach for — each is anchored to a model in this schema:

- **Many-to-many → join table.** A pure junction with a composite PK, e.g. `TalentInterest` (`@@id([talentId, interestId])`). Use one only when **both** sides are genuinely many.
- **One-to-many → foreign key on the "many" side, not a join table.** A talent has one current school → `Talent.schoolId`, never a `TalentSchool` link table. The tell that you've mismodeled a 1:N as M:N: you find yourself adding a `@@unique` on the FK column to stop duplicates.
- **A link table *with attributes* is an associative entity — a separate decision.** A bare junction glues two keys; the moment the relationship itself carries data (a `source`, a `confirmedAt`, a quantity), that's a deliberate entity. Don't reach for it speculatively, and don't refuse it when the data genuinely belongs on the relationship.
- **A domain entity gets its own table + FK, not loose strings/JSON.** A thing referenced repeatedly (a high school) gets a typed, deduplicated row (`School`), not `name`/`city`/`uai` columns copied onto every referrer. "Normalize later" tends to never happen.
- **External-system data → anti-corruption mirror, kept apart from your truth.** Don't fold a third party's claims into your aggregate root. Keep what *you* believe (`Talent`) separate from what an external system *claims* (`TalentSfImport`), and reconcile explicitly (see Salesforce reconciliation).
- **A relationship already carried by a foreign key needs no second marker.** If A already points at B via an FK, don't add an `ownerB`/`belongsToB` column that re-encodes the same link: it duplicates a tie you can already query, and it drifts. Before adding a column to bind two rows, check whether an existing FK (or a count over it) already answers the question. When the tie is incidental, don't model it at all: prefer computing the answer to storing a flag.
- **New models are prefixed by feature group: `Prefix_ModelName`.** A model belonging to a feature area carries a `Feature_` prefix in its **Prisma model name** (e.g. `Note_TalentNote`, `EventConfig_Module`, `Feedback_Form`), not a `@@map`. This namespaces the schema by feature so related tables sort and read together.

### Default to less: coupling and surface

The safe default here is the smallest thing that meets the need. Three rules, learned the hard way:

- **Prefer the least coupling that works.** Reference by id over embedding or ownership. A control governs only its own surface: a per-event sub-option hides its own column, it does not reach into an unrelated screen like the talent fiche. A preset or template is a point-in-time copy applied once, not a live link. An external attribute (the Salesforce event type) is a hint, never a binding. Features that merely relate should reference each other, not interlock.
- **When a concept is questioned as redundant or "too clever", delete the mechanism, don't refine it.** Refining coupling that should not exist only yields subtler coupling. If you cannot say what a column, flag, or abstraction buys beyond what is already expressible, remove it instead of making it cleaner.
- **Build the minimal surface first.** Don't add a management page, a seed script, or a built-in-vs-custom distinction speculatively. Manage a thing inline (in the dialog or list that already exists) until volume genuinely justifies a dedicated surface; a catalogue is told apart by names before it needs a type filter.

### XP System

XP follows the ledger pattern above. Each granting fact is one `XpGrant` row (unique on `(source, sourceId)`; sources: `onboarding`, `minigame`, `activity_presence`, `admin_adjustment`). `Talent.xp` = `SUM(amount)` and `Talent.eventsCount` = present-participation count, both cached projections.

- **Never mutate `Talent.xp` directly.** It's a cached projection of `XpGrant`; go through `xpService` so the recompute stays atomic.
- Activity difficulty → XP: Débutant=20, Intermédiaire=45, Avancé=75 (`src/lib/domain/xp.ts`).
- **Level is derived, not stored** (`Talent.level` was dropped). Use `computeLevel(xp)` (tiers: Novice 0–199, Apprentice 200–499, Expert 500+). `JUMP_LEVELS` is canonical in `domain/xp.ts`; `xpRangeForLevel` maps a tier back to an `xp` range for the broadcast filter. No level tier is surfaced in the dev workspace, so there is no French label helper.
- Backfill/repair: `scripts/backfill-xp-ledger.ts` (idempotent, `--dry-run`).

### Onboarding: one dossier per school year

Platform onboarding is walked once per school year. `Onboarding_Record` is the fact (one row per `(talentId, schoolYear)`); the flat onboarding columns on `Talent` are its cached projection, stamped with `Talent.onboardingSchoolYear` so a reader can tell which year they describe. Writes go through `onboardingYearService`, in the caller's transaction, never straight to the columns.

Three rules, each of which a reasonable-looking change breaks silently rather than loudly:

- **The projection describes the MOST RECENT dossier, not the current year.** `schoolingService` does the opposite deliberately, so aligning the two is the tempting mistake: a guardian co-signing after the 31 July cutover writes to last year's dossier, a clock-based refresh would skip it, and the parent portal would ask for that signature forever. The clock belongs on the read side, where it decides whether a dossier still counts.
- **Three kinds of reader, and the rule is stated once, on `DatedOnboardingFields`.** "Has this talent ever signed, and when" reads the flat columns as they stand: the signature-date series, early-bird (which pairs them with the year stamp). "Is year Y's dossier done" goes through `onboardingFieldsForYear`, or through the dossier rows when the question is about a year that is not the current one: the wizard, the guards, broadcast filters, the staff dossier statuses, what a guardian still owes. **Anything that names one document reads the dossier row**, never the projection: the PDF worker, `/settings/documents`, the staff archive export, onboarding velocity. And **"what applies to this person right now" reads neither**: there is exactly one such question, the image-rights stance, and it is below.
- **A year-scoped aggregate reads dossier rows; an unscoped one reads the projection.** Both branches are in `adminStats/cohort.ts` and both are load-bearing: filtering the projection by year answers a question about 2025-2026 with 2026-2027's state, and pinning an unfiltered cohort to the year in progress counts every past promotion as blocked on step one, permanently. The exception is a **dated** series, which has no projection branch at all (`completedDossierWhere`): a completion and the date it is filed under have to come off one row, or a scoped answer quotes another year's date and an unscoped window silently loses the earlier of two completions.
- **A question about a guardian's outstanding acts is NOT a year question.** `isParentDossierComplete` and the `db/dossierCompliance` fragments it twins with read the flat columns unnarrowed, because that is what the parent guard asks and therefore what decides whether anybody is actually chased. Year-scoping one side of that made the admin directory's chip read "En attente" for every talent whose dossier predates the cutover while its own filter and KPI tile counted them complete.

Collégiens have no dossier at all. `isOnboardingEligible` is a property of the niveau (`domain/niveau.ts`), layered **over** the ladder in `guards.ts` and in the aggregates, never inside `getOnboardingStep`, whose contract is that the step is a pure function of the timestamps set. The RGPD charte is still owed to them, which is what the standalone `/charte` is for, and it is a once-per-account consent: not re-asked of a returning talent, and its date never restamped.

**Two documents are settled once per school year: the règlement intérieur and the droit à l'image.** Everything below applies to both, and the second one earned the rule the hard way rather than by analogy, so do not treat either as a special case.

Each is a **versioned catalogue** (`lib/content/reglement/`, `lib/content/droit-image/`), pinned at signature time (`reglementVersion` on the dossier, `version` on each `ImageRightsDecisionRecord`). **A published version file is never edited and never deleted:** the PDF is regenerated from DB state on every later act, so editing one rewrites the wording of documents already signed. A new wording is a new key. The rules themselves live once in `content/versionedDocument.ts`; each file opens with a comment saying whether it is frozen or in force, and a unit test keeps those comments out of the rendered document. A droit-à-l'image version holds *two* texts, the authorization and the refusal, keyed together so a version cannot exist on one branch and not the other.

**The rendered PDF belongs to the dossier, not to the talent** (`Onboarding_Record.rulesFilePath` and `imageRightsFilePath`, keys `documents/{talentId}/{kind}-{schoolYear}.pdf`). Version-pinning protects the *wording* of a signed document; this protects the *document*. One key per talent meant the second year's render overwrote a PDF a legal guardian had already signed for a minor, with no way to rebuild it, and it silently dropped the previous year out of `/settings/documents` and the staff archive. Three consequences to keep: an `OnboardingPdfJob` carries the `schoolYear` it renders, **not null and with no fallback**, because a job can be queued or retried long after the act that asked for it and "the current dossier" will have moved (a nullable column with the worker falling back to the most recent dossier is the same bug wearing a default, and it stays dormant until the talent comes back); the worker renders **from that dossier row**, which is now the only thing it can do, since the job's payload snapshot was dropped rather than left unread (a snapshot re-publishes a decision that has since been reversed, and a job that carries generator inputs invites somebody to render from them again); and both reset paths (`resetTalentToImport`, `anonymizeTalent`) collect the keys from **every** dossier row, since deleting the rows is what drops the references. A document kind declares `scope` and `dossierFilePathField` in `ONBOARDING_DOCUMENTS` rather than naming a `Talent` column, which is what let the règlement keep pointing at a per-talent artifact after it became annual.

**A consent expires; an interdiction does not.** The image-rights decision is asked once per school year, so its projection goes blank when a talent reopens a dossier, which is right for every "what does this family still owe" reader. It is wrong for the only question that is not about a year: whether this student may be photographed today. That one is `imageRightsStance` (`domain/imageRights.ts`), fed by the latest `ImageRightsDecisionRecord` across all years, so a refusal nobody has revisited keeps forbidding while the dossier reads "En attente", and a *lapsed authorization* resolves to `unknown` rather than to consent. Read the projection alone and the marker silently drops off a refused student's printed badge on the first day of the new school year. Only `forbidden` is marked on printed material; marking every `unknown` would flag most of the cohort each September and the marker would stop being read. The figures obey the same split, and the reason is that one of them is quoted to people: `stats_compliance_status` returns the three-state decision **for the year in scope**, which is the state of that year's campaign and what the relance reads, plus `imageUseForbidden`, the standing interdictions, which is the only figure to consult before publishing a photo and the only one in that answer no school-year filter narrows. Returning the per-year `refused` count alone answers "combien ne doivent pas être photographiés" with a number that goes to nearly zero every September.

**Collégiens are out of the image-rights flow, and not because of the ladder.** The blocker is upstream: `parentEmail` is only ever written by the wizard's parents step and `TalentSfImport` carries no guardian fields, so Jump holds no address to ask. Nothing in the model forecloses them, since their decision would simply open a dossier row carrying only the image-rights block. If they are photographed at a Coding Club, the consent gap is real and is handled off-platform.

### Salesforce reconciliation

Talent profile fields have two sources — the worker sync (Salesforce) and onboarding (the student). They are **reconciled, not blindly overwritten**.

- **`Talent` = Jump's current truth.** Onboarding writes it directly (**optimistic**: the student's input shows on their dashboard immediately; staff arbitrate divergences afterward — there is no pending-validation gate).
- **`TalentSfImport` = 1:1 typed mirror of Salesforce's last claim** — the anti-corruption boundary. Written *only* by `syncService.syncTalents`, never by onboarding, and upserted only when the inbound payload differs.
- **`School` = canonical UAI-keyed directory**, resolved lazily from the éducation-nationale annuaire (`server/annuaire.ts` + `schoolService.resolveSchoolByUai`). Only schools actually attended ever land here, never the ~69k national set. It replaced the old free-text `highSchoolName/City/Uai` columns: `Talent` now carries a `schoolId` FK (+ `highSchoolNameManual`, used *only* when a lycée has no UAI). The student's school and SF's claimed school (`TalentSfImport.sfSchoolId`) both FK the same `School`.
- **No-clobber rule:** before a field is talent-confirmed (its `*ValidatedAt` is set), sync re-seeds it on `Talent`; after, sync writes **only the mirror**. Never let SF overwrite a confirmed value. (This fixed a real bug where every sync overwrote the talent's confirmed phone/name.)
- **Conflict** = field is talent-confirmed **AND** `Talent` ≠ `TalentSfImport` (school compared by FK). Computed in `reconciliationService`, never stored. Surfaced at `/staff/admin/sf-conflicts` (list + accept/reject + CSV export); `acceptJump` realigns the mirror optimistically. `niveau` is SF-owned (onboarding never sets it) → always synced, never a conflict.

### UI, API, or both

The admin space stopping its UI growth (below) is often read as "admin work goes to the API". That is not the axis. What the freeze reacted to is **pages that restate the database**: one screen per question, none fitting anyone exactly. Five tests instead, and they cut across spaces:

1. **Is the output a fact, a figure, or a bounded state change?** → API. A chat composes the exact answer; a screen freezes one shape of it forever.
2. **Does the human need to *see* the result to decide?** → UI. When the acceptance test is "does this look right", no JSON substitutes for a render.
3. **Is it done while already on a screen that exists?** → put the control there. That is not growing the admin space; the certificate picker in `EventConfigWizard` replaced a switch that was already in that dialog.
4. **Is it done under time pressure, in the field, repeatedly?** → UI. Nobody opens a chat client to check in 200 students at 9am, which is why émargement is a screen.
5. **Is it for someone who will never hold a token?** → UI. Talents, parents, campus staff.

**And the rule under all five: the API is the floor.** Every capability lands as a named operation first; a UI is optional convenience on top. A config field reachable only in the wizard is a hole, because event configuration is already fully MCP-driven, and the people who use it prefer it that way: a form will never be exactly what its user wants, whereas a named operation is. Stated here because it is mechanically checked - `operations.test.ts` asserts that every field of `adminEventSchema` is reachable through some write, and that every catalogue entry is mounted on exactly one HTTP route. `write_event_inscrits_options` exists because that test found `moduleSettings` reachable through nothing at all.

The corollary is narrower than it looks. "No form will ever fit" is decisive for **authoring** surfaces. It says nothing about a picker inside a flow somebody is already in.

### Curated admin API and MCP

The admin space **stops growing UI**. New admin capabilities ship as curated named API operations, consumable over HTTP and as MCP tools (July 2026 seminar). Campus staff and talents never get MCP.

Rules, all non-negotiable (they come from the team's own Salesforce-MCP failure analysis):

- **The LLM formats, it never computes.** Every figure is returned wrapped with its own French definition (`adminApi/metrics.ts` → `metric(value, definition)`), so it can be quoted but not re-derived. This extends to ratios: `share()` exists because returning two counts and no percentage just moves the division downstream, where the consumer picks its own denominator and its own wording. Any proportion a human would ask for is a figure the API returns. The instruction to quote rather than compute is declared **once**, as the MCP server's `instructions`; a definition itself is owned by whatever owns the rule it states (the visible-cohort clause lives with `visibleParticipationWhere` in `domain/sfMemberStatus.ts`), never spelled out again in a tool description or a second aggregate.
- **Curated named operations only.** `adminApi/operations.ts` is the single catalogue: HTTP endpoints, MCP tool names and audit `operation` values all read from it. Adding a question means adding an entry; there is no generic query surface. Each entry carries **one** strict schema used by both consumers, so an unknown filter is a refusal over HTTP *and* over MCP (hand the SDK a raw shape instead and it silently strips the key, which answers a wider question than the one asked).
- **An unknown scope is a refusal, never a zero.** Filters name things the caller can actually see: a campus is its unique `Campus.name`, not a cuid no operation returns. `adminApi/scope.ts` checks every campus, event and school year exists before anything is counted, and the refusal lists the values that would have worked. Skipping that check is how `campus: "Lile"` came back as `{ campus: "Lile", events: 0 }`, a confident zero with the echoed filter confirming it.
- **No talent identity, at any tier.** No answer carries a `nom`, `prenom`, `email` or `phone`, and none may. What a core-tier answer *may* carry beyond aggregates: row ids that a write needs (an event, a PDF job), operational internals, and the verbatim student testimonials from `stats_closing_testimonials`, which are unattributed and were collected explicitly to be quoted. Everything else free-text (the per-question notes, the team verdict, feedback answers) stays out and is only counted. Enforced by running it: `adminApiNoPii.integration.test.ts` seeds a talent, conducts a closing on him, calls every read, and fails on the identity.

  Testimonials are the one exception, and it is stated rather than implied: unattributed is not the same as non-identifying, because a student can sign his own sentence and verbatim means it goes out signed. Screening a quote against its author's name was weighed and turned down (what makes the answer worth having is that it is what was written), so the French definition says so and the test pins the behaviour. Only that operation is exempt from the string search, never from the structural one: a `nom` reappearing in its select still fails.
- **Hard caps + audit.** Every list is capped, every token is quota-limited per 24h, and **every** call (success or refusal) writes an `AdminApi_Call` row. Audit replaces up-front restriction, so nothing may bypass it. Including what a transport refuses on its own: the MCP SDK rejects an unknown tool name and validates arguments before a tool handler runs, so `mcpServer.ts` reads the envelope first (`auditUnreachedToolCall`) and logs those refusals, which are exactly the ones that show a model probing.

  Two consequences of "a row per call", both load-bearing. **One call per MCP request**: a JSON-RPC batch is refused (`envelopeRefusal`), because quota, plan digest and audit row are all spent per call, so a batch lets one HTTP request spend N of them ahead of the authorisation that guards them. And **the endpoint assumes a rate limit at the edge**: a refused call writes its row like any other, so unauthenticated traffic is unauthenticated *writes*, at request rate. That control belongs at Cloudflare, which fronts prod, and specifically not on the Traefik ingress: traffic reaches the cluster through a `cloudflared` tunnel, so Traefik sees the tunnel pods as the source and a per-IP rule there would put every caller in one bucket, which is worse than none because it reads as protection. The zone's bot mitigation is not that control either, and is the easy thing to mistake for it: it classifies traffic instead of bounding a rate, and an unauthenticated `curl` POST does reach the app. The rule is scoped to the `/api/admin` and `/api/mcp` prefixes, which every endpoint of this tier lives under today, so one mounted anywhere else leaves the protection behind with nothing failing to say so. None of this is checkable from the app, which is why it is written down here.
- **A parameter that names a thing declares where that thing comes from.** This tier's only consumer is a language model, so a parameter no answer produces is not awkward, it is dead, and it fails silently: the operation sits in the tool list and refuses only when called with a value nobody could have. `adminApi/handles.ts` is the single map from a named value (an event id, a form id, a question key) to the reads that return it and the slice each one covers. The parameter descriptions, the French sentence every refusal ends with, and `meta_operations`' `requires` / `provides` are all generated from it. `handles.test.ts` then walks the catalogue and fails when a parameter has no producing read **its own tier can call**, insists every parameter be classified as a handle or as naming nothing, and runs itself against a doctored registry so a broken guard fails instead of passing forever.

  The per-tier clause is the point. That hole had already shipped twice: `stats_feedback_results` once required a form id obtainable only from a configuration answer national leadership cannot reach, and `ops_resolve_sync_errors` took a list of row ids no read has ever returned. Between adding a read to feed a parameter and removing a parameter nothing can feed, the second is honest; a handle nothing returns *on purpose* (`ops_reset_closing`) declares that, in both languages, because an oversight reads exactly the same. This replaced provenance written as prose in nine places naming three different lists, none of them naming the operation that actually covered the common case.
- **The gap is a measured quantity.** `ops_api_usage` reports the refusal rate **per operation** and the operation names callers reached for that do not exist. Both were already in `AdminApi_Call` and unread, which is why the two holes above were found in a conversation instead of in a report.
- **Say what the figures cannot answer.** Jump holds no admission outcome, so nothing here is a conversion rate. `stats_school_year_review` returns a `limites` field saying so in French, because a consumer handed only good figures fills the gap itself.

**Two tiers, one catalogue.** An entry declares `leadership: true` to be reachable by a tier-2 token; the default is core-team only, so `core ⊇ leadership` holds by construction and the leadership surface only ever grows by an explicit opt-in. What qualifies is a figure or a ranking (cohort make-up, school reach, attendance, the cross-campus comparison, lycée churn, closing answers, the school-year review), plus the unattributed student testimonials, which were collected to be quoted and whose first reader is this tier. What does not is anything `ops_*` or `config_*` and any free text somebody wrote *about* a student. Enforced in `guard.ts` (which refuses) and mirrored in `mcpServer.ts` (which does not register the tool, so a model never tries). A leadership token is minted by an admin for someone with no Jump account, so `AdminApi_Call.actorUserId` names the *issuer* and the token label names the holder.

Three rules keep that surface honest, and each closed a hole that shipped once:

- **Ids are judged by what they are, not by being ids.** Never one that identifies a person, and never one only a write could spend. An event id is a périmètre key many leadership reads accept, so withholding it would leave the tier holding a parameter it cannot obtain; `stats_events` is where it comes from. Which operation hands out which id is declared, not counted by hand: see the handle registry above.
- **A leadership answer carries `fraicheur`.** Composed once in `defineOperation`, for every `leadership: true` entry, because its reader can call neither `stats_sync_health` nor the admin sync page: a dead worker would otherwise let them quote last week's platform as today's. "An unknown scope is a refusal, never a zero" has this sibling, and `dataFreshness.ts` owns the threshold for both tiers.
- **Nothing the tier would otherwise compute is left to it.** Any proportion, *any ranking, and any year-on-year movement* is returned already computed. Two working rules follow, and both closed real holes: **a definition never asks its reader to calculate** (if it says « l'écart avec », « face à » or « la somme de », the figure is missing), and **every breakdown row carries its share**, as `SchoolRow` and `LevelRow` always did and `BreakdownRow` did not. The ranking helper is `metrics.rank`, shared rather than re-derived: hence `stats_campus_comparison` and `stats_feedback_question` (both ranked server-side, ties sharing a rank, unmeasurable values unranked rather than last) and `compareTo` on `stats_school_year_review` (`metrics.variation`, which withholds the relative gap on a rate because 20 % to 30 % is +10 points, not +50 %). Handing back two years and letting the consumer subtract them means the growth figure, the one actually quoted, is computed downstream in its own wording.

**The tier names a usage, not a job title.** Every national director gets a leadership token, including the Directeur des Opérations, whose operational questions stay with the internal admin team rather than becoming an `ops_*` exception. Configuring Jump is the core team's job, so `leadership` grants reads only (asserted in `operations.test.ts`).

**Reads and writes.** An entry's `kind` decides the HTTP verb (`adminApiRead` → `GET`, `adminApiWrite` → `POST`, each asserting the catalogue at import), whether the token needs `writeEnabled`, which quota applies, and whether the answer lands on the audit row as `before` / `after`. Three classes govern what may become a write at all:

| Class | Test | Treatment |
| --- | --- | --- |
| **A - direct** | Bounded to named rows, reversible, internal (sends no message) | A tool. Applies immediately, audited with before/after, description states whether repeating is safe |
| **B - two-step** | Touches many rows | Mandatory dry run returning the exact rows that would change plus a `planDigest`, then an apply echoing it (`adminApi/plan.ts`) |
| **C - never a tool** | Irreversible, outbound, identity-bearing or PII-bearing | Human action. Every broadcast send or retry, `users/invite`, `impersonate`, `talents/resetToImport`, the RGPD erasure fulfilment, and every `delete` a model could aim on its own |

The qualifier on that last one is the whole test, and `ops_reset_closing` is what it was written for: a closing reset is a hard delete, irreversible, and it is still a tool. What makes it one is that **no read in the catalogue returns a `Closing_Record.id`** (check `ANSWER_SELECT` in `closingInsights.ts` and the testimonial select), so a model cannot pick a victim, only carry out a reset on an id a human read off the admin closings page and handed over. Template and question ids ARE returned, and that is the distinction: they are what an author spends on a write that composes a grid, not on one that destroys a conversation. Add an id to a read and you have silently promoted the delete into class C, so before returning any row id, ask which write could spend it.

Three things follow that are easy to get wrong. **Writes are token-only**: an admin browser session reads but never mutates, so every change is attributable to a credential somebody deliberately minted, and a cookie-carrying cross-origin POST is not a threat model this endpoint has to reason about. **The two-step contract holds no state**: the apply recomputes the plan and compares digests rather than looking up a stored one, which also catches the world moving between the two calls, and needs no table on horizontally-scaled pods. And **a token is only as alive as its owner's role**: `verifyToken` re-reads `StaffProfile.staffRole` on every call, so a demotion cuts the credential the way a departure already did through the FK cascade, and `updateStaffRole` never has to learn that this table exists. Its inventory is shared for the same reason it is audited: every admin sees and can revoke every token, because a leadership token's holder has no Jump account and no way to cut his own.

Pieces:

| Concern | Where |
| --- | --- |
| Tokens (mint / verify / revoke, sha256-hashed, secret shown once, tier + write capability fixed at mint, owner's admin role re-read on every call, one shared inventory) | `adminApi/tokens.ts`, minted from `StaffApiTokensDialog` via the action-only `/staff/api-tokens` route |
| Auth, tier, write capability, both quotas - every refusal in one place | `adminApi/guard.ts` |
| Caller-facing errors (`OperationRefusedError`, and which failures explain themselves) | `adminApi/errors.ts` |
| Authorise, run, record: the one step both consumers share, so an answer and its audit row can't depend on the transport | `adminApi/execute.ts` |
| Audit rows with before/after + retention purge | `adminApi/audit.ts`, `POST /api/jobs/gc-api-audit` |
| Operation catalogue (one strict schema per entry, `kind` / `leadership` / `twoStep`) | `adminApi/operations.ts` |
| Scope resolution + refusals (campus by name, event by id, school year); the campus list a refusal and `meta_scope` share | `adminApi/scope.ts` |
| Figures with their definitions, and the arithmetic no consumer has to do: shares, medians, year-on-year movement, server-side ranking | `adminApi/metrics.ts` |
| Data age carried by every leadership answer, and the staleness threshold both tiers read | `services/adminStats/dataFreshness.ts` |
| The vocabulary the filters accept (campus names, school years), so discovery is not a deliberate error | `services/adminStats/scopeVocabulary.ts` |
| Where every named value (event id, form id, question key) comes from, per tier, and the guard that fails when nothing produces one | `adminApi/handles.ts` |
| Dry-run digest and the two-step contract | `adminApi/plan.ts` |
| Write implementations | `adminApi/writes/{events,ops,bulk,diplomas}.ts` |
| HTTP endpoints (one line each) | `adminApi/route.ts` → `src/routes/api/admin/**` |
| MCP tools (stateless, `@hono/mcp` transport, tool list built per credential) | `adminApi/mcpServer.ts` → `POST /api/mcp` |
| Aggregation services | `services/adminStats/*` (reuse `EventService.listAdminEvents`, `cohort.ts`'s shared scope, `cohortOverview`'s rankings, the onboarding ladder, `infra/syncStatus`) |

`services/adminStats/cohort.ts` is where "the cohort in scope" is defined once, for every aggregate: an operation states what it measured, never who it measured it over.

The weekly PO digest (`services/adminDigest.ts`, `POST /api/jobs/admin-digest`) reads those same services, so an inbox figure and an asked figure can't disagree.

### Key Server Services (`src/lib/server/`)

- **`auth.ts`** — BetterAuth config (Prisma adapter, Microsoft OAuth, email OTP, admin plugin with impersonation)
- **`adminApi/`** — curated admin API: token auth (tier + write capability), quotas, audit log with before/after, operation catalogue, write implementations, two-step plan digest, MCP server (see above)
- **`services/adminStats/`** — the curated aggregates (cohort profile, school reach and lycée churn, attendance, the cross-campus comparison, closing insights and testimonials, feedback results, engagement, onboarding funnel and velocity, compliance, the operational queues, configuration state, the school-year review), each figure carrying its definition
- **`services/adminDigest.ts`** — weekly French digest to every admin-role login, built on `adminStats/`
- **`services/staffAdminService.ts`** — staff roster writes for `/staff/admin/users` (the role change moves `StaffProfile.staffRole` + `bauth_user.role` in one transaction)
- **`services/syncErrorService.ts`** — admin remediation of sync errors, including the extId rebind and its refusal branches
- **`services/onboardingService.ts`** — the onboarding transactions: parent-1 account provisioning, interest swap, rules signature (timestamps + XP facts + PDF job)
- **`infra/documentRenderer.ts`** - the one browser-render path: PDFs for what gets printed, PNGs for what gets looked at, both over the same page setup so a preview cannot disagree with the document it previews. Owns the page lifecycle and turns off **both script execution and the network**, so no caller can render a stored design with either switched off by forgetting to switch it on; no template wants page JS anyway (a QR code arrives as a data URI its caller built). Fonts therefore carry their own bytes (`templates/fonts.ts`, `@font-face` built from the `@fontsource` packages with `?inline`)
- **`services/diplomaGenerator.ts`** - certificates: takes the design off a `Diploma_Template` row, substitutes the `{placeholders}`, and renders one page per recipient
- **`services/syncService.ts`** — Salesforce worker sync → seeds `Talent` + upserts the `TalentSfImport` mirror (no-clobber; see Salesforce reconciliation)
- **`services/reconciliationService.ts`** — computes `Talent` ↔ `TalentSfImport` conflicts; accept/reject + CSV for `/staff/admin/sf-conflicts`
- **`services/schoolService.ts`** / **`annuaire.ts`** — lazy `School` resolution from UAI via the éducation-nationale annuaire
- **`services/anonymizationService.ts`** — RGPD anonymization job
- **`infra/browserPool.ts`** — pooled Puppeteer instances (max 5 concurrent, 60s idle timeout)
- **`db/scoped.ts`** — campus-scoped DB query helpers

### Client Libraries (`src/lib/`)

- **`domain/`** — business logic (XP calculation in `xp.ts`, event lifecycle in `eventLifecycle.ts`)
- **`validation/`** — Zod schemas for forms (auth, events, students, templates, planning)
- **`components/ui/`** — Bits UI primitives (shadcn pattern)
- **`utils.ts`** — `cn()` helper (clsx + twMerge) for conditional classes

### Staff cohort tables

Two performance contracts govern staff list pages over cohort volume (~200 rows): the streaming
`load` shape, and `SortableTable` rendering one layout rather than a CSS-toggled dual render. Both
are regressions that shipped once. Read `frontend/src/lib/components/staff/CLAUDE.md` before adding
or reworking a staff list page.

## Coding Conventions

- **Language:** All UI text and user-facing strings are in **French**. Code identifiers (functions, variables) are in English.

  For a string no human reads *directly*, the test is **relay, not audience**: does it reach a French-speaking human, even through a machine? A cron job's `'Unauthorized: Invalid or missing token'` dies in a pod log, so it stays English, and so does anything a model reads as *instruction* rather than content (MCP tool descriptions, Zod `.describe()`, validation messages, the server-level MCP instructions). But an API error an MCP client paraphrases to an admin is French, and a `metric()` definition is French without exception: it is quoted verbatim into a chat answer and into the weekly digest, and English there would make the model translate before quoting, which is a re-derived definition, the one thing that tier exists to prevent.

  Being machine-facing is also not a licence to use our own vocabulary. "Operation" is what `operations.ts` calls a catalogue entry; an admin reading a dialog thinks "les chiffres et l'état de configuration". And the reverse trap is real: **`token` stays `token`** on an ops surface. The no-jargon rule says name what the person experiences, and what they experience is a credential they paste after `Authorization: Bearer`; "jeton" makes them translate back to the word they actually type. Talent-facing copy is where jargon gets replaced, not the admin token dialog.
- **Register (vous / tu):** Pick by who reads the string. **Staff-facing copy uses _vous_** (dev and admin spaces: buttons, tooltips, help cards, confirms). **Talent-facing copy uses _tu_** (the student portal and anything a talent reads, e.g. the QR check-in page). A single feature often spans both: the émargement staff page vouvoie the staff, while its talent check-in page tutoie the student. Match the surrounding screen's register, don't mix within one audience.
- **Forms:** Use sveltekit-superforms with Zod validation. Never use raw `<form>` handling.
- **DB access:** Import `prisma` from `$lib/server/db`. Never pass the Prisma client as a function parameter — it's a singleton. Always scope queries by `campusId` for staff/student data.
- **Auth checks:** Don't call BetterAuth directly in page server loads; `hooks.server.ts` already hydrates `locals.{user, staffProfile, talent}`.
- **Styling:** Tailwind utility classes only, no inline styles.
- **UI components:** always use the shadcn-style components in `src/lib/components/ui/` (Tooltip, Select, Breadcrumb, Dialog...) instead of native HTML equivalents (`title=` attributes, bare `<select>`). If a needed component isn't there yet, add it via shadcn-svelte rather than hand-rolling one.
- **Cursor affordance:** every clickable element gets `cursor-pointer`, including items inside custom selects, dropdowns, and date pickers. This is the most-missed detail in reviews; check it before presenting UI work.
- **UI & Interaction Skills:** Optional design skills live in `.claude/skills/`:
  - `impeccable` (`.claude/skills/impeccable/SKILL.md`): UX audit, spacing, contrast, and anti-slop review.
  - `emil-design-eng` (`.claude/skills/emil-design-eng/SKILL.md`): interaction design, spring physics, and micro-animations.
  `DESIGN.md` and the existing shadcn-svelte components in `src/lib/components/ui/` remain the absolute source of truth: skills must never introduce out-of-palette colors or ad-hoc raw HTML replacements for standard UI components.
- **User-facing copy:** no developer jargon in strings a talent or staff member reads. "Scan", "QR", "flag", "mini games" and similar are implementation vocabulary; describe what the person experiences instead. (Register rules: see the vous/tu bullet above.)
- **Copy density: a control gets one line, the rest goes behind a ⓘ.** A screen is read to be acted on, so a sentence that does not change what the person clicks pushes the control that does further down, and past a few of those they stop reading the ones that mattered too. The order to apply, in this order:

  1. **Cut.** An enumeration that only illustrates a choice its own title already makes ("Chiffres de pilotage seulement, en lecture" does not need four examples) is deleted, not relocated. Hiding noise still costs the reader a hover to find out it was noise.
  2. **One visible line.** Whatever is left on a control is the single fact that changes the decision at the moment it is taken, typically an irreversibility ("Choix définitif : un token créé en lecture seule le reste.").
  3. **`InfoTooltip` for the rest** (`$lib/components/ui/info-tooltip`, ⓘ next to the label it belongs to): rationale, quotas, audit guarantees, "why we ask". Reachable when wanted, invisible otherwise. `KpiTile`'s `helpText` on `/staff/admin/events` is the reference use.
  4. **`Collapsible`, never a tooltip, for text somebody must be able to read and re-read**: terms a checkbox commits to, the consequences of a destructive action. Hover is not a reading surface, and it is not a place to put something a person is agreeing to.

  This is the most-repeated review finding on staff dialogs and admin pages: prose accumulates one well-meant clarification at a time, and nobody deletes any of it. `StaffApiTokensDialog` is the worked example (header, tier cards, write toggle, conditions, list).

- **A list whose length comes from data scrolls in its own box.** Any `{#each}` over rows the database decides the count of gets a bounded, scrollable region: `max-h-[40svh] overflow-y-auto` on the list, and the dialog or card keeps its own `max-h-[90svh] overflow-y-auto` as the floor for short viewports. Viewport-relative, not a pixel cap, so the box grows with the screen instead of leaving a letterbox on a laptop.

  The tell is not "is it long today", it is **who decides how many rows there are**. A fixed catalogue rendered from a constant is bounded by the code and needs nothing. A ledger, an append-only log, an inventory, a feed or anything with a revoked/archived tail is bounded by nothing and only ever grows, so it is already wrong the day it ships even while it looks fine.

  This bites hardest in a dialog, which is why it is worth stating: a dialog is centred and translated, so a list that outgrows the viewport does not simply push the page down, it pushes its own form and buttons off both edges where nothing can reach them. Scrolling **the list** rather than the whole dialog is what keeps the form on screen; scrolling the whole dialog only stops the clipping.

  Precedents to copy rather than re-invent: `TalentXpDetailDialog` (cap on the `<ul>`), `TalentNotesFeed` (the cap as a prop, so the host screen sets it), `AdminSfStatusInspectorDialog` (`flex flex-col` + `min-h-0 flex-1 overflow-y-auto` when the dialog is a full-height shell with its own header and footer).

  Pagination, search or a dedicated page are a different decision and belong to volume, not to this rule: bound the region first, and reach for those only when the count genuinely justifies them.

- **Layout canon:** the dev-space **inscrits** page (`/staff/dev/events/[id]/inscrits`) is the reference for staff list pages: its filter row, table, spacing, and empty states. New staff pages mirror it unless told otherwise.
- **Visual identity: [`DESIGN.md`](./DESIGN.md) at the repo root is the contract** (see the note at the top of this file). Colors, type, radii, spacing, elevation, motion, the per-space skins, and the brand primitives (`_`, `< />`, `{ }`, the blueprint grid) all live there, with the rationale for every deviation from the charte. Do not restate its values here. `frontend/src/routes/layout.css` is its single implementation, and two guards keep the two in step: `bun run test` (token values and contrast) and `bun run lint:design` (forbidden classes). The raw charte lives at `~/Downloads/Epitech Design System` (brand assets, the source PDF): use it for logos and photography instead of approximating, and treat its `sales/` and `eso/` mockups as tone reference only, per `DESIGN.md`.
- **Component naming:** PascalCase, domain-scoped in subfolders (`components/events/`, `components/students/`).
- **Staff filter controls:** Pick by list shape, do not default to a plain dropdown. A few inline choices → `SegmentedFilter`. A short, known list too wide to sit inline → `FilterSelect`. A long, typeable list (campuses, lycées, talents, games) → `SearchableSelect` (built-in search box; renders its own `'all'` sentinel, so leave it out of `options`). The rationale lives in the `FilterSelect`/`SearchableSelect` doc comments. A campus filter on a plain `FilterSelect` is the classic miss.
- **Lucide icons:** Always import per-icon, never the barrel. Barrel imports drag every icon through Vite's dev resolver and tank cold-start (~9s → ~3s on this codebase). If you slip, run `bun scripts/codemod-lucide-imports.ts` to auto-rewrite.

  ```ts
  // ✅ correct
  import Trash2 from "@lucide/svelte/icons/trash-2";

  // ❌ wrong — barrel import
  import { Trash2 } from "@lucide/svelte";
  ```

- **Prose punctuation:** Never write em-dashes (`—`, U+2014) or en-dashes (`–`, U+2013) in any prose AI agents generate. This covers code comments, commit messages, PR descriptions, chat responses, and documentation. Use a regular hyphen `-`, a comma, a colon, parentheses, or two sentences instead. Reason: em-dashes are a tell of AI-generated text and we want our writing to read as human. Pre-existing em-dashes in this file and in unrelated prose are not in scope to retrofit; the rule is forward-looking.

## Constraints

- **RGPD:** Some users are minors. The charter must be signed before accessing the app. Anonymization job available via `POST /api/jobs/anonymize` with `Authorization: Bearer <CRON_SECRET>`. Never store personal data unnecessarily.
- **Salesforce:** `Event.externalId` optionally links events to Salesforce campaigns.
- **Scale:** typical stage de seconde event = ~200 students. Cohort-wide views (origin breakdowns, interest distributions, attendance lists) hit this volume — keep it in mind when designing layouts and queries.
- **Stateless pods:** SvelteKit pods scale horizontally on kube. Don't put source-of-truth state in process memory; each replica would carry its own and a pod restart would wipe it.
- **Outbound sends:** mail and SMS are trapped unless `OUTBOUND_MODE=real`, and prod is the only environment that sets it. Never widen that gate to debug a send, and never arm real sends from a non-prod environment: recipients are minors (RGPD).

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, Microsoft OAuth credentials (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`), and mail provider keys per `MAIL_PROVIDER` (`RESEND_API_KEY` for `resend`, or `MAILJET_API_KEY` + `MAILJET_API_SECRET` for `mailjet`). Optional: `CRON_SECRET`, `WORKER_API_TOKEN`, `MAIL_PROVIDER`, `MAIL_FROM`, `SMS_PROVIDER` (+ `BREVO_API_KEY`, `SMS_SENDER`, `SMS_DEV_RECIPIENTS`), `OUTBOUND_MODE` (the outbound gate — set `=real` in prod only; fail-safe to `redirect` otherwise), `EMAIL_DEV_RECIPIENTS`.

### Outbound: `MAIL_PROVIDER` / `SMS_PROVIDER`

Both are provider façades (`$lib/server/email/`, `$lib/server/sms/`) fronted by one fail-safe gate,
`OUTBOUND_MODE` (see Constraints). Provider tables, the gate/destination split, and the full
dev-redirect priority order live in `.claude/skills/outbound-messaging/SKILL.md` (Claude Code loads it
as the `/outbound-messaging` skill; other agents read the file). Read it before touching any code path
that sends.

## Prisma Migrations

Always include `--name` when creating migrations:

```
bunx prisma migrate dev --name descriptive_name
```

**Name a migration for the change, not the moment:** `--name add_event_config_template`, never a pasted sentence, a chat message, or a bare `update`.

**Put one-shot backfills in the migration SQL, not a script.** When a schema change needs existing rows updated (a new non-null column, a split, a projection recompute), write the `UPDATE`/`INSERT` directly in the generated migration so the data change ships atomically with the schema and every environment applies it exactly once. Fall back to a standalone script only when the backfill is large or batched (needs chunking to avoid a long lock) or needs application logic raw SQL can't express.

**A destructive drop ships with the change that retires it, in the same PR.** Holding it back for a follow-up migration reads like the careful move and buys nothing here, so don't spend a PR on it. Two reasons, both structural. Migrations run from the container `CMD` (`frontend/Dockerfile`), so on a rolling update the *incoming* pod applies the DDL and the outgoing pod is drained only afterwards: the window where old code meets the new schema exists whichever PR the migration rode in on. And a branch is not a release, because `dev` promotes to staging, preprod and prod in batches, so a follow-up merged before the next promotion crosses every environment boundary in the same deploy as the change it was meant to trail.

Know what that window actually costs, because it is wider than the feature being retired: Prisma Client selects a model's scalar fields **by name**, never `SELECT *`, so a dropped column fails *every* query on that table, including each `include` of it from elsewhere, until the last old pod is gone.

And know the mitigation that looks like it works and doesn't: leaving the column in `schema.prisma` marked retired for one release. That release's client still lists the column by name, so it would break on the drop exactly like its predecessor. The only build safe to drop a column under is one whose `schema.prisma` has already lost the field, which means shipping deliberate drift and breaking `migrate dev` for everyone until the follow-up lands. Not worth it for a dead column.

So: declare the data loss in the migration's `Warnings` block, say in a comment why no backfill is owed (**check the data against a real snapshot, don't assume**), and ship it. Eliminating the window is a deployment property, not a migration one - old pods must not outlive the schema they were built against - and it belongs to the rollout strategy in the `jump-k3s` repo.

**Squash a branch's dev migrations before merge.** Iterating a schema with `migrate dev` leaves a trail where a later migration drops what an earlier one added. Ship **one** clean migration per branch, never an add-then-drop trail: collapse them (rewrite the first migration's SQL to the net result, delete the rest, and reconcile the `_prisma_migrations` table so the DB still matches) before opening the PR. Never let a migration create something the same PR removes.

## Commits

Conventional Commits (`type(scope): subject`), the format the existing history uses (`fix(events):`, `feat(...)`). **Keep the subject line under 72 characters including the `type(scope):` prefix.** Trim wording to fit and push detail into the body rather than a long subject; one logical change per commit.

**Commits are written in English**, subject and body, whatever language the issue and the review conversation used. A commit sits next to the code, whose identifiers are English by the rule above, and it is read through `git log` and `git blame` long after the discussion that produced it. Pull request titles too, because `scripts/generate-changelog.sh` copies them verbatim into `CHANGELOG.md`, which is English: a French title lands there unedited.

The reason this is a written rule and not a matter of taste: **a branch's own history is the only style guide the next agent gets**, so one French subject makes every later commit on that branch French by imitation, and "matching the existing history" is enough of an instruction to keep it going. Eleven accumulated that way before anyone read them side by side.

What stays French is what a French-speaking non-developer reads: the UI strings covered above, and the content of an issue, which the PO reads (see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md), step 1). A pull request body follows its audience the same way. Its title does not, because of `CHANGELOG.md`.
