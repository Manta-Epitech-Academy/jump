# Parent Sign Flow Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the parent signature flow on the talent flow: auth via BetterAuth OTP (no custom tokens), blocking image rights guard, delete `ParentToken` table.

**Architecture:** Remove the parallel auth system (`ParentToken` + public `/parent/sign` route). Parents authenticate via standard BetterAuth OTP like talents. A new guard in `guards.ts` blocks dashboard access until image rights are signed for all children. The signature page moves inside the `(parent)` route group as an authenticated route `/parent/signature`.

**Tech Stack:** SvelteKit 2 (Svelte 5), Prisma 7 + PostgreSQL, BetterAuth (emailOTP plugin), Resend email, Puppeteer PDF generation.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/lib/server/auth.ts:44-53` | Remove parent special-case in OTP hook — send email directly for all roles |
| Modify | `frontend/src/lib/server/otp.ts` | Add `sendParentOtpEmail()` function with parent-specific template |
| Modify | `frontend/src/lib/server/auth/guards.ts:184-200` | Add image rights guard for parent routes |
| Modify | `frontend/src/routes/(talent)/onboarding/+page.server.ts:86-128` | Simplify parent email sending (no more consume/store OTP) |
| Modify | `frontend/src/routes/(parent)/parent/login/+page.server.ts` | Remove ParentToken dependency, use standard OTP flow |
| Create | `frontend/src/routes/(parent)/parent/signature/+page.server.ts` | New authenticated signature page (load + sign action) |
| Create | `frontend/src/routes/(parent)/parent/signature/+page.svelte` | New signature UI (reuse sign form from old `/parent/sign`) |
| Modify | `frontend/src/routes/api/onboarding/send-parent-code/+server.ts` | Remove ParentToken dependency |
| Modify | `frontend/src/routes/logout/+page.server.ts:29-35` | Add `type=parent` redirect |
| Modify | `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.svelte:91-131` | Update banner link to `/parent/signature` |
| Delete | `frontend/src/lib/server/services/parentTokens.ts` | Entire file removed |
| Delete | `frontend/src/lib/server/services/parentEmail.ts` | Entire file removed (replaced by `sendParentOtpEmail`) |
| Delete | `frontend/src/routes/parent/sign/+page.server.ts` | Old public route removed |
| Delete | `frontend/src/routes/parent/sign/+page.svelte` | Old public route removed |
| Modify | `frontend/prisma/schema.prisma:167-179` | Drop `ParentToken` model |
| Create | `frontend/prisma/migrations/xxx/migration.sql` | Migration to drop `ParentToken` table |

---

### Task 1: Remove parent special-case from BetterAuth OTP hook

**Files:**
- Modify: `frontend/src/lib/server/auth.ts:10,44-53`

This is the root cause of the ParentToken workaround. The hook currently intercepts parent OTPs and stores them in DB instead of sending email. We make it send emails for everyone.

- [ ] **Step 1: Edit `auth.ts` — remove import and parent branch**

Replace the entire `sendVerificationOTP` callback and remove the `storeParentOtp` import:

```typescript
// auth.ts — lines 1-11: remove line 10
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { sendOtpEmail } from '$lib/server/otp';
import { sendParentOtpEmail } from '$lib/server/otp';
import { resolve } from '$app/paths';
import { dev } from '$app/environment';
// REMOVED: import { storeParentOtp } from '$lib/server/services/parentTokens';
```

Replace `sendVerificationOTP` callback (lines 44-54):

```typescript
async sendVerificationOTP({ email, otp }) {
  const user = await prisma.bauth_user.findUnique({
    where: { email },
    select: { role: true, name: true },
  });
  if (user?.role === 'parent') {
    await sendParentOtpEmail(email, otp, user.name ?? undefined);
    return;
  }
  await sendOtpEmail(email, otp, user?.name ?? undefined);
},
```

Now BetterAuth sends the email directly for parents too — no more DB roundtrip.

- [ ] **Step 2: Verify the project type-checks**

Run: `cd frontend && bun run check`
Expected: No errors related to `storeParentOtp` (not imported anywhere else yet — other files still import it, we'll fix those in later tasks).

Note: This step will show errors for other files still importing from `parentTokens.ts`. That's expected — we fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/lib/server/auth.ts && git commit -m "refactor(parent-auth): remove ParentToken OTP hook, send parent emails directly via BetterAuth"
```

---

### Task 2: Add `sendParentOtpEmail` to `otp.ts`

**Files:**
- Modify: `frontend/src/lib/server/otp.ts`

Add a parent-specific OTP email template. The parent receives a clear message: "your access code for Jump" + the OTP + the login URL. No signature link, no special flow.

- [ ] **Step 1: Add `sendParentOtpEmail` function**

Add after the existing `sendOtpEmail` function (after line 37):

```typescript
export async function sendParentOtpEmail(email: string, otp: string, name?: string) {
  const displayName = name || 'cher parent';
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: "Votre code d'accès Jump — Espace Parent",
    text: `Bonjour ${displayName},\n\nVoici votre code d'accès pour l'espace parent Jump :\n\n${otp}\n\nConnectez-vous sur ${loginUrl}\n\nCe code est valable 10 minutes.\n\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Bonjour <strong>${displayName}</strong>,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Voici votre code d'accès pour l'espace parent Jump :</p>

          <div style="background-color: #fff7ed; border: 2px dashed #ff5f3a; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 30px;">
            <strong style="font-size: 32px; font-family: monospace; letter-spacing: 8px; color: #ff5f3a;">${otp}</strong>
          </div>

          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Connectez-vous sur <a href="${loginUrl}" style="color: #2563eb; font-weight: bold; text-decoration: none;">${loginUrl}</a>
          </p>

          <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;"><i>Ce code est valable 10 minutes.</i></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Merci,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
```

Also add the `base` import at the top of the file (line 2, after the Resend import):

```typescript
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: `sendParentOtpEmail` is properly exported and used by `auth.ts` (from Task 1).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/lib/server/otp.ts && git commit -m "feat(parent-auth): add parent-specific OTP email template"
```

---

### Task 3: Simplify parent login — remove ParentToken dependency

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/login/+page.server.ts`

The login page currently does: BetterAuth OTP → store in ParentToken → consume from ParentToken → send email manually. Now BetterAuth sends the email directly via the hook (Task 1), so login just calls `sendVerificationOTP` and `signInEmailOTP` — identical to talent login.

- [ ] **Step 1: Rewrite `+page.server.ts`**

Replace the full file content:

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
            text: 'Aucun compte parent trouvé avec cette adresse email.',
          },
          { status: 404 },
        );
      }

      // BetterAuth generates OTP and sends email directly via hook
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

Key changes: removed `consumeParentOtp` import, removed `sendOtpEmail` import, removed manual OTP consumption + email sending from `requestOtp`.

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors in this file.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/login/+page.server.ts && git commit -m "refactor(parent-login): use standard BetterAuth OTP flow, remove ParentToken dependency"
```

---

### Task 4: Simplify talent onboarding — parent email creation

**Files:**
- Modify: `frontend/src/routes/(talent)/onboarding/+page.server.ts:1-11,86-128`

The onboarding `validateInfo` action currently: creates parent user → generates OTP via BetterAuth → consumes from ParentToken → sends custom email with link + OTP. Now it just: creates parent user → calls `sendVerificationOTP` (which sends the email directly via the hook).

- [ ] **Step 1: Edit imports — remove ParentToken dependencies**

Replace lines 1-11:

```typescript
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { infoValidationSchema } from '$lib/validation/onboarding';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';
import { auth } from '$lib/server/auth';
```

Removed: `sendParentSignatureEmail` import, `consumeParentOtp` import.

- [ ] **Step 2: Simplify the async parent email block**

Replace lines 91-128 (the fire-and-forget block inside `validateInfo`):

```typescript
    (async () => {
      // Upsert parent bauth_user
      let parentUser = await prisma.bauth_user.findUnique({
        where: { email: parentEmail },
      });

      if (!parentUser) {
        parentUser = await prisma.bauth_user.create({
          data: {
            email: parentEmail,
            name: `${result.data.parentPrenom} ${result.data.parentNom}`,
            role: 'parent',
            emailVerified: true,
          },
        });
      } else {
        await prisma.bauth_user.update({
          where: { id: parentUser.id },
          data: {
            name: `${result.data.parentPrenom} ${result.data.parentNom}`,
          },
        });
      }

      // Send OTP email directly via BetterAuth hook
      await auth.api.sendVerificationOTP({
        body: { email: parentEmail, type: 'sign-in' },
      });
    })().catch((err) => console.error('Failed to send parent email:', err));
```

Key change: removed `consumeParentOtp` call and `sendParentSignatureEmail` call. BetterAuth's hook now sends the email with just the OTP code.

- [ ] **Step 3: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors in this file.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/routes/\(talent\)/onboarding/+page.server.ts && git commit -m "refactor(onboarding): simplify parent email to standard BetterAuth OTP flow"
```

---

### Task 5: Simplify send-parent-code API endpoint

**Files:**
- Modify: `frontend/src/routes/api/onboarding/send-parent-code/+server.ts`

This endpoint lets a student resend the parent OTP. Same simplification: just call `sendVerificationOTP`, the hook handles the rest.

- [ ] **Step 1: Rewrite the endpoint**

Replace full file:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const profile = locals.talent;

  if (!profile.parentEmail) {
    throw error(400, 'Aucun email parent renseigné');
  }

  // BetterAuth generates OTP and sends email directly via hook
  await auth.api.sendVerificationOTP({
    body: { email: profile.parentEmail, type: 'sign-in' },
  });

  return json({ success: true });
};
```

Removed: `sendParentSignatureEmail` import, `consumeParentOtp` import, manual OTP consumption.

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/api/onboarding/send-parent-code/+server.ts && git commit -m "refactor(api): simplify send-parent-code to standard BetterAuth OTP flow"
```

---

### Task 6: Add image rights guard for parent routes

**Files:**
- Modify: `frontend/src/lib/server/auth/guards.ts:9,29-31,184-200`

Add a blocking guard: after confirming the parent is authenticated, check if all their children have signed image rights. If not, redirect to `/parent/signature`.

- [ ] **Step 1: Add path definition and guard logic**

Add new path definition after line 30 (`pathParentRoot`):

```typescript
const pathParentSignature = p('/parent/signature');
```

Replace the parent guards block (lines 184-200) with:

```typescript
  // --- Parent Guards ---
  if (isParentRoute) {
    const isParentPublic = currentPath === pathParentLogin;

    if (
      !isParentPublic &&
      (!event.locals.user || event.locals.user.role !== 'parent')
    ) {
      return Response.redirect(new URL(pathParentLogin, event.url).href, 303);
    }
    if (
      event.locals.user?.role === 'parent' &&
      currentPath === pathParentLogin
    ) {
      return Response.redirect(new URL(pathParentRoot, event.url).href, 303);
    }

    // Image rights guard: block dashboard until all children have signed
    if (
      event.locals.user?.role === 'parent' &&
      !isParentPublic &&
      currentPath !== pathParentSignature
    ) {
      const unsignedCount = await prisma.talent.count({
        where: {
          parentEmail: event.locals.user.email,
          imageRightsSignedAt: null,
        },
      });
      if (unsignedCount > 0) {
        return Response.redirect(
          new URL(pathParentSignature, event.url).href,
          303,
        );
      }
    }

    // Already signed all: prevent going back to signature page
    if (
      event.locals.user?.role === 'parent' &&
      currentPath === pathParentSignature
    ) {
      const unsignedCount = await prisma.talent.count({
        where: {
          parentEmail: event.locals.user.email,
          imageRightsSignedAt: null,
        },
      });
      if (unsignedCount === 0) {
        return Response.redirect(new URL(pathParentRoot, event.url).href, 303);
      }
    }
  }
```

- [ ] **Step 2: Add prisma import**

Add at line 3 (after existing imports):

```typescript
import { prisma } from '$lib/server/db';
```

- [ ] **Step 3: Make the function async**

The function signature on line 5 must become async since we now `await` Prisma queries:

```typescript
export async function applyRouteGuards(event: RequestEvent): Promise<Response | null> {
```

- [ ] **Step 4: Update `hooks.server.ts` to await the guard**

In `frontend/src/hooks.server.ts`, line 62, the call is currently:

```typescript
const guardResponse = applyRouteGuards(event);
```

Change to:

```typescript
const guardResponse = await applyRouteGuards(event);
```

- [ ] **Step 5: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/lib/server/auth/guards.ts src/hooks.server.ts && git commit -m "feat(parent-guard): add blocking image rights guard for parent routes"
```

---

### Task 7: Create authenticated signature page — server logic

**Files:**
- Create: `frontend/src/routes/(parent)/parent/signature/+page.server.ts`

This is the new signature page inside the `(parent)` group. It's protected by the role guard + image rights guard. Loads unsigned children, handles the sign action per child.

- [ ] **Step 1: Create `+page.server.ts`**

```typescript
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const unsignedChildren = await prisma.talent.findMany({
    where: {
      parentEmail: locals.user.email,
      imageRightsSignedAt: null,
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
    },
  });

  if (unsignedChildren.length === 0) {
    throw redirect(303, resolve('/parent'));
  }

  return {
    parentName: locals.user.name,
    children: unsignedChildren,
  };
};

export const actions: Actions = {
  sign: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'parent') {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const talentId = (formData.get('talentId') as string)?.trim();
    const signerName = (formData.get('signerName') as string)?.trim();
    const relationship = (formData.get('relationship') as string)?.trim();
    const city = (formData.get('city') as string)?.trim();
    const accepted = formData.get('accepted');

    if (!talentId) {
      return { error: 'Identifiant enfant manquant.' };
    }

    // Security: verify this child belongs to the authenticated parent
    const profile = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true, prenom: true, nom: true, parentEmail: true },
    });

    if (!profile || profile.parentEmail !== locals.user.email) {
      throw error(403, 'Accès non autorisé pour cet enfant.');
    }

    if (!accepted) {
      return { error: "Vous devez cocher l'autorisation pour signer.", talentId };
    }

    if (!signerName || signerName.length < 2) {
      return { error: 'Veuillez entrer votre nom complet.', talentId };
    }

    if (!relationship) {
      return { error: 'Veuillez indiquer votre qualité (mère, père, tuteur).', talentId };
    }

    if (!city) {
      return { error: 'Veuillez indiquer la ville.', talentId };
    }

    const now = new Date();
    const storage = getStorage();
    const studentName = `${profile.prenom} ${profile.nom}`;

    const pdf = await generateOnboardingPDF({
      type: 'image-rights',
      studentName,
      signerName,
      relationship,
      city,
      signedAt: now,
    });

    const key = `documents/${profile.id}/image-rights-${now.getTime()}.pdf`;
    await storage.save(key, pdf);

    await prisma.talent.update({
      where: { id: profile.id },
      data: {
        imageRightsSignedAt: now,
        imageRightsSignerName: signerName,
        imageRightsFilePath: key,
      },
    });

    // Check if more children need signing
    const remaining = await prisma.talent.count({
      where: {
        parentEmail: locals.user.email,
        imageRightsSignedAt: null,
      },
    });

    if (remaining === 0) {
      throw redirect(303, resolve('/parent'));
    }

    // Stay on page for remaining children
    return { success: studentName };
  },
};
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors (types generated from route file).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/signature/+page.server.ts && git commit -m "feat(parent-signature): create authenticated signature page server logic"
```

---

### Task 8: Create authenticated signature page — UI

**Files:**
- Create: `frontend/src/routes/(parent)/parent/signature/+page.svelte`

Reuses the visual design from the old `/parent/sign` page (sign step). No OTP step needed — the parent is already authenticated. Shows one form per unsigned child.

- [ ] **Step 1: Create `+page.svelte`**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Camera, CheckCircle } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { marked } from 'marked';
  import droitImageBodyMd from '$lib/content/droit-image-body.md?raw';
  import { fly } from 'svelte/transition';

  const droitImageBody = marked.parse(droitImageBodyMd) as string;

  let { data, form } = $props();

  // Per-child form state
  let formState = $state<Record<string, {
    signerName: string;
    relationship: string;
    city: string;
    accepted: boolean;
    submitting: boolean;
  }>>({});

  function getState(childId: string) {
    if (!formState[childId]) {
      formState[childId] = {
        signerName: '',
        relationship: '',
        city: '',
        accepted: false,
        submitting: false,
      };
    }
    return formState[childId];
  }

  function canSign(childId: string) {
    const s = getState(childId);
    return (
      s.accepted &&
      s.signerName.trim().length >= 2 &&
      s.relationship !== '' &&
      s.city.trim().length >= 1 &&
      !s.submitting
    );
  }
</script>

<div class="mx-auto max-w-2xl px-4 py-8 sm:py-12">
  <div class="mb-8 text-center" in:fly={{ y: -20, duration: 400 }}>
    <div
      class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
    >
      <Camera class="h-7 w-7" />
    </div>
    <h1
      class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
    >
      Droit à l'image
    </h1>
    <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
      Veuillez signer l'autorisation pour {data.children.length > 1 ? 'chacun de vos enfants' : 'votre enfant'}.
    </p>
  </div>

  {#if form?.success}
    <div
      class="mb-6 flex items-center gap-3 rounded-2xl bg-green-50 p-4 dark:bg-green-950/20"
      in:fly={{ y: 10, duration: 300 }}
    >
      <CheckCircle class="h-5 w-5 shrink-0 text-green-600" />
      <p class="text-sm font-semibold text-green-800 dark:text-green-300">
        Autorisation signée pour <strong>{form.success}</strong>.
      </p>
    </div>
  {/if}

  {#if form?.error && !form?.talentId}
    <p
      class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
    >
      {form.error}
    </p>
  {/if}

  <div class="space-y-8">
    {#each data.children as child (child.id)}
      {@const s = getState(child.id)}
      <div
        class="overflow-hidden rounded-3xl bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
        in:fly={{ y: 20, duration: 400 }}
      >
        <div class="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <p class="font-heading text-lg text-slate-900 uppercase dark:text-white">
            {child.prenom} {child.nom}
          </p>
        </div>

        <form
          method="POST"
          action="?/sign"
          use:enhance={() => {
            s.submitting = true;
            return async ({ update }) => {
              await update();
              s.submitting = false;
            };
          }}
        >
          <input type="hidden" name="talentId" value={child.id} />

          {#if form?.error && form?.talentId === child.id}
            <p class="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {form.error}
            </p>
          {/if}

          <div class="max-h-[40vh] overflow-y-auto p-6">
            <div class="markdown-content max-w-none text-sm">
              <p>
                Je soussign&eacute;(e), Mme/Mr
                <input
                  name="signerName"
                  type="text"
                  bind:value={s.signerName}
                  placeholder="___________________"
                  required
                  class="inline-block w-44 border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm font-semibold text-slate-900 placeholder:text-slate-300 focus:border-epi-blue focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
                />
                agissant en qualit&eacute; de
                <select
                  name="relationship"
                  bind:value={s.relationship}
                  required
                  class="inline-block w-auto border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm font-semibold text-slate-900 focus:border-epi-blue focus:ring-0 dark:text-white [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-800 dark:[&>option]:text-white"
                >
                  <option value="" disabled>(choisir)</option>
                  <option value="mère">mère</option>
                  <option value="père">père</option>
                  <option value="tuteur légal">tuteur légal</option>
                  <option value="tutrice légale">tutrice légale</option>
                </select>, autorise <strong>Epitech</strong> à utiliser l'image de
                mon enfant <strong>{child.prenom} {child.nom}</strong> dans le cadre du stage de seconde.
              </p>
              {@html droitImageBody}
              <p class="mt-6">
                <strong>Fait &agrave;</strong>
                <input
                  name="city"
                  type="text"
                  bind:value={s.city}
                  placeholder="__________________"
                  required
                  class="inline-block w-40 border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
                /><strong>, le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>
              </p>
            </div>
          </div>

          <div class="px-6 pb-6">
            <label class="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50/70 px-4 py-3 dark:bg-slate-800/50">
              <input
                type="checkbox"
                name="accepted"
                bind:checked={s.accepted}
                class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
              />
              <span class="text-sm text-slate-700 dark:text-slate-300">
                En tant que représentant légal, j'autorise l'utilisation de l'image de mon enfant
              </span>
            </label>

            <Button
              type="submit"
              disabled={!canSign(child.id)}
              class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110 disabled:opacity-50"
            >
              {#if s.submitting}
                Signature en cours...
              {:else}
                Signer pour {child.prenom}
              {/if}
            </Button>
          </div>
        </form>
      </div>
    {/each}
  </div>

  <p class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase">
    Espace Parents — Epitech Academy
  </p>
</div>
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/signature/+page.svelte && git commit -m "feat(parent-signature): create authenticated signature page UI"
```

---

### Task 9: Delete old public `/parent/sign` route

**Files:**
- Delete: `frontend/src/routes/parent/sign/+page.server.ts`
- Delete: `frontend/src/routes/parent/sign/+page.svelte`

The old public route is replaced by the authenticated `/parent/signature` inside `(parent)`.

- [ ] **Step 1: Delete both files**

```bash
rm frontend/src/routes/parent/sign/+page.server.ts frontend/src/routes/parent/sign/+page.svelte
rmdir frontend/src/routes/parent/sign frontend/src/routes/parent 2>/dev/null || true
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors (no other file imports from these routes).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add -A src/routes/parent/ && git commit -m "refactor(parent-sign): delete old public signature route"
```

---

### Task 10: Update child detail page — fix banner link

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.svelte:112-115`

The banner currently links to the old `/parent/sign?student=...`. Update it to `/parent/signature` (no student param needed — the new page loads all unsigned children).

- [ ] **Step 1: Update banner link**

Replace lines 112-115:

```svelte
          <a
            href={resolve('/parent/signature')}
            class="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-amber-600/20 transition-all hover:bg-amber-700 active:scale-[0.98]"
          >
            Signer maintenant
          </a>
```

Also remove the `ExternalLink` import from the imports (line 8) since it's no longer used:

Replace line 8:

```typescript
  import {
    ArrowLeft,
    CalendarDays,
    Check,
    X,
    ChevronDown,
    FileCheck,
    FilePen,
    History,
    Rocket,
    LogOut,
    Clock,
    MapPin,
  } from '@lucide/svelte';
```

(Removed `ExternalLink` from the import list.)

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/enfant/\[talentId\]/+page.svelte && git commit -m "fix(parent-ui): update image rights banner link to new signature route"
```

---

### Task 11: Fix parent logout redirect

**Files:**
- Modify: `frontend/src/routes/logout/+page.server.ts:29-35`

Add `type=parent` handling so parents redirect to `/parent/login` after logout.

- [ ] **Step 1: Add parent case**

Replace lines 29-35:

```typescript
    if (type === 'admin') {
      throw redirect(303, resolve('/staff/admin/login'));
    } else if (type === 'student') {
      throw redirect(303, resolve('/login'));
    } else if (type === 'parent') {
      throw redirect(303, resolve('/parent/login'));
    } else {
      throw redirect(303, resolve('/staff/login'));
    }
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/routes/logout/+page.server.ts && git commit -m "fix(logout): add parent redirect to /parent/login"
```

---

### Task 12: Delete `parentTokens.ts` and `parentEmail.ts`

**Files:**
- Delete: `frontend/src/lib/server/services/parentTokens.ts`
- Delete: `frontend/src/lib/server/services/parentEmail.ts`

By this point, no file should import from these anymore (verified in Tasks 1-5, 9).

- [ ] **Step 1: Delete both files**

```bash
rm frontend/src/lib/server/services/parentTokens.ts frontend/src/lib/server/services/parentEmail.ts
```

- [ ] **Step 2: Verify no remaining imports**

Run: `cd frontend && grep -r "parentTokens\|parentEmail\|sendParentSignatureEmail\|consumeParentOtp\|storeParentOtp\|createSignToken\|verifySignToken" src/`
Expected: No output (zero matches).

- [ ] **Step 3: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add -A src/lib/server/services/parentTokens.ts src/lib/server/services/parentEmail.ts && git commit -m "refactor(cleanup): delete ParentToken service and parent email service"
```

---

### Task 13: Drop `ParentToken` table — Prisma migration

**Files:**
- Modify: `frontend/prisma/schema.prisma:167-179`
- Create: migration via `prisma migrate dev`

- [ ] **Step 1: Remove `ParentToken` model from schema**

Delete lines 167-179 in `schema.prisma` (the entire `model ParentToken { ... }` block).

- [ ] **Step 2: Generate migration**

```bash
cd frontend && bunx prisma migrate dev --name drop_parent_token_table
```

Expected: Migration created successfully, `DROP TABLE "ParentToken"` in the SQL.

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd frontend && bun run db:generate
```

- [ ] **Step 4: Verify full type-check**

Run: `cd frontend && bun run check`
Expected: No errors. No code references `prisma.parentToken` anymore.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add prisma/ && git commit -m "feat(db): drop ParentToken table — no longer needed with standard BetterAuth OTP flow"
```

---

### Task 14: Final verification

- [ ] **Step 1: Full type-check**

Run: `cd frontend && bun run check`
Expected: Zero errors.

- [ ] **Step 2: Lint check**

Run: `cd frontend && bun run lint`
Expected: No new lint errors.

- [ ] **Step 3: Build check**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 4: Grep for dead references**

```bash
cd frontend && grep -r "ParentToken\|parentToken\|signToken\|parent/sign" src/ --include="*.ts" --include="*.svelte"
```

Expected: No matches (zero dead references).

- [ ] **Step 5: Manual smoke test checklist**

1. Start dev server: `bun run dev`
2. Create a talent → validate info with parent email → verify parent receives OTP-only email (no link)
3. Go to `/parent/login` → enter parent email → receive OTP → login
4. Verify redirect to `/parent/signature` (not dashboard)
5. Sign image rights → verify redirect to dashboard
6. Verify banner on child detail shows "Droit à l'image signé"
7. Logout → verify redirect to `/parent/login`
