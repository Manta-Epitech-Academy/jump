# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jump — an internal Epitech Academy platform for managing training events, student progress, and certifications. French-language UI. Built with SvelteKit + Prisma + PostgreSQL.

## Commands

All commands run from `frontend/` using **Bun**:

| Task                   | Command               |
| ---------------------- | --------------------- |
| Install deps           | `bun install`         |
| Dev server             | `bun run dev`         |
| Production build       | `bun run build`       |
| Type check             | `bun run check`       |
| Format (write)         | `bun run format`      |
| Lint (check only)      | `bun run lint`        |
| Generate Prisma client | `bun run db:generate` |
| Run migrations         | `bun run db:migrate`  |
| Prisma Studio          | `bun run db:studio`   |

**Docker** (from repo root): `docker-compose up` starts PostgreSQL + SvelteKit.

No test framework is configured — there are no automated tests.

**When a `package.json` script exists for the task, use `bun run <script>` rather than invoking the tool directly.** The scripts often set env vars (`KIT_OUTDIR=.svelte-kit-check`) or flags (`--tsconfig ./tsconfig.check.json`) that a bare `bun svelte-check` or `bunx svelte-check` will silently skip — leading to types being written to the default `.svelte-kit/` dir or the wrong strictness. For one-shots without a matching script, `bun <tool>` is fine; reach for `bunx` only when the tool isn't installed locally.

## Tech Stack

- **SvelteKit 2** (Svelte 5) with `adapter-node`
- **Bun** runtime
- **Prisma 7** ORM with **PostgreSQL**
- **BetterAuth** for authentication (sessions, OAuth, OTP)
- **Tailwind CSS 4** with Bits UI components (shadcn-style)
- **Superforms + Zod** for server-side form validation
- **Resend** for transactional email (OTP codes)
- **Puppeteer** for PDF generation (diplomas, certificates)
- **TypeScript** in strict mode

## Architecture

### Workspaces

The app splits into four workspaces, each serving a distinct audience and business goal:

| Workspace  | Path             | Audience          | Objective                                                 |
| ---------- | ---------------- | ----------------- | --------------------------------------------------------- |
| **Dev**    | `/staff/dev/`    | `superdev`, `dev` | Talent Acquisition & Recruitment (admissions pipeline)    |
| **Pedago** | `/staff/pedago/` | `peda`, `manta`   | Knowledge transmission & academic management              |
| **Admin**  | `/staff/admin/`  | `admin`           | Global system overview; account impersonation             |
| **Talent** | `(talent)/`      | students          | Student experience — gamification, progression, portfolio |

**Terminology:** "Dev" is short for **Business Development / Admissions / Talent Acquisition** — not software engineers. Keep this in mind when reading code: a `dev` role or `/dev/` route refers to the recruitment team.

### Auth System

Uses **BetterAuth** (`src/lib/server/auth.ts`) with two methods:

- **Microsoft OAuth** for staff and admins (must be `@epitech.eu`)
- **Email OTP** (6-digit, sent via Resend) for students and parents

Route guards in `src/lib/server/auth/guards.ts` enforce role-based access. Session data is loaded in `hooks.server.ts` into `event.locals` (user, session, staffProfile, talent).

Staff are routed by `StaffProfile.staffRole` (Prisma `StaffRole` enum: `admin`, `superdev`, `dev`, `peda`, `manta`). After login, staff redirect to their role-specific space. Guards block cross-space access and redirect to correct space. Role-to-path mapping lives in `src/lib/domain/staff.ts` (`getStaffRoleRedirectPath`).

| StaffRole         | Space                                |
| ----------------- | ------------------------------------ |
| `admin`           | `/staff/admin/`                      |
| `superdev`, `dev` | `/staff/dev/`                        |
| `peda`, `manta`   | `/staff/pedago/`                     |
| `null`            | blocked, shown "contact admin" error |

Client-side auth at `src/lib/auth-client.ts` (browser-side BetterAuth).

### Role gating

Inside a workspace, role-based gating goes through **one table** of named role groups in `src/lib/domain/permissions.ts`:

| Group          | Roles                     | Use for                                                                            |
| -------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `devLead`      | `superdev`                | Dev workspace lead-only mutations (delete, import, update)                         |
| `devMember`    | `superdev`, `dev`         | Dev workspace daily ops (participants, interviews, update)                         |
| `pedaLead`     | `peda`                    | Pedago workspace lead-only (planning page, factions)                               |
| `pedaMember`   | `peda`, `manta`           | Pedago workspace field ops (cockpit mutations)                                     |
| `leads`        | `superdev`, `peda`        | Actions shared across both workspace leads                                         |
| `interviewers` | `superdev`, `dev`, `peda`, `manta` | Roles eligible to be the `staff` of an Interview and fill its grid (any campus staff)  |

- **Client:** `<Gated group="devLead">...</Gated>` — reads role from page state, hides or disables with tooltip. Import: `$lib/components/auth/Gated.svelte`.
- **Server:** `requireStaffGroup(locals, 'devLead')` in every mutating action. Import: `$lib/server/auth/guards`.
- **Routes:** `STAFF_ROLE_GATES` in `guards.ts` gates whole URLs by group; use `readOnlyForRest` to degrade instead of redirect (e.g. manta on planning sees `locals.viewMode === 'readonly'`).

**UI pattern rule — pick one per site, do not mix:**

| Pattern           | When                                                         |
| ----------------- | ------------------------------------------------------------ |
| Hide              | Nav entries to lead-only destinations (sidebar, menus)       |
| Disable + tooltip | Mutating controls visible on shared screens                  |
| Readonly banner   | Whole-page readonly context (e.g. manta on planning)         |
| Redirect / 403    | Direct URL access to lead-only routes (via STAFF_ROLE_GATES) |

Never inline a `['superdev']` array at a call site. If the group you need doesn't exist, add it to `STAFF_GROUPS`.

### Feature Flags

Per-campus feature toggles defined in `src/lib/domain/featureFlags.ts`. Each flag has a `key`, `kind` (`capability` | `rollout`), `defaultEnabled`, and optional `removeBy` date.

- **Catalogue:** `FEATURE_FLAGS` object — edit here to add/remove flags. Current: `stage_seconde` (on by default), `coding_club` (off by default).
- **Overrides:** `CampusFeatureFlag` table stores per-campus `{flagKey, enabled}` rows. Missing rows fall back to `defaultEnabled`. Resolved via `resolveEffectiveFlags()`.
- **Runtime:** `hooks.server.ts` hydrates `locals.featureFlags: Set<FlagKey>` per request from the campus scope.
- **Server guard:** `requireFlag(locals, key)` throws 404 if disabled. Use in page loads / actions when a whole feature is gated.
- **Event types:** `EVENT_TYPE_TO_FLAG` maps `EventType` → `FlagKey`. Creating/listing events of a type requires the flag.
- **Admin UI:** `/staff/admin/campuses` toggles overrides per campus.

Do not hardcode flag strings — import from `FEATURE_FLAGS` or use the `FlagKey` type.

### Route Groups

- `(staff)/` — all staff routes: login, OAuth, onboarding, and role-gated spaces (`staff/admin/`, `staff/dev/`, `staff/pedago/`)
- `(talent)/` — student portal (login, OTP, charter, dashboard)
- `api/` — API endpoints (auth, students, certificates, diplomas, jobs, worker)
- `p/` — public portfolio view
- `logout/` — universal logout
- `register/` — student registration

### Data Layer

Prisma schema at `frontend/prisma/schema.prisma`. Key models:

- **Auth:** `bauth_user`, `bauth_session`, `bauth_account`, `bauth_verification` (managed by BetterAuth)
- **Profiles:** `StaffProfile` (userId, campusId, avatar, discordId), `Talent` (student identity, XP, level, badges)
- **Event structure:** `Event` → `Planning` → `TimeSlot` → `Activity`. Events can optionally link to Salesforce via `externalId`.
- **Templates:** `ActivityTemplate` (clonable activity definitions), `PlanningTemplate` → `PlanningTemplateDay` → `PlanningTemplateSlot` → `PlanningTemplateSlotItem`
- **Domain:** `Campus`, `Theme` (transversal tags across activities), `Participation`, `ParticipationActivity`, `StepsProgress`, `PortfolioItem`, `EventManta`

Data is campus-scoped. Themes tag activities across days without creating extra hierarchy.

### Data modeling: facts as rows, state as projection

Several domain tables are append-only fact/log records — `MinigameAttempt`, `TalentQuizAttempt`, `TalentObservableState`, `BroadcastRecipient`, `OnboardingReminder`, `XpGrant`. Current values that derive from them are **cached projections** recomputed transactionally on each write, not independently mutated (e.g. `Talent.xp` = `SUM(XpGrant.amount)`).

When persisting a new domain fact, follow this shape rather than a mutable counter or a `Json` blob: the fact gets a row, and any aggregate is a projection refreshed in the same transaction. A bare counter is lossy — you can't explain, audit, or timestamp the value, and ad-hoc `Math.max(0, x - n)` adjustments drift. The XP ledger is the reference implementation (see below).

### XP System

XP follows the ledger pattern above. Each granting fact is one `XpGrant` row (unique on `(source, sourceId)`; sources: `onboarding`, `minigame`, `activity_presence`, `admin_adjustment`). `Talent.xp` = `SUM(amount)` and `Talent.eventsCount` = present-participation count, both cached projections.

- **Never mutate `Talent.xp` directly.** Go through `src/lib/server/services/xpService.ts` (`grantXp` / `revokeXp` / `recomputeTalentXp` / `recomputeEventsCount`), each taking a `Prisma.TransactionClient`. Mark-present upserts a grant; unmark/remove/reset deletes it.
- Activity difficulty → XP: Débutant=20, Intermédiaire=45, Avancé=75 (`src/lib/domain/xp.ts`).
- **Level is derived, not stored** (`Talent.level` was dropped). Use `computeLevel(xp)` / `levelLabelFr(xp)` (tiers: Novice 0–199, Apprentice 200–499, Expert 500+). `JUMP_LEVELS` is canonical in `domain/xp.ts`; the broadcast filter maps a tier to an `xp` range.
- Backfill/repair: `scripts/backfill-xp-ledger.ts` (idempotent, `--dry-run`).

### Key Server Services (`src/lib/server/`)

- **`auth.ts`** — BetterAuth config (Prisma adapter, Microsoft OAuth, email OTP, admin plugin with impersonation)
- **`services/campaignService.ts`** — bulk CSV import with conflict detection (NEW/MERGE/CONFLICT/SIBLING)
- **`services/progressService.ts`** — learning progress validation (QCM, PINs, step advancement)
- **`services/diplomaGenerator.ts`** — PDF generation via Puppeteer with HTML templates in `server/templates/`
- **`services/syncService.ts`** — data synchronization
- **`services/anonymizationService.ts`** — RGPD anonymization job
- **`infra/browserPool.ts`** — pooled Puppeteer instances (max 5 concurrent, 60s idle timeout)
- **`infra/contentCache.ts`** — in-memory cache for content
- **`db/scoped.ts`** — campus-scoped DB query helpers

### Client Libraries (`src/lib/`)

- **`domain/`** — business logic (CSV parsing in `csv.ts`, XP calculation in `xp.ts`)
- **`validation/`** — Zod schemas for forms (auth, events, students, templates, planning)
- **`components/ui/`** — Bits UI primitives (shadcn pattern)
- **`utils.ts`** — `cn()` helper (clsx + twMerge) for conditional classes

## Coding Conventions

- **Language:** All UI text and user-facing strings are in **French**. Code identifiers (functions, variables) are in English.
- **Forms:** Use sveltekit-superforms with Zod validation. Never use raw `<form>` handling.
- **DB access:** Import `prisma` from `$lib/server/db`. Never pass the Prisma client as a function parameter — it's a singleton. Always scope queries by `campusId` for staff/student data.
- **Auth checks:** Always go through `locals.user` / `locals.staffProfile` / `locals.talent` set in hooks. Never call BetterAuth directly in page server loads.
- **Styling:** Tailwind utility classes only. Use `cn()` from `$lib/utils` for conditional classes. No inline styles.
- **Component naming:** PascalCase, domain-scoped in subfolders (`components/events/`, `components/students/`).
- **Lucide icons:** Always import per-icon, never the barrel. Barrel imports drag every icon through Vite's dev resolver and tank cold-start (~9s → ~3s on this codebase). If you slip, run `bun scripts/codemod-lucide-imports.ts` to auto-rewrite.

  ```ts
  // ✅ correct
  import Trash2 from "@lucide/svelte/icons/trash-2";

  // ❌ wrong — barrel import
  import { Trash2 } from "@lucide/svelte";
  ```

## Constraints

- **RGPD:** Some users are minors. The charter must be signed before accessing the app. Anonymization job available via `POST /api/jobs/anonymize` with `Authorization: Bearer <CRON_SECRET>`. Never store personal data unnecessarily.
- **Salesforce:** `Event.externalId` optionally links events to Salesforce campaigns.
- **Scale:** typical stage de seconde event = ~200 students. Cohort-wide views (origin breakdowns, interest distributions, attendance lists) hit this volume — keep it in mind when designing layouts and queries.

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, Microsoft OAuth credentials (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`), and mail provider keys per `MAIL_PROVIDER` (`RESEND_API_KEY` for `resend`, or `MAILJET_API_KEY` + `MAILJET_API_SECRET` for `mailjet`). Optional: `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`, `CRON_SECRET`, `WORKER_API_TOKEN`, `INTERVIEW_SYNC_MODE`, `MAIL_PROVIDER`, `MAIL_FROM`.

### `MAIL_PROVIDER`

Picks the transactional mail backend. Lives behind a façade in `$lib/server/email/` — flipping the env swaps the active provider with no code change.

| Value              | Behavior                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `resend` (default) | Send via the official Resend SDK. Batch cap = 100/call.                                                 |
| `mailjet`          | Send via Mailjet's REST v3.1 Send API (fetch, no SDK). Batch cap = 50/call (provider chunks transparently). |

`MAIL_FROM` is the sender address used regardless of provider; `RESEND_FROM_EMAIL` is kept as a fallback alias during the migration. `EMAIL_DEV_RECIPIENTS` redirects all outbound mail to a debug address — applied in the façade *before* the provider sees the payload, so it works uniformly.

### `INTERVIEW_SYNC_MODE`

Picks the calendar sync backend for interview events. Lives behind a façade in `$lib/server/services/calendarSync/` — flipping the env var swaps the active backend with no code change.

| Value             | Behavior                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email` (default) | Send iCalendar invites (`METHOD:REQUEST` / `METHOD:CANCEL`) via Resend. No extra OAuth scope needed; works for every staff regardless of tenant policy. Schedule-affecting actions fan out to every affected staff member's mailbox (reassign emits CANCEL to old + REQUEST to new in one shot). |
| `graph`           | Push events directly to the user's Outlook calendar via Microsoft Graph. Requires the `Calendars.ReadWrite` delegated scope, which Epitech-style tenants gate behind admin consent. Opt in only once consent is granted; the `Calendars.ReadWrite` scope is added to the OAuth request automatically when this mode is active. |
| `off`             | Disable sync entirely; sync UI controls hide.                                                                                                                                         |

`OutlookCalendarSync` rows carry `syncKind` so both backends share the table; flipping modes leaves stale rows behind, which the next reconcile in the new mode will simply ignore.

**Re-send escape hatch (email mode).** `Resend.emails.send()` resolves on accepted-by-Resend, not delivery — a bounce never invalidates the sync row, so the `contentHash` dedupe keeps blocking retries. The `forceResync` page action (chevron menu next to the calendar-sync button) clears `contentHash` for the scope (current user, or whole event for dev) and re-reconciles. Use when staff reports a missing invite.

## Prisma Migrations

Always include `--name` when creating migrations:

```
bunx prisma migrate dev --name descriptive_name
```
