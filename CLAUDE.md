# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jump — an internal Epitech Academy platform for managing training events, student progress, and certifications. French-language UI. Built with SvelteKit + Prisma + PostgreSQL.

## Commands

All commands run from `frontend/` using **Bun**:

| Task                   | Command               |
| ---------------------- | --------------------- |
| Install deps           | `bun install`         |
| Provision a worktree   | `bun run setup:worktree` |
| Dev server             | `bun run dev`         |
| Production build       | `bun run build`       |
| Type check             | `bun run check`       |
| Format (write)         | `bun run format`      |
| Lint (check only)      | `bun run lint`        |
| Generate Prisma client | `bun run db:generate` |
| Run migrations         | `bun run db:migrate`  |
| Prisma Studio          | `bun run db:studio`   |

**Docker** (from repo root): `docker-compose up` starts PostgreSQL + SvelteKit.

**Git worktrees:** a freshly-added worktree has no `.env` (untracked) and no `node_modules`. The `.githooks/post-checkout` hook auto-provisions it on creation — links `.env` from the main checkout and runs `bun install`. If your editor adds worktrees without firing git hooks, run `bun run setup:worktree` once to do the same.

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
- **Profiles:** `StaffProfile` (userId, campusId, avatar, discordId), `Talent` (student identity, XP, badges, `schoolId` FK), `TalentSfImport` (1:1 Salesforce-claim mirror)
- **Event structure:** `Event` → `Planning` → `TimeSlot` → `Activity`. Events can optionally link to Salesforce via `externalId`.
- **Templates:** `ActivityTemplate` (clonable activity definitions), `PlanningTemplate` → `PlanningTemplateDay` → `PlanningTemplateSlot` → `PlanningTemplateSlotItem`
- **Domain:** `Campus`, `Theme` (transversal tags across activities), `Participation`, `ParticipationActivity`, `StepsProgress`, `PortfolioItem`, `EventManta`, `School` (canonical UAI-keyed high-school directory)

Data is campus-scoped. Themes tag activities across days without creating extra hierarchy.

### Data modeling: facts as rows, state as projection

Several domain tables are append-only fact/log records — `MinigameAttempt`, `TalentQuizAttempt`, `TalentObservableState`, `BroadcastRecipient`, `OnboardingReminder`, `XpGrant`. Current values that derive from them are **cached projections** recomputed transactionally on each write, not independently mutated (e.g. `Talent.xp` = `SUM(XpGrant.amount)`).

When persisting a new domain fact, follow this shape rather than a mutable counter or a `Json` blob: the fact gets a row, and any aggregate is a projection refreshed in the same transaction. A bare counter is lossy — you can't explain, audit, or timestamp the value, and ad-hoc `Math.max(0, x - n)` adjustments drift. The XP ledger is the reference implementation (see below).

**Not for polled external state.** The ledger shape fits discrete domain facts that happen once. Do *not* append a row per poll of a mutable external system — the Salesforce sync runs every ~30 min, so an append-only log would bloat with no payoff. Mirror the external system's current state in a 1:1 typed row, upserted only when the inbound payload differs (see `TalentSfImport` under Salesforce reconciliation).

### Relational modeling

Model relationships and entities by their real shape. These are deliberate calls, not defaults to reach for — each is anchored to a model in this schema:

- **Many-to-many → join table.** A pure junction with a composite PK, e.g. `TalentInterest` (`@@id([talentId, interestId])`). Use one only when **both** sides are genuinely many.
- **One-to-many → foreign key on the "many" side, not a join table.** A talent has one current school → `Talent.schoolId`, never a `TalentSchool` link table. The tell that you've mismodeled a 1:N as M:N: you find yourself adding a `@@unique` on the FK column to stop duplicates.
- **A link table *with attributes* is an associative entity — a separate decision.** A bare junction glues two keys; the moment the relationship itself carries data (a `source`, a `confirmedAt`, a quantity), that's a deliberate entity. Don't reach for it speculatively, and don't refuse it when the data genuinely belongs on the relationship.
- **A domain entity gets its own table + FK, not loose strings/JSON.** A thing referenced repeatedly (a high school) gets a typed, deduplicated row (`School`), not `name`/`city`/`uai` columns copied onto every referrer. "Normalize later" tends to never happen.
- **External-system data → anti-corruption mirror, kept apart from your truth.** Don't fold a third party's claims into your aggregate root. Keep what *you* believe (`Talent`) separate from what an external system *claims* (`TalentSfImport`), and reconcile explicitly (see Salesforce reconciliation).

### XP System

XP follows the ledger pattern above. Each granting fact is one `XpGrant` row (unique on `(source, sourceId)`; sources: `onboarding`, `minigame`, `activity_presence`, `admin_adjustment`). `Talent.xp` = `SUM(amount)` and `Talent.eventsCount` = present-participation count, both cached projections.

- **Never mutate `Talent.xp` directly.** Go through `src/lib/server/services/xpService.ts` (`grantXp` / `revokeXp` / `recomputeTalentXp` / `recomputeEventsCount`), each taking a `Prisma.TransactionClient`. Mark-present upserts a grant; unmark/remove/reset deletes it.
- Activity difficulty → XP: Débutant=20, Intermédiaire=45, Avancé=75 (`src/lib/domain/xp.ts`).
- **Level is derived, not stored** (`Talent.level` was dropped). Use `computeLevel(xp)` / `levelLabelFr(xp)` (tiers: Novice 0–199, Apprentice 200–499, Expert 500+). `JUMP_LEVELS` is canonical in `domain/xp.ts`; the broadcast filter maps a tier to an `xp` range.
- Backfill/repair: `scripts/backfill-xp-ledger.ts` (idempotent, `--dry-run`).

### Salesforce reconciliation

Talent profile fields have two sources — the worker sync (Salesforce) and onboarding (the student). They are **reconciled, not blindly overwritten**.

- **`Talent` = Jump's current truth.** Onboarding writes it directly (**optimistic**: the student's input shows on their dashboard immediately; staff arbitrate divergences afterward — there is no pending-validation gate).
- **`TalentSfImport` = 1:1 typed mirror of Salesforce's last claim** — the anti-corruption boundary. Written *only* by `syncService.syncTalents`, never by onboarding, and upserted only when the inbound payload differs.
- **`School` = canonical UAI-keyed directory**, resolved lazily from the éducation-nationale annuaire (`server/annuaire.ts` + `schoolService.resolveSchoolByUai`). Only schools actually attended ever land here, never the ~69k national set. It replaced the old free-text `highSchoolName/City/Uai` columns: `Talent` now carries a `schoolId` FK (+ `highSchoolNameManual`, used *only* when a lycée has no UAI). The student's school and SF's claimed school (`TalentSfImport.sfSchoolId`) both FK the same `School`.
- **No-clobber rule:** before a field is talent-confirmed (its `*ValidatedAt` is set), sync re-seeds it on `Talent`; after, sync writes **only the mirror**. Never let SF overwrite a confirmed value. (This fixed a real bug where every sync overwrote the talent's confirmed phone/name.)
- **Conflict** = field is talent-confirmed **AND** `Talent` ≠ `TalentSfImport` (school compared by FK). Computed in `reconciliationService`, never stored. Surfaced at `/staff/admin/sf-conflicts` (list + accept/reject + CSV export); `acceptJump` realigns the mirror optimistically. `niveau` is SF-owned (onboarding never sets it) → always synced, never a conflict.

### Key Server Services (`src/lib/server/`)

- **`auth.ts`** — BetterAuth config (Prisma adapter, Microsoft OAuth, email OTP, admin plugin with impersonation)
- **`services/campaignService.ts`** — bulk CSV import with conflict detection (NEW/MERGE/CONFLICT/SIBLING)
- **`services/progressService.ts`** — learning progress validation (QCM, PINs, step advancement)
- **`services/diplomaGenerator.ts`** — PDF generation via Puppeteer with HTML templates in `server/templates/`
- **`services/syncService.ts`** — Salesforce worker sync → seeds `Talent` + upserts the `TalentSfImport` mirror (no-clobber; see Salesforce reconciliation)
- **`services/reconciliationService.ts`** — computes `Talent` ↔ `TalentSfImport` conflicts; accept/reject + CSV for `/staff/admin/sf-conflicts`
- **`services/schoolService.ts`** / **`annuaire.ts`** — lazy `School` resolution from UAI via the éducation-nationale annuaire
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

- **Prose punctuation:** Never write em-dashes (`—`, U+2014) or en-dashes (`–`, U+2013) in any prose Claude generates. This covers code comments, commit messages, PR descriptions, chat responses, and documentation. Use a regular hyphen `-`, a comma, a colon, parentheses, or two sentences instead. Reason: em-dashes are a tell of AI-generated text and we want our writing to read as human. Pre-existing em-dashes in this file and in unrelated prose are not in scope to retrofit; the rule is forward-looking.

## Constraints

- **RGPD:** Some users are minors. The charter must be signed before accessing the app. Anonymization job available via `POST /api/jobs/anonymize` with `Authorization: Bearer <CRON_SECRET>`. Never store personal data unnecessarily.
- **Salesforce:** `Event.externalId` optionally links events to Salesforce campaigns.
- **Scale:** typical stage de seconde event = ~200 students. Cohort-wide views (origin breakdowns, interest distributions, attendance lists) hit this volume — keep it in mind when designing layouts and queries.

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, Microsoft OAuth credentials (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`), and mail provider keys per `MAIL_PROVIDER` (`RESEND_API_KEY` for `resend`, or `MAILJET_API_KEY` + `MAILJET_API_SECRET` for `mailjet`). Optional: `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`, `CRON_SECRET`, `WORKER_API_TOKEN`, `INTERVIEW_SYNC_MODE`, `MAIL_PROVIDER`, `MAIL_FROM`, `SMS_PROVIDER` (+ `BREVO_API_KEY`, `SMS_SENDER`, `SMS_DEV_RECIPIENTS`), `OUTBOUND_MODE` (the outbound gate — set `=real` in prod only; fail-safe to `redirect` otherwise), `EMAIL_DEV_RECIPIENTS`.

### `MAIL_PROVIDER`

Picks the transactional mail backend. Lives behind a façade in `$lib/server/email/` — flipping the env swaps the active provider with no code change.

| Value              | Behavior                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `resend` (default) | Send via the official Resend SDK. Batch cap = 100/call.                                                 |
| `mailjet`          | Send via Mailjet's REST v3.1 Send API (fetch, no SDK). Batch cap = 50/call (provider chunks transparently). |

`MAIL_FROM` is the sender address used regardless of provider; `RESEND_FROM_EMAIL` is kept as a fallback alias during the migration.

**Dev-redirect.** Two concerns kept apart: the **gate** (`$lib/server/outbound.ts`) and the **destination** (`$lib/server/{email,sms}/dev-redirect.ts`).

- **The gate — `OUTBOUND_MODE` (`outboundTrapped()`).** One env var for **both** channels, **fail-safe**: only `OUTBOUND_MODE=real` reaches real recipients; anything else (unset, blank, typo) means `redirect` (trapped). So a forgotten var never mails/texts a minor — worst case is real users not getting mail, never the reverse. **Prod is the only place that sets `real`.** It's an env var, not a DB flag, on purpose: it's the one signal bound to the *environment* not the *data*, so it can't ride a `pg_dump` from prod into staging, and the running app can't flip it. (This replaced the old design where `EMAIL_DEV_RECIPIENTS`/`SMS_DEV_RECIPIENTS` each gated their own channel — set one, forget the other, and that channel quietly went live. Those vars are now pure fallback destinations, see below.)

- **The destination** — `resolveMailRouting` / `resolveSmsRouting` return a tagged `OutboundRouting` (`real` | `redirect` | `drop`), only consulted once trapped. Priority order:
  1. **`'bypass'`** (per-send `SendOptions.devRedirect`) → the real recipient. A single, explicit, human-typed **test-send** (the "Tester" button) — a real preview from dev/staging without a redeploy.
  2. **Armed real sends** (`$lib/server/armRealSends.ts`) → the real recipient. An **admin** (`realSendArmers` = `['admin']`) can **arm** real sends from the **settings dialog** (`StaffSettingsDialog`, opened from the admin profile dropdown — there is no standalone `/staff/settings` page; the route is action-only). While armed, every send *their own session* drives bypasses the trap. Gun safety: per-user (a signed cookie bound to their id — never another session or a cookieless background cron), auto-expiring (15 min), role-gated, loud (red banner via root layout, disarm button). Endpoint `POST /api/dev/real-sends`.
  3. **`string[]`** (per-send) → those addresses. Bulk broadcasts pass their **creator**'s configured list (or login email), resolved from the row so a worker-run send still lands with the right tester. (Bulk SMS has no such route — staff carry no phone — so it falls through to the env fallback.)
  4. **The acting staff member's personal list** — admins set their own dev-redirect emails + phones in the settings dialog (`StaffProfile.devRedirect{Emails,Phones}`). With no explicit control, the trap routes to the human driving the request (`requestContext.ts` `AsyncLocalStorage`, captured in `hooks.server.ts`): the **impersonator** when impersonating, else the logged-in staff. So an admin testing talent onboarding by impersonating gets the parent / image-rights mail in *their own* inbox.
  5. **The acting human's login email** (mail only) — default when no personal list is set.
  6. **The `*_DEV_RECIPIENTS` env fallback** — for sends with no request actor (cron relances, anonymization, logged-out OTP).
  7. **`drop`** — trapped but none of the above resolved → the send is **suppressed**, surfaced as a permanent failure (`reason: 'dev_redirect_dropped'`), never leaked to the real recipient.

`SendOptions.devRedirect` is applied in the façade before the provider sees the payload, so it works uniformly across backends. **Recipients are minors (RGPD).** The gate (`OUTBOUND_MODE`) is the floor; set the `*_DEV_RECIPIENTS` fallbacks on any non-prod env that sends with no actor (cron/OTP) so those don't `drop`.

### `SMS_PROVIDER`

Picks the transactional SMS backend. Lives behind a façade in `$lib/server/sms/` (mirrors `$lib/server/email/`) — flipping the env swaps the active provider with no code change. Powers the **SMS escalation** step of onboarding relances and the SMS broadcast channel.

| Value           | Behavior                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `null` (default) | No provider wired. Sends fail loud and non-retryably, so an unconfigured prod surfaces "0 envoyés / N échecs" instead of a silent success. The relance UI disables the SMS channel and explains why. |
| `brevo`         | Brevo (ex-Sendinblue) transactional SMS via REST (fetch, no SDK). Requires `BREVO_API_KEY`. `SMS_SENDER` is the alphanumeric sender shown on the handset (Brevo caps it at 11 chars; default `Epitech`). |

`SMS_DEV_RECIPIENTS` is the SMS **fallback destination** (comma-separated; every listed number gets a copy), mirroring `EMAIL_DEV_RECIPIENTS`. It is **not** the gate — the gate is `OUTBOUND_MODE`, shared with mail (see the dev-redirect note above for the gate/destination split).

**SMS escalation (relances).** `email` is the primary onboarding nudge; `sms` is the escalation. The SMS carries **no action link** — it names the recipient's own mailbox (`{{email}}`) and tells them to check it. A talent is only SMS-eligible once an **email** relance has already been sent (`noPriorEmail` skip otherwise) and a usable phone exists (`noPhone` skip). Each channel has its own cooldown track. The body is a fixed default (`RELANCE_SMS_DEFAULTS`, editable in the compose dialog), not an admin `EmailActionMapping` template. Phone numbers are normalized to Brevo's format by `$lib/domain/phone` → `toBrevoRecipient`.

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
