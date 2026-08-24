# Contributing to Jump

This document formalises how features are built on Jump — from the PO's initial
need to the merged PR. Objective: enable any developer or AI agent to execute
tasks with the exact same standard of quality.

See also: [`AGENTS.md`](../AGENTS.md) for the philosophy, architecture, and coding
standards, and [`JARGON.md`](./JARGON.md) for shared domain vocabulary.

---

## The Protocol

Four rules govern everything below, in this order.

1. **A step is only real if it leaves an artifact something checks.** A step whose trace lives outside this repository gets forgotten, by humans and by agents alike. That is why the issue number is carried by the branch name, and why the board is no longer moved by hand.
2. **A guard always runs, and skips itself.** A check filtered by `paths:` can never be a required check: it never reports on the pull requests it does not match, and GitHub waits for it forever. Guards run on every pull request and exit early when they have nothing to say.
3. **If a step needs a human who is not available, stop and say so.** Steps 0 and 1 depend on the Product Owner. Skipping them silently and reconstructing the issue afterwards is the exact failure this protocol exists to prevent. An unanswered question is a blocker to announce, not a defect to work around.
4. **The issue number is the key.** It is the only artifact that exists before the first commit, so it is what the branch name carries and what every later step is checked against.

### What proves each step, and what verifies it

| Step | Artifact that proves it | Verified by |
| --- | --- | --- |
| 0. PO alignment | nothing in the repo | prose, plus rule 3 |
| 1. User stories in a GitHub issue | the issue, with non-empty `User Stories` and `Acceptance Criteria` headings | **`Work item`**, a required check |
| 2. Functional plan | pasted into the issue | prose |
| 3. Technical plan | `docs/plans/` on your machine (gitignored) | prose |
| 4. Branch `type/<issue>-slug`, cut from `dev` | the branch name, and the issue predating the branch's first commit | **`Work item`**, and the `pre-push` hook |
| 4b. Issue on the board, in `In Progress` | the board item | **automated** by `board-sync.yml` when the PR opens |
| 5. Technical gate | green checks | **`Lint & Type Check`, `Unit & Integration Tests`, `E2E Tests`**, all required |
| 6. Definition of Done | the ticked boxes in the PR body | prose, rendered by the PR template |
| 7. `Closes #<issue>` in the PR body | the PR body | **`Work item`**, re-checked on every body edit |
| 7b. Issue in `Done`, and closed | the board item | **automated** by `board-sync.yml` on merge |

Anything marked **required** blocks the merge into `dev`. Anything marked prose does not, which is precisely why the prose steps are the ones to be deliberate about.

Run the guard yourself before pushing, so you find out locally instead of in CI:

```bash
bash scripts/check-work-item.sh
```

**What the guard cannot check.** It verifies that a story exists and is structured, never that it is any good: a hollow story passes. The guard prevents forgetting, not mediocrity. The substance is a human review.

### Escape hatches, both named

Urgent work stays possible without quietly disabling anything.

- **Locally:** `git push --no-verify` skips the `pre-push` hook. It is git's own mechanism, so there is nothing extra to learn and nothing extra to maintain.
- **In CI:** label the pull request `no-issue` and give its body a `## Process exception` section saying why. The guard then passes. An exception you have to name is respected; an implicit one becomes the default.

Promotion pull requests (`dev` into `staging`, `staging` into `main`) need neither: the guard recognises them by their source branch and exits.

---

## Engineering Philosophy

The engineering philosophy, **cleanest not quickest**, **modularity before optimisation**,
and **DRY everywhere**, is defined once in [`AGENTS.md`](../AGENTS.md#philosophy).
Read it there before contributing.

---

## Feature Pipeline

### Step 0 — PO Alignment

Before writing any code or specifications, talk with the Product Owner (PO) to grasp
the core user need and business requirements. The PO's implementation suggestions are
inputs to challenge, not fixed specifications. Start from the user problem, not the technical solution.

### Step 1 — User Stories in GitHub Issues

Open the issue **before the branch**, with the *Feature* template. It carries the two headings the
`Work item` check reads, `User Stories` and `Acceptance Criteria`, and GitHub refuses to submit
the form while either is empty.

Express requirements as User Stories. Format:

```
As a [role], I want to [action] so that [benefit].
```

French is fine, and is what most issues here use: *En tant que [rôle], je veux [action], pour
[bénéfice]*. The guard matches on the headings, not on the language of the prose under them.

Each story must include clear acceptance criteria (`Given X, when Y, then Z`).
The PO reviews and validates these criteria before moving forward. Acceptance criteria
directly serve as the foundation for tests (unit, integration, E2E).

### Step 2 — Functional Plan (No-Code Context)

Before opening a branch, generate a functional plan with the AI assistant. This plan outlines:

- Business context and decided rules
- Target entities and impacted data flows
- Edge cases and identified risks
- Explicitly out-of-scope items

**No code snippets at this step.** The goal is ensuring requirements are fully understood
before technical execution begins.

This plan is pasted into the GitHub Projects item description (or as a comment) for post-mortem
traceability.

> 💡 **AI Prompting Tip:** At the start of scoping, instructing the AI *"We are in a
> brainstorming phase, do not generate any code for now"* forces clean architectural reflection
> before execution.

### Step 3 — Technical Execution Plan

The detailed technical plan (DB schemas, function signatures, migrations, implementation phases)
is generated locally under `docs/plans/` using `/plan` and referenced in the GitHub item.
This directory is `gitignored`: plans are working documents that guide execution and live in the GitHub item.

### Step 4 — Branching & Implementation

Always branch off `dev` (never from `main`), and carry the issue number in the branch name:

```bash
scripts/start-work.sh --issue 248 --type feat --slug short-descriptive-name
```

One command: it cuts the branch from an up-to-date `dev`, puts the issue on the
[Jump Roadmap & Releases](https://github.com/orgs/Manta-Epitech-Academy/projects/1) board, and sets it
to **In Progress**. Pass `--title` and `--body-file` instead of `--issue` to open the issue and the
branch in the same call. By hand it is:

```bash
git checkout dev && git pull origin dev
git checkout -b feat/248-short-descriptive-name
```

The board is no longer yours to move afterwards: `board-sync.yml` sets **In Progress** when the pull
request opens and **Done** when it merges.

During implementation:
- Refactor and share existing utilities — never duplicate logic locally.
- Keep the PO in the loop during development (screenshots, questions): an early feedback loop prevents costly rework.
- If a technical decision diverges from the initial plan, update the GitHub item accordingly.

### Step 5 — Technical Gate

Before any commit or PR, verify that all static checks pass cleanly:

```bash
cd "$(git rev-parse --show-toplevel)/frontend"
bun run check        # 0 errors, 0 warnings (TypeScript & Svelte)
bun run lint         # Formatting & linting (Prettier/ESLint)
bun run test         # Unit tests, incl. the DESIGN.md token contract
bun run lint:design  # Visual contract (see scripts/LINT-DESIGN.md)
```

For branches with schema updates, ensure migrations are cleanly named and squashed into a single migration per branch (see [`AGENTS.md`](../AGENTS.md#prisma-migrations)). Since unit tests (`bun run test`) mock the database layer, branches modifying Prisma schema or tables MUST also be verified against a real PostgreSQL database (via `bunx prisma db push` or `bun run test:integration`) before declaring the feature complete.

### Step 6 — Visual Review & Definition of Done

The Definition of Done lives in [`pull_request_template.md`](./pull_request_template.md), as a
checklist in the pull request body. It is deliberately not repeated here: it is ticked in the PR, so
that is where it belongs, and one copy cannot drift from the other.

Two of its lines are worth reading before you start rather than at the end, because they change how
you build: new behaviours need automated coverage, and a schema change needs verifying against a
real PostgreSQL database.

### Step 7 — PR, Self-Review & Merge

Writing the commits and the pull request copy is the agent's job, not a tool's. What follows is the
part that is easy to get wrong.

1. Conventional Commits, per [`AGENTS.md`](../AGENTS.md#commits): `type(scope): subject` under 72 characters including the prefix, one logical change per commit.
2. **Write the copy into files under `.ship/`, and hand the files to git and gh.** `git commit -F .ship/commit.txt`, and `scripts/finish-work.sh` reads `.ship/pr-body.md`. Pasting multi-line markdown through the terminal mangles newlines and bullets, and the shell here is fish, which has no heredoc to fall back on. `.ship/` is gitignored.

   **`.ship/` still holds the previous branch's files.** Rewrite every one you are about to use, or clear the directory first: `finish-work.sh` will cheerfully ship a stale body from two branches ago, and it looks plausible enough that nobody notices.
3. **Do not hard-wrap inside those files.** One bullet is one line, however long; one paragraph is one line. GitHub and `git log` wrap for you, and manual breaks at 72 columns re-introduce the exact mangling the files exist to prevent.
4. **Scope the body to the whole branch, not the working tree.** Survey it with `git log --oneline origin/dev..HEAD` and `git diff --name-status origin/dev...HEAD`. On a long branch, cluster the commits into themes and write from the themes. If something is still uncommitted, say so instead of quietly folding it into the summary.
5. **Name real things.** Actual symbols, models, routes, files. "Various improvements" is not a summary. Add `## Migrations` and `## Env vars` sections when the branch carries either, so a reviewer cannot miss them.
6. Stage explicit paths rather than `git add -A` whenever `git status` shows untracked files that are not part of the change: scratch notes, screenshots, summary dumps. Surface them so the user decides.
7. Open the pull request with `scripts/finish-work.sh`. It pushes the branch, guarantees the `Closes #<issue_number>` line the `Work item` check requires, opens it as a **draft**, and then runs the guard so a failure surfaces now rather than in CI.
8. Self-review: read your own diff as if it were someone else's. Then tick the Definition of Done in the body, and mark the PR ready for review.
9. Merge into `dev` once approved (or auto-merge if working solo).
10. **Nothing to do about the board.** `board-sync.yml` sets the issue to `Done` on merge, and the board's own workflow closes it from there. This used to be a manual step, and being manual is why it was skipped on 10 of the last 17 issues. `Closes #N` still earns its place as the link a reviewer follows, but it closes nothing by itself: GitHub only applies closing keywords when a PR merges into the **default branch**, and every feature PR targets `dev`. The later `dev` to `main` promotion carries no keyword either.

---

## Branching Strategy

**`dev` is the trunk of this repository. `main` is the release branch (production).**

In this repository, `main` represents the latest tagged stable release. `dev` is where all ongoing work is integrated and is the single source of truth for active development.

Rule: **Always branch off `dev`, always merge into `dev`.** `main` only receives commits during formal releases (via a merge from `dev` to `main`).

Branch naming: **`type/<issue>-slug`**. The issue number is mandatory and checked, both by the
`pre-push` hook and by the `Work item` job; the slug is lowercase kebab-case.

| Type             | Prefix      | Example                            |
| ---------------- | ----------- | ---------------------------------- |
| New feature      | `feat/`     | `feat/223-sf-member-status`        |
| Bug fix          | `fix/`      | `fix/218-emargement-export`        |
| Refactoring      | `refactor/` | `refactor/222-retire-event-type`   |
| Documentation    | `docs/`     | `docs/224-contributing-and-jargon` |

`chore/`, `test/`, `perf/`, `ci/`, `build/` and `style/` are accepted too, matching the Conventional
Commit types used in the history. Any other prefix fails the check.

---

## PR Review Protocol

When reviewing a PR, start by testing the **Test Plan** checkboxes in the PR description. If the test plan fails, stop the review there.

Next, evaluate the Definition of Done checklist against the diff. Key points to double-check:

- **Business Alignment:** compare the diff against the issue's User Stories to verify it fulfills the exact requirement — no more, no less.
- **Database Migrations:** cleanly named, squashed into one, atomic SQL backfill included if needed.
- **Copy & Tone:** correct *_vous_* / *_tu_* register, no dev jargon, no em-dashes.
- **Space Integrity:** audience targets, border radii, `cursor-pointer`, component reuse.

---

## Working with AI

**Native Agent Capabilities** (built-in commands available in any workspace):

| Command  | Usage                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| `/plan`  | Researches the codebase, generates a detailed plan, and waits for user approval |
| `/review`| Reviews a diff or PR, highlights critical issues, and proposes clean fixes     |

> 💡 At the start of a scoping session with `/plan`, specifying *"We are in a
> brainstorming phase, do not generate any code for now"* encourages deeper architectural analysis.

**Repository scripts** are the vendor-neutral half of the toolchain. They are plain shell in
`scripts/`, so any agent can run them, not only the ones that understand Claude skills:

| Script | Usage |
| ------ | ----- |
| `scripts/start-work.sh` | Open the issue (or reuse one), put it on the board in `In Progress`, cut `type/<issue>-slug` |
| `scripts/finish-work.sh` | Open the draft PR against `dev` with the `Closes #<issue>` line |
| `scripts/check-work-item.sh` | Run the `Work item` guard locally, exactly the code CI runs |
| `scripts/apply-repo-config.sh` | Apply the versioned repo config in `.github/settings/repo-config.json` (required checks, labels) |

**Custom Repository Skills** encode Jump-specific workflows. They live in `.claude/skills/`, one
directory per skill, and each `SKILL.md` opens with a `description` front-matter line stating what it
does and when to reach for it. Read the directory rather than a table here: a table drifts the moment a
skill is added or renamed, and the front-matter is what agents actually match on.
