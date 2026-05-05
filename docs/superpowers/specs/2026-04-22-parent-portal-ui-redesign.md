# Parent Portal UI Redesign — Design Spec

**Goal:** Rework the parent portal UI so it clearly serves parents following their child's activity, not participants doing activities themselves. Apply emotional design with a reassuring/institutional tone.

**Scope:** Dashboard (`/parent`) and child detail page (`/parent/enfant/[talentId]`). Server logic unchanged — this is a frontend-only rework.

---

## Principles

- **Tone:** Reassuring / institutional — "your child is in good hands"
- **Greeting:** "Bonjour, M./Mme {lastName}" (extracted from `user.name`, fallback to full name)
- **Perspective:** Everything is phrased from the parent's point of view ("Votre enfant participera à...", "Alice était présente")
- **Explicit statuses:** Every visual indicator (badge, icon, color) MUST have an accompanying text label. No color-only communication. A parent should never have to guess what a symbol means.
- **Emotional design:** Clear status badges (green = all good, amber = action needed), consistent icons, subtle fly animations, generous spacing

---

## Name extraction logic

Extract last name from `locals.user.name` server-side and pass to pages:

```
"Sophie Martin" → lastName = "Martin"
"Sophie" → lastName = "Sophie" (fallback)
```

Logic: `name.split(' ').slice(1).join(' ') || name`

Both `+page.server.ts` files already return `parentName`. Add `parentLastName` alongside it.

---

## Dashboard — `/parent` (+page.svelte)

### Header
- **Before:** "Bonjour, Sophie !"
- **After:** "Bonjour, M./Mme Martin"
- **Subtitle:** "Espace de suivi parental" (instead of "Suivez la progression de vos enfants.")

### Child cards
- Keep: child name, next event, image rights badge
- Reformulate event count: "X événement(s) suivi(s)" → "X événement(s) au programme"
- Next event context: "Prochain rendez-vous le {date}" (instead of just the event name)
- No event: "Pas d'événement prévu pour le moment"

### Empty state
- Unchanged (already appropriate)

---

## Child detail page — `/parent/enfant/[talentId]` (+page.svelte)

### Header
- **Before:** "Bonjour, Sophie !" / "Suivi de Alice Martin"
- **After:** "Bonjour, M./Mme Martin" / "Suivi de votre enfant Alice Martin"

### Today's planning section
- **Title:** "Programme du jour pour Alice" (instead of "Programme du jour")
- Add intro context: "Votre enfant participe aujourd'hui à {event.titre}"
- Keep time slots with activities (type, difficulty) — parents want to know what their child does today
- Keep existing visual structure (timeline with border-left)

### Upcoming events section
- **Title:** "Prochains événements d'Alice" (instead of "À venir")
- Add badge count: "X événement(s) à venir"
- Keep collapsible activity detail
- Reformulate context: activities shown as what the child will participate in

### History section
- **Title:** "Événements passés" (instead of "Historique")
- **Explicit status labels** — every participation shows icon + text:

| Status | Icon | Color | Text |
|--------|------|-------|------|
| Present | Check | Green | "Présent(e)" |
| Absent | X | Red | "Absent(e)" |
| Late | Clock | Amber | "En retard — {minutes} min" |

- Text is always visible inline, never hidden in a tooltip
- Keep collapsible activity detail per event
- Empty state: "Aucun événement passé pour le moment"

### Image rights banner
- Unchanged (amber tone already appropriate and well-designed)

---

## What does NOT change

- Page structure (no shared layout header — each page manages its own)
- `+page.server.ts` files (data stays the same, only add `parentLastName`)
- Collapsible components for activity detail
- Signature page (`/parent/signature`)
- Login page (`/parent/login`)
- Route guards and auth logic

---

## Data changes required

Both `+page.server.ts` files need to compute and return `parentLastName`:

```typescript
const parentName = locals.user.name ?? '';
const parentLastName = parentName.split(' ').slice(1).join(' ') || parentName;

return {
  parentName,
  parentLastName,
  // ... rest unchanged
};
```

The `delay` field (Int?, minutes) on the `Participation` model is already available. Need to include it in the history data mapping for the late status display. A participation is "late" when `isPresent === true && delay > 0`.
