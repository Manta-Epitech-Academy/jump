# Markdown Rendering Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all markdown rendering issues (broken tables, lists, images, headings, no syntax highlighting) by cleaning up the dual CSS system and adding syntax highlighting.

**Architecture:** Keep `marked` (already used everywhere), add `marked-highlight` + `highlight.js` for code syntax coloring. Remove the custom `.markdown-content` CSS, replace with customized Tailwind Typography (`prose`). Create a single `renderMarkdown()` utility used by all consumers.

**Tech Stack:** marked v17, marked-highlight, highlight.js, @tailwindcss/typography v0.5 (already installed), Tailwind CSS 4.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/lib/markdown.ts` | Single `renderMarkdown()` function with highlight.js integration |
| Modify | `frontend/src/routes/layout.css:187-216` | Replace `.markdown-content` with `.prose` overrides for Epitech branding |
| Modify | `frontend/src/routes/(talent)/[activityId]/+page.svelte:3,51-58,121,388` | Use `renderMarkdown()` instead of raw `marked.parse()` |
| Modify | `frontend/src/routes/(talent)/onboarding/components/RulesStep.svelte:5,19` | Use `renderMarkdown()` |
| Modify | `frontend/src/routes/parent/sign/+page.svelte:7,10` | Use `renderMarkdown()` |
| Modify | `frontend/src/lib/server/services/onboardingDocumentGenerator.ts:2,30,52` | Use `renderMarkdown()` for server-side PDF |

---

### Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install highlight.js and marked-highlight**

```bash
cd frontend && bun add marked-highlight highlight.js
```

- [ ] **Step 2: Verify installation**

```bash
cd frontend && bun run check
```

Expected: No new errors. Both packages in `node_modules/`.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add package.json bun.lock && git commit -m "chore(deps): add marked-highlight and highlight.js for syntax highlighting"
```

---

### Task 2: Create `renderMarkdown()` utility

**Files:**
- Create: `frontend/src/lib/markdown.ts`

- [ ] **Step 1: Create the markdown utility**

Create `frontend/src/lib/markdown.ts`:

```typescript
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
  {
    gfm: true,
    breaks: false,
  },
);

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown) as string;
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/lib/markdown.ts && git commit -m "feat(markdown): create renderMarkdown utility with highlight.js integration"
```

---

### Task 3: Replace `.markdown-content` CSS with `prose` overrides

**Files:**
- Modify: `frontend/src/routes/layout.css:187-216`

The current `.markdown-content` class conflicts with Tailwind `prose` and is missing styles for `ol`, `table`, `img`, `hr`, `h4-h6`. Instead of patching it, we remove it and add minimal overrides to `prose` for Epitech branding (epi-blue links, epi-teal blockquote borders, heading font).

- [ ] **Step 1: Replace the markdown CSS block**

Replace lines 187-216 in `frontend/src/routes/layout.css`:

```css
/* --- Markdown Prose Overrides (Epitech branding on top of @tailwindcss/typography) --- */
.prose h1,
.prose h2,
.prose h3,
.prose h4 {
  @apply font-heading tracking-wide text-slate-900 uppercase dark:text-white;
}
.prose a {
  @apply font-bold text-epi-blue decoration-2 underline-offset-2 transition-colors hover:text-epi-blue/80;
}
.prose blockquote {
  @apply rounded-r-xl border-epi-teal bg-slate-50 dark:bg-slate-900/50;
}
.prose pre {
  @apply rounded-xl shadow-inner;
}
.prose code:not(pre code) {
  @apply rounded-md bg-slate-100 px-1.5 py-0.5 text-epi-blue dark:bg-slate-800 dark:text-blue-300;
}
.prose code::before,
.prose code::after {
  content: none;
}
```

This removes `.markdown-content` entirely. Tailwind Typography's `prose` handles all elements (tables, ordered lists, images, hrs, all heading sizes) out of the box. We only override brand colors.

- [ ] **Step 2: Add highlight.js theme import**

Add at the top of `frontend/src/routes/layout.css` (line 1, before existing imports):

```css
@import 'highlight.js/styles/github-dark.css';
```

This gives syntax-highlighted code blocks a dark theme matching the existing `bg-slate-900` code block style.

- [ ] **Step 3: Verify the CSS compiles**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/routes/layout.css && git commit -m "feat(markdown): replace custom CSS with prose overrides + highlight.js theme"
```

---

### Task 4: Migrate activity page to `renderMarkdown()`

**Files:**
- Modify: `frontend/src/routes/(talent)/[activityId]/+page.svelte:3,51-58,121,388`

- [ ] **Step 1: Replace the import**

Replace line 3:

```typescript
  import { renderMarkdown } from '$lib/markdown';
```

(Remove `import { marked } from 'marked';`)

- [ ] **Step 2: Update the derived values**

Replace lines 51-58:

```typescript
  let parsedHtml = $derived(
    currentStep ? renderMarkdown(currentStep.content_markdown) : '',
  );

  // Static activity markdown
  let staticHtml = $derived(
    !isDynamic && data.activity.content
      ? renderMarkdown(data.activity.content)
      : '',
  );
```

- [ ] **Step 3: Update container CSS classes**

Replace line 121:

```svelte
            class="prose prose-slate dark:prose-invert max-w-none text-base leading-relaxed"
```

(Remove `markdown-content` from the class list.)

Replace line 388:

```svelte
                class="prose prose-slate dark:prose-invert max-w-none text-base leading-relaxed"
```

(Remove `markdown-content` from the class list.)

- [ ] **Step 4: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/routes/\(talent\)/\[activityId\]/+page.svelte && git commit -m "refactor(markdown): migrate activity page to renderMarkdown utility"
```

---

### Task 5: Migrate onboarding RulesStep to `renderMarkdown()`

**Files:**
- Modify: `frontend/src/routes/(talent)/onboarding/components/RulesStep.svelte:5,19,62`

- [ ] **Step 1: Replace the import**

Replace line 5:

```typescript
  import { renderMarkdown } from '$lib/markdown';
```

(Remove `import { marked } from 'marked';`)

- [ ] **Step 2: Update the parse call**

Replace line 19:

```typescript
  const renderedContent = renderMarkdown(contentWithoutSignature);
```

- [ ] **Step 3: Update container CSS class**

Replace line 62:

```svelte
    <div class="prose prose-slate prose-sm dark:prose-invert max-w-none">
```

(Replace `markdown-content max-w-none text-sm` with `prose prose-slate prose-sm dark:prose-invert max-w-none`.)

- [ ] **Step 4: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/routes/\(talent\)/onboarding/components/RulesStep.svelte && git commit -m "refactor(markdown): migrate RulesStep to renderMarkdown utility"
```

---

### Task 6: Migrate parent sign page to `renderMarkdown()`

**Files:**
- Modify: `frontend/src/routes/parent/sign/+page.svelte:7,10,270`

- [ ] **Step 1: Replace the import**

Replace line 7:

```typescript
  import { renderMarkdown } from '$lib/markdown';
```

(Remove `import { marked } from 'marked';`)

- [ ] **Step 2: Update the parse call**

Replace line 10:

```typescript
  const droitImageBody = renderMarkdown(droitImageBodyMd);
```

- [ ] **Step 3: Update container CSS class**

Replace line 270:

```svelte
          <div class="prose prose-slate prose-sm dark:prose-invert max-w-none">
```

(Replace `markdown-content max-w-none text-sm` with `prose prose-slate prose-sm dark:prose-invert max-w-none`.)

- [ ] **Step 4: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/routes/parent/sign/+page.svelte && git commit -m "refactor(markdown): migrate parent sign page to renderMarkdown utility"
```

---

### Task 7: Migrate server-side PDF generator to `renderMarkdown()`

**Files:**
- Modify: `frontend/src/lib/server/services/onboardingDocumentGenerator.ts:2,30,52`

- [ ] **Step 1: Replace the import**

Replace line 2:

```typescript
import { renderMarkdown } from '$lib/markdown';
```

(Remove `import { marked } from 'marked';`)

- [ ] **Step 2: Update the parse calls**

Replace line 30:

```typescript
  return renderMarkdown(filled);
```

Replace line 52:

```typescript
    documentContent = renderMarkdown(filled);
```

- [ ] **Step 3: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/lib/server/services/onboardingDocumentGenerator.ts && git commit -m "refactor(markdown): migrate PDF generator to renderMarkdown utility"
```

---

### Task 8: Verify no remaining `marked` imports and final check

- [ ] **Step 1: Grep for leftover `marked` imports**

```bash
cd frontend && grep -r "from 'marked'" src/ --include="*.ts" --include="*.svelte"
```

Expected: Only `src/lib/markdown.ts` should import from `marked`. No other files.

- [ ] **Step 2: Grep for leftover `markdown-content` usage**

```bash
cd frontend && grep -r "markdown-content" src/ --include="*.svelte" --include="*.css"
```

Expected: Zero matches.

- [ ] **Step 3: Full type-check**

Run: `cd frontend && bun run check`
Expected: Zero errors.

- [ ] **Step 4: Lint check**

Run: `cd frontend && bun run lint`
Expected: No new errors.

- [ ] **Step 5: Visual smoke test**

1. `bunx prisma migrate reset` (reseed with markdown-rich content)
2. `bun run dev`
3. Login as Alice (`alice.martin@mail.com`)
4. Open the static conference activity ("Bienvenue à l'atelier IA")
5. Verify:
   - h1/h2/h3/h4 have different sizes (prose default sizing)
   - Headings use `font-heading` uppercase
   - Ordered lists show numbers
   - Tables render with borders and alignment
   - Code blocks have syntax highlighting with colors
   - Images display
   - Blockquotes have epi-teal left border
   - Links are epi-blue
   - `<hr>` renders as a line
   - Inline code has epi-blue color
