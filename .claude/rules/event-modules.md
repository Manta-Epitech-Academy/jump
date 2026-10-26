---
paths:
  - "frontend/src/lib/domain/{eventModules,devWorkspace,diplomas,eventCategory}.ts"
  - "frontend/src/lib/components/events/{EventConfigWizard,EventModuleIcon,EventModulesCell,EventCategoryChip}.svelte"
  - "frontend/src/lib/server/services/{eventConfigTemplates,eventCategories,diplomaGenerator}.ts"
  - "frontend/src/lib/server/{diplomaSanitize,diplomaTemplates}.ts"
  - "frontend/src/lib/server/infra/documentRenderer.ts"
  - "frontend/src/lib/server/templates/certificate.html"
  - "frontend/src/lib/server/adminApi/writes/{diplomas,events,eventCategories}.ts"
  - "frontend/src/routes/api/admin/**/diploma-*/**"
  - "frontend/src/lib/server/services/stageContext.ts"
  - "frontend/src/routes/**/dev/events/**"
---

# Event modules

Dev surfaces are enabled **per event**, not per campus. There is no feature-flag
subsystem: the per-campus `CampusFeatureFlag` table, `domain/featureFlags.ts`,
`requireFlag` and `locals.featureFlags` were all removed in favour of this.

- **Catalogue:** `EVENT_MODULES` / `EVENT_MODULE_DEFS` in `src/lib/domain/eventModules.ts`.
- **Storage:** one `EventConfig_Module` row per `(eventId, moduleKey)`, with an optional `settings` Json bag validated app-side by a per-module Zod schema. Typed FKs (e.g. `Event.feedbackFormId`) stay columns on `Event`, never in the bag.
- **Presets:** `EventConfig_Template` is a named, point-in-time seed applied by the config wizard. Applying one copies modules + settings; there is no live link afterwards. A preset carries a feedback form, a closing grid or a certificate only for the section that uses it (bilan, closings, inscrits): `saveTemplate` drops the rest for the wizard and `write_event_template` alike, since an event may keep a reference whose section is off and a preset copying it attached one nobody chose.
- **Routing:** `reachableSurfaces` / `landingSurface` decide which surface the dev dashboard lands on.
- **Gate:** a dev event route loads its event with `loadEventOr404(eventId, campusId, surface)`, so the module that gates it is an argument the compiler asks for, not a second call. It used to be one (`requireEventModule`), and four endpoints forgot it: both exports and both émargement QR codes answered for an event whose section was off. A data gate (a feedback form, a closing grid, a certificate design, a schedule) stays in the route's own load. The one write outside the dev space, a talent scanning the émargement code (`(talent)/presence/[token]`), follows both rules on its side: the section on, the talent on the shown roster.
- **Roster:** whatever a dev event surface lists, counts, prints or exports is the cohort the dev space shows, so every enrolment read there spreads `visibleParticipationWhere`, and the bilan's answers are read through `shownCohortOf` (`feedbackStats.ts`), which applies it on each answer's enrolment. Six forgot it (certificates, badges, both exports, the bilan denominator, the bilan's figures and export) and printed or shipped withdrawn talents the screen never listed; `sfMemberStatus.test.ts` now fails on such a read, with no exception: a closing that outlives its enrolment stays reachable through its own record, never through an unfiltered enrolment read.
- **A document an event issues is a nullable FK on `Event`, never a sub-option.** `Event.diplomaTemplateId` names which certificate the Inscrits export renders, and `null` means it issues none. That nullness IS the gate: there is no companion boolean, because "does this event issue one" and "which one" are the same question. It replaced exactly such a boolean (`inscrits.diplomas`), which could only ever turn the one hardcoded document on or off.

  The certificate itself is a `Diploma_Template` row whose CSS and markup are **authored at runtime** over the API, because the set of documents grows with the business and their wording belongs to the team, not to a developer. Two consequences worth stating. **A stored design is outside the `DESIGN.md` contract**, which guards code: `lint:design` cannot see it, and that is an accepted trade, not an oversight. And **the shell is not**: `templates/certificate.html` keeps the pagination and the once-in-`<head>` hoisting of logo, signature and font bytes, because repeating those per page is what timed out a 200-page render. **An ornament is inline SVG in the markup, never shapes built in CSS**: SVG reaches the brand fonts, costs a few hundred bytes a page, and is what a model writes untaught, whereas the CSS tricks it replaced (clip-path polygons, tiled gradients in rotated boxes) cost tokens to write and one of them was rasterised on every printed page. Since a stored design is handed to a real Chrome inside the cluster, `server/diplomaSanitize.ts` screens it, refusing exactly what its sanitiser would remove so a design is stored as written or not at all, and `infra/documentRenderer.ts` renders it with script execution and the network both off. The script switch is the one that actually contains the damage, and the two are not interchangeable: Puppeteer's request interception never sees a `ws://` handshake, so a design that got as far as running could still reach every internal service the pod reaches.

- **A category is display, never a switch.** `Event.categoryKey` names a row of `EventConfig_Category` (Coding Club, Stage, Camp...), which the campus calendar colours and filters by and a badge rule counts by, and nothing else may read. That is the whole difference from the `eventType` retired in July 2026, which screens branched on: a rule that wants to change a page for one kind of event is asking for a module. The catalogue is authored over the API (`write_event_category`), with no migration per kind and no admin screen; a preset carries a default, copied on apply like the cohort noun. It is **archived, never deleted**: an archived category is no longer given to an event, and one that carries it keeps it and shows it (`updateEventConfig` holds that for the wizard and `write_event_config` alike, so echoing a read back is accepted). Its colour is any `#rrggbb` the team picks, outside the `DESIGN.md` palette on purpose: a closed list of the four brand accents was weighed first and dropped, because the mockup's first four kinds already spend all four and the calendar needs one colour per kind. Legibility is the screen's job, never a refusal at write: `EventCategoryChip` borders its swatch so a near-white one still shows, and text painted on a category fill derives its colour from the fill.

Don't hardcode module keys.
