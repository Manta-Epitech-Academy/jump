# Mini CMS — Welcome Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow leads and admins to edit a per-campus welcome page (WYSIWYG) that talents see when they land on the platform.

**Architecture:** New `CmsPage` Prisma model (slug + campusId unique). Tiptap WYSIWYG editor on staff routes. Read-only prose render on talent route. HTML sanitized server-side with DOMPurify before storage.

**Tech Stack:** Tiptap (WYSIWYG), svelte-tiptap, @tiptap/starter-kit, @tiptap/extension-link, isomorphic-dompurify, Prisma, SvelteKit superforms.

---

### Task 1: Install Tiptap dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd frontend && bun add @tiptap/core @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder svelte-tiptap
```

- [ ] **Step 2: Verify installation**

```bash
cd frontend && bun run check
```

Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/bun.lock
git commit -m "feat(cms): install tiptap wysiwyg dependencies"
```

---

### Task 2: Add CmsPage Prisma model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (add model after Campus ~line 207)

- [ ] **Step 1: Add CmsPage model to schema**

Add after the `Campus` model block (after line 207 in `schema.prisma`):

```prisma
model CmsPage {
  id        String   @id @default(cuid())
  slug      String
  campusId  String
  content   String   @db.Text
  updatedAt DateTime @updatedAt
  updatedBy String

  campus Campus     @relation(fields: [campusId], references: [id], onDelete: Cascade)
  user   bauth_user @relation(fields: [updatedBy], references: [id])

  @@unique([slug, campusId])
  @@index([campusId])
}
```

- [ ] **Step 2: Add reverse relations**

In the `Campus` model, add to the relations list:

```prisma
  cmsPages          CmsPage[]
```

In the `bauth_user` model, add to the relations list:

```prisma
  cmsPages          CmsPage[]
```

- [ ] **Step 3: Generate migration**

```bash
cd frontend && bunx prisma migrate dev --name add_cms_page
```

Expected: migration created successfully, Prisma client regenerated.

- [ ] **Step 4: Verify generated client**

```bash
cd frontend && bun run db:generate
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/
git commit -m "feat(cms): add CmsPage model and migration"
```

---

### Task 3: Create CmsEditor Svelte component

**Files:**
- Create: `frontend/src/lib/components/cms/CmsEditor.svelte`

This is a reusable Tiptap WYSIWYG editor component.

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import Placeholder from '@tiptap/extension-placeholder';
  import {
    Bold,
    Italic,
    Strikethrough,
    List,
    ListOrdered,
    Heading1,
    Heading2,
    Heading3,
    Quote,
    Code,
    Minus,
    Undo,
    Redo,
    Link as LinkIcon,
    Unlink,
  } from '@lucide/svelte';

  type Props = {
    content: string;
    placeholder?: string;
  };

  let { content = $bindable(), placeholder = 'Commencez à écrire...' }: Props = $props();

  let element: HTMLDivElement;
  let editor: Editor | undefined = $state();

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
        }),
        Placeholder.configure({ placeholder }),
      ],
      content,
      editorProps: {
        attributes: {
          class: 'prose prose-slate dark:prose-invert max-w-none min-h-[300px] focus:outline-none p-4',
        },
      },
      onUpdate: ({ editor: e }) => {
        content = e.getHTML();
      },
      onTransaction: () => {
        // Force Svelte reactivity
        editor = editor;
      },
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL du lien :', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  type ToolbarAction = {
    icon: typeof Bold;
    label: string;
    action: () => void;
    isActive?: () => boolean;
  };

  const toolbarGroups: ToolbarAction[][] = $derived(
    editor
      ? [
          [
            {
              icon: Bold,
              label: 'Gras',
              action: () => editor!.chain().focus().toggleBold().run(),
              isActive: () => editor!.isActive('bold'),
            },
            {
              icon: Italic,
              label: 'Italique',
              action: () => editor!.chain().focus().toggleItalic().run(),
              isActive: () => editor!.isActive('italic'),
            },
            {
              icon: Strikethrough,
              label: 'Barré',
              action: () => editor!.chain().focus().toggleStrike().run(),
              isActive: () => editor!.isActive('strike'),
            },
          ],
          [
            {
              icon: Heading1,
              label: 'Titre 1',
              action: () => editor!.chain().focus().toggleHeading({ level: 1 }).run(),
              isActive: () => editor!.isActive('heading', { level: 1 }),
            },
            {
              icon: Heading2,
              label: 'Titre 2',
              action: () => editor!.chain().focus().toggleHeading({ level: 2 }).run(),
              isActive: () => editor!.isActive('heading', { level: 2 }),
            },
            {
              icon: Heading3,
              label: 'Titre 3',
              action: () => editor!.chain().focus().toggleHeading({ level: 3 }).run(),
              isActive: () => editor!.isActive('heading', { level: 3 }),
            },
          ],
          [
            {
              icon: List,
              label: 'Liste',
              action: () => editor!.chain().focus().toggleBulletList().run(),
              isActive: () => editor!.isActive('bulletList'),
            },
            {
              icon: ListOrdered,
              label: 'Liste numérotée',
              action: () => editor!.chain().focus().toggleOrderedList().run(),
              isActive: () => editor!.isActive('orderedList'),
            },
            {
              icon: Quote,
              label: 'Citation',
              action: () => editor!.chain().focus().toggleBlockquote().run(),
              isActive: () => editor!.isActive('blockquote'),
            },
            {
              icon: Code,
              label: 'Code',
              action: () => editor!.chain().focus().toggleCodeBlock().run(),
              isActive: () => editor!.isActive('codeBlock'),
            },
            {
              icon: Minus,
              label: 'Ligne horizontale',
              action: () => editor!.chain().focus().setHorizontalRule().run(),
            },
          ],
          [
            {
              icon: LinkIcon,
              label: 'Lien',
              action: setLink,
              isActive: () => editor!.isActive('link'),
            },
            {
              icon: Unlink,
              label: 'Retirer le lien',
              action: () => editor!.chain().focus().unsetLink().run(),
            },
          ],
          [
            {
              icon: Undo,
              label: 'Annuler',
              action: () => editor!.chain().focus().undo().run(),
            },
            {
              icon: Redo,
              label: 'Rétablir',
              action: () => editor!.chain().focus().redo().run(),
            },
          ],
        ]
      : [],
  );
</script>

{#if editor}
  <div class="rounded-lg border border-border bg-card">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-1 border-b border-border p-2">
      {#each toolbarGroups as group, i}
        {#if i > 0}
          <div class="mx-1 h-6 w-px bg-border"></div>
        {/if}
        {#each group as { icon: Icon, label, action, isActive }}
          <button
            type="button"
            onclick={action}
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground {isActive?.()
              ? 'bg-accent text-accent-foreground'
              : ''}"
            title={label}
          >
            <Icon class="h-4 w-4" />
          </button>
        {/each}
      {/each}
    </div>

    <!-- Editor -->
    <div bind:this={element}></div>
  </div>
{/if}
```

- [ ] **Step 2: Verify the component compiles**

```bash
cd frontend && bun run check
```

Expected: no type errors related to CmsEditor.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/components/cms/CmsEditor.svelte
git commit -m "feat(cms): create CmsEditor tiptap wysiwyg component"
```

---

### Task 4: Create staff CMS edit page (dev workspace)

**Files:**
- Create: `frontend/src/routes/(staff)/staff/dev/cms/welcome/+page.server.ts`
- Create: `frontend/src/routes/(staff)/staff/dev/cms/welcome/+page.svelte`

- [ ] **Step 1: Create the server load + action**

File: `frontend/src/routes/(staff)/staff/dev/cms/welcome/+page.server.ts`

```typescript
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import DOMPurify from 'isomorphic-dompurify';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaffGroup(locals, 'leads');
  const campusId = getCampusId(locals);

  const page = await prisma.cmsPage.findUnique({
    where: { slug_campusId: { slug: SLUG, campusId } },
  });

  return { cmsContent: page?.content ?? '' };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireStaffGroup(locals, 'leads');
    const campusId = getCampusId(locals);
    const userId = locals.user!.id;

    const formData = await request.formData();
    const rawContent = formData.get('content');

    if (typeof rawContent !== 'string') {
      return fail(400, { error: 'Contenu invalide.' });
    }

    const content = DOMPurify.sanitize(rawContent);

    await prisma.cmsPage.upsert({
      where: { slug_campusId: { slug: SLUG, campusId } },
      update: { content, updatedBy: userId },
      create: { slug: SLUG, campusId, content, updatedBy: userId },
    });

    return { success: true };
  },
};
```

- [ ] **Step 2: Create the edit page UI**

File: `frontend/src/routes/(staff)/staff/dev/cms/welcome/+page.svelte`

```svelte
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Save, Eye } from '@lucide/svelte';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';

  let { data, form: actionData }: { data: PageData; form: ActionData } = $props();

  let content = $state(data.cmsContent);
  let showPreview = $state(false);
  let saving = $state(false);

  $effect(() => {
    if (actionData?.success) {
      toast.success('Page d\'accueil mise à jour !');
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  });
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Page d'accueil Talents</h1>
      <p class="text-sm text-muted-foreground">
        Ce contenu est affiché aux talents lorsqu'ils arrivent sur la plateforme.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showPreview = !showPreview)}
      >
        <Eye class="mr-2 h-4 w-4" />
        {showPreview ? 'Éditer' : 'Aperçu'}
      </Button>
    </div>
  </div>

  {#if showPreview}
    <div class="rounded-lg border border-border bg-card p-8">
      <div class="prose prose-slate dark:prose-invert max-w-none">
        {@html content}
      </div>
    </div>
  {:else}
    <form
      method="POST"
      action="?/save"
      use:enhance={() => {
        saving = true;
        return async ({ update }) => {
          saving = false;
          await update();
        };
      }}
    >
      <input type="hidden" name="content" value={content} />
      <CmsEditor bind:content placeholder="Rédigez le contenu de la page d'accueil..." />
      <div class="mt-4 flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save class="mr-2 h-4 w-4" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  {/if}
</div>
```

- [ ] **Step 3: Verify compilation**

```bash
cd frontend && bun run check
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(staff\)/staff/dev/cms/
git commit -m "feat(cms): add dev workspace welcome page editor"
```

---

### Task 5: Create staff CMS edit page (pedago workspace)

**Files:**
- Create: `frontend/src/routes/(staff)/staff/pedago/cms/welcome/+page.server.ts`
- Create: `frontend/src/routes/(staff)/staff/pedago/cms/welcome/+page.svelte`

These are identical to the dev versions — same logic, same component, different route.

- [ ] **Step 1: Create the server load + action**

File: `frontend/src/routes/(staff)/staff/pedago/cms/welcome/+page.server.ts`

```typescript
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import DOMPurify from 'isomorphic-dompurify';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaffGroup(locals, 'leads');
  const campusId = getCampusId(locals);

  const page = await prisma.cmsPage.findUnique({
    where: { slug_campusId: { slug: SLUG, campusId } },
  });

  return { cmsContent: page?.content ?? '' };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireStaffGroup(locals, 'leads');
    const campusId = getCampusId(locals);
    const userId = locals.user!.id;

    const formData = await request.formData();
    const rawContent = formData.get('content');

    if (typeof rawContent !== 'string') {
      return fail(400, { error: 'Contenu invalide.' });
    }

    const content = DOMPurify.sanitize(rawContent);

    await prisma.cmsPage.upsert({
      where: { slug_campusId: { slug: SLUG, campusId } },
      update: { content, updatedBy: userId },
      create: { slug: SLUG, campusId, content, updatedBy: userId },
    });

    return { success: true };
  },
};
```

- [ ] **Step 2: Create the edit page UI**

File: `frontend/src/routes/(staff)/staff/pedago/cms/welcome/+page.svelte`

```svelte
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Save, Eye } from '@lucide/svelte';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';

  let { data, form: actionData }: { data: PageData; form: ActionData } = $props();

  let content = $state(data.cmsContent);
  let showPreview = $state(false);
  let saving = $state(false);

  $effect(() => {
    if (actionData?.success) {
      toast.success('Page d\'accueil mise à jour !');
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  });
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Page d'accueil Talents</h1>
      <p class="text-sm text-muted-foreground">
        Ce contenu est affiché aux talents lorsqu'ils arrivent sur la plateforme.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showPreview = !showPreview)}
      >
        <Eye class="mr-2 h-4 w-4" />
        {showPreview ? 'Éditer' : 'Aperçu'}
      </Button>
    </div>
  </div>

  {#if showPreview}
    <div class="rounded-lg border border-border bg-card p-8">
      <div class="prose prose-slate dark:prose-invert max-w-none">
        {@html content}
      </div>
    </div>
  {:else}
    <form
      method="POST"
      action="?/save"
      use:enhance={() => {
        saving = true;
        return async ({ update }) => {
          saving = false;
          await update();
        };
      }}
    >
      <input type="hidden" name="content" value={content} />
      <CmsEditor bind:content placeholder="Rédigez le contenu de la page d'accueil..." />
      <div class="mt-4 flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save class="mr-2 h-4 w-4" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  {/if}
</div>
```

- [ ] **Step 3: Verify compilation**

```bash
cd frontend && bun run check
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(staff\)/staff/pedago/cms/
git commit -m "feat(cms): add pedago workspace welcome page editor"
```

---

### Task 6: Add route gates for CMS edit pages

**Files:**
- Modify: `frontend/src/lib/server/auth/guards.ts` (~line 27-51, `STAFF_ROLE_GATES` array)

- [ ] **Step 1: Add CMS route gates**

Add two entries to the `STAFF_ROLE_GATES` array in `frontend/src/lib/server/auth/guards.ts`:

```typescript
  {
    pattern: /^\/staff\/dev\/cms(?:\/|$)/,
    group: 'devLead',
  },
  {
    pattern: /^\/staff\/pedago\/cms(?:\/|$)/,
    group: 'pedaLead',
  },
```

These restrict CMS editing to workspace leads. Admins bypass `STAFF_ROLE_GATES` through the admin check in `hooks.server.ts` — verify this is the case. If admins are not auto-bypassed, the `requireStaffGroup(locals, 'leads')` in the page server files already covers leads. For admin access, check if there is an admin bypass in the guard flow. If not, adjust to allow admin role explicitly.

- [ ] **Step 2: Verify compilation**

```bash
cd frontend && bun run check
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/server/auth/guards.ts
git commit -m "feat(cms): add route gates for cms edit pages"
```

---

### Task 7: Add navigation links in staff sidebars

**Files:**
- Modify: `frontend/src/routes/(staff)/staff/dev/+layout.svelte` (~line 181-194, Ressources section)
- Modify: `frontend/src/routes/(staff)/staff/pedago/+layout.svelte` (~line 123-136, Ressources section)

- [ ] **Step 1: Add link in dev sidebar**

In `frontend/src/routes/(staff)/staff/dev/+layout.svelte`, add `FileText` to the lucide imports (line 1-18):

```typescript
import {
  // ...existing imports...
  FileText,
} from '@lucide/svelte';
```

Then inside the `Gestion` section (inside the `<Gated group="devLead">` block, after the "Équipe" link around line 207), add a new nav link:

```svelte
      <a
        href={resolve('/staff/dev/cms/welcome')}
        class={navLinkClass(isActive('/staff/dev/cms/welcome'))}
      >
        <FileText class="h-5 w-5" />
        <span>Page d'accueil</span>
      </a>
```

- [ ] **Step 2: Add link in pedago sidebar**

In `frontend/src/routes/(staff)/staff/pedago/+layout.svelte`, add `FileText` to the lucide imports (line 1-11):

```typescript
import {
  // ...existing imports...
  FileText,
} from '@lucide/svelte';
```

Then add a new `Contenu` section after the Ressources section (after line 136), gated to pedaLead. First, import Gated if not already imported:

```typescript
import Gated from '$lib/components/auth/Gated.svelte';
```

Then add:

```svelte
  <Gated group="pedaLead" mode="hide">
    <div class="sidebar-section-title">
      Contenu<span class="text-foreground">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/pedago/cms/welcome')}
        class={navLinkClass(isActive('/staff/pedago/cms/welcome'))}
      >
        <FileText class="h-5 w-5" />
        <span>Page d'accueil</span>
      </a>
    </nav>
  </Gated>
```

- [ ] **Step 3: Verify compilation**

```bash
cd frontend && bun run check
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(staff\)/staff/dev/+layout.svelte frontend/src/routes/\(staff\)/staff/pedago/+layout.svelte
git commit -m "feat(cms): add welcome page editor links in staff sidebars"
```

---

### Task 8: Create talent welcome page

**Files:**
- Create: `frontend/src/routes/(talent)/welcome/+page.server.ts`
- Create: `frontend/src/routes/(talent)/welcome/+page.svelte`

The talent doesn't have a direct `campusId`. The campus is resolved through their most recent participation.

- [ ] **Step 1: Create the server load**

File: `frontend/src/routes/(talent)/welcome/+page.server.ts`

```typescript
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // Resolve campus from the talent's most recent participation
  const participation = await prisma.participation.findFirst({
    where: { talentId: locals.talent.id },
    orderBy: { event: { date: 'desc' } },
    select: { campusId: true },
  });

  if (!participation) {
    return { cmsContent: null };
  }

  const page = await prisma.cmsPage.findUnique({
    where: { slug_campusId: { slug: SLUG, campusId: participation.campusId } },
  });

  return { cmsContent: page?.content ?? null };
};
```

- [ ] **Step 2: Create the talent welcome page UI**

File: `frontend/src/routes/(talent)/welcome/+page.svelte`

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { ArrowRight, Rocket } from '@lucide/svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-12">
  {#if data.cmsContent}
    <div class="prose prose-slate dark:prose-invert max-w-none">
      {@html data.cmsContent}
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <Rocket class="h-16 w-16 text-epi-teal" />
      <h1 class="text-3xl font-bold">Bienvenue sur la plateforme !</h1>
      <p class="max-w-md text-lg text-muted-foreground">
        Ton espace est en cours de préparation. En attendant, tu peux accéder à ton tableau de bord.
      </p>
    </div>
  {/if}

  <div class="mt-8 flex justify-center">
    <Button href={resolve('/')}>
      Accéder au tableau de bord
      <ArrowRight class="ml-2 h-4 w-4" />
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Verify compilation**

```bash
cd frontend && bun run check
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(talent\)/welcome/
git commit -m "feat(cms): add talent welcome page with fallback content"
```

---

### Task 9: Manual testing + final verification

- [ ] **Step 1: Start dev server**

```bash
cd frontend && bun run dev
```

- [ ] **Step 2: Test staff editor flow**

1. Log in as a `superdev` or `peda` lead
2. Navigate to the CMS link in the sidebar ("Page d'accueil" under Gestion/Contenu)
3. Write content in the WYSIWYG editor
4. Click "Enregistrer" — verify toast appears
5. Toggle "Aperçu" — verify content renders correctly
6. Refresh the page — verify content persists

- [ ] **Step 3: Test talent read flow**

1. Log in as a talent
2. Navigate to `/welcome`
3. Verify the saved content displays with correct prose styling
4. If no content exists, verify the fallback message appears

- [ ] **Step 4: Test access control**

1. Log in as a non-lead staff member (e.g., `dev` or `manta`)
2. Verify the CMS link is hidden in the sidebar
3. Try accessing `/staff/dev/cms/welcome` directly — verify redirect/403

- [ ] **Step 5: Run format + lint**

```bash
cd frontend && bun run format && bun run lint
```

Fix any issues.

- [ ] **Step 6: Final type check**

```bash
cd frontend && bun run check
```

- [ ] **Step 7: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore(cms): format and lint fixes"
```
