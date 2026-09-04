# Intra Epitech Academy (Jump)

Internal platform for managing Epitech coding workshops: staff organize events, track attendance, and generate diplomas while students earn XP, level up, and build a portfolio.

Built for the **stage de seconde** (2-week high school internship, ~2000 students) and year-round **coding clubs**.

## Tech Stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Framework  | SvelteKit 2 (Node adapter)                        |
| Language   | TypeScript (strict)                               |
| Database   | PostgreSQL 18 + Prisma 7                          |
| Auth       | BetterAuth (Microsoft OAuth, email OTP)           |
| Styling    | Tailwind CSS 4 + Shadcn/Svelte                    |
| PDF        | Puppeteer (diplomas & certificates)               |
| Email      | Resend (OTP delivery)                             |
| Runtime    | Bun                                               |
| Deployment | Docker + GitHub Actions                           |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Microsoft Azure app registration (for staff OAuth)
- [Resend](https://resend.com) API key (for student OTP emails)

### Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Fill in BETTER_AUTH_SECRET, Microsoft OAuth creds, and the mail provider keys
# (RESEND_API_KEY by default, or MAILJET_API_KEY + MAILJET_API_SECRET)

# 2. Start PostgreSQL
docker compose up postgres -d

# 3. Install dependencies and set up the database
cd frontend
bun install
bunx prisma migrate dev --name init
bunx prisma generate

# 4. Start the dev server
bun run dev
```

The app runs at `http://localhost:5173` in dev.

### Docker (full stack)

```bash
docker compose up
```

This starts PostgreSQL and the SvelteKit app. Migrations run automatically on container startup.

## Development

All commands run from the `frontend/` directory:

```bash
bun run dev          # Start dev server with hot reload
bun run build        # Production build
bun run check        # Svelte type checking
bun run format       # Format with Prettier
bun run lint         # Check formatting

bun run db:generate  # Generate Prisma client
bun run db:migrate   # Create/apply migrations
bun run db:studio    # Open Prisma Studio GUI
```

### Database Migrations

Always name your migrations:

```bash
bunx prisma migrate dev --name add_new_field
```

## Architecture

The app is served from the root path.

### Route Groups

| Route       | Audience | Description                                      |
| ----------- | -------- | ------------------------------------------------ |
| `(auth)/`   | Public   | Login, register, onboarding                      |
| `(app)/`    | Staff    | Event management, student tracking, subjects     |
| `(camper)/` | Students | Learning dashboard, history, portfolio, settings |
| `admin/`    | Admins   | Campus, user, theme, and subject management      |
| `api/`      | Internal | Auth handler, student endpoints, PDF generation  |
| `p/`        | Public   | Student portfolio view                           |

### Authentication

- **Staff** sign in via Microsoft OAuth (restricted to `@epitech.eu` emails)
- **Students** receive a 6-digit OTP by email, no password required
- Role-based route guards enforce access (`staff`, `student`, `admin`)

### Data Model

Data is **campus-scoped**: staff and themes belong to a specific campus.

Core entities: `Campus` > `Theme` > `Subject` > `Event` > `Participation`

Students earn XP based on subject difficulty (20 / 45 / 75 XP) and progress through levels (Novice, Apprentice, Expert).

### Key Patterns

- **Server services** (`src/lib/server/services/`) encapsulate business logic
- **Scoped queries** (`src/lib/server/db/scoped.ts`) enforce campus-level data isolation
- **Zod + Superforms** for validation across all form actions
- **Puppeteer** renders HTML templates into PDF diplomas and certificates

## Deployment

CI builds and pushes Docker images to GHCR on pushes to `main`, `staging`, and `dev`:

| Branch    | Image Tag |
| --------- | --------- |
| `main`    | `latest`  |
| `staging` | `staging` |
| `dev`     | `dev`     |

## Environment Variables

| Variable                  | Purpose                       |
| ------------------------- | ----------------------------- |
| `DATABASE_URL`            | PostgreSQL connection string  |
| `BETTER_AUTH_SECRET`      | Session signing secret        |
| `MICROSOFT_CLIENT_ID`     | Azure OAuth app ID            |
| `MICROSOFT_CLIENT_SECRET` | Azure OAuth secret            |
| `MICROSOFT_TENANT_ID`     | Azure AD tenant               |
| `MAIL_PROVIDER`           | `resend` (default) or `mailjet` |
| `MAIL_FROM`               | Sender address for transactional emails |
| `RESEND_API_KEY`          | Resend API key (when `MAIL_PROVIDER=resend`) |
| `MAILJET_API_KEY`         | Mailjet API key (when `MAIL_PROVIDER=mailjet`) |
| `MAILJET_API_SECRET`      | Mailjet API secret (when `MAIL_PROVIDER=mailjet`) |

See [`.env.example`](.env.example) for the full template.

## Contributing

The contribution protocol is [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md), and part of it is
enforced: a CI check blocks the merge unless the branch is named `type/<issue>-slug`, the issue it
points at carries user stories and acceptance criteria, and the pull request body closes it. The
document opens with a table saying exactly which steps are checked and which are not.

Start a piece of work with:

```bash
scripts/start-work.sh --issue <n> --type feat --slug short-name
```

That opens the branch and moves the issue on the board. Repo-wide conventions for agents and humans
alike live in [`AGENTS.md`](AGENTS.md).

## License

Private, Epitech internal use only.
