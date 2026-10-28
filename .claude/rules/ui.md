---
paths:
  - "frontend/src/**/*.svelte"
  - "frontend/src/lib/components/**"
  - "frontend/src/routes/layout.css"
---

# UI conventions

Read [`DESIGN.md`](../../DESIGN.md) at the repo root before any visual work: it is the visual contract (tokens, per-space skins, brand primitives, and the argument behind every deviation from the charte). Two guards enforce it and both fail the build: `bun run test` checks the token values and every documented contrast pair against `frontend/src/routes/layout.css`, and `bun run lint:design` refuses an off-palette class.

- **Styling:** Tailwind utility classes only, no inline styles. A value only the data knows (an authored colour, a picture's own size) is passed as a custom property, set with `style:--name` and read by a class (`bg-[var(--name)]`), as `EventCategoryChip` and `CopiedPicture` do.

- **UI components:** always use the shadcn-style components in `src/lib/components/ui/` (Tooltip, Select, Breadcrumb, Dialog...) instead of native HTML equivalents (`title=` attributes, bare `<select>`). If a needed component isn't there yet, add it via shadcn-svelte rather than hand-rolling one.

- **Cursor affordance:** every clickable element gets `cursor-pointer`, including items inside custom selects, dropdowns, and date pickers. This is the most-missed detail in reviews; check it before presenting UI work.

- **UI & Interaction Skills:** Optional design skills live in `.claude/skills/`:
  - `impeccable` (`.claude/skills/impeccable/SKILL.md`): UX audit, spacing, contrast, and anti-slop review.
  - `emil-design-eng` (`.claude/skills/emil-design-eng/SKILL.md`): interaction design, spring physics, and micro-animations.
    `DESIGN.md` and the existing shadcn-svelte components in `src/lib/components/ui/` remain the absolute source of truth: skills must never introduce out-of-palette colors or ad-hoc raw HTML replacements for standard UI components.

- **Copy density: a control gets one line, the rest goes behind a ⓘ.** A screen is read to be acted on, so a sentence that does not change what the person clicks pushes the control that does further down, and past a few of those they stop reading the ones that mattered too. The order to apply, in this order:

  1. **Cut.** An enumeration that only illustrates a choice its own title already makes ("Chiffres de pilotage seulement, en lecture" does not need four examples) is deleted, not relocated. Hiding noise still costs the reader a hover to find out it was noise.
  2. **One visible line.** Whatever is left on a control is the single fact that changes the decision at the moment it is taken, typically an irreversibility ("Choix définitif : un token créé en lecture seule le reste.").
  3. **`InfoTooltip` for the rest** (`$lib/components/ui/info-tooltip`, ⓘ next to the label it belongs to): rationale, quotas, audit guarantees, "why we ask". Reachable when wanted, invisible otherwise. `KpiTile`'s `helpText` on `/staff/admin/events` is the reference use.
  4. **`Collapsible`, never a tooltip, for text somebody must be able to read and re-read**: terms a checkbox commits to, the consequences of a destructive action. Hover is not a reading surface, and it is not a place to put something a person is agreeing to.

  This is the most-repeated review finding on staff dialogs and admin pages: prose accumulates one well-meant clarification at a time, and nobody deletes any of it. The `/staff/admin/api-tokens` page is the worked example (header, tier cards, write toggle, conditions, list).

- **An empty state says what will be there, not only that nothing is.** It is the moment someone decides whether they have something to do or only have to wait, so each of its four kinds has its own sentence:

  1. **Nothing yet** (no note, no inscrit): what will appear and where it comes from, plus why it matters for the talent when that is not obvious. The control that fills the space is already on the screen: name it rather than drawing a second one.
  2. **A filter matched nothing:** `SortableTable` says it and offers the reset (`onResetFilters`).
  3. **Not applicable** (no phone, no recommendation question): the fact, short.
  4. **Failed to load:** what failed and what to do next.

  A list, or the whole body of a card or a dialog, gets `ResultsNotice` (`compact` inside a card or a dialog), never a bare italic sentence. The event home's cards are the one exception: `HomeCard` draws its own, as the 2027 mockup does. A missing value on one line among others (a field, a table cell, one entry of a rail) stays a muted line or `-`. The same state reads the same everywhere: an event with no one shown is `EmptyCohortNotice`, on every one of its pages.

- **A list whose length comes from data scrolls in its own box.** Any `{#each}` over rows the database decides the count of gets a bounded, scrollable region: `max-h-[40svh] overflow-y-auto` on the list, and the dialog or card keeps its own `max-h-[90svh] overflow-y-auto` as the floor for short viewports. Viewport-relative, not a pixel cap, so the box grows with the screen instead of leaving a letterbox on a laptop.

  The tell is not "is it long today", it is **who decides how many rows there are**. A fixed catalogue rendered from a constant is bounded by the code and needs nothing. A ledger, an append-only log, an inventory, a feed or anything with a revoked/archived tail is bounded by nothing and only ever grows, so it is already wrong the day it ships even while it looks fine.

  This bites hardest in a dialog, which is why it is worth stating: a dialog is centred and translated, so a list that outgrows the viewport does not simply push the page down, it pushes its own form and buttons off both edges where nothing can reach them. Scrolling **the list** rather than the whole dialog is what keeps the form on screen; scrolling the whole dialog only stops the clipping.

  Precedents to copy rather than re-invent: `TalentXpDetailDialog` (cap on the `<ul>`), `TalentNotesFeed` (the cap as a prop, so the host screen sets it), `AdminSfStatusInspectorDialog` (`flex flex-col` + `min-h-0 flex-1 overflow-y-auto` when the dialog is a full-height shell with its own header and footer).

  Pagination, search or a dedicated page are a different decision and belong to volume, not to this rule: bound the region first, and reach for those only when the count genuinely justifies them.

- **Layout canon:** the dev-space **inscrits** page (`/staff/dev/events/[id]/inscrits`) is the reference for staff list pages: its toolbar, header filters and chips row, table, spacing, and empty states. New staff pages mirror it unless told otherwise.

- **Visual identity: [`DESIGN.md`](../../DESIGN.md) at the repo root is the contract** (see above). Colors, type, radii, spacing, elevation, motion, the per-space skins, and the brand primitives (`_`, `< />`, `{ }`, the blueprint grid) all live there, with the rationale for every deviation from the charte. Do not restate its values here. `frontend/src/routes/layout.css` is its single implementation, and two guards keep the two in step: `bun run test` (token values and contrast) and `bun run lint:design` (forbidden classes). The raw charte lives at `~/Downloads/Epitech Design System` (brand assets, the source PDF): use it for logos and photography instead of approximating, and treat its `sales/` and `eso/` mockups as tone reference only, per `DESIGN.md`.

- **Component naming:** PascalCase, domain-scoped in subfolders (`components/events/`, `components/students/`).

- **Staff filter controls:** Pick by list shape, do not default to a plain dropdown. Up to four inline choices → `SegmentedFilter`, and the ceiling is a rule rather than a taste: a fifth option is the point where the group stops being readable at a glance, which is the only thing a segmented control buys over a select. A short, known list too wide to sit inline → `FilterSelect`. A long, typeable list (campuses, lycées, talents, games) → `SearchableSelect` (built-in search box; renders its own `'all'` sentinel, so leave it out of `options`). A multi-value facet over a column of a cohort table (niveau, lycée, genre on a roster) → a filter in that column's header (`ColumnDef.filter`), the way the PO's 2027 mockup draws the Inscrits page: it sits where the eye reads the value, and the table's card drawer carries it on narrow screens. A facet worth filtering on but not worth a column on every row is filtered on the page that owns it (a closing's state on Closings, a recommendation on Feedback), never by an extra column: the Inscrits page grew three such columns and had to scroll sideways. A column offers one control, a sort or a filter, never both: two affordances per header is what made the Inscrits roster feel cramped next to the mockup, which sorts the names and the XP and filters everything else. The rationale lives in the `FilterSelect`/`SearchableSelect` doc comments. A campus filter on a plain `FilterSelect` is the classic miss.

- **Lucide icons:** Always import per-icon, never the barrel. Barrel imports drag every icon through Vite's dev resolver and tank cold-start (~9s → ~3s on this codebase). If you slip, run `bun scripts/codemod-lucide-imports.ts` to auto-rewrite.

  ```ts
  // ✅ correct
  import Trash2 from "@lucide/svelte/icons/trash-2";

  // ❌ wrong: barrel import
  import { Trash2 } from "@lucide/svelte";
  ```
