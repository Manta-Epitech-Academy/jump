# JARGON.md: Shared Domain Glossary for Jump

This document is the source of truth for domain terms that carry specific meanings
within Jump. The same word may refer to different concepts depending on the context
(Salesforce, application domain, staff UI, talent UI): we clarify them here to avoid
misunderstandings in code, issues, PRs, and product discussions.

Rule: if a term is ambiguous, add it to this document before using it in a PR or story.

---

## People & Roles

| Term in Jump    | Definition & Context                                                                                                   | Salesforce Term  | Auth / DB Model                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------- |
| **Talent**      | High-school student tracked by Epitech Academy (prospect or event attendee).                                           | `Contact`        | `Talent` (Prisma model)                         |
| **Stagiaire**   | A talent enrolled in a multi-week internship (`stage`). Staff dev UI string only.                                      | `CampaignMember` | -                                               |
| **Participant** | Generic term for a talent enrolled in any event type. Default fallback for `cohortNoun`.                               | `CampaignMember` | -                                               |
| **Staff**       | Epitech staff member using `/staff/`. Includes all staff roles.                                                        | -                | `StaffProfile`                                  |
| **Dev** (role)  | **Not a software engineer.** Refers to Business Development / Admissions / Talent Acquisition. Accesses `/staff/dev/`. | -                | `StaffRole.dev` / `StaffRole.superdev`          |
| **Admin**       | Staff member with global system access. Accesses `/staff/admin/`.                                                      | -                | `StaffRole.admin`                               |
| **Parent**      | Legal guardian of a talent. Accesses `(parent)/` to co-sign rules and decide image rights.                             | -                | `parentEmail`, `parentPhone` fields on `Talent` |

---

## Events & Structure

| Term in Jump       | Definition & Context                                                                                                            | Salesforce Term                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Event**          | An instance of an Epitech Academy activity (stage, coding club, open house...). Core entity of Jump.                            | `Campaign`                               |
| **Stage**          | Multi-week internship event. Its cohort noun is _stagiaires_.                                                                   | `Campaign` of type stage                 |
| **Coding Club**    | Single-day recurring event. Its cohort noun is _participants_.                                                                  | `Campaign` of type club                  |
| **Activation dev** | Action where an admin makes an event visible in the dev space (`devActivatedAt != null`).                                       | -                                        |
| **Public name**    | Clean user-facing title of an event (e.g., "Stage Web Été 2026"), distinct from raw Salesforce title. Field `Event.publicName`. | -                                        |
| **Cohort**         | The set of talents registered for an event, filtered by visible statuses.                                                       | `CampaignMember` rows for the `Campaign` |

---

## Salesforce Member Statuses

These values arrive from the worker sync and are stored in `Participation.sfMemberStatus`.
The dev workspace never prints them; an admin sees the raw word in « Membres Salesforce » and in the event configuration.

**Which statuses the dev workspace shows is configuration, set per event, never code** (#371). Three pieces of data hold it:

| Term                   | Meaning                                                                                                                            | Where                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Status catalogue**   | The words Jump knows. A word missing from it is _unrecognised_.                                                                    | `Sync_MemberStatus`, written by `write_sync_member_status` and from « Membres Salesforce »            |
| **Shown statuses**     | The words one event's dev workspace shows. Copied from a template, seeded at creation from the catalogue's `shownByDefault` words. | `EventConfig_ShownStatus`, written by `write_event_config`, `bulk_event_config` and the config wizard |
| **Shown in dev space** | Whether one enrolment is shown: its status against its event's shown statuses.                                                     | `Participation.shownInDevSpace`, a projection                                                         |

The vocabulary at the time of the switch, and what a new event shows:

| Salesforce Value | Business Meaning                                                         | Shown by default on a new event                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `READY`          | Talent confirmed attendance                                              | Yes                                                                                                                                                                                                       |
| `MET`            | Talent attended the event                                                | Yes                                                                                                                                                                                                       |
| `CONNECTED`      | Talent clicked Salesforce link but did not confirm                       | No (Coding Clubs typically show it)                                                                                                                                                                       |
| `DESISTED`       | Talent explicitly withdrew                                               | No                                                                                                                                                                                                        |
| any other value  | A word missing from the catalogue (Salesforce added or renamed a status) | Never shown on any event, as a precaution. Counted and located by `stats_sync_health` and the weekly digest, flagged in « Membres Salesforce ». Adding it to the catalogue is what lets an event show it. |
| `null` (legacy)  | Row synced prior to `sfMemberStatus` field introduction                  | Always shown, on every event                                                                                                                                                                              |

A masked enrolment is never missing from Jump: only the dev workspace leaves it out. Say "affichée dans l'espace dev" for the shown count, never "dans Jump", and give the masked count beside it when an answer has one.

Rules over that data: `frontend/src/lib/domain/sfMemberStatus.ts`. Its writer: `frontend/src/lib/server/services/devSpaceVisibility.ts`.

---

## Participation vs Émargement

These two concepts are distinct and must not be confused in code or documentation. A Salesforce status says nothing about presence in Jump: no screen, figure or export reads `MET` as « présent » or `READY` as « absent ».

| Concept           | Definition                                                                                                                                                                                                                | Data Source            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Participation** | The fact that a talent is enrolled in an event (originates from Salesforce via worker). `Participation` entity in DB.                                                                                                     | Salesforce sync worker |
| **Émargement**    | Real-time attendance tracking during the event, entered by staff inside Jump. `EventPresence` entity in DB. The only presence record in Jump, independent of SF statuses: an unmarked cell in a closed slot reads absent. | Staff entry in Jump    |

---

## Workspaces & Audiences

| Workspace  | Route           | Target Audience      | UI Copy Register & Tone      |
| ---------- | --------------- | -------------------- | ---------------------------- |
| **Dev**    | `/staff/dev/`   | Staff dev / superdev | _*vous*_, clean, functional  |
| **Admin**  | `/staff/admin/` | Staff admin          | _*vous*_, stats, operational |
| **Talent** | `(talent)/`     | High-school students | _*tu*_, welcoming, gamified  |
| **Parent** | `(parent)/`     | Legal guardians      | _*vous*_, formal             |

---

## Common Terminology Pitfalls

| ❌ Do Not Say                          | ✅ Use Instead                          | Reason                                                                                            |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Dev" referring to a developer         | "Software engineer" or their first name | "Dev" refers specifically to the Business Dev role in Jump                                        |
| "Participant" for a specific stagiaire | Event's configured `cohortNoun`         | Cohort noun depends on event type and is configurable                                             |
| "Status" without qualification         | "SF status" vs "Dossier status"         | Two statuses co-exist: Salesforce status vs talent file completion status (charter, image rights) |
| "Sync" without qualification           | "Salesforce sync" vs "Worker sync"      | Multiple sync processes exist (talents, events, campuses)                                         |
