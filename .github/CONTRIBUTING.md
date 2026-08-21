# Contributing to Jump

This document formalises how features are built on Jump — from the PO's initial
need to the merged PR. Objective: enable any developer or AI agent to execute
tasks with the exact same standard of quality.

See also: [`AGENTS.md`](./AGENTS.md) for the philosophy, architecture, and coding
standards, and [`JARGON.md`](./JARGON.md) for shared domain vocabulary.

---

## Engineering Philosophy

The engineering philosophy, **cleanest not quickest**, **modularity before optimisation**,
and **DRY everywhere**, is defined once in [`AGENTS.md`](./AGENTS.md#philosophy).
Read it there before contributing.

---

## Feature Pipeline

### Step 0 — PO Alignment

Before writing any code or specifications, talk with the Product Owner (PO) to grasp
the core user need and business requirements. The PO's implementation suggestions are
inputs to challenge, not fixed specifications. Start from the user problem, not the technical solution.

### Step 1 — User Stories in GitHub Issues

Express requirements as User Stories within the corresponding GitHub Projects item. Format:

```
As a [role], I want to [action] so that [benefit].
```

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

Always branch off `dev` (never from `main`):

```bash
git checkout dev && git pull origin dev
git checkout -b feat/short-descriptive-name
```

During implementation:
- Move the issue to **In Progress** on the [Jump Roadmap & Releases](https://github.com/orgs/Manta-Epitech-Academy/projects/1) board, as the first thing you do. Nothing moves it for you.
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

For branches with schema updates, ensure migrations are cleanly named and squashed into a single migration per branch (see [`AGENTS.md`](./AGENTS.md#prisma-migrations)). Since unit tests (`bun run test`) mock the database layer, branches modifying Prisma schema or tables MUST also be verified against a real PostgreSQL database (via `bunx prisma db push` or `bun run test:integration`) before declaring the feature complete.

### Step 6 — Visual Review & Definition of Done

Before submitting a PR, verify the full Definition of Done:

- [ ] **Technical:** `check` 0/0, `lint` clean, migration named & squashed.
- [ ] **Automated Testing:** prefer creating automated tests (unit, integration, or Playwright E2E) for new behaviors rather than relying solely on manual testing. Human verification is welcomed for visual polish and UX, but core functional contracts must have automated test coverage.
- [ ] **Space Conventions:** rounded corners, title colors, button placements; square dialogs (dev) vs rounded (talent); `cursor-pointer` on all interactive elements; reuse existing UI components.
- [ ] **User Audience:**
  - Admin space = stats/operational, clean and direct
  - Dev space = clean, functional, no XP tiers or confetti
  - Talent space = welcoming, gamified, using the French *_tu_* register
- [ ] **Copy:** *_vous_* for staff / *_tu_* for talents, no developer jargon in UI strings, no em-dashes (`—`).
- [ ] **No Ambiguous Jargon:** internal dev slang must not bleed into UI strings (refer to [`JARGON.md`](./JARGON.md)).
- [ ] **Responsive Design:** tested across desktop, average laptop, and mobile screens.
- [ ] **List Filter Controls:** campuses / high-schools / long typeable lists → `SearchableSelect`, never a plain `<select>`.
- [ ] **No UI Duplication:** reuse existing components rather than cloning near-identical variants.
- [ ] **Sound Domain Decisions:** technical choices must never violate real-world business needs (e.g. avoid IP-based rate limiting on shared campus networks).

### Step 7 — PR, Self-Review & Merge

1. Write Conventional Commits (`type(scope): subject` ≤ 72 chars).
2. Use the `/ship` skill to generate commit and PR copy in `.ship/`. Always include `Closes #<issue_number>` in `.ship/pr-body.md` under `## Context` so GitHub links the PR to its issue.
3. Open the PR as a **Draft** first.
4. Perform a self-review: inspect your diff as if reviewing someone else's work.
5. Mark as Ready for Review, assign a reviewer if available.
6. Merge into `dev` once approved (or auto-merge if working solo).
7. **Move the issue to `Done` on the board, by hand.** The board's own workflow closes the issue from there, so `Done` is the single action, not two. `Closes #N` never fires here: GitHub only applies closing keywords when a PR merges into the **default branch**, and every feature PR targets `dev`. The keyword still earns its place, it is what links the two and what a reviewer follows, but it will not move or close anything, and the later `dev` → `main` promotion carries no keyword either, so nothing closes the issue afterwards. An issue left open in a stale column is the normal outcome of forgetting this, not an edge case.

---

## Branching Strategy

**`dev` is the trunk of this repository. `main` is the release branch (production).**

In this repository, `main` represents the latest tagged stable release. `dev` is where all ongoing work is integrated and is the single source of truth for active development.

Rule: **Always branch off `dev`, always merge into `dev`.** `main` only receives commits during formal releases (via a merge from `dev` to `main`).

Branch naming conventions:

| Type             | Prefix      | Example                        |
| ---------------- | ----------- | ------------------------------ |
| New feature      | `feat/`     | `feat/sf-member-status`        |
| Bug fix          | `fix/`      | `fix/emargement-export`        |
| Refactoring      | `refactor/` | `refactor/retire-event-type`   |
| Documentation    | `docs/`     | `docs/contributing-and-jargon` |

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

**Custom Repository Skills** encode Jump-specific workflows. They live in `.claude/skills/`, one
directory per skill, and each `SKILL.md` opens with a `description` front-matter line stating what it
does and when to reach for it. Read the directory rather than a table here: a table drifts the moment a
skill is added or renamed, and the front-matter is what agents actually match on.
