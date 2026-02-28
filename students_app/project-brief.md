# Project Brief: TekCamp Student Portal ("The Cockpit")

## 1. Executive Summary

The **TekCamp Student Portal** is a desktop-first web application designed to transform the attendee experience from a passive listener to an active "Camper". It serves as a real-time Learning Management System (LMS) during Epitech events ranging from 3-hour workshops to 2-week internships. By digitizing the workflow (sequential unlocking, quiz validation, help requests) and generating public showcases and "Parcoursup-ready" certificates, the portal professionalizes the delivery of Epitech camps. Furthermore, it will seamlessly integrate with the **existing internal Staff/Manta application** to bridge the communication gap between students and instructors.

## 2. Problem Statement

- **Current State:** Students follow workshops via static PDFs or Notion pages. There is no automated real-time tracking of their progress.
- **The "Bottleneck" Issue:** In a room with 20+ students, validation is chaotic. Students wait too long for help, leading to disengagement.
- **Format Scalability:** With the introduction of 2-week "Stage de Seconde" internships, tracking a student's progress manually across multiple days and subjects has become unsustainable for the staff.
- **The "Value Gap":** Post-event, students leave with code trapped on local machines. There is a lack of shareable proof of their acquired skills for academic files (Parcoursup) or social networks (Discord/Instagram).

## 3. Target Users

- **Primary Segment: "The Camper" (14-17yo)**
  - **Profile:** Middle/High school student. Tech-curious but needs structure.
  - **Context:** Uses the app on a laptop _during_ the event (from a single afternoon up to 10 consecutive days).
  - **Goal:** Have fun coding, avoid being blocked, and get a "trophy" (certificate & public profile) to show parents/peers.
- **Secondary Segment: "The Manta" (Instructor / Staff)**
  - **Context:** Already uses the _existing_ internal TekCamp admin application.
  - **Interaction:** Receives alerts from Campers and validates critical checkpoints directly from their existing staff dashboard.

## 4. Proposed Solution: The "Cockpit" Experience

A web application acting as a digital companion, synchronized with the existing staff infrastructure:

1.  **Frictionless Entry:** Login via Magic Link + OTP (No passwords, easy to resume across multiple days).
2.  **Gamified & Persistent Flow:** Content delivered in sequential steps. Progress is saved continuously to support multi-day internships.
3.  **Hybrid Validation Engine:**
    - **Auto-Unlock:** Simple quizzes (QCM) unlock theoretical steps instantly.
    - **Manta-Check:** Critical milestones require physical verification (Manta inputs a PIN or uses the staff app to unlock the student's screen remotely).
4.  **Tangible Output & Viral Loop:**
    - Generation of a comprehensive PDF dossier.
    - Creation of a permanent, public "Showcase" URL for social sharing.

## 5. MVP Scope (Must Haves)

### A. Authentication & Session Management

- **Hybrid Login:** Email entry -> sends Magic Link + 6-digit OTP.
- **Multi-day Persistence:** The session remembers exactly which step of which subject the student was on yesterday.

### B. The "Live" Cockpit (Workshop Mode)

- **Step-by-Step Viewer:** Display subject content (Markdown) one block at a time.
- **Validation Widgets:**
  - Embedded QCM form (Auto-validation with retry limits).
  - "Call Manta" button (Triggers the "Manta-Signal").
  - "Admin Unlock" mechanism (PIN code or remote unlock).
- **Progress Bar:** Visual indicator of completion and total XP gained.

### C. Portfolio, Showcase & Export

- **Screenshot/Link Uploader:** Area for students to save images and GitHub/Replit links as they progress.
- **Public Showcase Page:** A read-only, sharable URL (e.g., `tekcamp.epitech.eu/p/lucas-123`) acting as their "Parcours Epitech" resume.
- **Certificate Engine:** Generates a branded PDF summarizing:
  - Total duration (3h, 6h, or 2 weeks).
  - Skills acquired & Subjects completed.
  - Portfolio screenshots.

### D. Existing Staff App Integration (The "Manta" Side)

- **Live Dashboard Update:** Modify the _existing_ SvelteKit admin app to receive real-time notifications when a Camper clicks "Call Manta" or reaches a manual checkpoint.

## 6. Technical Considerations

- **Platform:** Web Application (Desktop-first responsiveness).
- **Architecture:** The new Camper portal must share the same PocketBase backend as the existing staff app to ensure seamless real-time data flow.
- **Realtime:** PocketBase subscriptions are critical for pushing the "Manta-Signal" to the existing staff interface.
- **Data Model Impact:** Need to extend existing collections or create `Sessions`, `Steps_Progress`, `Quizzes`, and `PortfolioItems` collections.

## 7. Constraints & Assumptions

- **Adaptability:** The UI and data structure MUST gracefully handle a 3-hour event (1 subject) just as well as a 2-week internship (10+ subjects).
- **No Home Work:** Post-event access is read-only (consulting the showcase/PDF). Active progression only happens on-campus.
- **Hardware:** Assumes every student has a laptop with internet access.

## 8. Success Metrics

1.  **Flow Efficiency:** Reduction in student idle time / wait time for a Manta.
2.  **Scalability:** Successful deployment during a massive 2-week "Stage de Seconde" without data loss or bottleneck.
3.  **Viral & Value Creation:** % of students who download their PDF and share their Public Showcase URL.
