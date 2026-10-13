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

**`bun run verify` is the gate, and it is the same gate CI runs.** It chains `lint:scripts`, `lint`, `lint:design`, `lint:tests`, `lint:prose`, `check`, `test`, `test:integration`, `test:schema-drift`, `test:seed` and `test:e2e`, in that order, through the same scripts the required checks call. Run it before you say you verified something: the point is that the claim is recontrollable by somebody else, and a green `verify` is the artifact that makes it so. Anything needing a real database provisions itself (`scripts/with-test-db.sh`), so there is no `docker compose up` and no `migrate deploy` to remember. Nothing in the chain is CI-only: a required check with no local equivalent is the hole this command exists to close, which is why the executable-bit guard moved out of the workflow YAML and into `scripts/check-exec-bits.sh`. Nothing in it is local-only either, and that half is checked rather than promised: `lint:prose` fails when a link of the chain is run by no required job. It is the same sentence read in the other direction, and it is the one that had just gone false, because `lint:prose` itself shipped into the chain with no step in `Lint & Type Check` and therefore blocked nothing. See `frontend/TESTING.md` for the individual links in the chain and for what each CI job actually executes.

**Two of the hooks in `.claude/settings.json` talk back to the agent, and they are the deterministic half of the rules this file states.** (The third, `WorktreeCreate`, is not one of them: it shapes worktree creation and is covered under _Git worktrees_ below.) A rule written here is probabilistic: an agent can report that the checks ran when they did not, and the three hooks in `.githooks/` cannot catch that, because they fire at commit and at push, which is after the claim. `frontend/scripts/agent-edit-check.sh` runs the prose lint on every file written and hands the violation straight back. It warns, it does not veto: `PostToolUse` fires after the tool has run, so the write has already landed, and the value is the distance between hearing about it now and hearing about it at `verify` time, which in practice is after a commit. `frontend/scripts/agent-stop-gate.sh` refuses an end of turn when the tree carries a tracked change and one of the database-free links is red. It deliberately runs no more than those five: `svelte-check` and the database suites on every end of turn would get the hook switched off inside a week, and a disarmed gate guards nothing. Both fail open on everything except a linter that ran and reported a violation, since a hook that blocks on its own bug teaches you to ignore it: only an exit 1 gates, so a missing binary (a worktree whose `bun install` never finished) and a script name that no longer exists let the turn end instead of handing the model a violation that is not there. `bun run verify` stays the gate for the pull request. Permissions stay in `settings.local.json`, which is gitignored because they carry absolute paths; only the hooks are shared.

**Docker** (from repo root): `docker-compose up` starts PostgreSQL + SvelteKit.

**Git worktrees:** a freshly-added worktree has no `.env` (untracked) and no `node_modules`. The `.githooks/post-checkout` hook auto-provisions it on creation: links `.env` from the main checkout and runs `bun install`. If your editor adds worktrees without firing git hooks, run `bun run setup:worktree` once to do the same. The link is not rewritten when it already exists, so both the hook and the manual command are safe to re-run.

**The test environment is not provisioned, because it is tracked.** `frontend/.env.test.defaults` carries every value the integration and E2E suites need, and `scripts/with-test-db.sh` sources it directly, in a worktree and on a CI runner alike. It was `.env.test.example`, a template each developer copied, with CI holding a third transcription of the same values in `test.yml`; a copy only drifts in one direction, so a new variable reached every developer and never the runner, which is how `WORKSHOP_TICKET_SECRET` shipped a red required check off a green local gate. `.env.test` still exists and is still gitignored, but only as a local override: the wrapper loads it over the defaults, so it wins on the keys it names and on nothing else. Neither file carries `DATABASE_URL`, `PORT` or `ORIGIN`, per the paragraph below.

**Adding one goes through `scripts/new-worktree.sh`, whoever is asking.** By hand it takes the name and prints the directory it created (`sh scripts/new-worktree.sh feat-308-event-exports`); Claude Code runs the same script as its `WorktreeCreate` hook, so `claude --worktree`, `claude --worktree '#341'`, a subagent declaring `isolation: worktree` and a backgrounded session all produce the same shape rather than the built-in's. That shape is the two rules below plus the branch: `feat-308-event-exports` becomes the branch `feat/308-event-exports` in `../jump-worktrees/feat-308-event-exports`, and `pr-341` becomes a worktree on origin's `pull/341/head`. A new branch starts from `origin/dev`, because the built-in starts it from `origin/HEAD`, which is `main` and some five hundred commits behind a branch nothing here is ever merged into. Left to the built-in, the branch reaches the pull request named `worktree-<name>`, which the `pre-push` hook and the `Work item` check both refuse.

**A worktree belongs outside the main checkout, and its directory name is load-bearing.** Nothing gitignores a worktree created inside the checkout, so every search run from the repo root returns each tracked file two or three times: that is how an audit of this repo came to report one test file under fifteen paths, and to read the noise as a finding about this file. And the directory's basename is what the paragraph below turns into a database name and a port offset, so a placeholder name becomes a placeholder database. `frontend/scripts/setup-worktree.sh` says both out loud on provisioning, with the `git worktree move` to run. It warns rather than refuses: a misplaced worktree may already hold work, and the move recomputes the test database, so choosing when to pay that is the author's call.

**A worktree gets its own test database, and that is not a nicety.** `scripts/with-test-db.sh` derives the name from the worktree (`jump_test` in the main checkout, `jump_test_<worktree>` elsewhere) on the one container from `docker-compose.test.yml`, and derives the E2E server's port and `ORIGIN` from that same discriminant: a value that is per-worktree in one layer and shared in the other is not isolated, and the port being the shared half let one worktree's gate run green against another's build. They used to share the single `jump_test`, so a `migrate deploy` run from one branch left every other worktree's integration suite red against a schema it was never written for, with nothing to say so. Two traps the script exists to absorb: `prisma.config.ts` loads the repo-root `.env`, which points at the shared DEV database, and an already-set `DATABASE_URL` only wins because the script exports its own last; and the test container is not clean per launch (the postgres image declares its own volume, so a restart keeps its data - only `docker compose -f docker-compose.test.yml down -v` resets it).

**Testing Philosophy:** Prefer high-value, critical-path tests over sheer test volume. Never create redundant or useless placeholder tests. Focus exclusively on core domain logic, security & role permissions, bug-regression edge cases, and critical end-to-end user flows.

**`.svelte-kit/` belongs to the dev server, and to nothing else.** Anything that loads the SvelteKit vite plugin regenerates that directory when it runs, `generated/root.svelte` and `generated/client/app.js` included, so doing it while a dev server is live blanks the page in the browser until that server is restarted. Every other command therefore gets its own directory through `KIT_OUTDIR`, which `svelte.config.js` reads: `bun run check` uses `.svelte-kit-check/` (set in the script, since `svelte-check` has no config file of its own), vitest uses `.svelte-kit-test/` (set in `vitest.config.ts`, so an editor's test runner obeys it too), and the E2E suite's build uses `.svelte-kit-e2e/` (set in the `webServer` command in `playwright.config.ts`). A new command that touches the plugin needs the same treatment, plus an entry in `server.watch.ignored`.

**When a `package.json` script exists for the task, use `bun run <script>` rather than invoking the tool directly.** The scripts often set env vars (`KIT_OUTDIR=.svelte-kit-check`) or flags (`--tsconfig ./tsconfig.check.json`) that a bare `bun svelte-check` or `bunx svelte-check` will silently skip, leading to types being written to the default `.svelte-kit/` dir or the wrong strictness. For one-shots without a matching script, `bun <tool>` is fine; reach for `bunx` only when the tool isn't installed locally.

## Architecture

**The doctrine of a surface lives with the surface**, in `.claude/rules/`. Each file there declares the paths it governs in a `paths:` header, and Claude Code loads it when it reads or writes a matching file, so touching a surface brings its rules and the incidents behind them, even when the surface spans several directories. **Every other agent has to open them itself**, which is why each is named here by path rather than merely existing.

| File                                                                                           | The question it answers                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`.claude/rules/auth.md`](./.claude/rules/auth.md)           | Who may sign in through which door, and what gates a role inside a workspace    |
| [`.claude/rules/data-model.md`](./.claude/rules/data-model.md)                                     | How a fact, a relationship and a migration are shaped, and how little to couple |
| [`frontend/src/lib/server/CLAUDE.md`](./frontend/src/lib/server/CLAUDE.md)                     | Which service owns what, file by file                                           |
| [`.claude/rules/usage.md`](./.claude/rules/usage.md)         | Which of its own screens anybody opened, and why the answer holds no PII        |
| [`.claude/rules/admin-api.md`](./.claude/rules/admin-api.md)   | What a named operation may do, and what a token may reach                       |
| [`.claude/rules/staff-lists.md`](./.claude/rules/staff-lists.md) | How a staff list page survives cohort volume                                    |
| [`.claude/rules/seed.md`](./.claude/rules/seed.md)                         | What a generated database must contain, and what it must never do               |
| [`.claude/rules/salesforce.md`](./.claude/rules/salesforce.md)       | What the Salesforce worker is told to do, what may delete an enrolment, and how a Salesforce claim is reconciled with what a talent confirmed |
| [`.claude/rules/closings.md`](./.claude/rules/closings.md) | How a closing grid is composed from a global question bank, and what each figure is taken over |
| [`.claude/rules/onboarding.md`](./.claude/rules/onboarding.md) | Which school year's dossier a reader means, and why a signed document is never rewritten |
| [`.claude/rules/event-modules.md`](./.claude/rules/event-modules.md) | Which surfaces an event turns on, and how a certificate design is stored and rendered |

`bun run lint:prose` checks that every link in this table resolves, so a renamed file cannot leave a
pointer here quietly wrong.

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

BetterAuth with two disjoint doors, and how the staff door was closed to the OTP path after a code sign-in on a staff address minted a full staff session. Read [`.claude/rules/auth.md`](./.claude/rules/auth.md).

### Role gating

One table of named role groups, the client and server call shapes, and the UI pattern to pick per site. Read [`.claude/rules/auth.md`](./.claude/rules/auth.md).

### Event modules

Moved to [`.claude/rules/event-modules.md`](./.claude/rules/event-modules.md).

### Closings: a question bank, composed per event

Moved to [`.claude/rules/closings.md`](./.claude/rules/closings.md).

### Data Layer

Prisma schema at `frontend/prisma/schema.prisma`. Data is campus-scoped.

### Data modeling: facts as rows, state as projection

Append-only fact rows with cached projections recomputed in the same transaction, and the case this shape does NOT fit. Read [`.claude/rules/data-model.md`](./.claude/rules/data-model.md).

### Relational modeling

Model relationships by their real shape: join table only when both sides are many, an anti-corruption mirror for an external system, a composite foreign key binding a denormalised column to its source, and the `Context_ModelName` prefix. Read [`.claude/rules/data-model.md`](./.claude/rules/data-model.md).

### Default to less: coupling and surface

Prefer the least coupling that works, delete a questioned mechanism instead of refining it, and why a table holding no data of its own is not a table. Read [`.claude/rules/data-model.md`](./.claude/rules/data-model.md).

### XP System

XP follows the ledger pattern above. Each granting fact is one `XpGrant` row (unique on `(source, sourceId)`; sources: `onboarding`, `onboarding_early_bird`, `minigame`, `minigame_rank`, `reward`, `workshop`, `admin_adjustment`). `Talent.xp` = `SUM(amount)` and `Talent.eventsCount` = present-participation count, both cached projections.

- **Never mutate `Talent.xp` directly.** It's a cached projection of `XpGrant`; go through `xpService` so the recompute stays atomic.
- **Level is derived, not stored** (`Talent.level` was dropped). Use `computeLevel(xp)` (tiers: Novice 0-199, Apprentice 200-499, Expert 500+). `JUMP_LEVELS` is canonical in `domain/xp.ts`; `xpRangeForLevel` maps a tier back to an `xp` range for the broadcast filter. No level tier is surfaced in the dev workspace, so there is no French label helper.
- Backfill/repair: `scripts/backfill-xp-ledger.ts` (idempotent, `--dry-run`).

### Onboarding: one dossier per school year

Moved to [`.claude/rules/onboarding.md`](./.claude/rules/onboarding.md).

### Salesforce sync: Jump decides, the worker obeys

The worker holds no configuration, no cadence and no watermark: it is woken on a fixed tick, asks Jump what to do over `/api/worker/*`, obeys, and reports each run into `Sync_Run`. Which campaigns are pulled (`Sync_Source`), how often (`Sync_Cadence`), whether somebody asked for a pass now (`Sync_Request`) and what each run did are Jump's, and the staff steer them through named operations rather than a screen. The rule that matters most: **only a `full` pass may delete an enrolment**, because removing a member from a campaign moves no modstamp in Salesforce and is therefore invisible to any incremental, and it does so only from a complete roster: a deletion it cannot prove is held, never refused, because a refusal fails the run and a failed run replays identically at every tick. Read [`.claude/rules/salesforce.md`](./.claude/rules/salesforce.md) before touching any of it.

### Salesforce reconciliation

Moved to [`.claude/rules/salesforce.md`](./.claude/rules/salesforce.md).

### Usage analytics: a catalogue of features, recorded server-side

Which of its own screens anybody opened, and the reasons the answer is shaped the way it is: what is absent from the fact table IS the PII boundary, two deliberately asymmetric actor regimes, nothing recorded by client code, and a small-cell floor on any narrowed talent count. Read [`.claude/rules/usage.md`](./.claude/rules/usage.md).

### UI, API, or both

The admin space stopping its UI growth (below) is often read as "admin work goes to the API". That is not the axis. What the freeze reacted to is **pages that restate the database**: one screen per question, none fitting anyone exactly. Five tests instead, and they cut across spaces:

1. **Is the output a fact, a figure, or a bounded state change?** → API. A chat composes the exact answer; a screen freezes one shape of it forever.
2. **Does the human need to _see_ the result to decide?** → UI. When the acceptance test is "does this look right", no JSON substitutes for a render.
3. **Is it done while already on a screen that exists?** → put the control there. That is not growing the admin space; the certificate picker in `EventConfigWizard` replaced a switch that was already in that dialog.
4. **Is it done under time pressure, in the field, repeatedly?** → UI. Nobody opens a chat client to check in 200 students at 9am, which is why émargement is a screen.
5. **Is it for someone who will never hold a token?** → UI. Talents, parents, campus staff.

**And the rule under all five: the API is the floor.** Every capability lands as a named operation first; a UI is optional convenience on top. A config field reachable only in the wizard is a hole, because event configuration is already fully MCP-driven, and the people who use it prefer it that way: a form will never be exactly what its user wants, whereas a named operation is. Stated here because it is mechanically checked - `operations.test.ts` asserts that every field of `adminEventSchema` is reachable through some write, and that every catalogue entry is mounted on exactly one HTTP route. `write_event_config` carries `moduleSettings` because that test found it reachable through nothing at all.

The corollary is narrower than it looks. "No form will ever fit" is decisive for **authoring** surfaces. It says nothing about a picker inside a flow somebody is already in.

### Curated admin API and MCP

The admin space **stops growing UI**: new admin capabilities ship as curated named API operations,
consumable over HTTP and as MCP tools, never as new admin UI. Read
[`.claude/rules/admin-api.md`](./.claude/rules/admin-api.md) before
adding, changing, or reasoning about an operation, a write's class (A/B/C), the leadership tier, or
anything under `src/lib/server/adminApi/`: it carries the non-negotiable rules (PII, audit, scope
refusal, handles) and the file-by-file map of the tier.

### Key Server Services (`src/lib/server/`)

The file-by-file map of the server tier: auth, the admin API, the aggregates, the digest, the renderers, the Salesforce sync, the usage recorder, the scoped DB helpers. Read [`frontend/src/lib/server/CLAUDE.md`](./frontend/src/lib/server/CLAUDE.md).

### Client Libraries (`src/lib/`)

- **`domain/`**: business logic (XP calculation in `xp.ts`, event lifecycle in `eventLifecycle.ts`)
- **`validation/`**: Zod schemas for forms (auth, events, students, templates, planning)
- **`components/ui/`**: Bits UI primitives (shadcn pattern)
- **`utils.ts`**: `cn()` helper (clsx + twMerge) for conditional classes

### Staff cohort tables

Two performance contracts govern staff list pages over cohort volume (~200 rows): the streaming
`load` shape, and `SortableTable` rendering one layout rather than a CSS-toggled dual render. Both
are regressions that shipped once. Read
[`.claude/rules/staff-lists.md`](./.claude/rules/staff-lists.md)
before adding or reworking a staff list page.

## Coding Conventions

- **Language:** All UI text and user-facing strings are in **French**. Code identifiers (functions, variables) are in English.

  For a string no human reads _directly_, the test is **relay, not audience**: does it reach a French-speaking human, even through a machine? A cron job's `'Unauthorized: Invalid or missing token'` dies in a pod log, so it stays English, and so does anything a model reads as _instruction_ rather than content (MCP tool descriptions, Zod `.describe()`, validation messages, the server-level MCP instructions). But an API error an MCP client paraphrases to an admin is French, and a `metric()` definition is French without exception: it is quoted verbatim into a chat answer and into the weekly digest, and English there would make the model translate before quoting, which is a re-derived definition, the one thing that tier exists to prevent.

  Being machine-facing is also not a licence to use our own vocabulary. "Operation" is what `frontend/src/lib/server/adminApi/operations.ts` calls a catalogue entry; an admin reading a dialog thinks "les chiffres et l'état de configuration". And the reverse trap is real: **`token` stays `token`** on an ops surface. The no-jargon rule says name what the person experiences, and what they experience is a credential they paste after `Authorization: Bearer`; "jeton" makes them translate back to the word they actually type. Talent-facing copy is where jargon gets replaced, not the admin token dialog.

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

  This is the most-repeated review finding on staff dialogs and admin pages: prose accumulates one well-meant clarification at a time, and nobody deletes any of it. The `/staff/admin/api-tokens` page is the worked example (header, tier cards, write toggle, conditions, list).

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

See `.env.example`. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, Microsoft OAuth credentials (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`), and mail provider keys per `MAIL_PROVIDER` (`RESEND_API_KEY` for `resend`, or `MAILJET_API_KEY` + `MAILJET_API_SECRET` for `mailjet`). Optional: `CRON_SECRET`, `WORKER_API_TOKEN`, `JUMP_ADMIN_TOKEN` + `JUMP_ORIGIN` (agent-side only, expanded by the MCP client from the repo's `.mcp.json`, never read by the server), `USAGE_SALT` (the usage-analytics pseudonym salt - unset means no talent usage is recorded at all, which is the intended failure mode), `MAIL_PROVIDER`, `MAIL_FROM`, `SMS_PROVIDER` (+ `BREVO_API_KEY`, `SMS_SENDER`, `SMS_DEV_RECIPIENTS`), `OUTBOUND_MODE` (the outbound gate: set `=real` in prod only; fail-safe to `redirect` otherwise), `EMAIL_DEV_RECIPIENTS`, `WORKSHOP_TICKET_SECRET` + `WORKSHOP_TICKET_KEY_ID` (the CTFd activities' shared secret and the name of this Jump environment; unset means entering an activity answers 503 and the progress callback 500, so an environment offering activities needs both).

### Outbound: `MAIL_PROVIDER` / `SMS_PROVIDER`

Both are provider façades (`$lib/server/email/`, `$lib/server/sms/`) fronted by one fail-safe gate,
`OUTBOUND_MODE` (see Constraints). Provider tables, the gate/destination split, and the full
dev-redirect priority order live in `.claude/skills/outbound-messaging/SKILL.md` (Claude Code loads it
as the `/outbound-messaging` skill; other agents read the file). Read it before touching any code path
that sends.

## Development data

`bun run seed` fills a database from named scenarios, and the seven rules it enforces rather than hopes for, including why a seeded row must be a fact and never an instruction a scheduler can find. Read [`.claude/rules/seed.md`](./.claude/rules/seed.md).

## Prisma Migrations

Naming, the one-shot backfill that ships inside the migration, why a destructive drop travels with the change that retires it, and why a branch squashes its trail into one. Read [`.claude/rules/data-model.md`](./.claude/rules/data-model.md).

## Commits

Conventional Commits (`type(scope): subject`), the format the existing history uses (`fix(events):`, `feat(...)`). **Keep the subject line under 72 characters including the `type(scope):` prefix.** Trim wording to fit and push detail into the body rather than a long subject; one logical change per commit.

**Commits are written in English**, subject and body, whatever language the issue and the review conversation used. A commit sits next to the code, whose identifiers are English by the rule above, and it is read through `git log` and `git blame` long after the discussion that produced it. Pull request titles too, because `scripts/generate-changelog.sh` copies them verbatim into `CHANGELOG.md`, which is English: a French title lands there unedited.

The reason this is a written rule and not a matter of taste: **a branch's own history is the only style guide the next agent gets**, so one French subject makes every later commit on that branch French by imitation, and "matching the existing history" is enough of an instruction to keep it going. Eleven accumulated that way before anyone read them side by side.

What stays French is what a French-speaking non-developer reads: the UI strings covered above, and the content of an issue, which the PO reads (see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md), step 1). A pull request body follows its audience the same way. Its title does not, because of `CHANGELOG.md`.

## Pull Requests and Self-Review Boundary

**Opening a PR ends the authoring turn.** When implementation, tests, and the `verify` gate are complete, open the draft pull request with `scripts/finish-work.sh`. Once the PR URL is printed, the authoring agent's task is done: stop and return the PR URL.

**Never review your own diff in the same session.** A session that wrote the branch carries the assumptions that produced it and re-reads its own reasoning as sound. Review belongs in an independent, fresh session (or to the human), typically via `/review <pr_number>`. An agent must never spawn subshells or headless review commands (`claude -p`, diff analyzers) inside the authoring session: having the writer supervise and approve its own work destroys the isolation that removes confirmation bias.
