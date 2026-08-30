# JARGON.md: Shared Domain Glossary for Jump

This document is the source of truth for domain terms that carry specific meanings
within Jump. The same word may refer to different concepts depending on the context
(Salesforce, application domain, staff UI, talent UI): we clarify them here to avoid
misunderstandings in code, issues, PRs, and product discussions.

Rule: if a term is ambiguous, add it to this document before using it in a PR or story.

---

## People & Roles

| Term in Jump          | Definition & Context                                                                               | Salesforce Term            | Auth / DB Model             |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------- |
| **Talent**            | High-school student tracked by Epitech Academy (prospect or event attendee).                       | `Contact`                  | `Talent` (Prisma model)     |
| **Stagiaire**         | A talent enrolled in a multi-week internship (`stage`). Staff dev UI string only.                   | `CampaignMember`           | -                           |
| **Participant**       | Generic term for a talent enrolled in any event type. Default fallback for `cohortNoun`.           | `CampaignMember`           | -                           |
| **Staff**             | Epitech staff member using `/staff/`. Includes all staff roles.                                     | -                          | `StaffProfile`              |
| **Dev** (role)        | **Not a software engineer.** Refers to Business Development / Admissions / Talent Acquisition. Accesses `/staff/dev/`. | - | `StaffRole.dev` / `StaffRole.superdev` |
| **Admin**             | Staff member with global system access. Accesses `/staff/admin/`.                                  | -                          | `StaffRole.admin`           |
| **Parent**            | Legal guardian of a talent. Accesses `(parent)/` to co-sign rules and decide image rights.        | -                          | `parentEmail`, `parentPhone` fields on `Talent` |

---

## Events & Structure

| Term in Jump          | Definition & Context                                                                               | Salesforce Term            |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| **Event**             | An instance of an Epitech Academy activity (stage, coding club, open house...). Core entity of Jump. | `Campaign`                 |
| **Stage**             | Multi-week internship event. Its cohort noun is *stagiaires*.                                       | `Campaign` of type stage   |
| **Coding Club**       | Single-day recurring event. Its cohort noun is *participants*.                                     | `Campaign` of type club    |
| **Activation dev**    | Action where an admin makes an event visible in the dev space (`devActivatedAt != null`).           | -                          |
| **Public name**       | Clean user-facing title of an event (e.g., "Stage Web Été 2026"), distinct from raw Salesforce title. Field `Event.publicName`. | - |
| **Cohort**            | The set of talents registered for an event, filtered by visible statuses.                          | `CampaignMember` rows for the `Campaign` |

---

## Salesforce Member Statuses

These values arrive from the worker sync and are stored in `Participation.sfMemberStatus`.
They are **never** exposed raw in the UI: they map to French domain labels.

| Salesforce Value   | Business Meaning                                                      | Displayed in Jump UI                                |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `READY`            | Talent confirmed attendance                                           | Visible in dev workspace. For past events: *Absent* (confirmed but did not show up) |
| `MEET`             | Talent attended the event                                             | Visible in dev workspace. For past events: *Présent* |
| `CONNECTED`        | Talent clicked Salesforce link but did not confirm                    | **Not visible** in dev workspace. Retained in DB for debugging. |
| `DESISTED`         | Talent explicitly withdrew                                            | **Not visible** in dev workspace. Retained in DB for debugging. |
| `null` (legacy)    | Row synced prior to `sfMemberStatus` field introduction               | Treated as visible (preserves historical behavior)  |

Source of truth in code: `frontend/src/lib/domain/sfMemberStatus.ts`.

---

## Participation vs Presence vs Émargement

These three concepts are distinct and must not be confused in code or documentation.

| Concept            | Definition                                                                                        | Data Source                |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------------------------- |
| **Participation**  | The fact that a talent is enrolled in an event (originates from Salesforce via worker). `Participation` entity in DB. | Salesforce sync worker     |
| **Présence SF**    | For a *past* event: inferred from `sfMemberStatus` (`MEET` = present, `READY` = absent). No manual entry in Jump. | `Participation.sfMemberStatus` |
| **Émargement**     | Real-time attendance tracking during the event, entered by staff inside Jump. `EventPresence` entity in DB. Independent of SF statuses. | Staff entry in Jump        |

---

## Workspaces & Audiences

| Workspace      | Route          | Target Audience       | UI Copy Register & Tone     |
| -------------- | -------------- | --------------------- | --------------------------- |
| **Dev**        | `/staff/dev/`  | Staff dev / superdev  | *_vous_*, clean, functional |
| **Admin**      | `/staff/admin/`| Staff admin           | *_vous_*, stats, operational|
| **Talent**     | `(talent)/`    | High-school students  | *_tu_*, welcoming, gamified |
| **Parent**     | `(parent)/`    | Legal guardians       | *_vous_*, formal            |

---

## Common Terminology Pitfalls

| ❌ Do Not Say                    | ✅ Use Instead                              | Reason                                                           |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| "Dev" referring to a developer  | "Software engineer" or their first name     | "Dev" refers specifically to the Business Dev role in Jump       |
| "Participant" for a specific stagiaire | Event's configured `cohortNoun`     | Cohort noun depends on event type and is configurable            |
| "Status" without qualification  | "SF status" vs "Dossier status"             | Two statuses co-exist: Salesforce status vs talent file completion status (charter, image rights) |
| "Sync" without qualification    | "Salesforce sync" vs "Worker sync"          | Multiple sync processes exist (talents, events, campuses)        |
