# Contributing to Jump

This document formalises how features are built on Jump — from the PO's initial
need to the merged PR. Objective: enable any developer or AI agent to execute
tasks with the exact same standard of quality.

See also: [`JARGON.md`](./JARGON.md) for shared domain vocabulary, and
[`CLAUDE.md`](./CLAUDE.md) for technical directives and coding standards.

---

## Engineering Philosophy

**Cleanest, not quickest.** We do not take shortcuts. We always choose the cleanest,
most modular, and maintainable solution — even if it requires more upfront work.
Local hotfixes or duplicated components that merely "do the job" are anti-patterns.

**Modularity before optimization.** Do not optimize prematurely. Code must first be
clear and well-decomposed; optimize only when a measurable performance requirement
justifies it.

**DRY everywhere.** No repetition in code, no repetition in documentation. If a rule
or fact applies in multiple places, it must have a single source of truth.

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
- Refactor and share existing utilities — never duplicate logic locally.
- Keep the PO in the loop during development (screenshots, questions): an early feedback loop prevents costly rework.
- If a technical decision diverges from the initial plan, update the GitHub item accordingly.

### Step 5 — Technical Gate

Before any commit or PR, verify that all static checks pass cleanly:

```bash
cd "$(git rev-parse --show-toplevel)/frontend"
bun run check   # 0 errors, 0 warnings (TypeScript & Svelte)
bun run lint    # Formatting & linting (Prettier/ESLint)
bun run test    # Unit tests
```

For branches with schema updates, ensure migrations are cleanly named and squashed into a single migration per branch (see [`CLAUDE.md`](./CLAUDE.md#prisma-migrations)).

### Step 6 — Visual Review & Definition of Done

Before submitting a PR, verify the full Definition of Done:

- [ ] **Technical:** `check` 0/0, `lint` clean, migration named & squashed.
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
2. Use the `/ship` skill to generate commit and PR copy in `.ship/`.
3. Open the PR as a **Draft** first.
4. Perform a self-review: inspect your diff as if reviewing someone else's work.
5. Mark as Ready for Review, assign a reviewer if available.
6. Merge into `dev` once approved (or auto-merge if working solo).

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

**Custom Repository Skills** (`.claude/skills/`) — encode Jump-specific workflows:

| Skill               | Usage                                                         |
| ------------------- | ------------------------------------------------------------- |
| `/ship`             | Generates standardized commit & PR copy in `.ship/`           |
| `/align-migrations` | Re-orders and squashes migrations following merge conflicts   |
| `/database-design`  | Data modeling and schema design before code implementation    |
