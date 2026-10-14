---
paths:
  - "frontend/src/lib/domain/{eventModules,devWorkspace,diplomas}.ts"
  - "frontend/src/lib/components/events/{EventConfigWizard,EventModuleIcon,EventModulesCell}.svelte"
  - "frontend/src/lib/server/services/{eventConfigTemplates,diplomaGenerator}.ts"
  - "frontend/src/lib/server/{diplomaSanitize,diplomaTemplates}.ts"
  - "frontend/src/lib/server/infra/documentRenderer.ts"
  - "frontend/src/lib/server/templates/certificate.html"
  - "frontend/src/lib/server/adminApi/writes/{diplomas,events}.ts"
  - "frontend/src/routes/api/admin/**/diploma-*/**"
---

# Event modules

Dev surfaces are enabled **per event**, not per campus. There is no feature-flag
subsystem: the per-campus `CampusFeatureFlag` table, `domain/featureFlags.ts`,
`requireFlag` and `locals.featureFlags` were all removed in favour of this.

- **Catalogue:** `EVENT_MODULES` / `EVENT_MODULE_DEFS` in `src/lib/domain/eventModules.ts`.
- **Storage:** one `EventConfig_Module` row per `(eventId, moduleKey)`, with an optional `settings` Json bag validated app-side by a per-module Zod schema. Typed FKs (e.g. `Event.feedbackFormId`) stay columns on `Event`, never in the bag.
- **Presets:** `EventConfig_Template` is a named, point-in-time seed applied by the config wizard. Applying one copies modules + settings; there is no live link afterwards.
- **Routing:** `reachableSurfaces` / `firstReachableSurface` decide which surface the dev dashboard lands on.
- **A document an event issues is a nullable FK on `Event`, never a sub-option.** `Event.diplomaTemplateId` names which certificate the Inscrits export renders, and `null` means it issues none. That nullness IS the gate: there is no companion boolean, because "does this event issue one" and "which one" are the same question. It replaced exactly such a boolean (`inscrits.diplomas`), which could only ever turn the one hardcoded document on or off.

  The certificate itself is a `Diploma_Template` row whose CSS and markup are **authored at runtime** over the API, because the set of documents grows with the business and their wording belongs to the team, not to a developer. Two consequences worth stating. **A stored design is outside the `DESIGN.md` contract**, which guards code: `lint:design` cannot see it, and that is an accepted trade, not an oversight. And **the shell is not**: `templates/certificate.html` keeps the pagination and the once-in-`<head>` hoisting of logo, signature and font bytes, because repeating those per page is what timed out a 200-page render. **An ornament is inline SVG in the markup, never shapes built in CSS**: SVG reaches the brand fonts, costs a few hundred bytes a page, and is what a model writes untaught, whereas the CSS tricks it replaced (clip-path polygons, tiled gradients in rotated boxes) cost tokens to write and one of them was rasterised on every printed page. Since a stored design is handed to a real Chrome inside the cluster, `server/diplomaSanitize.ts` screens it, refusing exactly what its sanitiser would remove so a design is stored as written or not at all, and `infra/documentRenderer.ts` renders it with script execution and the network both off. The script switch is the one that actually contains the damage, and the two are not interchangeable: Puppeteer's request interception never sees a `ws://` handshake, so a design that got as far as running could still reach every internal service the pod reaches.

Don't hardcode module keys.
