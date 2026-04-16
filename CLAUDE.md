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

### Auth System

Uses **BetterAuth** (`src/lib/server/auth.ts`) with three methods:

- **Microsoft OAuth** for staff (must be `@epitech.eu`)
- **Email OTP** (6-digit, sent via Resend) for students
- **Email + password** for staff

Route guards in `src/lib/server/auth/guards.ts` enforce role-based access. Session data is loaded in `hooks.server.ts` into `event.locals` (user, session, staffProfile, talent).

Staff are routed by `StaffProfile.staffRole` (Prisma `StaffRole` enum: `admin`, `superdev`, `dev`, `peda`, `manta`). After login, staff redirect to their role-specific space. Guards block cross-space access and redirect to correct space. Role-to-path mapping lives in `src/lib/domain/staff.ts` (`getStaffRoleRedirectPath`).

| StaffRole | Space |
|-----------|-------|
| `admin` | `/staff/admin/` |
| `superdev`, `dev` | `/staff/dev/` |
| `peda`, `manta` | `/staff/pedago/` |
| `null` | blocked, shown "contact admin" error |

Client-side auth at `src/lib/auth-client.ts` (browser-side BetterAuth).

### Route Groups

- `(staff)/` — all staff routes: login, OAuth, onboarding, and role-gated spaces (`staff/admin/`, `staff/dev/`, `staff/pedago/`)
- `(talent)/` — student portal (login, OTP, charter, dashboard)
- `api/` — API endpoints (auth, students, certificates, diplomas, jobs, worker)
- `p/` — public portfolio view
- `logout/` — universal logout
- `register/` — student registration

### Data Layer

Prisma schema at `frontend/prisma/schema.prisma`. Key models:

- **Auth:** `bauth_user`, `bauth_session`, `bauth_account`, `bauth_verification` (managed by BettesalesforceCampaignIdrAuth)
- **Profiles:** `StaffProfile` (userId, campusId, avatar, discordId), `Talent` (student identity, XP, level, badges)
- **Event structure:** `Event` → `Planning` → `TimeSlot` → `Activity`. Events can optionally link to Salesforce via `salesforceCampaignId`.
- **Templates:** `ActivityTemplate` (clonable activity definitions), `PlanningTemplate` → `PlanningTemplateDay` → `PlanningTemplateSlot` → `PlanningTemplateSlotItem`
- **Domain:** `Campus`, `Theme` (transversal tags across activities), `Participation`, `ParticipationActivity`, `StepsProgress`, `PortfolioItem`, `EventManta`

Data is campus-scoped. Themes tag activities across days without creating extra hierarchy.

### XP System

Activity difficulty determines XP: Débutant=20, Intermédiaire=45, Avancé=75. Student levels: Novice, Apprentice, Expert. Logic in `src/lib/domain/xp.ts`.

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

## Constraints

- **RGPD:** Some users are minors. The charter must be signed before accessing the app. Anonymization job available via `POST /api/jobs/anonymize` with `Authorization: Bearer <CRON_SECRET>`. Never store personal data unnecessarily.
- **Salesforce:** `Event.salesforceCampaignId` optionally links events to Salesforce campaigns.

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, Microsoft OAuth credentials (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`), `RESEND_API_KEY`. Optional: `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`, `CRON_SECRET`, `WORKER_API_TOKEN`.

## Prisma Migrations

Always include `--name` when creating migrations:

```
bunx prisma migrate dev --name descriptive_name
```
