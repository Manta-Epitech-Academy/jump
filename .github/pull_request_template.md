## Context

Closes #

<!-- One or two sentences on why this change exists. Link the issue above; the `Work item` check
     requires the `Closes #<issue>` line and reads the number off the branch name. -->

## Summary

-

## Test plan

- [ ]

## Definition of Done

This checklist is the canonical one, referenced by `CONTRIBUTING.md` step 6. Tick it before marking
the PR ready for review.

- [ ] **Technical:** `bun run check` 0 errors 0 warnings, `bun run lint` clean, `bun run lint:design` clean, migration named and squashed into one.
- [ ] **Automated testing:** new behaviours are covered by unit, integration or Playwright tests, not by manual testing alone. Human verification is welcome for visual polish, but core functional contracts need automated coverage.
- [ ] **Schema changes:** verified against a real PostgreSQL database (`bunx prisma db push` or `bun run test:integration`), because unit tests mock the database layer.
- [ ] **Space conventions:** rounded corners, title colors, button placement; square dialogs in the dev space, rounded in the talent space; `cursor-pointer` on every interactive element; existing UI components reused.
- [ ] **Audience:** admin space is operational and direct, dev space is functional with no XP tiers or confetti, talent space is welcoming and gamified.
- [ ] **Copy:** *vous* for staff, *tu* for talents, no developer jargon in UI strings (see `JARGON.md`), no em-dashes.
- [ ] **Responsive:** tested on desktop, an average laptop, and mobile.
- [ ] **List filter controls:** campuses, high schools and long typeable lists use `SearchableSelect`, never a plain `<select>`.
- [ ] **Data-length lists:** any list whose row count the database decides scrolls in its own bounded box.
- [ ] **No UI duplication:** no near-identical component cloned instead of reused.
- [ ] **Sound domain decisions:** no technical choice that violates a real business need (for example, no IP-based rate limiting on shared campus networks).

<!-- Only if this PR carries the `no-issue` label, keep the section below and say why the issue-first
     rule does not apply. Otherwise delete it.

## Process exception

-->
