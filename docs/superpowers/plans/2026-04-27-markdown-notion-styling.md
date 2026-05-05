# Markdown Notion-Like Styling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix markdown rendering to match Notion's clean, airy visual style while keeping Epitech brand colors.

**Architecture:** Keep `marked` parser, enable `breaks: true`, rewrite the `.prose` CSS overrides in `layout.css` to produce Notion-like rendering (clean headings, styled tables, task lists, images, hr). No new dependencies, no component changes.

**Tech Stack:** marked v17 (existing), @tailwindcss/typography v0.5 (existing), highlight.js (existing).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/lib/markdown.ts:16` | Enable `breaks: true` |
| Modify | `frontend/src/routes/layout.css:189-211` | Rewrite `.prose` overrides for Notion-like styling |

No other files change. All consumers already use `renderMarkdown()` + `prose` classes.

---

### Task 1: Enable line break support in parser

**Files:**
- Modify: `frontend/src/lib/markdown.ts:16`

- [ ] **Step 1: Change `breaks` option**

In `frontend/src/lib/markdown.ts`, replace line 16:

```typescript
    breaks: false,
```

with:

```typescript
    breaks: true,
```

This makes single `\n` in markdown produce `<br>` tags, matching Notion's behavior where a line break is a line break.

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/lib/markdown.ts && git commit -m "fix(markdown): enable breaks for Notion-like line break behavior"
```

---

### Task 2: Rewrite prose overrides for Notion-like rendering

**Files:**
- Modify: `frontend/src/routes/layout.css:189-211`

- [ ] **Step 1: Replace the entire prose overrides block**

In `frontend/src/routes/layout.css`, replace lines 189-211 (from `/* --- Markdown Prose Overrides` down to the closing `}` of `prose code::after`):

```css
/* --- Markdown Prose Overrides (Notion-like with Epitech branding) --- */

/* Headings — clean, no uppercase, weighted sizing like Notion */
.prose h1 {
  @apply text-2xl font-bold text-slate-900 dark:text-white;
}
.prose h2 {
  @apply text-xl font-semibold text-slate-900 dark:text-white;
}
.prose h3 {
  @apply text-lg font-semibold text-slate-800 dark:text-slate-100;
}
.prose h4 {
  @apply text-base font-semibold text-slate-700 dark:text-slate-200;
}

/* Links — Epitech blue, underline on hover like Notion */
.prose a {
  @apply font-medium text-epi-blue underline decoration-epi-blue/30 underline-offset-2 transition-colors hover:decoration-epi-blue;
}

/* Blockquotes — Notion-style left border with subtle bg */
.prose blockquote {
  @apply rounded-r-lg border-l-4 border-epi-teal bg-slate-50 px-4 py-1 dark:bg-slate-900/50;
}

/* Tables — Notion-style with header bg and clean borders */
.prose table {
  @apply w-full border-collapse overflow-hidden rounded-lg text-sm;
}
.prose thead th {
  @apply bg-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300;
}
.prose tbody td {
  @apply border-t border-slate-200 px-3 py-2 dark:border-slate-700;
}
.prose tbody tr:hover {
  @apply bg-slate-50/50 dark:bg-slate-800/30;
}

/* Task lists — styled checkboxes, no bullet */
.prose ul:has(input[type='checkbox']) {
  @apply list-none pl-0;
}
.prose li:has(> input[type='checkbox']) {
  @apply flex items-start gap-2 pl-0;
}
.prose input[type='checkbox'] {
  @apply mt-1 h-4 w-4 rounded border-slate-300 accent-epi-blue;
}

/* Images — rounded, constrained, centered */
.prose img {
  @apply mx-auto max-w-full rounded-lg;
}

/* HR — subtle Notion-style divider */
.prose hr {
  @apply my-8 border-t border-slate-200 dark:border-slate-700;
}

/* Code blocks — keep existing dark theme */
.prose pre {
  @apply rounded-xl shadow-inner;
}

/* Inline code — subtle highlight */
.prose code:not(pre code) {
  @apply rounded-md bg-slate-100 px-1.5 py-0.5 text-epi-blue dark:bg-slate-800 dark:text-blue-300;
}
.prose code::before,
.prose code::after {
  content: none;
}
```

- [ ] **Step 2: Verify CSS compiles**

Run: `cd frontend && bun run check`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/layout.css && git commit -m "style(markdown): rewrite prose overrides for Notion-like rendering"
```

---

### Task 3: Visual verification

- [ ] **Step 1: Start dev server**

```bash
cd frontend && bun run dev
```

- [ ] **Step 2: Verify with seed content**

Login as a talent user and open the first HTML activity ("Ma première page HTML" → step "Qu'est-ce que le HTML ?"). This step contains every markdown element: h1-h4, bold/italic/strikethrough, hr, bullet lists, numbered lists, nested lists, inline code, code blocks, tables, blockquotes, links, images, and checklists.

Verify each element renders correctly:
- **Headings:** Clean, no uppercase, decreasing sizes h1 → h4
- **Tables:** Header row with grey background, borders, hover effect on rows
- **Task lists:** Styled checkboxes without bullet markers
- **Images:** Rounded corners, centered
- **HR:** Subtle line divider
- **Code blocks:** Syntax highlighted, dark background
- **Blockquotes:** Teal left border, light bg
- **Lists:** Proper spacing, nested lists indented
- **Line breaks:** Single `\n` produces visible line break

- [ ] **Step 3: Check dark mode**

Toggle dark mode and verify all elements remain readable with proper contrast.

- [ ] **Step 4: Check RulesStep and parent sign page**

Navigate to the onboarding rules step and parent sign page. Verify the `prose-sm` variant also looks correct (these pages use smaller prose).
