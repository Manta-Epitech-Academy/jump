# Feedback Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the WhatsApp-style feedback conversation into Jump's talent space, with admin dashboard for results.

**Architecture:** Form schemas defined in JSON (w1/w2), conversation state machine drives the chat UI, answers stored as JSON in a `FeedbackSubmission` table. Talent dashboard shows a banner when feedback is due. Admin dashboard aggregates results.

**Tech Stack:** SvelteKit 2 (Svelte 5), Prisma 7 (PostgreSQL), Tailwind CSS 4, Superforms + Zod, existing Bits UI components.

**Spec:** `docs/specs/2026-06-09-feedback-stage-seconde.md`
**Prototype reference:** `/tmp/feedback-forms/` (extracted from `feedback-forms.tgz`)

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `prisma/migrations/YYYYMMDD_add_feedback_submission/migration.sql` | DB migration |
| `src/lib/domain/feedback.ts` | Pure domain logic: form loading, prefill, Friday deadline calc |
| `src/lib/domain/feedbackForms/w1.json` | W1 form schema (questions) |
| `src/lib/domain/feedbackForms/w2.json` | W2 form schema (questions) |
| `src/lib/domain/feedbackForms/schema.ts` | Types + validation for form schemas |
| `src/lib/domain/feedbackForms/conversation.svelte.ts` | Conversation state machine (Svelte 5 runes) |
| `src/lib/components/feedback/ChatThread.svelte` | Scrolling message list + typing indicator |
| `src/lib/components/feedback/MessageBubble.svelte` | Single chat bubble (bot/user) |
| `src/lib/components/feedback/QuickReplies.svelte` | Chip buttons for single/multiple/gate |
| `src/lib/components/feedback/ScaleRating.svelte` | Ordered scale cards with emoji |
| `src/lib/components/feedback/TextInput.svelte` | Text/textarea input in dock |
| `src/lib/components/feedback/ChatScreen.svelte` | Top-level chat frame: header + thread + dock |
| `src/lib/components/feedback/FeedbackBanner.svelte` | Dashboard banner prompting feedback |
| `src/lib/validation/feedback.ts` | Zod schema for submit action |
| `src/routes/(talent)/feedback/[eventId]/[formId]/+page.server.ts` | Load form + prefill, submit action |
| `src/routes/(talent)/feedback/[eventId]/[formId]/+page.svelte` | Chat page |
| `src/routes/(staff)/staff/admin/events/[eventId]/feedback/+page.server.ts` | Admin load: aggregate answers |
| `src/routes/(staff)/staff/admin/events/[eventId]/feedback/+page.svelte` | Admin dashboard |
| `src/routes/(staff)/staff/admin/events/[eventId]/feedback/export/+server.ts` | XLSX export |

### Modified files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `FeedbackSubmission` model + relations on `Event`, `Talent` |
| `src/routes/(talent)/+page.server.ts` | Load pending feedback deadlines for banner |
| `src/routes/(talent)/+page.svelte` | Render `FeedbackBanner` when feedback is due |

---

## Task 1: Prisma model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/prisma/migrations/<timestamp>_add_feedback_submission/migration.sql`

- [ ] **Step 1: Add FeedbackSubmission to schema.prisma**

Add after the `EventPresenceClosure` model block:

```prisma
model FeedbackSubmission {
  id        String   @id @default(cuid())
  eventId   String
  talentId  String
  formId    String
  answers   Json
  createdAt DateTime @default(now())

  event  Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  talent Talent @relation(fields: [talentId], references: [id], onDelete: Cascade)

  @@unique([eventId, talentId, formId])
  @@index([eventId, formId])
}
```

Add relation arrays on `Event` and `Talent`:
- `Event`: add `feedbackSubmissions FeedbackSubmission[]`
- `Talent`: add `feedbackSubmissions FeedbackSubmission[]`

- [ ] **Step 2: Generate and run migration**

```bash
cd frontend && bunx prisma migrate dev --name add_feedback_submission
```

- [ ] **Step 3: Verify**

```bash
bun run db:generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(feedback): add FeedbackSubmission model and migration"
```

---

## Task 2: Form schemas + domain logic

**Files:**
- Create: `frontend/src/lib/domain/feedbackForms/schema.ts`
- Create: `frontend/src/lib/domain/feedbackForms/w1.json`
- Create: `frontend/src/lib/domain/feedbackForms/w2.json`
- Create: `frontend/src/lib/domain/feedback.ts`

- [ ] **Step 1: Create schema.ts**

Port types from the prototype's `src/lib/forms/schema.ts`. Types: `QuestionType`, `InputKind`, `Question`, `FormSchema`, `AnswerValue`, `Answers`. Include `validateAnswer()` and `loadForm()` functions. Adapt `loadForm` to use static imports instead of `import.meta.glob` (only 2 forms, no need for dynamic loading):

```typescript
import w1 from './w1.json';
import w2 from './w2.json';

const FORMS: Record<string, FormSchema> = { w1, w2 };

export function loadForm(id: string): FormSchema | null {
  return FORMS[id] ?? null;
}
```

Include the `validateAnswer()` function from the prototype verbatim.

- [ ] **Step 2: Copy w1.json and w2.json**

Copy from `/tmp/feedback-forms/src/lib/forms/w1.json` and `w2.json` into `src/lib/domain/feedbackForms/`.

- [ ] **Step 3: Create feedback.ts domain logic**

Pure functions:
- `feedbackFridayDeadline(eventStart: Date, week: 1 | 2, timezone: string): Date` - computes the Friday 17h00 for W1 or W2
- `pendingFeedbackForms(eventStart: Date, timezone: string, existingFormIds: string[]): string[]` - returns which formIds (`['w1']`, `['w2']`, or `['w1','w2']`) are currently due but not yet submitted
- `buildPrefill(talent: { prenom, nom, email, phone, campus }, campusName: string): Answers` - builds the prefill map from talent profile

The Friday logic: find the first Friday >= `eventStart`, that's W1's Friday. W2's Friday = W1 + 7 days. Use `@internationalized/date` for timezone-correct comparison (same pattern as `slotClosure.ts` in the emargement feature).

- [ ] **Step 4: Commit**

```bash
git add src/lib/domain/feedbackForms/ src/lib/domain/feedback.ts
git commit -m "feat(feedback): form schemas, validation, and deadline logic"
```

---

## Task 3: Conversation state machine

**Files:**
- Create: `frontend/src/lib/domain/feedbackForms/conversation.svelte.ts`

- [ ] **Step 1: Port the Conversation class**

Port from `/tmp/feedback-forms/src/lib/stores/conversation.svelte.ts` into the new path. The class uses Svelte 5 runes (`$state`, `$effect`). Keep the same API:
- `constructor(form, prefill)`
- `start()`, `answer(value, display?)`, `current`, `isDone`, `status`, `messages`, `answers`, `error`
- Gate logic, identity skip logic, section headers

No changes needed to the logic itself, only the import path for `FormSchema`/`Question`/`Answers`/`AnswerValue`/`validateAnswer` changes from `$lib/forms/schema` to `$lib/domain/feedbackForms/schema`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/domain/feedbackForms/conversation.svelte.ts
git commit -m "feat(feedback): conversation state machine"
```

---

## Task 4: Chat UI components

**Files:**
- Create: `frontend/src/lib/components/feedback/MessageBubble.svelte`
- Create: `frontend/src/lib/components/feedback/ChatThread.svelte`
- Create: `frontend/src/lib/components/feedback/QuickReplies.svelte`
- Create: `frontend/src/lib/components/feedback/ScaleRating.svelte`
- Create: `frontend/src/lib/components/feedback/TextInput.svelte`
- Create: `frontend/src/lib/components/feedback/ChatScreen.svelte`

- [ ] **Step 1: Create MessageBubble.svelte**

Port from prototype. Replace CSS custom properties with Tailwind classes to match the talent space design system:
- Bot bubbles: `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm`
- User bubbles: `bg-epi-blue text-white rounded-2xl rounded-br-sm`
- Keep the pop animation with `prefers-reduced-motion` guard
- Timestamp: `font-mono text-[10px]`

- [ ] **Step 2: Create ChatThread.svelte**

Port from prototype's `ChatThread.svelte`. Scrolling container with auto-scroll on new messages. Renders `MessageBubble` for each message + `TypingIndicator` (three bouncing dots, inline as a simple snippet rather than a separate component). Accept an optional `replies` snippet to render choice chips inline after the last bot message.

- [ ] **Step 3: Create QuickReplies.svelte**

Port from prototype. Replace CSS with Tailwind:
- Chips: `border border-epi-blue text-epi-blue rounded-sm px-3 py-2 text-sm` (active: `bg-epi-blue text-white`)
- Validate button: `bg-epi-teal text-epi-blue font-mono text-xs font-bold uppercase rounded-sm px-4 py-2`
- Use `cn()` for conditional classes

- [ ] **Step 4: Create ScaleRating.svelte**

Port from prototype's `ScaleRating.svelte`. Read `/tmp/feedback-forms/src/lib/components/ScaleRating.svelte` and `/tmp/feedback-forms/src/lib/components/scale.ts` for the emoji mapping. Adapt to Tailwind. Each scale option is a card with emoji + label, full width, stacked vertically.

- [ ] **Step 5: Create TextInput.svelte**

Port from prototype. Use the existing `Input` and `Textarea` components from `$lib/components/ui/` instead of raw HTML inputs. Send button with `Send` lucide icon.

- [ ] **Step 6: Create ChatScreen.svelte**

Port from prototype. This is the top-level frame:
- Header bar: canard avatar + "Bernard le canard" + form title + online dot
- `ChatThread` in the middle (flex-1, overflow scroll)
- Choice replies rendered inline in the thread (via snippet)
- Text input / end screen in the dock (footer)
- End screen: "Merci pour ton retour !" + submission status + "Retour a mon espace" button (link to `/`)

Replace the PDF download with a simple "Retour a mon espace" CTA since we're in Jump (no standalone PDF needed). The submission goes through a SvelteKit form action, not a fetch to `/api/submit`.

Adapt the mascot: use the `canard.png` from the prototype (copy to `frontend/static/canard.png`).

- [ ] **Step 7: Copy mascot image**

```bash
cp /tmp/feedback-forms/canard.png frontend/static/canard.png
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/feedback/ static/canard.png
git commit -m "feat(feedback): chat UI components adapted for talent space"
```

---

## Task 5: Validation schema + talent feedback route

**Files:**
- Create: `frontend/src/lib/validation/feedback.ts`
- Create: `frontend/src/routes/(talent)/feedback/[eventId]/[formId]/+page.server.ts`
- Create: `frontend/src/routes/(talent)/feedback/[eventId]/[formId]/+page.svelte`

- [ ] **Step 1: Create validation/feedback.ts**

```typescript
import { z } from 'zod';

export const feedbackSubmitSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});
```

- [ ] **Step 2: Create +page.server.ts**

Load function:
- Require `locals.talent` (auth gate via layout)
- Validate `formId` is `'w1'` or `'w2'`, else 404
- Load the form schema via `loadForm(formId)`
- Load the event via `prisma.event.findUnique` (validate it exists and talent has a participation)
- Check if already submitted (`FeedbackSubmission` exists for this talent/event/formId) - if so, redirect to dashboard
- Build prefill from `locals.talent` + campus name
- Return `{ form, prefill, eventId, formId }`

Submit action (`default`):
- Validate with superforms + zod (`feedbackSubmitSchema`)
- Validate each answer against the form schema's questions using `validateAnswer()`
- Upsert `FeedbackSubmission` with `answers` JSON
- Return success

- [ ] **Step 3: Create +page.svelte**

- Import `ChatScreen`, pass `form` schema and `prefill` from data
- On conversation done, auto-submit via a form action (like the prototype's `$effect` pattern but using superforms `enhance`)
- Show error toast on failure
- After successful submit, show the end screen with "Retour a mon espace" link to `/`

- [ ] **Step 4: Commit**

```bash
git add src/lib/validation/feedback.ts src/routes/\(talent\)/feedback/
git commit -m "feat(feedback): talent feedback route with chat UI"
```

---

## Task 6: Dashboard banner

**Files:**
- Create: `frontend/src/lib/components/feedback/FeedbackBanner.svelte`
- Modify: `frontend/src/routes/(talent)/+page.server.ts`
- Modify: `frontend/src/routes/(talent)/+page.svelte`

- [ ] **Step 1: Create FeedbackBanner.svelte**

Props: `eventId: string`, `formId: string`, `week: 1 | 2`.

Banner design matching the talent space:
- `bg-epi-blue/10 border border-epi-blue/20 rounded-2xl p-4`
- Canard avatar (small, 32px) + text "Ton avis compte ! Donne ton feedback sur ta [1ere/2eme] semaine de stage."
- CTA button: "C'est parti !" linking to `/feedback/{eventId}/{formId}`
- Dismissible (X button), but reappears on next page load (no localStorage persistence, just hides for the session via a local `$state`)

- [ ] **Step 2: Modify +page.server.ts**

In the talent dashboard load function, add a query to determine pending feedback:
- Find the talent's active `stage_seconde` participation (if any)
- Check feature flag `stage_seconde`
- Compute which forms are due via `pendingFeedbackForms()`
- Check which have already been submitted (`FeedbackSubmission` for this talent/event)
- Return `pendingFeedback: { eventId, formId, week }[] | null`

- [ ] **Step 3: Modify +page.svelte**

Render `FeedbackBanner` at the top of the dashboard grid (before the existing content) for each pending feedback form.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/feedback/FeedbackBanner.svelte src/routes/\(talent\)/+page.server.ts src/routes/\(talent\)/+page.svelte
git commit -m "feat(feedback): dashboard banner for pending feedback"
```

---

## Task 7: Admin feedback dashboard

**Files:**
- Create: `frontend/src/routes/(staff)/staff/admin/events/[eventId]/feedback/+page.server.ts`
- Create: `frontend/src/routes/(staff)/staff/admin/events/[eventId]/feedback/+page.svelte`

- [ ] **Step 1: Create +page.server.ts**

Load function:
- Guard: admin role (check via route gates or `requireStaffGroup`)
- Load event + all `FeedbackSubmission` rows for this event
- Load participant count for the event
- Load form schemas (w1, w2)
- Aggregate answers per question: for `single`/`scale`/`gate` count by option, for `multiple` count per option, for `text`/`textarea` collect as list
- Return `{ event, forms: [{ formId, schema, submissions, participantCount, aggregated }] }`

- [ ] **Step 2: Create +page.svelte**

Admin page with vouvoiement:
- `AdminPageHeader` with title "Feedback" and event subtitle
- Tab selector: W1 / W2 (using `SegmentedFilter`)
- KPI strip: submissions count / participant count, response rate %
- Per question: card with question prompt, then distribution bars (for choice questions) or text list (for free text)
- Distribution bars: horizontal bars with option label + count + percentage, colored by epi-blue

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(staff\)/staff/admin/events/\[eventId\]/feedback/
git commit -m "feat(feedback): admin dashboard with aggregated results"
```

---

## Task 8: Admin XLSX export

**Files:**
- Create: `frontend/src/routes/(staff)/staff/admin/events/[eventId]/feedback/export/+server.ts`

- [ ] **Step 1: Create export endpoint**

GET endpoint with query params `?formId=w1&anonymized=true`:
- Guard: admin role
- Load all `FeedbackSubmission` rows for the event + formId
- Load the form schema to get question order and labels
- Build XLSX (using the same pattern as the emargement export: `@smithy/node-http-handler` or a simple CSV)
- Columns: one per question (using `question.prompt` as header), rows = submissions
- If `anonymized=false`, prepend talentId/nom/prenom columns
- Return as download with `Content-Disposition`

- [ ] **Step 2: Add export button to admin page**

Add a download button in the admin dashboard header linking to the export endpoint.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(staff\)/staff/admin/events/\[eventId\]/feedback/export/
git commit -m "feat(feedback): admin XLSX export for feedback results"
```

---

## Task 9: Type check + final verification

- [ ] **Step 1: Run type check**

```bash
cd frontend && bun run check
```

Fix any errors.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

- [ ] **Step 3: Run format**

```bash
bun run format
```

- [ ] **Step 4: Manual test checklist**

- [ ] Talent dashboard shows feedback banner when Friday 17h has passed
- [ ] Banner links to `/feedback/{eventId}/w1`
- [ ] Chat conversation works: bot asks questions, chips respond, text input works
- [ ] Identity questions are skipped (pre-filled from talent profile)
- [ ] Submit saves `FeedbackSubmission` in DB
- [ ] Banner disappears after submission
- [ ] Admin dashboard at `/staff/admin/events/{eventId}/feedback` shows results
- [ ] XLSX export downloads correctly

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(feedback): type check and lint fixes"
```
