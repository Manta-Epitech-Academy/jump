# Parent Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a lightweight parent portal where parents can log in via Email OTP, see their children's event participation, and sign image rights documents.

**Architecture:** New `(parent)/` route group with its own layout guard checking `role === 'parent'`. Parent-child link via `Talent.parentEmail` matching `user.email`. Reuses existing BetterAuth OTP and parent signature flows.

**Tech Stack:** SvelteKit 2 (Svelte 5), Prisma, BetterAuth emailOTP, Superforms + Zod, Tailwind CSS, Bits UI

---

## File Structure

```
frontend/src/
├── routes/(parent)/
│   ├── +layout.server.ts          ← guard: role='parent', bypass login
│   ├── +layout.svelte             ← shared layout (header, logout)
│   ├── login/
│   │   ├── +page.server.ts        ← OTP request/verify actions
│   │   └── +page.svelte           ← login UI (email → OTP)
│   ├── +page.server.ts            ← dashboard data loader
│   ├── +page.svelte               ← dashboard multi-enfants
│   └── enfant/
│       └── [talentId]/
│           ├── +page.server.ts    ← child detail data loader
│           └── +page.svelte       ← child detail UI
├── lib/
│   └── validation/
│       └── auth.ts                ← add parentEmailSchema, parentOtpSchema (reuse existing camper schemas)
```

Modified files:
- `frontend/src/lib/server/auth/guards.ts` — add `(parent)` route guards
- `frontend/src/lib/server/auth.ts` — update OTP hook to send email directly for parent login (currently stores OTP instead of emailing)
- `frontend/src/hooks.server.ts` — no changes needed (parent is already a `bauth_user`, session loaded automatically)

---

### Task 1: Update auth to support parent OTP login

The current `sendVerificationOTP` hook in `auth.ts` intercepts parent role and stores the OTP in `ParentToken` instead of sending an email. This was designed for the signature flow where the OTP is included in a combined email. For parent login, we need the OTP sent directly like for students.

**Files:**
- Modify: `frontend/src/lib/server/auth.ts:44-52`

- [ ] **Step 1: Update the OTP hook to distinguish parent login from parent signature**

In `frontend/src/lib/server/auth.ts`, replace the `sendVerificationOTP` function:

```typescript
async sendVerificationOTP({ email, otp, type }) {
  const user = await prisma.bauth_user.findUnique({
    where: { email },
    select: { role: true, name: true },
  });
  // For parent sign-in, send OTP directly like students
  // For parent signature flow (sign-up type), store OTP for combined email
  if (user?.role === 'parent' && type !== 'sign-in') {
    await storeParentOtp(email, otp);
    return;
  }
  await sendOtpEmail(email, otp, user?.name ?? undefined);
},
```

- [ ] **Step 2: Verify the type parameter is available**

Check BetterAuth emailOTP plugin docs — the `sendVerificationOTP` callback receives `{ email, otp, type }` where type is `'sign-in' | 'sign-up' | 'forget-password' | 'email-verification'`. The talent login uses `type: 'sign-in'` (see `auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })`).

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/server/auth.ts
git commit -m "feat(auth): send OTP email directly for parent sign-in"
```

---

### Task 2: Add parent route guards

**Files:**
- Modify: `frontend/src/lib/server/auth/guards.ts`

- [ ] **Step 1: Add parent route detection and guard logic**

In `frontend/src/lib/server/auth/guards.ts`, add after the `isTalentRoute` / `isStaffRoute` declarations (around line 31):

```typescript
const isParentRoute = routeId.startsWith('/(parent)');
```

Add a `pathParentLogin` path definition alongside the existing path definitions:

```typescript
const pathParentLogin = p('/parent/login');
const pathParentRoot = p('/parent');
```

Note: `pathParent` already exists (line 26) and is used in `isPublicPath`. Remove `/parent` from `isPublicPath` since parent routes now need auth (except login). Replace the `isPublicPath` definition:

```typescript
const isPublicPath =
  currentPath.startsWith(pathLogout) ||
  currentPath.startsWith(pathPublicShowcase) ||
  currentPath.startsWith(pathApi);
```

Then add the parent guard block before `return null;`:

```typescript
// --- Parent Guards ---
if (isParentRoute) {
  const isParentPublic = currentPath === pathParentLogin;

  if (!isParentPublic && (!event.locals.user || event.locals.user.role !== 'parent')) {
    return Response.redirect(new URL(pathParentLogin, event.url).href, 303);
  }
  if (event.locals.user?.role === 'parent' && currentPath === pathParentLogin) {
    return Response.redirect(new URL(pathParentRoot, event.url).href, 303);
  }
}
```

- [ ] **Step 2: Verify type check passes**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/server/auth/guards.ts
git commit -m "feat(auth): add parent route guards"
```

---

### Task 3: Create parent login page

**Files:**
- Create: `frontend/src/routes/(parent)/login/+page.server.ts`
- Create: `frontend/src/routes/(parent)/login/+page.svelte`

- [ ] **Step 1: Create the login server logic**

Create `frontend/src/routes/(parent)/login/+page.server.ts`:

```typescript
import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { camperEmailSchema, camperOtpSchema } from '$lib/validation/auth';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role === 'parent') {
    throw redirect(303, resolve('/parent'));
  }

  const emailForm = await superValidate(zod4(camperEmailSchema));
  const otpForm = await superValidate(zod4(camperOtpSchema));

  return { emailForm, otpForm };
};

export const actions: Actions = {
  requestOtp: async ({ request }) => {
    const emailForm = await superValidate(request, zod4(camperEmailSchema));

    if (!emailForm.valid) {
      return fail(400, { emailForm });
    }

    try {
      const normalizedEmail = emailForm.data.email.toLowerCase().trim();

      const user = await prisma.bauth_user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user || user.role !== 'parent') {
        return message(
          emailForm,
          {
            type: 'error',
            text: "Aucun compte parent trouvé avec cette adresse email.",
          },
          { status: 404 },
        );
      }

      await auth.api.sendVerificationOTP({
        body: { email: normalizedEmail, type: 'sign-in' },
      });

      return message(emailForm, {
        type: 'success',
        text: 'Code envoyé',
        email: normalizedEmail,
      });
    } catch (err) {
      console.error('Parent OTP Request Error:', err);
      return message(
        emailForm,
        {
          type: 'error',
          text: "Impossible d'envoyer le code. Réessayez plus tard.",
        },
        { status: 500 },
      );
    }
  },

  verifyOtp: async ({ request, cookies }) => {
    const otpForm = await superValidate(request, zod4(camperOtpSchema));

    if (!otpForm.valid) {
      return fail(400, { otpForm });
    }

    try {
      const authResponse = await auth.api.signInEmailOTP({
        body: {
          email: otpForm.data.email,
          otp: otpForm.data.password,
        },
        asResponse: true,
        headers: request.headers,
      });

      if (!authResponse.ok) {
        throw new Error('Invalid OTP');
      }

      forwardAuthCookies(authResponse, cookies);
    } catch (err) {
      console.error('[parent verifyOtp] Error:', err);
      return message(
        otpForm,
        { type: 'error', text: 'Code incorrect ou expiré.' },
        { status: 400 },
      );
    }

    throw redirect(303, resolve('/parent'));
  },
};
```

- [ ] **Step 2: Create the login page UI**

Create `frontend/src/routes/(parent)/login/+page.svelte`:

```svelte
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { CircleAlert, Sparkles, Lock, ArrowLeft, Users } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { fly } from 'svelte/transition';
  import { untrack } from 'svelte';

  let { data } = $props();
  let step = $state<'email' | 'otp'>('email');

  const {
    form: emailForm,
    errors: emailErrors,
    enhance: emailEnhance,
    delayed: emailDelayed,
    message: emailMessage,
  } = superForm(
    untrack(() => data.emailForm),
    {
      resetForm: false,
      onUpdated: ({ form }) => {
        if (form.valid && form.message?.type === 'success') {
          $otpForm.email = $emailForm.email.toLowerCase().trim();
          step = 'otp';
        }
      },
    },
  );

  const {
    form: otpForm,
    errors: otpErrors,
    enhance: otpEnhance,
    delayed: otpDelayed,
    message: otpMessage,
  } = superForm(
    untrack(() => data.otpForm),
    { resetForm: false },
  );

  let digitRefs = $state<HTMLInputElement[]>([]);
  let digits = $derived($otpForm.password.padEnd(6, ' ').slice(0, 6).split(''));
  let otpComplete = $derived($otpForm.password.length === 6);
  let otpFormRef = $state<HTMLFormElement>(undefined!);

  function handleDigitInput(index: number, e: Event) {
    const input = e.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    if (raw.length > 1) {
      const pasted = raw.slice(0, 6);
      $otpForm.password = pasted;
      const focusIndex = Math.min(pasted.length, 5);
      digitRefs[focusIndex]?.focus();
      return;
    }
    const val = raw.slice(-1);
    const chars = $otpForm.password.padEnd(6, ' ').slice(0, 6).split('');
    chars[index] = val || ' ';
    $otpForm.password = chars.join('').replace(/\s/g, '');
    if (val && index < 5) {
      digitRefs[index + 1]?.focus();
    }
  }

  function handleDigitKeydown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      e.preventDefault();
      const chars = $otpForm.password.split('');
      chars[index - 1] = '';
      $otpForm.password = chars.join('').replace(/\s/g, '');
      digitRefs[index - 1]?.focus();
    }
  }

  function handleDigitPaste(e: ClipboardEvent) {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    $otpForm.password = pasted;
    const focusIndex = Math.min(pasted.length, 5);
    digitRefs[focusIndex]?.focus();
  }

  $effect(() => {
    if (otpComplete && otpFormRef && !$otpDelayed) {
      otpFormRef.requestSubmit();
    }
  });

  $effect(() => {
    if (step === 'otp') {
      setTimeout(() => digitRefs[0]?.focus(), 100);
    }
  });

  function goBackToEmail() {
    step = 'email';
    $otpForm.password = '';
    $otpMessage = undefined;
  }
</script>

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <div class="z-10 w-full max-w-md">
    <Card.Root
      class="relative w-full overflow-hidden rounded-2xl border-none bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div class="h-1.5 w-full bg-linear-to-r from-epi-blue to-epi-teal"></div>

      <Card.Header class="space-y-4 pt-8 pb-4 text-center">
        <div
          class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
        >
          <Users class="h-7 w-7" />
        </div>

        <div class="space-y-1">
          <Card.Title
            class="font-heading text-3xl tracking-tight text-epi-blue uppercase"
          >
            Jump
          </Card.Title>
          <Card.Description
            class="text-sm font-bold tracking-tight text-slate-500 uppercase"
          >
            {#if step === 'email'}
              Espace Parent
            {:else}
              Vérification
            {/if}
          </Card.Description>
        </div>
      </Card.Header>

      <Card.Content class="pb-10">
        {#if step === 'email'}
          <div class="animate-slide-in-left">
            {#if $emailMessage && $emailMessage.type === 'error'}
              <Alert
                variant="destructive"
                class="mb-6 rounded-xl border-red-100 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
              >
                <CircleAlert class="h-4 w-4" />
                <AlertDescription class="text-xs font-medium"
                  >{$emailMessage.text}</AlertDescription
                >
              </Alert>
            {/if}

            <form method="POST" action="?/requestOtp" use:emailEnhance class="space-y-5">
              <div class="space-y-2">
                <Label
                  for="email"
                  class="pl-1 text-xs font-black text-slate-500 uppercase"
                  >Votre adresse email</Label
                >
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="votre@email.com"
                  bind:value={$emailForm.email}
                  class="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-base focus-visible:ring-epi-blue dark:border-slate-800 dark:bg-slate-950/50"
                />
                {#if $emailErrors.email}<span class="pl-1 text-xs font-bold text-red-500"
                    >{$emailErrors.email}</span
                  >{/if}
              </div>

              <Button
                type="submit"
                disabled={$emailDelayed}
                class="h-12 w-full rounded-xl bg-epi-blue text-base font-bold text-white shadow-md transition-all hover:bg-epi-blue/90 active:scale-[0.98]"
              >
                {#if $emailDelayed}
                  <Sparkles class="mr-2 h-4 w-4 animate-spin" /> Envoi en cours...
                {:else}
                  Recevoir mon code
                {/if}
              </Button>
            </form>
          </div>
        {:else}
          <div in:fly={{ x: 20, duration: 300 }}>
            {#if $otpMessage}
              <Alert
                variant="destructive"
                class="mb-6 rounded-xl border-red-100 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
              >
                <CircleAlert class="h-4 w-4" />
                <AlertDescription class="text-xs font-medium"
                  >{$otpMessage.text}</AlertDescription
                >
              </Alert>
            {/if}

            <div class="mb-6 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-950">
              <p class="text-xs font-bold text-slate-500 uppercase">Code envoyé à</p>
              <p class="font-bold text-epi-blue">{$otpForm.email}</p>
            </div>

            <form
              bind:this={otpFormRef}
              method="POST"
              action="?/verifyOtp"
              use:otpEnhance
              class="space-y-6"
            >
              <input type="hidden" name="email" bind:value={$otpForm.email} />

              <div class="space-y-3">
                <Label for="otp-digit-0" class="sr-only">Code à 6 chiffres</Label>
                <input type="hidden" name="password" bind:value={$otpForm.password} />

                <div class="flex justify-center gap-2.5">
                  {#each { length: 6 } as _, i}
                    <input
                      bind:this={digitRefs[i]}
                      id="otp-digit-{i}"
                      type="text"
                      inputmode="numeric"
                      autocomplete={i === 0 ? 'one-time-code' : 'off'}
                      maxlength={1}
                      placeholder=" "
                      value={digits[i]?.trim() || ''}
                      oninput={(e) => handleDigitInput(i, e)}
                      onkeydown={(e) => handleDigitKeydown(i, e)}
                      onpaste={handleDigitPaste}
                      class={cn(
                        'h-14 w-12 rounded-xl border-2 bg-white text-center font-mono text-2xl font-black text-slate-900 shadow-sm transition-all duration-200 outline-none dark:bg-slate-950 dark:text-white',
                        digits[i]?.trim()
                          ? 'border-epi-teal shadow-epi-teal/10'
                          : 'border-slate-200 dark:border-slate-800',
                        'focus:border-epi-blue focus:ring-2 focus:ring-epi-blue/20',
                      )}
                    />
                  {/each}
                </div>

                {#if $otpErrors.password}<span
                    class="block text-center text-xs font-bold text-red-500"
                    >{$otpErrors.password}</span
                  >{/if}
              </div>

              <div class="space-y-3">
                <Button
                  type="submit"
                  disabled={$otpDelayed || !otpComplete}
                  class="h-12 w-full rounded-xl bg-epi-teal text-base font-bold text-slate-950 shadow-md transition-all hover:bg-epi-teal/90 active:scale-[0.98] disabled:opacity-50"
                >
                  {#if $otpDelayed}
                    Connexion...
                  {:else}
                    <Lock class="mr-2 h-4 w-4" /> Se connecter
                  {/if}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  class="h-10 w-full rounded-xl text-xs font-bold text-slate-400 uppercase hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  onclick={goBackToEmail}
                  disabled={$otpDelayed}
                >
                  <ArrowLeft class="mr-1.5 h-3.5 w-3.5" /> Changer d'email
                </Button>
              </div>
            </form>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Espace Parents — Epitech Academy
    </p>
  </div>
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(parent\)/login/
git commit -m "feat(parent): add parent login page with Email OTP"
```

---

### Task 4: Create parent layout with guard

**Files:**
- Create: `frontend/src/routes/(parent)/+layout.server.ts`
- Create: `frontend/src/routes/(parent)/+layout.svelte`

- [ ] **Step 1: Create the layout server guard**

Create `frontend/src/routes/(parent)/+layout.server.ts`:

```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
  };
};
```

Note: The actual guard redirect logic is handled centrally in `guards.ts` (Task 2). This layout just passes user data to the client.

- [ ] **Step 2: Create the layout component**

Create `frontend/src/routes/(parent)/+layout.svelte`:

```svelte
<script lang="ts">
  import '../../app.css';
  import { Button } from '$lib/components/ui/button';
  import { LogOut } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data, children } = $props();
  const isLoginPage = $derived(!data.user);
</script>

{#if isLoginPage}
  {@render children()}
{:else}
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <header
      class="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/80"
    >
      <div class="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
        <a href={resolve('/parent')} class="flex items-center gap-2">
          <span class="font-heading text-xl font-bold tracking-tight text-epi-blue uppercase">
            Jump
          </span>
          <span class="rounded-full bg-epi-blue/10 px-2 py-0.5 text-[10px] font-bold text-epi-blue uppercase">
            Parent
          </span>
        </a>

        <form method="POST" action={resolve('/logout')}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            class="gap-2 text-slate-500 hover:text-red-500"
          >
            <LogOut class="h-4 w-4" />
            Déconnexion
          </Button>
        </form>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-8">
      {@render children()}
    </main>
  </div>
{/if}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(parent\)/+layout.server.ts frontend/src/routes/\(parent\)/+layout.svelte
git commit -m "feat(parent): add layout with header and logout"
```

---

### Task 5: Create parent dashboard page

**Files:**
- Create: `frontend/src/routes/(parent)/+page.server.ts`
- Create: `frontend/src/routes/(parent)/+page.svelte`

- [ ] **Step 1: Create the dashboard data loader**

Create `frontend/src/routes/(parent)/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentEmail = locals.user.email;

  const children = await prisma.talent.findMany({
    where: { parentEmail },
    select: {
      id: true,
      prenom: true,
      nom: true,
      imageRightsSignedAt: true,
      participations: {
        select: { id: true },
      },
    },
  });

  // For each child, fetch the upcoming event
  const childrenWithEvents = await Promise.all(
    children.map(async (child) => {
      const upcomingParticipation = await prisma.participation.findFirst({
        where: {
          talentId: child.id,
          event: { date: { gt: new Date() } },
        },
        include: {
          event: { select: { id: true, name: true, date: true } },
        },
        orderBy: { event: { date: 'asc' } },
      });

      return {
        id: child.id,
        prenom: child.prenom,
        nom: child.nom,
        imageRightsSigned: !!child.imageRightsSignedAt,
        eventsCount: child.participations.length,
        upcomingEvent: upcomingParticipation?.event ?? null,
      };
    }),
  );

  return {
    parentName: locals.user.name,
    children: childrenWithEvents,
  };
};
```

- [ ] **Step 2: Create the dashboard UI**

Create `frontend/src/routes/(parent)/+page.svelte`:

```svelte
<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { CalendarDays, Users, ChevronRight, FileCheck, FilePen } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data } = $props();
</script>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
      Bonjour{data.parentName ? `, ${data.parentName.split(' ')[0]}` : ''} !
    </h1>
    <p class="mt-1 text-sm text-slate-500">
      Suivez la progression de {data.children.length > 1 ? 'vos enfants' : 'votre enfant'}
    </p>
  </div>

  {#if data.children.length === 0}
    <Card.Root class="rounded-2xl border-slate-200 dark:border-slate-800">
      <Card.Content class="flex flex-col items-center gap-4 py-12">
        <Users class="h-12 w-12 text-slate-300" />
        <p class="text-sm text-slate-500">Aucun enfant inscrit pour le moment.</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2">
      {#each data.children as child}
        <a href={resolve(`/parent/enfant/${child.id}`)} class="group">
          <Card.Root
            class="h-full rounded-2xl border-slate-200 transition-all hover:border-epi-blue/30 hover:shadow-lg hover:shadow-epi-blue/5 dark:border-slate-800 dark:hover:border-epi-blue/30"
          >
            <Card.Content class="p-6">
              <div class="flex items-start justify-between">
                <div class="space-y-3">
                  <h2 class="text-lg font-bold text-slate-900 dark:text-white">
                    {child.prenom} {child.nom}
                  </h2>

                  <div class="flex items-center gap-2 text-sm text-slate-500">
                    <CalendarDays class="h-4 w-4" />
                    <span>{child.eventsCount} événement{child.eventsCount !== 1 ? 's' : ''} suivi{child.eventsCount !== 1 ? 's' : ''}</span>
                  </div>

                  {#if child.upcomingEvent}
                    <div class="rounded-lg bg-epi-blue/5 px-3 py-2">
                      <p class="text-[10px] font-bold text-epi-blue uppercase">Prochain événement</p>
                      <p class="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {child.upcomingEvent.name}
                      </p>
                      <p class="text-xs text-slate-500">
                        {new Date(child.upcomingEvent.date).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                    </div>
                  {:else}
                    <p class="text-xs text-slate-400">Aucun événement prévu</p>
                  {/if}
                </div>

                <ChevronRight
                  class="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-epi-blue"
                />
              </div>

              <div class="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                {#if child.imageRightsSigned}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    <FileCheck class="h-3 w-3" />
                    Droit à l'image signé
                  </Badge>
                {:else}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    <FilePen class="h-3 w-3" />
                    Droit à l'image à signer
                  </Badge>
                {/if}
              </div>
            </Card.Content>
          </Card.Root>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(parent\)/+page.server.ts frontend/src/routes/\(parent\)/+page.svelte
git commit -m "feat(parent): add dashboard with children cards"
```

---

### Task 6: Create child detail page

**Files:**
- Create: `frontend/src/routes/(parent)/enfant/[talentId]/+page.server.ts`
- Create: `frontend/src/routes/(parent)/enfant/[talentId]/+page.svelte`

- [ ] **Step 1: Create the child detail data loader**

Create `frontend/src/routes/(parent)/enfant/[talentId]/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentEmail = locals.user.email;
  const { talentId } = params;

  const child = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      parentEmail: true,
      imageRightsSignedAt: true,
    },
  });

  // Security: verify this child belongs to the parent
  if (!child || child.parentEmail !== parentEmail) {
    throw redirect(303, resolve('/parent'));
  }

  // Fetch upcoming event
  const upcomingParticipation = await prisma.participation.findFirst({
    where: {
      talentId,
      event: { date: { gt: new Date() } },
    },
    include: {
      event: { select: { id: true, name: true, date: true } },
    },
    orderBy: { event: { date: 'asc' } },
  });

  // Fetch all participations with activities for history
  const participations = await prisma.participation.findMany({
    where: { talentId },
    include: {
      event: { select: { id: true, name: true, date: true } },
      activities: {
        include: {
          activity: {
            select: { id: true, name: true, activityType: true },
          },
        },
      },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return {
    child: {
      id: child.id,
      prenom: child.prenom,
      nom: child.nom,
      imageRightsSigned: !!child.imageRightsSignedAt,
    },
    upcomingEvent: upcomingParticipation?.event ?? null,
    participations: participations.map((p) => ({
      id: p.id,
      eventName: p.event.name,
      eventDate: p.event.date,
      isPresent: p.isPresent,
      activities: p.activities
        .filter((a) => a.activity.activityType !== 'orga')
        .map((a) => ({
          id: a.activity.id,
          name: a.activity.name,
          type: a.activity.activityType,
        })),
    })),
  };
};
```

- [ ] **Step 2: Create the child detail UI**

Create `frontend/src/routes/(parent)/enfant/[talentId]/+page.svelte`:

```svelte
<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import {
    ArrowLeft,
    CalendarDays,
    Check,
    X,
    ChevronDown,
    FileCheck,
    FilePen,
    ExternalLink,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { cn } from '$lib/utils';

  let { data } = $props();

  const activityTypeLabels: Record<string, string> = {
    atelier: 'Atelier',
    conference: 'Conférence',
    quiz: 'Quiz',
    special: 'Spécial',
  };
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <a
      href={resolve('/parent')}
      class="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-900"
    >
      <ArrowLeft class="h-4 w-4 text-slate-500" />
    </a>
    <div>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
        {data.child.prenom} {data.child.nom}
      </h1>
    </div>
  </div>

  <!-- Image rights banner -->
  {#if !data.child.imageRightsSigned}
    <Card.Root
      class="rounded-2xl border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20"
    >
      <Card.Content class="flex items-center justify-between p-4">
        <div class="flex items-center gap-3">
          <FilePen class="h-5 w-5 text-amber-600" />
          <div>
            <p class="text-sm font-bold text-amber-800 dark:text-amber-300">
              Droit à l'image non signé
            </p>
            <p class="text-xs text-amber-600 dark:text-amber-400">
              La signature est requise pour continuer
            </p>
          </div>
        </div>
        <a
          href="{resolve('/parent/sign')}?student={data.child.id}"
          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700"
        >
          Signer maintenant
          <ExternalLink class="h-3.5 w-3.5" />
        </a>
      </Card.Content>
    </Card.Root>
  {:else}
    <Badge
      variant="secondary"
      class="gap-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
    >
      <FileCheck class="h-3 w-3" />
      Droit à l'image signé
    </Badge>
  {/if}

  <!-- Upcoming event -->
  {#if data.upcomingEvent}
    <Card.Root class="rounded-2xl border-epi-blue/20 bg-epi-blue/5 dark:border-epi-blue/30">
      <Card.Content class="p-5">
        <p class="text-[10px] font-bold text-epi-blue uppercase">Prochain événement</p>
        <p class="mt-1 text-lg font-bold text-slate-900 dark:text-white">
          {data.upcomingEvent.name}
        </p>
        <div class="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays class="h-4 w-4" />
          {new Date(data.upcomingEvent.date).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Event history -->
  <div class="space-y-3">
    <h2 class="text-lg font-bold text-slate-900 dark:text-white">
      Historique des événements
    </h2>

    {#if data.participations.length === 0}
      <Card.Root class="rounded-2xl border-slate-200 dark:border-slate-800">
        <Card.Content class="py-8 text-center">
          <p class="text-sm text-slate-500">Aucun événement pour le moment.</p>
        </Card.Content>
      </Card.Root>
    {:else}
      <div class="space-y-2">
        {#each data.participations as participation}
          <Collapsible.Root>
            <Card.Root class="rounded-xl border-slate-200 dark:border-slate-800">
              <Collapsible.Trigger class="w-full">
                <Card.Content class="flex items-center justify-between p-4">
                  <div class="flex items-center gap-3 text-left">
                    {#if participation.isPresent}
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/30"
                      >
                        <Check class="h-4 w-4 text-emerald-600" />
                      </div>
                    {:else}
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30"
                      >
                        <X class="h-4 w-4 text-red-500" />
                      </div>
                    {/if}
                    <div>
                      <p class="text-sm font-bold text-slate-900 dark:text-white">
                        {participation.eventName}
                      </p>
                      <p class="text-xs text-slate-500">
                        {new Date(participation.eventDate).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    {#if participation.activities.length > 0}
                      <span class="text-xs text-slate-400">
                        {participation.activities.length} activité{participation.activities.length !== 1 ? 's' : ''}
                      </span>
                    {/if}
                    <ChevronDown
                      class="h-4 w-4 text-slate-400 transition-transform [[data-state=open]_&]:rotate-180"
                    />
                  </div>
                </Card.Content>
              </Collapsible.Trigger>

              <Collapsible.Content>
                {#if participation.activities.length > 0}
                  <div class="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                    <div class="space-y-2">
                      {#each participation.activities as activity}
                        <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                          <span class="text-sm text-slate-700 dark:text-slate-300">
                            {activity.name}
                          </span>
                          <Badge variant="outline" class="text-[10px]">
                            {activityTypeLabels[activity.type] ?? activity.type}
                          </Badge>
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <div class="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                    <p class="text-xs text-slate-400">Aucune activité enregistrée</p>
                  </div>
                {/if}
              </Collapsible.Content>
            </Card.Root>
          </Collapsible.Root>
        {/each}
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(parent\)/enfant/
git commit -m "feat(parent): add child detail page with event history"
```

---

### Task 7: Verify full build and smoke test

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

Run: `cd frontend && bunx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `cd frontend && bun run lint`
Expected: No errors

- [ ] **Step 3: Run formatter**

Run: `cd frontend && bun run format`

- [ ] **Step 4: Build the project**

Run: `cd frontend && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit any formatting changes**

```bash
git add -A
git commit -m "style: format parent portal files"
```

- [ ] **Step 6: Manual smoke test checklist**

Verify these flows manually with `bun run dev`:
1. Navigate to `/parent/login` — see email input form
2. Enter a non-parent email — see "Aucun compte parent trouvé" error
3. Enter a valid parent email — receive OTP, transition to OTP step
4. Enter valid OTP — redirect to `/parent` dashboard
5. See children cards with event counts and image rights status
6. Click a child card — navigate to `/parent/enfant/[id]`
7. See upcoming event, event history with accordion
8. Click accordion — see activities list
9. If image rights not signed — see banner with "Signer maintenant" link
10. Click logout — session ends, redirect to `/parent/login`
11. Navigate to `/parent` while unauthenticated — redirect to `/parent/login`
12. Navigate to `/parent/enfant/[wrongId]` — redirect to dashboard
