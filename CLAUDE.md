# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TekCamp — an internal Epitech Academy platform for managing training events, student progress, and certifications. French-language UI. Built with SvelteKit + PocketBase.

## Commands

All commands run from `frontend/`:

| Task | Command |
|---|---|
| Dev server | `bun run dev` |
| Build | `bun run build` |
| Start prod | `bun run start` |
| Type check | `bun run check` |
| Lint (format check) | `bun run lint` |
| Format | `bun run format` |
| Generate PB types | `bun run typegen` |
| Setup PocketBase | `bun run db:setup` |
| Start PocketBase | `bun run db:start` |

All scripts load env from `../.env`. Docker deployment via `./deploy.sh` at repo root.

## Tech Stack

- **SvelteKit 2** (Svelte 5) with `adapter-node`, base path `/tekcamp`
- **Bun** runtime
- **PocketBase** as backend (SQLite-based BaaS)
- **Tailwind CSS 4** with Bits UI components (shadcn-style)
- **Superforms + Zod** for server-side form validation
- **Puppeteer** for PDF generation (diplomas, certificates)
- **TypeScript** in strict mode

## Architecture

### Authentication (3 concurrent auth contexts)

`hooks.server.ts` creates 3 PocketBase instances per request, each with its own `CustomAuthStore` (cookie-based):
- **Admin** (`_superusers`) — email/password
- **Staff** (`users`) — Microsoft OAuth, campus-scoped
- **Student** (`students`) — OTP auth

Route guards in `src/lib/server/auth/guards.ts` handle redirects based on auth state. All three auth tokens are refreshed in parallel on every request.

### Route Groups

- `(auth)/` — public auth routes (login, register, OAuth callback, onboarding)
- `(app)/` — staff/admin dashboard (students, events, subjects)
- `(camper)/` — student portal (dashboard, charter acceptance)
- `admin/` — superuser-only routes (users, subjects, themes, campuses)
- `api/` — API endpoints (student search, PDF generation)

### Data Access

All PocketBase queries run server-side only (`+page.server.ts` / `+server.ts`). The `createScoped()` helper auto-injects the user's campus ID into create operations to enforce campus isolation.

Types are auto-generated from the PocketBase schema via `pocketbase-typegen` into `src/lib/pocketbase-types.ts` — regenerate with `bun run typegen` after schema changes.

### Key Server Services (`src/lib/server/`)

- **`auth/`** — auth context creation, cookie stores, route guards
- **`services/campaignService.ts`** — bulk CSV import with conflict detection (NEW/MERGE/CONFLICT/SIBLING)
- **`services/progressService.ts`** — learning progress validation (QCM, PINs, step advancement)
- **`services/diplomaGenerator.ts`** — PDF generation via Puppeteer
- **`infra/browserPool.ts`** — pooled Puppeteer instances (max 5 concurrent, 60s idle timeout)
- **`infra/subjectCache.ts`** — in-memory cache for subject content

### Client Libraries (`src/lib/`)

- **`domain/`** — business logic (CSV parsing, XP calculation, subject recommender)
- **`validation/`** — Zod schemas for forms (auth, events, students, subjects)
- **`components/ui/`** — Bits UI primitives (shadcn pattern)

### Database

PocketBase with SQLite. Migrations in `pocketbase-backend/pb_migrations/` (JavaScript). Key collections: `users`, `students`, `campuses`, `events`, `subjects`, `themes`, `participations`, `steps_progress`.

## Environment Variables

See `.env.example`. Key vars: `PUBLIC_POCKETBASE_URL` (browser), `PUBLIC_INTERNAL_POCKETBASE_URL` (Docker internal), `PB_ADMIN_EMAIL`/`PB_ADMIN_PASS`, `PORT`, `ORIGIN`.
