# AGENTS.md: Vendor-Neutral AI Agent Instructions

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

Jump: an internal Epitech Academy platform for managing training events, student progress, and certifications. French-language UI. Built with SvelteKit + Prisma + PostgreSQL.

## Philosophy

**Cleanest, not quickest.** Always prefer the cleanest, most maintainable solution over the fastest shortcut. A local hotfix or a duplicated component that "works" is an anti-pattern here. Take the time to do it right.

**Modularity before optimisation.** Don't optimise prematurely. Code must first be clear and well-decomposed; optimise only when a measurable need justifies it.

**DRY everywhere.** No repetitions in code, no repetitions in documentation. If something is true in two places, it must live in one.

See [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) for the full feature pipeline and Definition of Done, and [`JARGON.md`](.github/JARGON.md) for shared vocabulary.

## Commands

All commands run from `frontend/` using **Bun**. The shell's cwd often already IS `frontend/` (it persists between commands), so a reflexive `cd frontend` fails with "No such file or directory". Anchor on the repo root instead: `cd "$(git rev-parse --show-toplevel)/frontend"` works from anywhere, including worktrees.

Task-to-script mapping lives in `frontend/package.json`.

**`bun run verify` is the gate, and it is the same gate CI runs.** It chains `lint:scripts`, `lint`, `lint:design`, `lint:tests`, `check`, `test`, `test:integration`, `test:schema-drift` and `test:e2e`, in that order, through the same scripts the required checks call. Run it before you say you verified something: the point is that the claim is recontrollable by somebody else, and a green `verify` is the artifact that makes it so. Anything needing a real database provisions itself (`scripts/with-test-db.sh`), so there is no `docker compose up` and no `migrate deploy` to remember. Nothing in the chain is CI-only: a required check with no local equivalent is the hole this command exists to close, which is why the executable-bit guard moved out of the workflow YAML and into `scripts/check-exec-bits.sh`. See `frontend/TESTING.md` for the individual links in the chain and for what each CI job actually executes.

**Docker** (from repo root): `docker-compose up` starts PostgreSQL + SvelteKit.

**Git worktrees:** a freshly-added worktree has no `.env` (untracked) and no `node_modules`. The `.githooks/post-checkout` hook auto-provisions it on creation: links `.env` from the main checkout and runs `bun install`. If your editor adds worktrees without firing git hooks, run `bun run setup:worktree` once to do the same. It also has no `.env.test`: copy it from `.env.test.example` once, and note that it deliberately carries no `DATABASE_URL`.

**A worktree gets its own test database, and that is not a nicety.** `scripts/with-test-db.sh` derives the name from the worktree (`jump_test` in the main checkout, `jump_test_<worktree>` elsewhere) on the one container from `docker-compose.test.yml`, and derives the E2E server's port and `ORIGIN` from that same discriminant: a value that is per-worktree in one layer and shared in the other is not isolated, and the port being the shared half let one worktree's gate run green against another's build. They used to share the single `jump_test`, so a `migrate deploy` run from one branch left every other worktree's integration suite red against a schema it was never written for, with nothing to say so. Two traps the script exists to absorb: `prisma.config.ts` loads the repo-root `.env`, which points at the shared DEV database, and an already-set `DATABASE_URL` only wins because the script exports its own last; and the test container is not clean per launch (the postgres image declares its own volume, so a restart keeps its data - only `docker compose -f docker-compose.test.yml down -v` resets it).

**Testing Philosophy:** Prefer high-value, critical-path tests over sheer test volume. Never create redundant or useless placeholder tests. Focus exclusively on core domain logic, security & role permissions, bug-regression edge cases, and critical end-to-end user flows.

**`.svelte-kit/` belongs to the dev server, and to nothing else.** Anything that loads the SvelteKit vite plugin regenerates that directory when it runs, `generated/root.svelte` and `generated/client/app.js` included, so doing it while a dev server is live blanks the page in the browser until that server is restarted. Every other command therefore gets its own directory through `KIT_OUTDIR`, which `svelte.config.js` reads: `bun run check` uses `.svelte-kit-check/` (set in the script, since `svelte-check` has no config file of its own), vitest uses `.svelte-kit-test/` (set in `vitest.config.ts`, so an editor's test runner obeys it too), and the E2E suite's build uses `.svelte-kit-e2e/` (set in the `webServer` command in `playwright.config.ts`). A new command that touches the plugin needs the same treatment, plus an entry in `server.watch.ignored`.

**When a `package.json` script exists for the task, use `bun run <script>` rather than invoking the tool directly.** The scripts often set env vars (`KIT_OUTDIR=.svelte-kit-check`) or flags (`--tsconfig ./tsconfig.check.json`) that a bare `bun svelte-check` or `bunx svelte-check` will silently skip, leading to types being written to the default `.svelte-kit/` dir or the wrong strictness. For one-shots without a matching script, `bun <tool>` is fine; reach for `bunx` only when the tool isn't installed locally.

## Architecture

### Workspaces

The app splits into four workspaces, each serving a distinct audience and business goal:

| Workspace  | Path            | Audience          | Objective                                              |
| ---------- | --------------- | ----------------- | ------------------------------------------------------ |
| **Dev**    | `/staff/dev/`   | `superdev`, `dev` | Talent Acquisition & Recruitment (admissions pipeline) |
| **Admin**  | `/staff/admin/` | `admin`           | Global system overview; account impersonation          |
| **Talent** | `(talent)/`     | students          | Student experience: gamification, progression          |
| **Parent** | `(parent)/`     | legal guardians   | Règlement co-signature, image-rights decision          |

**Terminology:** See [`JARGON.md`](.github/JARGON.md) for shared vocabulary. Critical for reading this codebase: `dev` roles and `/dev/` routes refer to the recruitment team (Business Development), not software engineers.

### Auth System

Uses **BetterAuth** (`src/lib/server/auth.ts`) with two methods:

- **Microsoft OAuth** for staff and admins (must be `@epitech.eu`)
- **Email OTP** (6-digit, sent via Resend) for students and parents

**The two doors are disjoint, and that is now enforced rather than described.**
It was not for a long time: the role filter lived in the `/login` page action,
and BetterAuth's own routes are mounted **under** it (`/api/auth/*`, which
`guards.ts` treats as public), so a code request followed by a code sign-in on a
staff address minted a full staff session - the Azure tenant restriction and its
MFA bypassed, against a code stored in plaintext, on an `admin` account that
carries impersonation of every talent. `disableSignUp: true` only ever stopped
account creation.

- **`resolveOtpIdentity`** (`server/auth/otpAudience.ts`) is the one answer to
  "may this address use the OTP door", read by the gate, by the server-side mint
  path and by the `/login` action, so the page and the routes underneath it
  cannot drift apart again. It is a **positive allowlist and staff-deny comes
  first**: a `StaffProfile` **or** a staff `bauth_user.role` refuses. Both halves
  earn their place - the profile is the truth about what someone can do, the
  column is what BetterAuth's admin plugin gates impersonation on, and testing
  `talent` first (as the action did) admits the row carrying both that bad
  Salesforce data produces.
- **`emailOtpAudienceGate`** (`server/auth/emailOtpAudienceGate.ts`) is a
  BetterAuth `before` hook over every path carrying `email-otp`, so an endpoint a
  future release adds is covered on arrival, inside the `/email-otp/` prefix or
  beside it (two of today's nine already are). It is **not** a check inside
  `sendVerificationOTP`, and that is the load-bearing part: the send endpoint
  writes the `bauth_verification` row **before** it looks the user up, and awaits
  the callback through `runInBackgroundOrAwait`, which swallows the rejection and
  still answers `200`. Refusing in the callback leaves a live code behind under
  the refused address. A `before` hook also covers `auth.api.*`, since both
  surfaces reach the endpoint through the same dispatcher.
- **A refusal discloses nothing, because it is not an answer of ours.** The hook
  substitutes an address BetterAuth has never seen (`.invalid`, one per request)
  and lets the plugin's own unknown-address path reply: `200 {success:true}` on
  the emitting routes under `disableSignUp`, `INVALID_OTP` on the consuming
  ones. Reproducing those two responses instead is the shape that shipped and
  had to be replaced, and the reason is the one a `before` hook cannot avoid: it
  runs ahead of body validation, so it would also have to answer for every
  request the endpoint rejects before its user lookup (`{email}` with no `type`,
  or `type: 'change-email'`), where a 400 for an eligible address against a 200
  for every other one discloses on an unauthenticated route precisely the bit
  the silent success exists to hide. Substituting keeps validation, error
  shapes and timing upstream where they belong; the parity is asserted per
  route, per malformed body, in `emailOtpAudience.integration.test.ts`.
- **The plugin's two server-only endpoints carry no path**, so a matcher cannot
  see them. `server/auth/otpSession.ts` owns both halves of the credential
  (`mintSigninOtp`, `establishOtpSession`) and checks the audience itself.
- **Opening a staff session locally, without Azure:** `POST /api/test/login-as`
  with `Authorization: Bearer $LOAD_TEST_SECRET`, then paste the returned cookie
  into the browser. No new mechanism and nothing to arm in production: the
  endpoint exists for the load-test driver, 404s unless `LOAD_TEST_SECRET` is set
  server-side, and `tests/e2e/auth.setup.ts` already mints every role's session
  through it for the same reason ("staff authenticate through Microsoft OAuth and
  talents through an emailed OTP, neither of which a headless run can walk").
  The OTP door used to be what stood in for this; it is not a substitute for a
  door being open in production.

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

| Group            | Roles             | Use for                                                  |
| ---------------- | ----------------- | -------------------------------------------------------- |
| `devMember`      | `superdev`, `dev` | Dev workspace daily ops (participants, closings, update) |
| `realSendArmers` | `admin`           | Arming real outbound sends / login-redirect pin          |

- **Client:** `const canEdit = $derived(can('devMember', page.data.staffProfile?.staffRole))`, then apply one of the UI patterns below. Import: `$lib/domain/permissions`.
- **Server:** `requireStaffGroup(locals, 'devMember')`. Import: `$lib/server/auth/guards`. Call it in every mutating action, or at the top of a `load` to gate a whole route.

**There is no superdev-only group today.** `superdev` and `dev` are permission-identical; the only thing the enum still separates is which roles a superdev may invite (`INVITABLE_STAFF_ROLES`, a catalogue, not a gate). Add a group back to `STAFF_GROUPS` the day a lead-only action exists. Never inline a `['superdev']` array at a call site.

**UI pattern rule: pick one per site, do not mix:**

| Pattern           | When                                                     |
| ----------------- | -------------------------------------------------------- |
| Hide              | Nav entries to restricted destinations (sidebar, menus)  |
| Disable + tooltip | Mutating controls visible on shared screens              |
| Redirect / 403    | Direct URL access, via `requireStaffGroup` in the `load` |

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

### Data Layer

Prisma schema at `frontend/prisma/schema.prisma`. Data is campus-scoped.

### Data modeling: facts as rows, state as projection

Several domain tables are append-only fact/log records: `MinigameAttempt`, `BroadcastRecipient`, `XpGrant`, `ImageRightsDecisionRecord`. Current values that derive from them are **cached projections** recomputed transactionally on each write, not independently mutated (e.g. `Talent.xp` = `SUM(XpGrant.amount)`).

When persisting a new domain fact, follow this shape rather than a mutable counter or a `Json` blob: the fact gets a row, and any aggregate is a projection refreshed in the same transaction. A bare counter is lossy: you can't explain, audit, or timestamp the value, and ad-hoc `Math.max(0, x - n)` adjustments drift. The XP ledger is the reference implementation (see below).

**Not for polled external state.** The ledger shape fits discrete domain facts that happen once. Do _not_ append a row per poll of a mutable external system: the Salesforce sync runs every ~30 min, so an append-only log would bloat with no payoff. Mirror the external system's current state in a 1:1 typed row, upserted only when the inbound payload differs (see `TalentSfImport` under Salesforce reconciliation).

### Relational modeling

Model relationships and entities by their real shape. These are deliberate calls, not defaults to reach for: each is anchored to a model in this schema:

- **Many-to-many → join table.** A pure junction with a composite PK, e.g. `TalentInterest` (`@@id([talentId, interestId])`). Use one only when **both** sides are genuinely many.
- **One-to-many → foreign key on the "many" side, not a join table.** A talent has one current school → `Talent.schoolId`, never a `TalentSchool` link table. The tell that you've mismodeled a 1:N as M:N: you find yourself adding a `@@unique` on the FK column to stop duplicates.
- **A link table _with attributes_ is an associative entity: a separate decision.** A bare junction glues two keys; the moment the relationship itself carries data (a `source`, a `confirmedAt`, a quantity), that's a deliberate entity. Don't reach for it speculatively, and don't refuse it when the data genuinely belongs on the relationship.
- **A domain entity gets its own table + FK, not loose strings/JSON.** A thing referenced repeatedly (a high school) gets a typed, deduplicated row (`School`), not `name`/`city`/`uai` columns copied onto every referrer. "Normalize later" tends to never happen.
- **External-system data → anti-corruption mirror, kept apart from your truth.** Don't fold a third party's claims into your aggregate root. Keep what _you_ believe (`Talent`) separate from what an external system _claims_ (`TalentSfImport`), and reconcile explicitly (see Salesforce reconciliation).
- **A relationship already carried by a foreign key needs no second marker.** If A already points at B via an FK, don't add an `ownerB`/`belongsToB` column that re-encodes the same link: it duplicates a tie you can already query, and it drifts. Before adding a column to bind two rows, check whether an existing FK (or a count over it) already answers the question. When the tie is incidental, don't model it at all: prefer computing the answer to storing a flag.
- **A denormalised key is bound to its source by a composite foreign key, not by discipline.** Some columns are copied on purpose - `Participation.campusId` and `Closing_Record.campusId` exist so campus scoping is one hop instead of a walk through `Event` - and a copy that nothing binds drifts the first time the source moves. Salesforce does reassign a campaign, the event sync has an explicit branch for it, and it updated `Event` alone: the enrolments stayed on the old campus, which is the column `db/scoped.ts` reads to cloister a campus's data, so the old campus kept seeing the cohort and the new one never did. Both tables now reference the pair `(Event.id, Event.campusId)` against a `@@unique([id, campusId])` on `Event`, and Prisma's default `ON UPDATE CASCADE` carries the move down. A snapshot is the opposite case and stays unbound on purpose (`MinigameAttempt.campusId`, `XpGrant.campusId`, both documented as such): the test is whether the column is meant to track the source or to record what was true once.
- **Attribution outlives the person; ownership does not.** A staff foreign key on a record other people read is `SetNull` on a nullable column, and `$lib/domain/staff.ts` holds the one label (`FORMER_STAFF_LABEL`) every screen renders in their place. Both other options had shipped and both were wrong: `Closing_Record.staffId` and `AdminFile.uploadedById` cascaded, so deleting one account destroyed every closing that person had conducted and the files they had put in a shared library, while `Broadcast.createdById`, `MessageTemplate.createdById` and `CmsPage.updatedBy` defaulted to `RESTRICT`, which made anyone who had ever sent a campaign undeletable behind a bare "Erreur lors de la suppression du membre". Cascade is for what belongs to the person alone (`Usage_FeatureUse.staffProfileId`, a behavioural log that must not outlive them); a plain unconstrained `String` is for an audit row that must survive even the FK (`AdminApi_Call.actorUserId`, `AuthIdentityRepair.resolvedBy`).
- **An invariant a comment asserts is a `CHECK` when the database can hold it.** There were none at all, and two earned their place: `AdminApi_Token` said a leadership token is read-only "by construction" when the construction was an `if`, and `Usage_FeatureUse` rests on staff being identified while talents are pseudonymous, where one wrong write is a minor's re-identification. Most invariants do NOT qualify, and the reasons are worth knowing before reaching for one. A rule spanning two statements of a transaction cannot be expressed, because Postgres `CHECK`s are not deferrable: `Talent.schoolId` XOR `highSchoolNameManual` is written by two services in one transaction and is legitimately both-set in between. A rule a referential action breaks cannot either: `BroadcastRecipient`'s exactly-one actor becomes none-set the moment a talent is erased through `SET NULL`. And a rule one writer already refuses with a better message is not worth a second, worse one - `closingAnswersIssues` says « Réponse inconnue pour … » where a constraint would say nothing. Prisma cannot express a `CHECK`, so it is hand-written into the migration; `migrate diff` does not read them, which is why `test:schema-drift` stays green.
- **Every new model is prefixed by its context: `Context_ModelName`.** This used to read "a model belonging to a feature area", and those three words made the prefix conditional; the condition is what left 32 of the 65 models bare. There is no exemption to find. The prefix lives in the **Prisma model name** (`Note_TalentNote`, `EventConfig_Module`, `Feedback_Form`), never faked with a `@@map`, so the schema sorts and reads by context instead of by whatever the model happened to be called.

  **The prefix names the bounded context that owns the write path, and that is the only axis.** Mixing axes is what makes a prefix scheme collapse, so `Sf_` is one context among the others, the anti-corruption mirror, and not an ownership tag bolted onto a second axis. **There is no `Jump_`, and there must not be.** A prefix earns its place by separating, not by labelling: if almost everything belongs to Jump, `Jump_` costs sixty names and carries no information. `Sf_` earns its place for exactly the inverse reason.

  **The bare models are a backlog, not a category, and they are never the precedent.** Half the schema predates this rule and a sweep issue tracks them, so the closest example you find by grepping is as likely to be the retard as the reference. Reaching for `School` or `TalentInterest` to justify a bare name is the specific mistake this paragraph exists to stop, and it has already been made once. The aggregate roots that every context reads and none owns (`Talent`, `Event`, `Campus`, `School`, `StaffProfile`) are the one genuinely open question and belong to that sweep: leave them as they are until it decides.

### Default to less: coupling and surface

The safe default here is the smallest thing that meets the need. Four rules, learned the hard way:

- **Prefer the least coupling that works.** Reference by id over embedding or ownership. A control governs only its own surface: a per-event sub-option hides its own column, it does not reach into an unrelated screen like the talent fiche. A preset or template is a point-in-time copy applied once, not a live link. An external attribute (the Salesforce event type) is a hint, never a binding. Features that merely relate should reference each other, not interlock.
- **When a concept is questioned as redundant or "too clever", delete the mechanism, don't refine it.** Refining coupling that should not exist only yields subtler coupling. If you cannot say what a column, flag, or abstraction buys beyond what is already expressible, remove it instead of making it cleaner.
- **A table that holds no data of its own is not a table.** Two shapes give it away, and the planning tree had both: a wrapper carrying nothing but a foreign key and timestamps (`Planning` was one row per event, 286 of 292 of them empty), and a 1:1 satellite whose row count matches its parent exactly (`Activity` held `nom` and `activityType` against a unique `timeSlotId`, and not one slot lacked one). Neither is free, and the bill does not arrive where the tables are: `db/scoped.ts` had to walk `activity -> timeSlot -> planning -> event -> campusId` at every level, which cost about 288 of its 707 lines - 41 % of the layer that cloisters a campus's data, and half of it guarding writes the application does not perform. Collapsing the three into `Planning_Slot` left one hop, the same as `EventPresence`. The test before adding a level: name a column it will hold that the level below could not. And when a nullable relation exists only because the schema made it optional - a slot with no activity rendered as nothing at all - make it required and delete the branch rather than carrying the `| null` through the query, the domain type and the component.
- **Build the minimal surface first.** Don't add a management page, a seed script, or a built-in-vs-custom distinction speculatively. Manage a thing inline (in the dialog or list that already exists) until volume genuinely justifies a dedicated surface; a catalogue is told apart by names before it needs a type filter.

### XP System

XP follows the ledger pattern above. Each granting fact is one `XpGrant` row (unique on `(source, sourceId)`; sources: `onboarding`, `onboarding_early_bird`, `minigame`, `minigame_rank`, `reward`, `admin_adjustment`). `Talent.xp` = `SUM(amount)` and `Talent.eventsCount` = present-participation count, both cached projections.

- **Never mutate `Talent.xp` directly.** It's a cached projection of `XpGrant`; go through `xpService` so the recompute stays atomic.
- **Level is derived, not stored** (`Talent.level` was dropped). Use `computeLevel(xp)` (tiers: Novice 0-199, Apprentice 200-499, Expert 500+). `JUMP_LEVELS` is canonical in `domain/xp.ts`; `xpRangeForLevel` maps a tier back to an `xp` range for the broadcast filter. No level tier is surfaced in the dev workspace, so there is no French label helper.
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

Each is a **versioned catalogue** (`lib/content/reglement/`, `lib/content/droit-image/`), pinned at signature time (`reglementVersion` on the dossier, `version` on each `ImageRightsDecisionRecord`). **A published version file is never edited and never deleted:** the PDF is regenerated from DB state on every later act, so editing one rewrites the wording of documents already signed. A new wording is a new key. The rules themselves live once in `content/versionedDocument.ts`; each file opens with a comment saying whether it is frozen or in force, and a unit test keeps those comments out of the rendered document. A droit-à-l'image version holds _two_ texts, the authorization and the refusal, keyed together so a version cannot exist on one branch and not the other.

**The rendered PDF belongs to the dossier, not to the talent** (`Onboarding_Record.rulesFilePath` and `imageRightsFilePath`, keys `documents/{talentId}/{kind}-{schoolYear}.pdf`). Version-pinning protects the _wording_ of a signed document; this protects the _document_. One key per talent meant the second year's render overwrote a PDF a legal guardian had already signed for a minor, with no way to rebuild it, and it silently dropped the previous year out of `/settings/documents` and the staff archive. Three consequences to keep: an `OnboardingPdfJob` carries the `schoolYear` it renders, **not null and with no fallback**, because a job can be queued or retried long after the act that asked for it and "the current dossier" will have moved (a nullable column with the worker falling back to the most recent dossier is the same bug wearing a default, and it stays dormant until the talent comes back); the worker renders **from that dossier row**, which is now the only thing it can do, since the job's payload snapshot was dropped rather than left unread (a snapshot re-publishes a decision that has since been reversed, and a job that carries generator inputs invites somebody to render from them again); and both reset paths (`resetTalentToImport`, `anonymizeTalent`) collect the keys from **every** dossier row, since deleting the rows is what drops the references. A document kind declares `scope` and `dossierFilePathField` in `ONBOARDING_DOCUMENTS` rather than naming a `Talent` column, which is what let the règlement keep pointing at a per-talent artifact after it became annual.

**A consent expires; an interdiction does not.** The image-rights decision is asked once per school year, so its projection goes blank when a talent reopens a dossier, which is right for every "what does this family still owe" reader. It is wrong for the only question that is not about a year: whether this student may be photographed today. That one is `imageRightsStance` (`domain/imageRights.ts`), fed by the latest `ImageRightsDecisionRecord` across all years, so a refusal nobody has revisited keeps forbidding while the dossier reads "En attente", and a _lapsed authorization_ resolves to `unknown` rather than to consent. Read the projection alone and the marker silently drops off a refused student's printed badge on the first day of the new school year. Only `forbidden` is marked on printed material; marking every `unknown` would flag most of the cohort each September and the marker would stop being read. The figures obey the same split, and the reason is that one of them is quoted to people: `stats_compliance_status` returns the three-state decision **for the year in scope**, which is the state of that year's campaign and what the relance reads, plus `imageUseForbidden`, the standing interdictions, which is the only figure to consult before publishing a photo and the only one in that answer no school-year filter narrows. Returning the per-year `refused` count alone answers "combien ne doivent pas être photographiés" with a number that goes to nearly zero every September.

**Collégiens are out of the image-rights flow, and not because of the ladder.** The blocker is upstream: `parentEmail` is only ever written by the wizard's parents step and `TalentSfImport` carries no guardian fields, so Jump holds no address to ask. Nothing in the model forecloses them, since their decision would simply open a dossier row carrying only the image-rights block. If they are photographed at a Coding Club, the consent gap is real and is handled off-platform.

### Salesforce reconciliation

Talent profile fields have two sources: the worker sync (Salesforce) and onboarding (the student). They are **reconciled, not blindly overwritten**.

- **`Talent` = Jump's current truth.** Onboarding writes it directly (**optimistic**: the student's input shows on their dashboard immediately; staff arbitrate divergences afterward, there is no pending-validation gate).
- **`TalentSfImport` = 1:1 typed mirror of Salesforce's last claim**: the anti-corruption boundary. Written _only_ by `syncService.syncTalents`, never by onboarding, and upserted only when the inbound payload differs.
- **`School` = canonical UAI-keyed directory**, resolved lazily from the éducation-nationale annuaire (`server/annuaire.ts` + `schoolService.resolveSchoolByUai`). Only schools actually attended ever land here, never the ~69k national set. It replaced the old free-text `highSchoolName/City/Uai` columns: `Talent` now carries a `schoolId` FK (+ `highSchoolNameManual`, used _only_ when a lycée has no UAI). The student's school and SF's claimed school (`TalentSfImport.sfSchoolId`) both FK the same `School`.
- **No-clobber rule:** before a field is talent-confirmed (its `*ValidatedAt` is set), sync re-seeds it on `Talent`; after, sync writes **only the mirror**. Never let SF overwrite a confirmed value. (This fixed a real bug where every sync overwrote the talent's confirmed phone/name.)
- **Conflict** = field is talent-confirmed **AND** `Talent` ≠ `TalentSfImport` (school compared by FK). Computed in `reconciliationService`, never stored. Surfaced at `/staff/admin/sf-conflicts` (list + accept/reject + CSV export); `acceptJump` realigns the mirror optimistically. `niveau` is SF-owned (onboarding never sets it) → always synced, never a conflict.

### Usage analytics: a catalogue of features, recorded server-side

Jump could say who was enrolled, who had signed and who was present, and nothing
about which of its own screens anybody opened. `Usage_FeatureUse` is that fact,
`Usage_FeatureMonthly` its actor-free monthly cube, and `domain/usage.ts` the
catalogue both read.

- **A key enters the catalogue only if a product decision depends on it.**
  Micro-interactions (a theme toggle, confetti seen, a collapsible opened) stay
  with Umami in aggregate. The boundary decides where a new measurement belongs:
  Umami answers "how much traffic", this catalogue answers "which campus adopted
  which feature", and only the second can be joined to `Participation`, `Campus`
  and `Event`, which is the whole reason it lives in our own database. A key is
  never added for a fact the database already records; `USAGE_MEASURED_ELSEWHERE`
  names those and the API carries the list, so a consumer is told where to look
  rather than reading a zero.

  The Umami half of that line is narrower than "traffic", and stating it loosely
  invites a cleanup that would lose something. **Umami keeps what the server
  cannot see**: a failure that never reaches an action, a duration
  (`secondsToSign`, `sessionDurationSec`), the OTP funnel before a session
  exists, and the low-cardinality dimensions this catalogue refuses on purpose
  (`sizeBucket`, `daysOpen`, `fromRole`/`toRole`). Several of its events name the
  same act as a catalogue key, and that is not duplication to remove: they are
  measured at different moments (a `track()` in `use:enhance` usually fires on
  success, `recordUsage` fires when the control is invoked), each success event
  is the denominator of a `_failed` twin, and Jump has no Sentry, so those twins
  are the only client error signal there is. Neither system is the other's check;
  quote one or the other, never both at once.

- **What is absent from the fact table is the PII boundary, and it is structural.**
  No `path`, no `url`, no `referer`, no `userAgent`, no `ip`, no `params`, no free
  text, and no `talentId`. The question is answerable from counts, so per-person
  identity for a minor is not necessary, and under art. 6(1)(f) what is not
  necessary has no basis. Before adding a column, say which figure it makes
  possible that the existing ones cannot.
- **Two actor regimes, deliberately asymmetric.** Staff are identified
  (`staffProfileId`), because they are adults, employees, and per-person history is
  what was asked for; the FK cascades, so a departure takes the history with it.
  That is the opposite of `AdminApi_Call.actorUserId`, which carries no FK
  precisely so an audit row outlives the person: an audit must, a behavioural log
  of an ex-employee must not. Talents get `actorHash` only, a monthly-rotating
  pseudonym, so the talent metric is **monthly active, never annual**. There is no
  `parent` value, because measuring a data subject on legitimate interest owes them
  an operable art. 21 objection and there is nowhere to store one for a guardian
  today (no Parent entity, `/parent/settings` holds no preferences).
- **Nothing is recorded by client code, and no view is recorded from a `load`.**
  Instructing a browser to post a result back is an access to the terminal under
  art. 5(3) ePD, which would drag the whole thing into art. 82 consent; a pure
  server log does not. There is no `/api/usage` endpoint and there must not be one.
  Visits and sessions come from `USAGE_VIEW_ROUTES` in `hooks.server.ts`, after the
  guards, which also keeps writes out of `load` functions that SvelteKit runs on
  hover-preload.
- **Where a use is recorded is a rule, not a judgement call per site.** An endpoint
  that produces an artifact records once the artifact exists, so an event issuing
  no certificate never counts a 404 as a render. Everything else records when the
  control is invoked.
- **`dedupeKey` must stay composed.** Only `feature` and `dedupeKey` are in the
  unique constraint, so the actor, the event and the impersonation flag all live
  inside the key. Drop any one of them and `skipDuplicates` silently discards a
  legitimate row; `record.test.ts` pins all three.
- **Fold before you purge.** `/api/jobs/usage-rollup` is one job for that reason:
  it folds every month present in the raw table, then purges past
  `USAGE_RAW_RETENTION_MONTHS`. Two jobs would make the ordering a scheduling
  assumption, and the purge would win a race nobody would notice until a month was
  missing from every year-on-year figure.
- **`USAGE_SALT` fails closed.** Unset means no talent recording at all, rather
  than hashing against an empty salt and producing a stable identifier for a
  minor. Same doctrine as `OUTBOUND_MODE`.
- **`db/scoped.ts` deliberately carries no delegate for these tables.** They are
  written by the recorder and read only through the admin API, which resolves its
  own scope; they are never reached through `scopedPrisma`. Same treatment, and the
  same kind of comment, as `Closing_Answer`.
- **A NARROWED talent cell is masked below five distinct actors**
  (`USAGE_SMALL_CELL_FLOOR`), because a cell of one or two in a small campus is
  nearly a statement about named children. A zero is never masked: it discloses
  nobody and it is the most actionable answer the matrix produces. The floor
  belongs to the READ, not to one operation, and not to one filter: it shipped
  applied inside the coverage matrix while `stats_feature_usage` took the same
  `campus` filter, was reachable with a leadership token, and answered unmasked;
  it then keyed on the campus filter alone while that operation also takes
  `eventId`, which names one campus, one date and a roster a dev can read by
  name, so it discloses more than the cell already withheld. The rule is the
  narrowing and not the word campus: any filter that can bring a talent count
  below the whole platform goes through `maskCell`, and the share is masked with
  the count or it hands the count straight back.
- **Two stores, one figure, and a distinct actor is counted per month.** Inside
  the retention window the answer comes from `Usage_FeatureUse`, beyond it from
  the actor-free cube, and both go through `server/usage/read.ts` so the store
  boundary cannot change what a number means. The month is not a formatting
  detail: the talent pseudonym rotates monthly, so distinct actors are additive
  across campuses and actor kinds INSIDE a month and across nothing else. The
  reported figure is therefore the busiest month's count, never a running total,
  which is also why it can never exceed a month's population. Both halves shipped
  broken and neither was visible to a test that asserted only the announced
  source or that compared the stores inside a single month.
- **A named school year IS the window.** Asking about 2025-2026 asks about
  2025-2026, so a `days` count narrows the year only when it was actually passed.
  Defaulting it and intersecting made every question about a past year an empty
  range, answered as zeros with the filters echoed back to confirm them. A
  period covering no time at all is a refusal, exactly as an unknown campus is,
  and it collapses two ways: the day count and the year do not meet, or the year
  has not opened yet. The second needs no day count, which is why the guard sits
  after the whole branch rather than inside it; while it did not, a year still
  ahead answered zeros through a `source` whose « au » preceded its « du ».
- **A connection is a `*_session` row, never a `bauth_session` row.** The session
  table is not a login history, which the schema states twice, on both
  `StaffProfile.firstLoginAt` and `Talent.firstLoginAt`: logout, identity repair
  and relinks delete from it, so it under-reports whoever signs out and
  over-reports whoever never does. It shipped once as the source of the members
  page's connection list, where 6046 of the development database's 6049 rows were
  expired sessions nobody had closed. The two projections answer "has this
  account ever been opened, and when", the session keys answer "how often", and
  neither question is ever asked of `bauth_session`. The figure that answers "how
  much does this person come" is then the count of DISTINCT DAYS, not of logins:
  a BetterAuth session lives a fortnight, so somebody working daily and never
  signing out produces about two logins a month.

Reads are `stats_feature_usage`, `stats_feature_adoption_gaps`,
`stats_campus_feature_coverage` (leadership) and `ops_staff_activity` (core), over
`services/adminStats/{featureUsage,staffActivity}.ts`, all reading through
`server/usage/read.ts`. The weekly digest's Adoption section reads the same
service, so an inbox figure and an asked figure cannot disagree, and it says
"adoption non mesurable" rather than naming every feature when nothing was
measured over the window: an absence of rows is an absence of measurement, and
printing it as a list of unused features is the one error that makes somebody
delete something in use. **Whichever store answers**, which is the half that was
missing: the detailed path asserted it had measured, and the digest asks for
ninety days, which always sits inside the retention window, so its own guard was
unreachable and the first mails after a deploy would have named the whole
catalogue.

### UI, API, or both

The admin space stopping its UI growth (below) is often read as "admin work goes to the API". That is not the axis. What the freeze reacted to is **pages that restate the database**: one screen per question, none fitting anyone exactly. Five tests instead, and they cut across spaces:

1. **Is the output a fact, a figure, or a bounded state change?** → API. A chat composes the exact answer; a screen freezes one shape of it forever.
2. **Does the human need to _see_ the result to decide?** → UI. When the acceptance test is "does this look right", no JSON substitutes for a render.
3. **Is it done while already on a screen that exists?** → put the control there. That is not growing the admin space; the certificate picker in `EventConfigWizard` replaced a switch that was already in that dialog.
4. **Is it done under time pressure, in the field, repeatedly?** → UI. Nobody opens a chat client to check in 200 students at 9am, which is why émargement is a screen.
5. **Is it for someone who will never hold a token?** → UI. Talents, parents, campus staff.

**And the rule under all five: the API is the floor.** Every capability lands as a named operation first; a UI is optional convenience on top. A config field reachable only in the wizard is a hole, because event configuration is already fully MCP-driven, and the people who use it prefer it that way: a form will never be exactly what its user wants, whereas a named operation is. Stated here because it is mechanically checked - `operations.test.ts` asserts that every field of `adminEventSchema` is reachable through some write, and that every catalogue entry is mounted on exactly one HTTP route. `write_event_inscrits_options` exists because that test found `moduleSettings` reachable through nothing at all.

The corollary is narrower than it looks. "No form will ever fit" is decisive for **authoring** surfaces. It says nothing about a picker inside a flow somebody is already in.

### Curated admin API and MCP

The admin space **stops growing UI**: new admin capabilities ship as curated named API operations,
consumable over HTTP and as MCP tools, never as new admin UI. Read
[`frontend/src/lib/server/adminApi/CLAUDE.md`](./frontend/src/lib/server/adminApi/CLAUDE.md) before
adding, changing, or reasoning about an operation, a write's class (A/B/C), the leadership tier, or
anything under `src/lib/server/adminApi/`: it carries the non-negotiable rules (PII, audit, scope
refusal, handles) and the file-by-file map of the tier.

### Key Server Services (`src/lib/server/`)

- **`auth.ts`**: BetterAuth config (Prisma adapter, Microsoft OAuth, email OTP, admin plugin with impersonation)
- **`adminApi/`**: curated admin API: token auth (tier + write capability), quotas, audit log with before/after, operation catalogue, write implementations, two-step plan digest, MCP server (see above)
- **`services/adminStats/`**: the curated aggregates (cohort profile, school reach and lycée churn, attendance, the cross-campus comparison, closing insights and testimonials, feedback results, engagement, onboarding funnel and velocity, compliance, the operational queues, configuration state, the school-year review), each figure carrying its definition
- **`services/adminDigest.ts`**: weekly French digest to every admin-role login, built on `adminStats/`
- **`services/staffAdminService.ts`**: staff roster writes for `/staff/admin/users` (the role change moves `StaffProfile.staffRole` + `bauth_user.role` in one transaction)
- **`services/syncErrorService.ts`**: admin remediation of sync errors, including the extId rebind and its refusal branches
- **`services/onboardingService.ts`**: the onboarding transactions: parent-1 account provisioning, interest swap, rules signature (timestamps + XP facts + PDF job)
- **`infra/documentRenderer.ts`** - the one browser-render path: PDFs for what gets printed, PNGs for what gets looked at, both over the same page setup so a preview cannot disagree with the document it previews. Owns the page lifecycle and turns off **both script execution and the network**, so no caller can render a stored design with either switched off by forgetting to switch it on; no template wants page JS anyway (a QR code arrives as a data URI its caller built). Fonts therefore carry their own bytes (`templates/fonts.ts`, `@font-face` built from the `@fontsource` packages with `?inline`)
- **`services/diplomaGenerator.ts`** - certificates: takes the design off a `Diploma_Template` row, substitutes the `{placeholders}`, and renders one page per recipient
- **`services/syncService.ts`**: Salesforce worker sync → seeds `Talent` + upserts the `TalentSfImport` mirror (no-clobber; see Salesforce reconciliation)
- **`services/reconciliationService.ts`**: computes `Talent` ↔ `TalentSfImport` conflicts; accept/reject + CSV for `/staff/admin/sf-conflicts`
- **`services/schoolService.ts`** / **`annuaire.ts`**: lazy `School` resolution from UAI via the éducation-nationale annuaire
- **`services/anonymizationService.ts`**: RGPD anonymization job
- **`infra/browserPool.ts`**: pooled Puppeteer instances (max 5 concurrent, 60s idle timeout)
- **`usage/record.ts`**: the one usage recorder: fire-and-forget, server-only, composes the dedupe key, honours a talent's objection, and refuses rather than guesses when the salt is unset
- **`usage/rollup.ts`**: folds the monthly cube then purges the raw window, in that order
- **`services/adminStats/featureUsage.ts`** / **`staffActivity.ts`**: feature adoption per campus, and whether the team logs in at all
- **`usage/memberActivity.ts`**: the one named-member read, for the dialog on `/staff/admin/users`. Deliberately not an operation: `ops_staff_activity` answers the same question in counts with no names, and a named-member read reachable with a token would put per-employee behaviour behind a credential minted for figures
- **`db/scoped.ts`**: campus-scoped DB query helpers

### Client Libraries (`src/lib/`)

- **`domain/`**: business logic (XP calculation in `xp.ts`, event lifecycle in `eventLifecycle.ts`)
- **`validation/`**: Zod schemas for forms (auth, events, students, templates, planning)
- **`components/ui/`**: Bits UI primitives (shadcn pattern)
- **`utils.ts`**: `cn()` helper (clsx + twMerge) for conditional classes

### Staff cohort tables

Two performance contracts govern staff list pages over cohort volume (~200 rows): the streaming
`load` shape, and `SortableTable` rendering one layout rather than a CSS-toggled dual render. Both
are regressions that shipped once. Read `frontend/src/lib/components/staff/CLAUDE.md` before adding
or reworking a staff list page.

## Coding Conventions

- **Language:** All UI text and user-facing strings are in **French**. Code identifiers (functions, variables) are in English.

  For a string no human reads _directly_, the test is **relay, not audience**: does it reach a French-speaking human, even through a machine? A cron job's `'Unauthorized: Invalid or missing token'` dies in a pod log, so it stays English, and so does anything a model reads as _instruction_ rather than content (MCP tool descriptions, Zod `.describe()`, validation messages, the server-level MCP instructions). But an API error an MCP client paraphrases to an admin is French, and a `metric()` definition is French without exception: it is quoted verbatim into a chat answer and into the weekly digest, and English there would make the model translate before quoting, which is a re-derived definition, the one thing that tier exists to prevent.

  Being machine-facing is also not a licence to use our own vocabulary. "Operation" is what `operations.ts` calls a catalogue entry; an admin reading a dialog thinks "les chiffres et l'état de configuration". And the reverse trap is real: **`token` stays `token`** on an ops surface. The no-jargon rule says name what the person experiences, and what they experience is a credential they paste after `Authorization: Bearer`; "jeton" makes them translate back to the word they actually type. Talent-facing copy is where jargon gets replaced, not the admin token dialog.

- **Register (vous / tu):** Pick by who reads the string. **Staff-facing copy uses _vous_** (dev and admin spaces: buttons, tooltips, help cards, confirms). **Talent-facing copy uses _tu_** (the student portal and anything a talent reads, e.g. the QR check-in page). A single feature often spans both: the émargement staff page vouvoie the staff, while its talent check-in page tutoie the student. Match the surrounding screen's register, don't mix within one audience.
- **Forms:** Use sveltekit-superforms with Zod validation. Never use raw `<form>` handling.
- **DB access:** Import `prisma` from `$lib/server/db`. Never pass the Prisma client as a function parameter, it's a singleton. Always scope queries by `campusId` for staff/student data.
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
- **Staff filter controls:** Pick by list shape, do not default to a plain dropdown. Up to four inline choices → `SegmentedFilter`, and the ceiling is a rule rather than a taste: a fifth option is the point where the group stops being readable at a glance, which is the only thing a segmented control buys over a select. A short, known list too wide to sit inline → `FilterSelect`. A long, typeable list (campuses, lycées, talents, games) → `SearchableSelect` (built-in search box; renders its own `'all'` sentinel, so leave it out of `options`). The rationale lives in the `FilterSelect`/`SearchableSelect` doc comments. A campus filter on a plain `FilterSelect` is the classic miss.
- **Lucide icons:** Always import per-icon, never the barrel. Barrel imports drag every icon through Vite's dev resolver and tank cold-start (~9s → ~3s on this codebase). If you slip, run `bun scripts/codemod-lucide-imports.ts` to auto-rewrite.

  ```ts
  // ✅ correct
  import Trash2 from "@lucide/svelte/icons/trash-2";

  // ❌ wrong: barrel import
  import { Trash2 } from "@lucide/svelte";
  ```

- **Prose punctuation:** Never write em-dashes (`—`, U+2014) or en-dashes (`–`, U+2013) in any prose AI agents generate. This covers code comments, commit messages, PR descriptions, chat responses, and documentation. Use a regular hyphen `-`, a comma, a colon, parentheses, or two sentences instead. Reason: em-dashes are a tell of AI-generated text and we want our writing to read as human. A dedicated pass swept pre-existing em-dashes and en-dashes from the repo's prose (comments, docs, this file included); the rule stays forward-looking for anything written from here on.

## Constraints

- **RGPD:** Some users are minors. The charter must be signed before accessing the app. Anonymization job available via `POST /api/jobs/anonymize` with `Authorization: Bearer <CRON_SECRET>`. Never store personal data unnecessarily.
- **Salesforce:** `Event.externalId` optionally links events to Salesforce campaigns.
- **Scale: design for the tail AND for the long tail, they are different problems.** A stage de seconde runs to ~200 students and that is the volume cohort-wide views are judged at (origin breakdowns, interest distributions, attendance lists, exports). But it is the tail of the distribution, not the norm: the median event carries 23 enrolments, three quarters carry under 40, and 41 of 292 carry none at all. Most events are also unconfigured - 235 of 292 have no module. So a screen has to survive 200 rows and has to survive being empty, and the second case is the one that is more common and gets tested less. The measured distributions live in `frontend/scripts/seed/PROFILE.md`; the generator applies them, so both cases are in front of you by default.
- **Stateless pods:** SvelteKit pods scale horizontally on kube. Don't put source-of-truth state in process memory; each replica would carry its own and a pod restart would wipe it.
- **Outbound sends:** mail and SMS are trapped unless `OUTBOUND_MODE=real`, and prod is the only environment that sets it. Never widen that gate to debug a send, and never arm real sends from a non-prod environment: recipients are minors (RGPD).

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, Microsoft OAuth credentials (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`), and mail provider keys per `MAIL_PROVIDER` (`RESEND_API_KEY` for `resend`, or `MAILJET_API_KEY` + `MAILJET_API_SECRET` for `mailjet`). Optional: `CRON_SECRET`, `WORKER_API_TOKEN`, `USAGE_SALT` (the usage-analytics pseudonym salt - unset means no talent usage is recorded at all, which is the intended failure mode), `MAIL_PROVIDER`, `MAIL_FROM`, `SMS_PROVIDER` (+ `BREVO_API_KEY`, `SMS_SENDER`, `SMS_DEV_RECIPIENTS`), `OUTBOUND_MODE` (the outbound gate: set `=real` in prod only; fail-safe to `redirect` otherwise), `EMAIL_DEV_RECIPIENTS`.

### Outbound: `MAIL_PROVIDER` / `SMS_PROVIDER`

Both are provider façades (`$lib/server/email/`, `$lib/server/sms/`) fronted by one fail-safe gate,
`OUTBOUND_MODE` (see Constraints). Provider tables, the gate/destination split, and the full
dev-redirect priority order live in `.claude/skills/outbound-messaging/SKILL.md` (Claude Code loads it
as the `/outbound-messaging` skill; other agents read the file). Read it before touching any code path
that sends.

## Development data

`bun run seed` fills a database from named scenarios (`frontend/scripts/seed/`).
It replaced a 3326-line demo seed, and the reason it exists is not tidiness: the
only credible dataset used to be a clone of production, so that is where feature
validation happened, which put real minors' personal data on non-prod
environments for days at a time and put the validation gate after the release
freeze. Both problems are downstream of the data.

Six rules, and each is enforced rather than hoped for:

- **A pull request that adds a behaviour adds its example.** A new enum value
  fails `bun run test:seed` until some scenario produces a row, because the enum
  list is read out of `schema.prisma` (via `getDMMF`) rather than maintained by
  hand. That check is in the `verify` chain, so it fails on the branch that
  caused it. A vocabulary carried by a `String` column instead of an enum is
  covered too (`assert/stringCatalogues.ts`), and there the check runs both ways:
  every declared value needs a row, and no seeded row may carry a value the
  catalogue does not declare. That second direction is not pedantry - it caught
  four invented `Usage_FeatureUse.feature` keys the generator was writing, which
  no screen would ever have shown as wrong. That half is a hand-kept table,
  because a `String` column cannot announce its own vocabulary.
- **And a state the schema can express needs a row, not only an enum value.**
  Every check above validates the CONTENT of rows that exist, so none of them can
  see a table with nothing in it or a nullable column that is null on every row -
  which was the shape of 104 gaps, `TalentInterest` (declared in the buffer,
  ordered in the flush, never pushed) and `Usage_FeatureMonthly` (the store that
  answers beyond the retention window, never written) among them. `assert/coverage.ts`
  asks `getDMMF` what is expressible and the database whether it is present: every
  model has a row, every nullable column has both a null and a non-null one, every
  boolean has both values.

  It carries two exemption lists and the split is the load-bearing part, because a
  check whose exemption list is comfortable to append to dies of a thousand
  additions. `NEVER_SEEDED` is structural, one-directional, one reason per line -
  **`Campus.externalName` heads it, since that column being empty IS the worker
  isolation**. `NOT_YET_SEEDED` is debt and **two-directional**: an entry whose gap
  has been closed fails until its line is deleted, so the list is an exact
  description of what is missing rather than a place to hide things, and its length
  is printed on every run as a number that only goes down. Moving a line between
  the two is possible and meant to be; doing it by accident is not.

  A rare state is **placed, never drawn.** A few per cent of the `ci` profile's
  couple of dozen dossiers rounds to none, so a failure rate makes coverage depend
  on the profile rather than on the generator. The PDF renders that fail and the
  closing verdicts are both placed for this reason.
- **Nothing reads the wall clock and nothing draws from `Math.random()`.** Every
  date derives from `--today` and every choice from `--seed`, both printed in the
  manifest the run emits. A scenario written as "an event that has not happened
  yet" must still mean that in six months.
- **The domain is imported, never restated.** `src/lib/domain` is alias-free, so
  a plain `bun` script reaches it by relative path. The services are not: they
  reach `$lib/server/db` and do not resolve outside Vite, so the generator writes
  rows and `--check` runs the domain's own functions over the result. The
  generator constructs, the domain verifies.
- **The measured shape of production lives in `frontend/scripts/seed/PROFILE.md`**
  and is not re-measured. It was taken once, in aggregates, with no row ever read;
  a figure that is missing from it gets asked for rather than looked up in
  production.
- **A seeded database is inert to the Salesforce worker, by construction.** The
  worker takes its scope from Jump - `GET /api/worker/campus` hands out
  `listCampuses()`, and `syncEvents` resolves what comes back against
  `Campus.externalName` - so the generator writes no external name at all and
  `listCampuses` only returns campuses that have one. A generated environment
  therefore answers an empty list, on any machine, and no real minor's data can
  land in it. This is not a flag somebody re-enables by forgetting: there is no
  campus to resolve. Turning the sync on for one campus is an explicit act on
  `/staff/admin/campuses`, where a blank external name already means null.

The seed deliberately over-represents what production barely contains. There are
three part-way dossiers in production out of 887; the generator stands one on
every rung of the ladder, because those are the states the wizard is made of and
no amount of realistic volume produces them.

Two things it does not touch. The E2E fixtures
(`frontend/tests/e2e/fixtures/seed.ts`) keep their own six accounts: a spec
anchored to a large dataset breaks the first time somebody adjusts it. And the
integration suites keep building their own fixtures per file, several of them
reading platform-wide aggregates a full dataset would silently widen.

## Prisma Migrations

Always include `--name` when creating migrations:

```
bunx prisma migrate dev --name descriptive_name
```

**Name a migration for the change, not the moment:** `--name add_event_config_template`, never a pasted sentence, a chat message, or a bare `update`.

**Put one-shot backfills in the migration SQL, not a script.** When a schema change needs existing rows updated (a new non-null column, a split, a projection recompute), write the `UPDATE`/`INSERT` directly in the generated migration so the data change ships atomically with the schema and every environment applies it exactly once. Fall back to a standalone script only when the backfill is large or batched (needs chunking to avoid a long lock) or needs application logic raw SQL can't express.

**A destructive drop ships with the change that retires it, in the same PR.** Holding it back for a follow-up migration reads like the careful move and buys nothing here, so don't spend a PR on it. Two reasons, both structural. Migrations run from the container `CMD` (`frontend/Dockerfile`), so on a rolling update the _incoming_ pod applies the DDL and the outgoing pod is drained only afterwards: the window where old code meets the new schema exists whichever PR the migration rode in on. And a branch is not a release, because `dev` promotes to staging, preprod and prod in batches, so a follow-up merged before the next promotion crosses every environment boundary in the same deploy as the change it was meant to trail.

Know what that window actually costs, because it is wider than the feature being retired: Prisma Client selects a model's scalar fields **by name**, never `SELECT *`, so a dropped column fails _every_ query on that table, including each `include` of it from elsewhere, until the last old pod is gone.

And know the mitigation that looks like it works and doesn't: leaving the column in `schema.prisma` marked retired for one release. That release's client still lists the column by name, so it would break on the drop exactly like its predecessor. The only build safe to drop a column under is one whose `schema.prisma` has already lost the field, which means shipping deliberate drift and breaking `migrate dev` for everyone until the follow-up lands. Not worth it for a dead column.

So: declare the data loss in the migration's `Warnings` block, say in a comment why no backfill is owed (**check the data against a real snapshot, don't assume**), and ship it. Eliminating the window is a deployment property, not a migration one - old pods must not outlive the schema they were built against - and it belongs to the rollout strategy in the `jump-k3s` repo.

**Squash a branch's dev migrations before merge.** Iterating a schema with `migrate dev` leaves a trail where a later migration drops what an earlier one added. Ship **one** clean migration per branch, never an add-then-drop trail: collapse them (rewrite the first migration's SQL to the net result, delete the rest, and reconcile the `_prisma_migrations` table so the DB still matches) before opening the PR. Never let a migration create something the same PR removes.

## Commits

Conventional Commits (`type(scope): subject`), the format the existing history uses (`fix(events):`, `feat(...)`). **Keep the subject line under 72 characters including the `type(scope):` prefix.** Trim wording to fit and push detail into the body rather than a long subject; one logical change per commit.

**Commits are written in English**, subject and body, whatever language the issue and the review conversation used. A commit sits next to the code, whose identifiers are English by the rule above, and it is read through `git log` and `git blame` long after the discussion that produced it. Pull request titles too, because `scripts/generate-changelog.sh` copies them verbatim into `CHANGELOG.md`, which is English: a French title lands there unedited.

The reason this is a written rule and not a matter of taste: **a branch's own history is the only style guide the next agent gets**, so one French subject makes every later commit on that branch French by imitation, and "matching the existing history" is enough of an instruction to keep it going. Eleven accumulated that way before anyone read them side by side.

What stays French is what a French-speaking non-developer reads: the UI strings covered above, and the content of an issue, which the PO reads (see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md), step 1). A pull request body follows its audience the same way. Its title does not, because of `CHANGELOG.md`.
