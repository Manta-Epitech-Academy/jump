# TekCamp Student Portal ("The Cockpit") - Brownfield Enhancement Architecture

### Document Control

| Date       | Version | Description                                        | Author    |
| ---------- | ------- | -------------------------------------------------- | --------- |
| 2026-02-27 | 1.0     | Initial Brownfield Architecture for Student Portal | Architect |

---

## 1. Introduction

### Introduction

This document outlines the architectural approach for enhancing **TekCamp** with the **Student Portal ("The Cockpit")**. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development of new features while ensuring seamless integration with the existing system.

**Relationship to Existing Architecture:**
This document supplements the existing project architecture by defining how the new student-facing components (`/(camper)` routes, new DB collections) will integrate with the current staff-facing system. Where conflicts arise between new and existing patterns (e.g., Auth flows), this document provides guidance on maintaining consistency while implementing enhancements.

### Existing Project Analysis

- **Analysis Source:** IDE-based analysis of `TekCamp` codebase (`hooks.server.ts`, `pocketbase-types.ts`).
- **Current Project State:**
  - **Primary Purpose:** Event management CRM for Epitech staff.
  - **Current Tech Stack:** SvelteKit (SSR/Client), PocketBase (Go/SQLite), Tailwind CSS.
  - **Architecture Style:** Monolith (Frontend + Backend in one repo, hosted via Docker).
  - **Deployment Method:** Docker containers on VPS.
- **Constraints:**
  - **Concurrency:** Must handle 2,000+ simultaneous student connections.
  - **Database:** Single SQLite instance (PocketBase default).
  - **Auth:** Current logic handles `users` (Staff) via Microsoft OAuth.

---

## 2. Enhancement Scope and Integration Strategy

### Enhancement Overview

- **Enhancement Type:** Major Feature Addition (Student Portal) + Core Refactoring (Auth & Realtime).
- **Scope:**
  1.  **Student Portal:** New `/(camper)` route group for the "Cockpit" experience.
  2.  **Staff App Upgrades:**
      - **Live Dashboard:** Real-time "Manta-Signal" alerts.
      - **Subject Builder:** UI for defining steps, QCMs, and validation points.
      - **Student Profile:** Portfolio viewer/PDF generator.
- **Integration Impact:** **High**. Requires modifying the root `hooks.server.ts` to handle a 3rd auth context (`student`) and updating the staff dashboard to listen for real-time events.

### Integration Approach

- **Code Integration Strategy:** Monorepo extension. We will add a `src/routes/(camper)` directory. This keeps the codebase unified and allows sharing of UI components (buttons, inputs) and utility functions.
- **Database Integration:** Extension of the existing PocketBase instance. No new database service will be spun up.
- **API Integration:** Students will interact via SvelteKit Form Actions (POST) which internally talk to PocketBase. Real-time updates (SSE) will be client-side subscriptions strictly scoped to specific records.

### Compatibility Requirements

- **Existing API Compatibility:** The staff app routes `/(app)` must remain untouched and fully functional.
- **Database Schema Compatibility:** New collections must relate to existing `students` and `events` without altering their core definition or breaking existing queries.
- **UI/UX Consistency:** The new portal must use the existing Tailwind configuration (`layout.css`) variables.
- **Performance Impact:** The 2,000 concurrent user load must not degrade the staff dashboard's responsiveness.

---

## 3. Tech Stack Alignment

### Existing Technology Stack

| Category               | Technology   | Version | Purpose                  |
| ---------------------- | ------------ | ------- | ------------------------ |
| **Frontend Framework** | SvelteKit    | Latest  | SSR & Client-side logic  |
| **Styling**            | Tailwind CSS | Latest  | Utility-first styling    |
| **Backend**            | PocketBase   | v0.23+  | Database, Auth, Realtime |
| **Language**           | TypeScript   | Latest  | Type safety              |
| **Database**           | SQLite (WAL) | -       | Embedded DB              |

### New Technology Additions

- **PDF Generation:** `puppeteer` (already present in `api/diploma`) or `pdf-lib` for generating certificates.
- **No other new libraries.** We strictly adhere to the existing stack to minimize complexity and bundle size.

---

## 4. Data Models and Schema Changes

### New Data Models

#### 1. `students` (Auth Collection - Modified)

- **Change:** Enable **OTP Auth** (Email). Disable Password auth.
- **Purpose:** Allow students to log in via Magic Link / Code without password management.
- **New Fields:**
  - `xp` (number): Total experience points.
  - `level` (select): 'Novice', 'Apprentice', 'Expert'.
  - `badges` (json): Array of earned badges.

#### 2. `subjects` (Modified)

- **New Field:** `content_structure` (JSON).
- **Purpose:** Stores the ordered list of steps and validation rules.
- **Schema Definition:**
  ```typescript
  type SubjectStructure = {
    steps: Array<{
      id: string; // UUID (Critical for progress tracking)
      title: string;
      content_markdown: string;
      type: "theory" | "exercise" | "checkpoint";
      validation?: {
        type: "auto_qcm" | "manual_manta";
        qcm_data?: {
          question: string;
          options: string[];
          correct_index: number;
        };
        unlock_code?: string; // For manual PIN fallback
      };
    }>;
  };
  ```

#### 3. `steps_progress` (New Collection)

- **Purpose:** Tracks exactly where a student is in a specific subject. Critical for the "Resume" feature.
- **Fields:**
  - `student` (Relation -> `students`)
  - `event` (Relation -> `events`)
  - `subject` (Relation -> `subjects`)
  - `current_step_id` (String - Matches UUID from JSON)
  - `unlocked_step_id` (String - Max progress)
  - `status` (Select: 'active', 'needs_help', 'completed')
  - `last_updated` (DateTime)

#### 4. `portfolio_items` (New Collection)

- **Purpose:** Store uploaded screenshots and links.
- **Fields:**
  - `student` (Relation -> `students`)
  - `event` (Relation -> `events`)
  - `file` (File)
  - `url` (URL)
  - `caption` (Text)

---

## 5. Component Architecture

### Student Portal Components (`/(camper)`)

- **`StudentAuthGuard`:** Logic in `hooks.server.ts` to validate `pb_student_auth` cookies. Redirects unauthenticated users to `/login`.
- **`CockpitLayout`:** A new layout wrapper implementing the **Adaptive** paradigm (Focus Mode vs Compact Mode).
- **`MarkdownViewer`:** A component that takes the `content_structure` JSON and renders _only_ the active step using a Markdown parser (e.g., `marked` or `svelte-markdown`).
- **`MantaSignalButton`:** A floating action button.
  - _Action:_ Sends a POST request to update `steps_progress.status = 'needs_help'`.
  - _State:_ Handles "Loading", "Sent", "Acknowledged" states optimistically.
- **`NetworkStatusIndicator`:** A small UI element that turns red if the SSE connection drops, alerting the student to "Raise Hand" instead.

### Staff App Components (`/(app)`)

- **`NotificationQueue`:** A persistent, floating sidebar/drawer on the `events/[id]/appel` page.
  - _Source:_ Subscribes to `steps_progress` (filtered by event).
  - _Display:_ List of help requests sorted by time.
  - _Action:_ "Quick Resolve" or "Scroll to Student".
- **`SubjectStepEditor`:** A Block-based editor for creating the `content_structure` JSON. Must support **"Smart Import"** (paste Markdown -> generate steps).
- **`PortfolioGallery`:** A grid view component to display student screenshots in the admin panel.

---

## 6. Infrastructure & Deployment Integration

### Scalability Strategy (The 2,000 User Problem)

1.  **Database Concurrency (WAL Mode):**
    - **Requirement:** PocketBase MUST run with `journal_mode = WAL`.
    - _Why:_ Allows simultaneous readers (students viewing content) and writers (students submitting quizzes/signals) without database locking.
2.  **Asymmetric Real-Time Architecture:**
    - **Students:** primarily **Write** (HTTP POST) signals. They **Read** (SSE) _only_ their specific session/progress record for remote unlocks.
    - **Staff:** **Read** (SSE) the global event stream.
    - _Benefit:_ Drastically reduces the "fan-out" broadcast load on the server.
3.  **Subscription Optimization:**
    - Student SSE Filter: `pb.collection('steps_progress').subscribe('RECORD_ID')` (Exact match).
    - _Prevents:_ Broadcasting every help request to every student in the room.

### Security Integration

1.  **Auth Isolation (`hooks.server.ts`):**
    - Implement "Multi-Tenant" auth logic.
    - Staff use `pb_auth` cookie (Admin context).
    - Students use `pb_student_auth` cookie (Student context).
    - _Risk Mitigation:_ Strict separation ensures a student cannot accidentally access `/_/` or `/admin` routes.
2.  **API Rules (RLS):**
    - `steps_progress`:
      - List/View: `student = @request.auth.id`
      - Update: `student = @request.auth.id` (Students can only update their own status).
    - `portfolio_items`:
      - Create: `student = @request.auth.id`
      - List/View: `student = @request.auth.id || @request.auth.collectionName = 'users'` (Staff can see all).
3.  **Rate Limiting:**
    - Implement rate limiting on the `/login` (OTP Request) endpoint to prevent abuse/cost explosions.

### Resilience Strategy

1.  **Optimistic UI:** Buttons (like "Call Manta") should update state _immediately_ on click, then sync with server. If sync fails, retry in background.
2.  **Idempotency:** "Validate Step" endpoints must be idempotent to handle network retries without erroring.
3.  **Zombie Dashboard Mitigation:** Staff dashboards should auto-disconnect SSE if the tab is inactive for >30m to save server resources.

---

## 7. Next Steps

### Developer Handoff

- **Start with Auth:** Implement the `/(camper)` route group and the OTP logic in `hooks.server.ts`. This is the foundation.
- **Schema First:** Apply the schema changes to PocketBase before building UI components.
- **Mock Data:** Generate 50 dummy students and a dummy subject to test the "Cockpit" flow locally.

### Story Manager Handoff

- **Epic 1 (Foundation):** Priority is establishing the isolated auth context.
- **Epic 2 (Cockpit):** Focus on the JSON structure for subjects. This is the data backbone.
- **Epic 3 (Manta-Signal):** This requires the Real-time listeners. Ensure `ulimits` are high enough in your dev environment if testing concurrency.
