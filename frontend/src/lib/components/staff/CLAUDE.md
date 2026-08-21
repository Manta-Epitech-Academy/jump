# Staff cohort tables

Two hard-won contracts govern every staff list page over cohort volume (~200 rows). Both were
performance regressions that shipped once; do not reintroduce either shape.

## Streaming heavy staff tables

The dev stage-seconde pages (`inscrits`, `émargement`, `entretiens`) and admin `sf-conflicts` stream their cohort. The `load` awaits only cheap shell data (event, countdown, filter chips) and returns the heavy cohort as a single **un-awaited promise**; the page renders its shell instantly and resolves the results region from that promise, showing the shared `ResultsSkeleton` (`$lib/components/staff/ResultsSkeleton.svelte`) until it lands. Follow this for any new staff table over cohort volume (~200 rows): do not `await` the heavy query in `load`, or you block the client navigation on it (the felt-2s "dead click").

- **Plain `{#await data.cohort}`** for read-only pages (inscrits, entretiens, sf-conflicts).
- **Resolve the promise into `$state` instead** when the page polls or writes optimistically (émargement). Binding `{#await}` directly there means every `invalidate` / optimistic write builds a fresh promise, which reflashes the skeleton and remounts the child, wiping its local state (search, optimistic overrides). Resolve `data.cohort` into a `$state` with a stale-promise guard (`if (data.cohort === p)`) so later polls swap data silently with the child still mounted.
- **Keep SSR on.** Streaming renders the shell server-side and flushes the cohort over the same response; the win is a fast first paint of the chrome, not a blank-until-JS page. Do not reach for `export const ssr = false` to "simplify" - it regresses first paint and buys nothing here.
- `ResultsSkeleton` is **delay-gated** (held invisible ~180ms, height reserved) so warm navigations swap straight to content without a skeleton flash; only genuinely slow loads fade it in. Reuse it, do not hand-roll per-page pending markup.

## SortableTable renders one layout

`SortableTable` (`$lib/components/staff/datatable/`) renders **either** the desktop table **or** the `mobileRow` cards, gated by a `MediaQuery` (lg seam) plus a mount guard, never both at once. Do not reintroduce a CSS-toggled (`hidden lg:block` / `lg:hidden`) dual render: it builds and hydrates every row twice (2x DOM nodes, 2x avatars) and was the main client-side render cost on these tables. Pages without a `mobileRow` snippet always render the desktop table (unchanged).

Column headers get their treatment from `Table.Head`, not from the page: it carries the mono overline, so a sentence-case header is not a variant to reach for. `TalentAvatar` draws its monogram locally; it used to fetch one per row from a third party, which sent a minor's id off-site and cost a request each time.
