# TekCamp Student Portal ("The Cockpit") - Brownfield Enhancement PRD

### Document Control

| Date       | Version | Description                    | Author          |
| ---------- | ------- | ------------------------------ | --------------- |
| 2026-02-27 | 1.0     | Initial PRD for Student Portal | Product Manager |

---

## 1. Intro Project Analysis and Context

### Existing Project Overview

- **Analysis Source:** IDE-based fresh analysis of the provided `TekCamp` SvelteKit/PocketBase codebase + Project Brief.
- **Current Project State:** The current system is a staff-facing CRM and event management tool. It utilizes SvelteKit for the frontend and PocketBase for the backend. It tracks `events`, `campuses`, `students`, `subjects`, and `participations`. Staff members (`users`) log in via Microsoft OAuth to manage attendance, assign subjects, and generate PDF diplomas. Currently, students (`students`) are passive records in the database without direct login access.

### Available Documentation Analysis

- **Available Documentation:**
  - [x] Tech Stack Documentation (SvelteKit, Tailwind, PocketBase) \*[x] Source Tree/Architecture (App routes, lib structure, server actions)
  - [x] Database Schema (Analyzed via `pocketbase-types.ts`)
  - [ ] UX/UI Guidelines (Missing for the new Camper portal)
  - [ ] External API Documentation (N/A - relying on PB)

### Enhancement Scope Definition

- **Enhancement Type:**
  - [x] New Feature Addition (Student Portal / "Cockpit")
  - [x] Major Feature Modification (Staff App "Manta-Signal" integration)
- **Enhancement Description:** Creation of a desktop-first web application for students to log in via Magic Link/OTP, view workshop steps sequentially, validate progress via QCM or Manta intervention, and generate shareable portfolios/PDFs. Requires adding real-time alerts to the existing Staff dashboard.
- **Impact Assessment:**
  - [x] **Significant Impact:** Requires extending the database schema (e.g., `OTP` handling for students, `steps_progress`, `portfolio_items`), creating a completely new routing group for the student portal, and adding PocketBase real-time subscriptions to the existing staff app.

### Goals and Background Context

- **Goals:**
  - Eliminate student idle time by automating theoretical validations (QCMs).
  - Enable seamless scaling for multi-day events (e.g., 2-week Stage de Seconde) via persistent session tracking.
  - Increase post-event value by providing automated, Parcoursup-ready PDF certificates and public showcase URLs.
  - Bridge the communication gap between Campers and Mantas via real-time alerts.
- **Background Context:**
  Currently, Epitech workshops rely on static documents, making it difficult for Mantas to track individual progress in a room of 20+ students. As formats expand to multi-day internships, manual tracking is unsustainable. Furthermore, students leave without a modern, digital proof of their achievements. The TekCamp Student Portal solves this by turning the learning process into a tracked, gamified, and highly valorizing interactive experience.

---

## 2. Requirements

### Functional Requirements (FR)

- **FR1: Hybrid Authentication:** Students must be able to log in using an email address, receiving both a Magic Link and a 6-digit OTP (via the existing or extended `otps` collection). Passwords are not used.
- **FR2: Persistent "Cockpit" Session:** Upon login, the student is routed to their active event dashboard. The system must remember their exact progress state (subject, current step) across multiple days (vital for the 2-week internships).
- **FR3: Sequential Content Viewer:** The app must render Markdown-based subject content block-by-block. Future steps remain hidden or locked until the current step's validation condition is met.
- **FR4: Auto-Unlock via QCM:** Students can unlock theoretical steps by correctly answering an embedded multiple-choice quiz. (Includes a retry limit before triggering a mandatory Manta help request).
- **FR5: The "Manta-Signal" (Help/Validation Request):** Students can click a button to request help or validation. This sends a lightweight HTTP POST request that triggers a real-time notification on the Staff dashboard.
- **FR6: Manual Manta Unlock (Real-time):** Critical steps require a Manta to unlock them. This can be done locally (PIN code) or remotely via the Manta's dashboard. **When unlocked remotely, the student's UI must transition to the next step automatically in real-time without requiring a page refresh.**
- **FR7: Portfolio Uploader:** Students can drag-and-drop screenshots or paste external links (GitHub/Replit) into a portfolio drawer during their session.
- **FR8: Parcoursup Certificate Engine:** Students can generate a downloadable PDF certificate summarizing their XP, completed subjects, duration, and portfolio items.
- **FR9: Public Showcase Page:** The system generates a read-only, public URL (e.g., `/p/[student-id]`) displaying the student's achievements and portfolio for social sharing.

### Non-Functional Requirements (NFR)

- **NFR1: High Concurrency Handling:** The system must comfortably support up to 2,000 concurrent student sessions.
- **NFR2: Optimized Real-time Architecture:** Students will utilize PocketBase SSE (Server-Sent Events) to listen for remote unlocks. To ensure stability at 2,000+ connections, DevOps must configure the hosting environment (Docker `ulimits`) to allow high open file descriptors, and frontend subscriptions must be strictly limited to the user's active session record to minimize payload size.
- **NFR3: Desktop-First UX:** While the app must be responsive, the primary UX must be optimized for laptops (13" to 15" screens) split-screened alongside an IDE.

### Compatibility Requirements (CR)

- **CR1: Database Schema Compatibility:** New collections (`steps_progress`, `portfolio_items`, `student_sessions`) must cleanly link to the existing `students`, `participations`, `events`, and `subjects` tables without requiring destructive migrations.
- **CR2: Routing & Auth Isolation:** The student portal must live under a distinct SvelteKit route group (e.g., `/(camper)`) with its own dedicated auth store (e.g., `pb_student_auth` in `hooks.server.ts`), entirely isolated from the existing `pb_admin_auth` and `pb_staff_auth`.
- **CR3: UI Consistency:** The student portal should utilize the existing Tailwind design system (Epitech colors, fonts like Anton and IBM Plex Sans) defined in `layout.css` to maintain brand consistency, but strip out heavy admin UI elements.
- **CR4: Existing Staff Dashboard Integration:** The "Manta-Signal" receiver must be integrated directly into the _existing_ `/(app)/events/[id]/appel` page so staff do not have to switch tabs to see who needs help.

---

## 3. User Interface Design Goals

### Overall UX Vision

The TekCamp Student Portal ("The Cockpit") should feel less like a traditional school website and more like a modern, gamified learning companion. It should draw inspiration from tools like Duolingo, Codecademy, and modern IDEs. The interface must be "quiet" enough not to distract from the actual coding work happening in another window, but "loud" enough when a success is achieved (level up, step completed). It uses the existing Epitech brand colors (Blue, Teal, Orange, Pink) to create a high-contrast, energetic tech aesthetic.

### Key Interaction Paradigms

- **Adaptability to "Screen Scarcity":** We acknowledge that students use small laptops (13"). The UI must support two distinct modes:
  1.  **Focus Mode (Full Screen):** Generous whitespace, large typography for reading and learning concepts.
  2.  **Compact Mode (Split Screen):** When the window is resized below ~900px, sidebars vanish, margins collapse, and the interface behaves like a mobile app _on desktop_. This allows the 10% of power users to keep coding side-by-side without horizontal scrolling.
- **Instant Context Recovery:** Since most students Alt-Tab away to their IDE, coming back to the app must be frictionless. The "Current Active Step" must be visually dominant (high contrast, highlighted background) so the eye lands on it immediately upon returning to the window.
- **Progressive Disclosure:** Users only see the current step they are working on, plus a blurred/locked preview of the next step. They cannot scroll ahead and read the end of the subject. This keeps focus absolute.
- **Immediate Feedback Loops:** Micro-interactions are critical. Clicking "Validate" on a QCM should immediately yield a satisfying success state (e.g., a green flash, a sound, or confetti) or a clear, gentle error state.
- **The "Call for Help" Lifeline:** The button to call a Manta must be omnipresent, floating, and frictionless. It should have a visual state confirming "A Manta is on the way."

### Core Screens and Views

1.  **Auth & Welcome Flow:** A minimalist, highly stylized login screen requesting an email, followed by a screen to enter the 6-digit OTP (if the magic link wasn't used).
2.  **The Event Lobby:** A landing page showing the current event details, the assigned subject(s), and the student's current XP/Level.
3.  **The "Cockpit" (Active Subject View):** The core screen. An adaptive layout showing:
    - _Content:_ The current step content (Markdown), QCMs, and the "Call Manta" button.
    - _Tools Drawer:_ A collapsible Portfolio drop-zone and visual roadmap of the subject's steps.
4.  **The Public Showcase:** A beautiful, read-only profile page summarizing the student's journey (Total XP, Badges, Portfolio items) designed to look great on mobile for social sharing.

### Accessibility

**WCAG AA**
_Rationale:_ Given the target audience (middle and high schoolers in an educational setting), we must ensure high contrast ratios (especially with the dark/cyberpunk aesthetic) and full keyboard navigability.

### Branding

We will utilize the existing `layout.css` variables found in the codebase to maintain absolute consistency with the staff app, but we will lean heavier into the "Dark Mode" aesthetic by default for the Cockpit to reduce eye strain during coding sessions.

- **Primary:** `--epi-blue` (#013afb)
- **Accents:** `--epi-teal` for successes/unlocks, `--epi-orange` for warnings/Manta calls, `--epi-pink` for level-ups/major achievements.
- **Typography:** 'Anton' for major headings (gamified feel), 'IBM Plex Sans' for readability in technical instructions.

### Target Device and Platforms

**Web Responsive (Desktop-First)**
_Rationale:_ Active learning and coding happen on laptops. While the Public Showcase must be mobile-perfect for Instagram/Discord sharing, the actual "Cockpit" where work happens is optimized for desktop browsers.

---

## 4. Technical Assumptions

### Repository Structure

**Choice:** Monorepo (Extension of Existing Codebase)
_Rationale:_ We will build the Student Portal directly inside the existing `TekCamp` SvelteKit repository by creating a new, isolated route group (e.g., `src/routes/(camper)`). This allows us to reuse the existing Tailwind CSS design system, PocketBase TypeScript definitions (`pocketbase-types.ts`), and generic UI components, drastically increasing development speed.

### Service Architecture

**Choice:** Monolith (SvelteKit SSR + PocketBase Backend)
_Rationale:_ We are maintaining the current architecture where SvelteKit handles the frontend routing, server-side rendering (SSR), and client-side interactivity, while the existing PocketBase instance handles the database, file storage (for the Portfolio), and real-time API (SSE). To handle the 2,000 concurrent user requirement, we assume the host server will be properly configured (e.g., high `ulimits` for file descriptors) to allow mass concurrent Server-Sent Events without crashing.

### Testing Requirements

**Choice:** Unit + Integration Testing
_Rationale:_ Given the strict time constraints of live events, we cannot afford bugs in the authentication flow or the "Manta-Signal" feature. We will require:

1.  **Unit Tests:** For isolated logic (e.g., XP calculation, QCM validation).
2.  **Integration Tests:** For the specific PocketBase interactions (e.g., ensuring the OTP login correctly validates against the database and sets the correct cookie).

### Additional Technical Assumptions and Requests

- **Auth Context Isolation:** The system must strictly separate the student authentication state from the staff/admin state. This will be handled in `hooks.server.ts` by checking a specific `pb_student_auth` cookie and validating against a dedicated PocketBase collection (either a new Auth collection for students, or manual token generation).
- **Real-time Payload Optimization:** When students subscribe to PocketBase via SSE to listen for "Manta Unlocks", the subscription must be strictly filtered to their specific `session` or `steps_progress` ID. This prevents the server from broadcasting room-wide updates to every single device, saving massive amounts of bandwidth and CPU.
- **Database Write-Ahead Logging (WAL):** We assume the PocketBase SQLite database is running in WAL mode to handle the concurrent write requests (saving QCM answers, updating steps) from thousands of students without database locking.

---

## 5. Epic List

**Epic Structure Decision**: Multiple Sequential Epics
_Rationale:_ While some brownfield enhancements fit into a single Epic, the scope of this project (a complete student portal + real-time staff dashboard modifications) is too large for one. We will split it logically: Foundation (Auth & DB), Core Student UX (The Cockpit), Staff Integration (Manta-Signal), and Post-Event Value (Showcase/PDF).

1.  **Epic 1: Foundation & Camper Authentication**
    - _Goal:_ Establish the `/(camper)` route isolation, extend the PocketBase schema to support student OTPs/Magic Links, and implement the frictionless student login flow without disrupting existing staff auth.
2.  **Epic 2: The "Cockpit" & Subject Progression**
    - _Goal:_ Build the core interactive student dashboard where subjects are rendered step-by-step, including the QCM auto-unlock mechanism and persistent session state (saving progress across multiple days).
3.  **Epic 3: The "Manta-Signal" & Real-Time Staff Integration**
    - _Goal:_ Bridge the gap between students and staff by implementing the "Call for Help" button, modifying the _existing_ staff dashboard to receive real-time alerts, and allowing Mantas to remote-unlock student steps.
4.  **Epic 4: Portfolio, Valorization, and Public Showcase**
    - _Goal:_ Implement the drag-and-drop portfolio uploader, the automated PDF certificate generator, and the read-only public showcase URL for social sharing.

---

## 6. Epic Details

### Epic 1: Foundation & Camper Authentication

**Epic Goal**: Establish the secure, isolated routing for the student portal and implement the passwordless login flow (Magic Link + 6-digit OTP) without breaking the existing Staff/Admin authentication.

- **Story 1.1: Database Schema Extension for Students**
  - **As a** System,
  - **I want** to extend the PocketBase schema to support student authentication and session tracking,
  - **so that** students can log in and their progress can be saved across multiple days.
  - **Acceptance Criteria:**
    - 1. The existing `students` collection is either converted to an Auth collection OR a new `student_sessions` collection is created to handle login tokens.
    - 2. An `otps` collection (or similar mechanism) exists to store temporary 6-digit codes with expiration timestamps.
    - 3. A `steps_progress` collection is created linking `student`, `subject`, `step_index`, and `status` (locked/unlocked).
    - 4. Existing data (staff users, previous events) remains intact and accessible.

- **Story 1.2: Route Isolation & Security Hooks**
  - **As a** Security framework,
  - **I want** to intercept requests to the `/(camper)` route group,
  - **so that** only authenticated students can access it, and students cannot access `/(app)` or `/admin`.
  - **Acceptance Criteria:**
    - 1. A new `/(camper)` route group is created in SvelteKit.
    - 2. `hooks.server.ts` is updated to check for a new cookie (e.g., `pb_student_auth`).
    - 3. If a student tries to access `/(app)`, they are redirected to `/(camper)/login`.
    - 4. If a staff member tries to access `/(camper)`, they are either allowed (for testing) or redirected to `/(app)`.
    - 5. Existing staff OAuth and Admin login flows continue to function normally.

- **Story 1.3: The Passwordless Login UI & Flow**
  - **As a** Student (Camper),
  - **I want** to log in using only my email address and a 6-digit code,
  - **so that** I don't have to remember a password during the workshop.
  - **Acceptance Criteria:**
    - 1. A `/login` page exists within the `/(camper)` group featuring the Epitech design system.
    - 2. The student enters their email. If the email exists in the `students` DB, the system generates a 6-digit OTP and sends an email.
    - 3. The UI transitions to an "Enter Code" screen.
    - 4. Upon entering the correct code before it expires, the system sets the `pb_student_auth` cookie and redirects to the Camper Dashboard.
    - 5. Invalid or expired codes display a clear error message.

### Epic 2: The "Cockpit" & Subject Progression

**Epic Goal**: Build the core interactive student dashboard where subjects are rendered step-by-step, including the QCM auto-unlock mechanism and persistent session state (saving progress across multiple days).

- **Story 2.1: The Event Lobby & Progress Resume**
  - **As a** Student,
  - **I want** to see my assigned subject and my current overall progress when I log in,
  - **so that** I know exactly where to resume my work, even if it's day 3 of an internship.
  - **Acceptance Criteria:**
    - 1. The dashboard fetches the student's active `participation` record for today's date.
    - 2. The UI displays the Subject Title, the student's total XP, and a "Resume" or "Start" button.
    - 3. Clicking the button routes the user to the active step in the Cockpit view.

- **Story 2.2: Sequential Markdown Viewer**
  - **As a** Student,
  - **I want** to read my subject instructions one step at a time,
  - **so that** I am not overwhelmed by a massive wall of text.
  - **Acceptance Criteria:**
    - 1. The Cockpit view renders Markdown content gracefully (handling code blocks, images, and formatting).
    - 2. The UI displays _only_ the currently unlocked step.
    - 3. The next step is visibly locked or blurred, preventing scrolling ahead.
    - 4. The UI layout adapts to screen width (Compact mode for split-screen coding).

- **Story 2.3: QCM Auto-Unlock Mechanism**
  - **As a** Student,
  - **I want** to answer a quick quiz to prove I understand a concept,
  - **so that** the next step unlocks immediately without waiting for a Manta.
  - **Acceptance Criteria:**
    - 1. A QCM form is rendered at the bottom of steps tagged for auto-validation.
    - 2. Submitting the correct answer updates the database (`steps_progress`) and immediately reveals the next step.
    - 3. Incorrect answers show a gentle error.
    - 4. After 3 consecutive incorrect attempts, the QCM locks and prompts the user to use the "Call Manta" button.

### Epic 3: The "Manta-Signal" & Real-Time Staff Integration

**Epic Goal**: Connect the student's app to the staff's app using real-time alerts, allowing for swift physical or remote interventions.

- **Story 3.1: The "Call for Help" Trigger**
  - **As a** Student,
  - **I want** to click a button to request help or manual validation,
  - **so that** a Manta knows I am blocked without me having to raise my hand for 10 minutes.
  - **Acceptance Criteria:**
    - 1. A persistent "Call Manta" button exists in the Cockpit UI.
    - 2. Clicking it sends a POST request updating the student's status to `needs_help` in the database.
    - 3. The button UI changes state (e.g., "Manta Notified...").
    - 4. The student can cancel the request.

- **Story 3.2: Real-Time Staff Dashboard Alerts**
  - **As a** Staff Member (Manta),
  - **I want** to see live alerts on my existing attendance dashboard when a student needs help,
  - **so that** I can prioritize who to assist first.
  - **Acceptance Criteria:**
    - 1. The _existing_ `/(app)/events/[id]/appel` page subscribes to PocketBase SSE for changes to student statuses in that specific event.
    - 2. When a student triggers the Manta-Signal, their row/card on the staff dashboard visually highlights (e.g., pulses orange) in real-time.
    - 3. The alert indicates which specific step the student is stuck on.

- **Story 3.3: Manual / Remote Step Unlock**
  - **As a** Staff Member (Manta),
  - **I want** to validate a student's work and unlock their next step from my dashboard,
  - **so that** the student can continue working immediately.
  - **Acceptance Criteria:**
    - 1. The staff dashboard allows the Manta to click "Approve Step" for a specific student.
    - 2. This updates the database and sends a real-time event back to the student's app.
    - 3. The student's UI automatically transitions to the next step without a page refresh.
    - 4. (Fallback) A Manta can type a secure 4-digit PIN directly into a modal on the _student's_ laptop to bypass the network remote-unlock if needed.

### Epic 4: Portfolio, Valorization, and Public Showcase

**Epic Goal**: Provide tangible, shareable proof of the student's work for their academic future and social networks.

- **Story 4.1: The Portfolio Drop-Zone**
  - **As a** Student,
  - **I want** to upload screenshots of my game/code or paste GitHub links during the workshop,
  - **so that** I have a record of what I actually built.
  - **Acceptance Criteria:**
    - 1. The Cockpit includes a side-drawer or designated area for "My Portfolio".
    - 2. Students can drag-and-drop image files (uploaded to PocketBase) or paste URLs.
    - 3. These items are linked to the student's profile and the specific event.

- **Story 4.2: Public Showcase Page**
  - **As a** Student,
  - **I want** a public link to my Epitech journey,
  - **so that** I can put it in my Discord bio or show my friends.
  - **Acceptance Criteria:**
    - 1. A dynamic, read-only public route is created (e.g., `/p/[student-id]`).
    - 2. The page displays the student's pseudo/first name, total XP, current Level, badges earned, and all portfolio items (screenshots/links).
    - 3. The layout is highly optimized for mobile viewing.
    - 4. No sensitive data (email, phone, parent info) is exposed on this route.

- **Story 4.3: Automated Parcoursup PDF Generation**
  - **As a** Student (or Parent),
  - **I want** to download a formal certificate summarizing my workshop,
  - **so that** I can add it to my school application files.
  - **Acceptance Criteria:**
    - 1. A "Download Certificate" button is available at the end of the event or on the student's lobby page.
    - 2. The system triggers a backend function (likely utilizing the existing Puppeteer/EJS setup you have in `api/diploma`) to generate a PDF.
    - 3. The new PDF includes: The specific subjects completed, total duration (e.g., 6 hours or 2 weeks), and thumbnails of their uploaded portfolio screenshots.

---

## 7. Checklist Results Report

### Category Statuses

| Category                         | Status   | Critical Issues                                                             |
| -------------------------------- | -------- | --------------------------------------------------------------------------- |
| 1. Problem Definition & Context  | **PASS** | None. Problem (student engagement, scaling tracking) is clearly defined.    |
| 2. MVP Scope Definition          | **PASS** | Scope is strict: synchronous use only, no "homework" features to bloat MVP. |
| 3. User Experience Requirements  | **PASS** | "Split-Screen" vs "Alt-Tab" reality addressed with adaptive layout.         |
| 4. Functional Requirements       | **PASS** | Requirements are testable (e.g., "After 3 incorrect attempts...").          |
| 5. Non-Functional Requirements   | **PASS** | 2,000 concurrent user constraint addressed via SSE architecture decision.   |
| 6. Epic & Story Structure        | **PASS** | Logical flow: Foundation -> Cockpit -> Staff Integration -> Showcase.       |
| 7. Technical Guidance            | **PASS** | Clear direction on leveraging existing SvelteKit/PocketBase stack.          |
| 8. Cross-Functional Requirements | **PASS** | Integration with existing Staff App explicitly defined (Story 3.2).         |
| 9. Clarity & Communication       | **PASS** | Terminology (Manta, Cockpit, Camper) is consistent.                         |

### Final Decision

- **READY FOR ARCHITECT:** The PRD is comprehensive, properly structured, and ready for architectural design.

---

## 8. Next Steps

### UX Expert Prompt

"Please create the UI/UX Specification for the **TekCamp Student Portal ('The Cockpit')**.
Key focus areas:

1.  **Adaptive 'Cockpit' Layout:** Design a view that works beautifully in Full Screen (Focus Mode) but collapses gracefully to a mobile-like column when resized to <900px (for split-screen coding).
2.  **Visual Hierarchy:** The 'Current Step' must be instantly identifiable when Alt-Tabbing back to the browser.
3.  **Gamification Feedback:** Design the visual payoffs for unlocking a step (QCM success) and the 'Waiting State' when the Manta-Signal is active.
4.  **Portfolio Drawer:** A collapsible sidebar for dragging-and-dropping screenshots without cluttering the main view."

### Architect Prompt

"Please create the **Brownfield Enhancement Architecture** for adding the Student Portal to the existing **TekCamp** repo.
Key constraints to address:

1.  **Concurrency:** How to configure PocketBase (Go/SQLite) to handle 2,000 concurrent SSE listeners without locking up.
2.  **Auth Isolation:** Detail the implementation of `hooks.server.ts` to support a secondary `pb_student_auth` cookie alongside the existing staff auth.
3.  **Schema Design:** Define the `student_sessions`, `otps`, and `steps_progress` collections, ensuring efficient querying at scale.
4.  **Real-time Optimization:** Design the SSE subscription model so students only listen to their _own_ record changes."
