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

| Term in Jump         | Definition & Context                                                                                                                                                                                                                                                                                                                                            | Salesforce Term                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Event**            | An instance of an Epitech Academy activity (stage, coding club, open house...). Core entity of Jump.                                                                                                                                                                                                                                                            | `Campaign`                               |
| **Stage**            | Multi-week internship event. Its cohort noun is _stagiaires_.                                                                                                                                                                                                                                                                                                   | `Campaign` of type stage                 |
| **Coding Club**      | Single-day recurring event. Its cohort noun is _participants_.                                                                                                                                                                                                                                                                                                  | `Campaign` of type club                  |
| **Activation dev**   | Action where an admin makes an event visible to everyone but admins: the dev space, its talents and their parents (`devActivatedAt != null` with at least one section, `shownEventWhere`). Nothing else shows an event, and the admin API reads them all.                                                                                                       | -                                        |
| **Public name**      | Clean user-facing title of an event (e.g., "Stage Web Été 2026"), distinct from raw Salesforce title. Field `Event.publicName`.                                                                                                                                                                                                                                 | -                                        |
| **Cohort**           | The set of talents registered for an event, filtered by visible statuses.                                                                                                                                                                                                                                                                                       | `CampaignMember` rows for the `Campaign` |
| **Catégorie**        | The kind of event (Coding Club, Stage, Camp...), for the campus calendar, the talent's parcours and badge rules only: nothing else changes with it, the modules stay the switch of an event's pages. An open list authored over the admin API, archived rather than deleted. Not the retired `eventType`. Field `Event.categoryKey`.                            | -                                        |
| **Événement clé**    | A category marked `keyEvent`: a format that weighs in a talent's journey (the stage de seconde). Its events carry a star in the talent's parcours. Display only, like the category's colour.                                                                                                                                                                    | -                                        |
| **Sujet**            | An online activity (`Workshop_Activity`) as the dev space's catalogue presents it to the staff: its name, tagline, picture, level, notions and domains. Shown only once complete; `config_workshops` says what one lacks. The steps themselves stay in CTFd.                                                                                                    | -                                        |
| **Domaine**          | A field a subject is filed under (Cybersécurité, IA/DATA...), what the catalogue filters by and what domain badges count by. An open list authored over the admin API, archived rather than deleted. Model `Workshop_Domain`.                                                                                                                                   | -                                        |
| **Code superviseur** | The code a CTFd instance asks for on its `/supervisor/join` page, where the people running the room make their supervisor account. One per instance, so every subject it serves shows the same one on its catalogue card. Copied into Jump by the declaration call the instance's `/admin/workshop/jump` page prints. Field `Workshop_Instance.supervisorCode`. | -                                        |

---

## Salesforce Member Statuses

These values arrive from the worker sync and are stored in `Participation.sfMemberStatus`.
The dev workspace never prints them; an admin sees the raw word in « Membres Salesforce » and in the event configuration.

**Which statuses the dev workspace shows is configuration, set per event, never code** (#371). Three pieces of data hold it:

| Term                   | Meaning                                                                                                                            | Where                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Status catalogue**   | The words Jump knows. A word missing from it is _unrecognised_.                                                                    | `Sync_MemberStatus`, written by `write_sync_member_status`                                  |
| **Shown statuses**     | The words one event's dev workspace shows. Copied from a template, seeded at creation from the catalogue's `shownByDefault` words. | `EventConfig_ShownStatus`, written by `write_event_config` and `bulk_event_config`          |
| **Attending statuses** | Among the shown words, those one event counts as a visit (MET; « 4 - En stage » on a stage). Seeded from `attestsByDefault`.       | `EventConfig_ShownStatus.attestsAttendance`, written by the same two (`attendanceStatuses`) |
| **Shown in dev space** | Whether one enrolment is shown: its status against its event's shown statuses.                                                     | `Participation.shownInDevSpace`, a projection                                               |

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

These three concepts are distinct and must not be confused in code or documentation. No Salesforce word means anything by itself: an event says which of its words count as a visit, and none ever reads as « absent ».

| Concept           | Definition                                                                                                                                                                                                                                                                                                                                              | Data Source             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Participation** | The fact that a talent is enrolled in an event (originates from Salesforce via worker). `Participation` entity in DB.                                                                                                                                                                                                                                   | Salesforce sync worker  |
| **Venu**          | The talent came to an event that is over: one proof is enough (an attending status, an émargement present or late, a closing; never an activity, done from anywhere), and its absence proves nothing. What « Déjà venu 3 fois » and « Nouveau » count. `Participation.attendanceAttested`, read through `attendedBeforeWhere` (`domain/attendance.ts`). | Projection of the three |
| **Émargement**    | Real-time attendance tracking during the event, entered by staff inside Jump. `EventPresence` entity in DB. Jump's half-day presence record: an unmarked cell in a closed slot reads absent there, and only there.                                                                                                                                      | Staff entry in Jump     |

---

## Workspaces & Audiences

| Workspace  | Route           | Target Audience      | UI Copy Register & Tone      |
| ---------- | --------------- | -------------------- | ---------------------------- |
| **Dev**    | `/staff/dev/`   | Staff dev / superdev | _*vous*_, clean, functional  |
| **Admin**  | `/staff/admin/` | Staff admin          | _*vous*_, stats, operational |
| **Talent** | `(talent)/`     | High-school students | _*tu*_, welcoming, gamified  |
| **Parent** | `(parent)/`     | Legal guardians      | _*vous*_, formal             |

---

## Talent Space

| Term in Jump            | Definition & Context                                                                                                                                                          | Model / Code                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **EpiDuck**             | The blue duck in every talent header, Jump's one mascot. Each talent names and dresses their own, and he hosts their questionnaires. Replaced « Bernard le canard » (#539).   | `Talent.mascot*`, `components/mascot/` |
| **Moment** (du canard)  | A point where EpiDuck speaks (a tap, the hello on arrival, going to sleep...). A closed list in code; what he says at each one is data the PO writes.                         | `MASCOT_MOMENTS`, `Mascot_Line`        |
| **Badge**               | What a talent earns on their journey when a counter of theirs reaches a rule (« A participé à 5 Coding Clubs »), kept for good. Data the PO writes over the admin API (#448). | `Badge_Definition`, `Badge_Award`      |
| **Compteur** (de badge) | What a badge rule counts (XP, visits, finished activities, first places at the daily game...), with the filters it takes. A closed list in code.                              | `BADGE_COUNTERS`                       |
| **Epidex**              | A talent's badge collection on Mon parcours, the mockup's name for it: every badge, earned ones in colour, the others as silhouettes. A click asks EpiDuck about one (#551).  | `EpidexCard`, `loadBadgeCollection`    |

---

## Common Terminology Pitfalls

| ❌ Do Not Say                          | ✅ Use Instead                          | Reason                                                                                            |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Dev" referring to a developer         | "Software engineer" or their first name | "Dev" refers specifically to the Business Dev role in Jump                                        |
| "Participant" for a specific stagiaire | Event's configured `cohortNoun`         | Cohort noun depends on event type and is configurable                                             |
| "Status" without qualification         | "SF status" vs "Dossier status"         | Two statuses co-exist: Salesforce status vs talent file completion status (charter, image rights) |
| "Sync" without qualification           | "Salesforce sync" vs "Worker sync"      | Multiple sync processes exist (talents, events, campuses)                                         |
| "Badge" on an event's page             | "Badge nominatif" (`badges.pdf`)        | The printed name badges of an event are not the badges a talent earns on their journey            |
