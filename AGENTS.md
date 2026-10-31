# AGENTS.md

Instructions for every AI agent working in this repository. `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` point here and hold nothing of their own.

This file holds only what every session needs and cannot read off the code. What concerns one surface lives in `.claude/rules/`, listed under [Doctrine by surface](#doctrine-by-surface): Claude Code loads each file when you touch its paths, every other agent opens it before touching them.

## Project

Jump is Epitech Academy's internal platform for the events it runs for school students: SvelteKit, Prisma, PostgreSQL, code under `frontend/`, UI in French.

**It exists to bring a talent back.** Most talents met on a campus never return, and that is the weakness Jump was built to address. So a feature earns its place by what it does for that return, and a talent-facing one by making the next event worth coming back to.

| Workspace  | Path            | Audience          | Purpose                                                |
| ---------- | --------------- | ----------------- | ------------------------------------------------------ |
| **Dev**    | `/staff/dev/`   | `superdev`, `dev` | Talent Acquisition & Recruitment (admissions pipeline) |
| **Admin**  | `/staff/admin/` | `admin`           | Global system overview; account impersonation          |
| **Talent** | `(talent)/`     | students          | Student experience: gamification, progression          |
| **Parent** | `(parent)/`     | legal guardians   | Règlement co-signature, image-rights decision          |

Three words read wrong from outside. The full glossary is [`JARGON.md`](.github/JARGON.md).

- **`dev` is the recruitment team** (Business Development), never a software engineer: `dev` roles, `/staff/dev/` routes.
- **A participation is not a presence.** `Participation` is an enrolment synced from Salesforce; émargement (`EventPresence`) is the only presence record, and no Salesforce status means present or absent.
- **A masked enrolment is still in Jump.** The dev workspace shows only some Salesforce statuses: say "affichée dans l'espace dev" for that count, never "dans Jump".

## Philosophy

- **Cleanest, not quickest.** A local hotfix or a duplicated component that "works" is an anti-pattern here.
- **Modularity before optimisation.** Clear and well-decomposed first; optimise only on a measured need.
- **DRY everywhere,** documentation included: if something is true in two places, it must live in one.

## Commands

Run from `frontend/` with Bun. The shell's cwd persists between commands, so anchor on the root rather than a reflexive `cd frontend`: `cd "$(git rev-parse --show-toplevel)/frontend"`.

- **`bun run verify` is the gate**, the same chain the required CI checks run (the chain is in `frontend/package.json`, each link is explained in [`frontend/TESTING.md`](frontend/TESTING.md)). Run it before you say something is verified. Database suites provision their own per-worktree database (`frontend/scripts/with-test-db.sh`): no `docker compose up`, no `migrate deploy`.
- **Use `bun run <script>` when one exists**, never the bare tool: the scripts set env vars and flags (`KIT_OUTDIR`, `--tsconfig ./tsconfig.check.json`) that `bunx svelte-check` silently skips.
- **`.svelte-kit/` belongs to the dev server.** A new command that loads the SvelteKit vite plugin gets its own `KIT_OUTDIR` and an entry in `server.watch.ignored`, or it blanks a running dev server (`vitest.config.ts` says why).
- **Add a worktree with `sh scripts/new-worktree.sh <type>-<issue>-<slug>`**, which Claude Code's `WorktreeCreate` hook also runs. It places the worktree outside the checkout and names its branch; the directory name becomes its test database and E2E port, so it is load-bearing.
- **Tests:** critical paths only (domain logic, permissions, regressions, critical E2E flows), never placeholder tests. See `frontend/TESTING.md` §1.
- **Two hooks in `.claude/settings.json` answer back:** the prose lint on every file you write (it warns), and a gate that refuses to end a turn while a database-free lint is red. Both fail open on their own errors; `verify` stays the gate.
- `docker-compose up` (repo root) starts PostgreSQL and SvelteKit together.

## Shipping a change

The protocol is [`CONTRIBUTING.md`](.github/CONTRIBUTING.md), and parts of it are enforced by a required CI check. What it asks of an agent, with the reasons in its step 7:

1. **The issue comes first**, with non-empty `User Stories` and `Acceptance Criteria`, written in French for the PO. Scoping needs the PO: if nobody can answer, stop and say so rather than reconstructing the issue afterwards.
2. **Branch `type/<issue>-slug` from `dev`**, never from `main`: `scripts/start-work.sh` cuts it and moves the issue on the board.
3. **Commits** follow Conventional Commits (`type(scope): subject`, under 72 characters including the prefix, one logical change each) and are **in English**, subject and body, whatever language the conversation used: one French subject makes every later commit on the branch French by imitation, and eleven had accumulated that way before anyone read them side by side. Commit and PR text go through files under `.ship/` (`git commit -F .ship/commit.txt`), never pasted multi-line through the shell; rewrite each file you use, since `.ship/` still holds the previous branch's, and never hard-wrap inside them.
4. **The PR body covers the whole branch** (`git log --oneline origin/dev..HEAD`), names real symbols, files and routes, adds `## Migrations` and `## Env vars` when the branch carries either, and deletes every line that does not apply instead of leaving `N/A` or an unchecked box. Its title is English, because `CHANGELOG.md` copies it verbatim; its body follows its audience. Stage explicit paths whenever untracked files that are not yours are present.
5. **`scripts/finish-work.sh` opens the draft PR, and that ends your turn**: return the URL and stop. Never review your own diff in the session that wrote it, and never spawn `claude -p` or a review subshell to do it: review belongs to a fresh session (`/review <pr>`) or to a human.

## Conventions

- **Language:** UI text is French, identifiers are English. For a string no human reads directly, ask whether it reaches a French speaker, even through a machine: an API error an MCP client paraphrases and every `metric()` definition are French; a log line and anything a model reads as instruction (tool descriptions, Zod `.describe()`, MCP instructions) stay English. The reasoning, and why `token` stays `token`, is in [`admin-api.md`](.claude/rules/admin-api.md#language-and-vocabulary-of-machine-facing-strings).
- **Register:** staff-facing copy uses _vous_, talent-facing copy uses _tu_, parents get _vous_. Match the audience of the screen: one feature can span both, like émargement.
- **No developer jargon in copy a person reads** ("scan", "QR", "flag", "mini games"): describe what they experience.
- **Forms:** sveltekit-superforms with Zod, never raw `<form>` handling.
- **Database:** import `prisma` from `$lib/server/db` (a singleton, never passed as a parameter) and scope staff and student data by `campusId`.
- **Auth:** never call BetterAuth in a `load`; `hooks.server.ts` already hydrates `locals.{user, staffProfile, talent}`.
- **Interface work** follows [`DESIGN.md`](DESIGN.md) and [`.claude/rules/ui.md`](.claude/rules/ui.md): shadcn components, `cursor-pointer`, copy density, scrolling lists, filter controls, Lucide imports.
- **No em-dash (`—`) and no en-dash (`–`)** in anything you write: comments, docs, commits, PRs, chat. Use `-`, a comma, a colon, parentheses or two sentences; they read as machine-written. `lint:prose` enforces it on files.

## Domain rules any change can hit

- **Event surfaces are per-event modules** (`EVENT_MODULES` in `domain/eventModules.ts`), never feature flags and never hard-coded keys.
- **XP is a ledger.** Never write `Talent.xp`: go through `xpService`. A level is derived (`computeLevel`), never stored, and never shown in the dev workspace.
- **Facts are rows, state is a projection** recomputed in the same transaction.
- **Onboarding writes go through `onboardingYearService`**, and the projection on `Talent` describes the most recent dossier, not the current year.
- **Salesforce never overwrites a field a talent confirmed, and only a `full` sync pass may delete an enrolment.**
- **A new admin capability is a named API operation** (HTTP and MCP), never new admin UI.

### UI, API, or both

The admin freeze reacted to pages that restate the database, not to admin work as such. Five tests, across every space:

1. **A fact, a figure, or a bounded state change?** API: a chat composes the exact answer, a screen freezes one shape of it.
2. **Does the human need to _see_ the result to decide?** UI.
3. **Done while already on an existing screen?** Put the control there; that is not growing the admin space.
4. **Done under time pressure, in the field, repeatedly?** UI: nobody checks in 200 students at 9am from a chat, which is why émargement is a screen.
5. **For someone who will never hold a token?** UI: talents, parents, campus staff.

Under all five, the API is the floor: every capability lands as a named operation first, and `operations.test.ts` checks it ([`admin-api.md`](.claude/rules/admin-api.md)).

## Doctrine by surface

Each file carries its surface's rules and the incidents that set them. Read it before touching the surface.

| File | Read before touching |
| --- | --- |
| [`.claude/rules/admin-api.md`](.claude/rules/admin-api.md) | the admin API, MCP tools, `adminStats`, tokens, the leadership tier |
| [`.claude/rules/auth.md`](.claude/rules/auth.md) | sign-in doors, guards, role groups, `hooks.server.ts` |
| [`.claude/rules/closings.md`](.claude/rules/closings.md) | closings: the question bank, grids, records, their figures |
| [`.claude/rules/data-model.md`](.claude/rules/data-model.md) | `schema.prisma`, a new model or relation, a migration |
| [`.claude/rules/event-modules.md`](.claude/rules/event-modules.md) | event modules, presets, certificate designs and rendering |
| [`.claude/rules/onboarding.md`](.claude/rules/onboarding.md) | the onboarding dossier, règlement, image rights, the parent portal |
| [`.claude/rules/salesforce.md`](.claude/rules/salesforce.md) | the worker API, the sync, Salesforce reconciliation |
| [`.claude/rules/seed.md`](.claude/rules/seed.md) | `bun run seed` and the generated dataset |
| [`.claude/rules/staff-lists.md`](.claude/rules/staff-lists.md) | a staff list page, its `load`, `SortableTable` |
| [`.claude/rules/ui.md`](.claude/rules/ui.md) | any `.svelte` file or component |
| [`.claude/rules/usage.md`](.claude/rules/usage.md) | usage analytics, the feature catalogue, `hooks.server.ts` |

**Where a new rule goes.** A rule about one surface goes in its file, with the incident that set it; a new surface gets a new file with a `paths:` header and a row here. This file takes a rule only if every session needs it. `lint:prose` fails on a rules file this table does not link, on a `paths:` glob that matches nothing, and on this file outgrowing its budget.

## Constraints

- **RGPD:** some users are minors. The charter is signed before the app opens, personal data is never stored without need, and erasure goes through `POST /api/jobs/anonymize`.
- **Outbound sends** are trapped unless `OUTBOUND_MODE=real`, which only prod sets. Never widen that gate to debug a send, and never arm real sends outside prod. Read the `outbound-messaging` skill (`.claude/skills/outbound-messaging/SKILL.md`) before touching any code path that sends.
- **Stateless pods:** SvelteKit scales horizontally, so no source-of-truth state in process memory.
- **Scale:** design for a 200-row cohort and for an empty one. The median event has 23 enrolments and most carry no module; [`frontend/scripts/seed/PROFILE.md`](frontend/scripts/seed/PROFILE.md) has the distributions, and the seed applies them.
- **Environment variables** are each documented in `.env.example`, at the repo root.
