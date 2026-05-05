# Parent Signature Flow Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the parent signature flow so authenticated parents can sign from the portal without a redundant OTP, and fix the race condition + email leak issues.

**Architecture:** When a parent is already authenticated via session, `/parent/sign` skips the OTP step and creates a `signToken` directly. For unauthenticated access (from email link), the existing OTP flow is preserved. The `parentEmail` is no longer exposed in the load function to unauthenticated users.

**Tech Stack:** SvelteKit 2, Prisma, BetterAuth

---

## File Structure

Modified files:
- `frontend/src/routes/parent/sign/+page.server.ts` — add session-aware bypass of OTP step, mask email for unauthenticated users
- `frontend/src/routes/parent/sign/+page.svelte` — handle new `sign` step from load (when authenticated parent arrives)
- `frontend/src/routes/(talent)/onboarding/+page.server.ts` — fix race condition in async IIFE by awaiting OTP storage before consuming
- `frontend/src/lib/server/services/parentEmail.ts` — accept OTP as parameter instead of consuming from DB (eliminates race condition)

---

### Task 1: Fix `/parent/sign` to skip OTP for authenticated parents

When a parent is logged in (via the parent portal), they click "Signer maintenant" and arrive at `/parent/sign?student=xxx`. Currently, the page always shows the OTP step. Instead, if the parent is authenticated and their email matches the child's `parentEmail`, we should skip OTP and go directly to the sign step with a `signToken`.

**Files:**
- Modify: `frontend/src/routes/parent/sign/+page.server.ts`

- [ ] **Step 1: Update the load function to accept `locals` and check auth**

Replace the entire `load` function in `frontend/src/routes/parent/sign/+page.server.ts`:

```typescript
export const load: PageServerLoad = async ({ url, locals }) => {
  const talentId = url.searchParams.get('student');
  if (!talentId) {
    throw error(400, 'Paramètre student manquant.');
  }

  const profile = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      parentEmail: true,
      imageRightsSignedAt: true,
      imageRightsSignerName: true,
    },
  });

  if (!profile) {
    throw error(404, 'Profil étudiant introuvable.');
  }

  const studentName = `${profile.prenom} ${profile.nom}`;

  // Already signed — show thank you page directly
  if (profile.imageRightsSignedAt) {
    return {
      step: 'done' as const,
      studentName,
      talentId,
    };
  }

  // If parent is authenticated and email matches, skip OTP → go to sign step
  if (
    locals.user?.role === 'parent' &&
    locals.user.email.toLowerCase() === profile.parentEmail?.toLowerCase()
  ) {
    const signToken = await createSignToken(talentId, locals.user.email);
    return {
      step: 'sign' as const,
      studentName,
      talentId,
      email: locals.user.email,
      signToken,
    };
  }

  // Unauthenticated: show OTP step — mask email for privacy
  const maskedEmail = profile.parentEmail
    ? maskEmail(profile.parentEmail)
    : null;

  return {
    step: 'otp' as const,
    studentName,
    talentId,
    parentEmail: profile.parentEmail,
    maskedEmail,
  };
};
```

- [ ] **Step 2: Add the `maskEmail` helper at the top of the file (after imports)**

```typescript
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/parent/sign/+page.server.ts
git commit -m "fix(parent-sign): skip OTP for authenticated parents and mask email"
```

---

### Task 2: Update `/parent/sign` UI to handle authenticated flow

The Svelte page needs to handle the case where load returns `step: 'sign'` directly (no OTP step). Currently the OTP form uses `data.parentEmail` for the hidden email field. When the parent is authenticated, the email comes from `data.email` instead. Also display the masked email for unauthenticated users.

**Files:**
- Modify: `frontend/src/routes/parent/sign/+page.svelte`

- [ ] **Step 1: Update the email display and hidden field**

In `frontend/src/routes/parent/sign/+page.svelte`, find the OTP step section. Replace the email display block (lines 133-142):

```svelte
      {#if data.maskedEmail}
        <div
          class="mb-6 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-950"
        >
          <p class="text-xs font-bold text-slate-500 uppercase">
            Code envoyé à
          </p>
          <p class="font-bold text-epi-blue">{data.maskedEmail}</p>
        </div>
      {/if}
```

The hidden email input on line 157 stays as-is (`data.parentEmail`) since the server still needs the real email for OTP verification. Same for the resendOtp form on line 215.

- [ ] **Step 2: Add a derived for the email used in sign step**

In the script section, add after the existing derived declarations:

```typescript
  const email = $derived(form?.email ?? data.email ?? '');
```

This is needed because when the load returns `step: 'sign'` directly (authenticated parent), the email is in `data.email`.

- [ ] **Step 3: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/parent/sign/+page.svelte
git commit -m "fix(parent-sign): show masked email for unauthenticated, handle auth flow in UI"
```

---

### Task 3: Fix OTP race condition in parentEmail service

Currently `sendParentSignatureEmail` calls `consumeParentOtp()` which reads the OTP from the DB. But the OTP is stored asynchronously by BetterAuth's hook. If the read happens before the write, the email arrives without a code.

Fix: pass the OTP as a parameter to `sendParentSignatureEmail` instead of consuming from DB. The caller already has access to the OTP through the `storeParentOtp` function. But actually, the caller doesn't have the raw OTP — it's generated inside BetterAuth and passed to the hook. So the fix is: have `storeParentOtp` return the OTP, and have the caller pass it to `sendParentSignatureEmail`. Wait — the caller doesn't call `storeParentOtp` directly, the BetterAuth hook does.

Better approach: make `sendParentSignatureEmail` read the OTP from the DB (like it does now) but use a retry/await pattern. Actually the simplest fix: `storeParentOtp` already `await`s the DB write before returning. The BetterAuth hook `await`s `storeParentOtp`. The real question is: does `auth.api.sendVerificationOTP` return/resolve AFTER the hook completes? Looking at the BetterAuth source, yes — `sendVerificationOTP` awaits the hook. So by the time the `await auth.api.sendVerificationOTP()` call resolves, the OTP is in the DB. The callers in onboarding and resendOtp both `await` this call before calling `sendParentSignatureEmail`. So there is no actual race condition in the sequential flow.

BUT in the onboarding flow, the entire block is in an async IIFE that's fire-and-forget — which means errors are swallowed. The sequential ordering inside the IIFE is fine (both calls are awaited). The real bug is that errors are silent.

Simpler fix: pass the OTP directly to avoid the DB round-trip entirely. Have `storeParentOtp` also return the OTP value. Then the callers can pass it to `sendParentSignatureEmail`.

Actually, even simpler: modify `sendParentSignatureEmail` to accept an optional `otp` parameter. If provided, use it; if not, try to consume from DB (backward compat).

**Files:**
- Modify: `frontend/src/lib/server/services/parentEmail.ts:15-21`
- Modify: `frontend/src/lib/server/services/parentTokens.ts:6-18`
- Modify: `frontend/src/routes/(talent)/onboarding/+page.server.ts:114-121`
- Modify: `frontend/src/routes/parent/sign/+page.server.ts:249-260` (resendOtp action)
- Modify: `frontend/src/routes/api/onboarding/send-parent-code/+server.ts:17-27`

- [ ] **Step 1: Make `storeParentOtp` return the OTP value**

In `frontend/src/lib/server/services/parentTokens.ts`, change the return type of `storeParentOtp`:

```typescript
export async function storeParentOtp(email: string, otp: string): Promise<string> {
  // Upsert: replace any existing OTP for this email
  await prisma.parentToken.deleteMany({ where: { email, type: 'otp' } });
  await prisma.parentToken.create({
    data: {
      email,
      talentId: '',
      type: 'otp',
      value: otp,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return otp;
}
```

- [ ] **Step 2: Update `sendParentSignatureEmail` to accept OTP as parameter**

In `frontend/src/lib/server/services/parentEmail.ts`, replace the function signature and remove the `consumeParentOtp` import/call:

```typescript
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';

let resend: Resend;

function getResend() {
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendParentSignatureEmail(
  parentEmail: string,
  talentId: string,
  studentName: string,
  otp?: string,
) {
  const signUrl = `${env.ORIGIN}${base}/parent/sign?student=${talentId}`;

  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: parentEmail,
    subject: "Autorisation de droit à l'image — Epitech Academy",
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Bonjour,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Votre enfant <strong>${studentName}</strong> participe aux ateliers Epitech Academy.
            Pour finaliser son inscription, nous avons besoin de votre autorisation concernant le droit à l'image.
          </p>

          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 10px;">Rendez-vous sur le lien ci-dessous :</p>
          <p style="text-align: center; margin-bottom: 20px;">
            <a href="${signUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 12px; font-size: 16px; font-weight: bold; text-decoration: none;">Signer l'autorisation</a>
          </p>

          ${
            otp
              ? `
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 10px;">Puis entrez ce code de connexion :</p>
          <div style="background-color: #fff7ed; border: 2px dashed #ff5f3a; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 30px;">
            <strong style="font-size: 32px; font-family: monospace; letter-spacing: 8px; color: #ff5f3a;">${otp}</strong>
          </div>
          <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;"><i>Ce code est valable 10 minutes.</i></p>
          `
              : ''
          }

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Merci,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
```

- [ ] **Step 3: Update the auth hook to return the OTP from `storeParentOtp`**

In `frontend/src/lib/server/auth.ts`, the `sendVerificationOTP` hook currently does:

```typescript
if (user?.role === 'parent' && type !== 'sign-in') {
  await storeParentOtp(email, otp);
  return;
}
```

No change needed here — `storeParentOtp` now returns the OTP but the hook doesn't need to use it. The callers will get the OTP from `consumeParentOtp` at the call site.

Actually, we need a different approach. The BetterAuth hook doesn't let us return the OTP to the caller. The caller calls `auth.api.sendVerificationOTP()` which internally calls the hook. The OTP is generated by BetterAuth, not by us.

Better approach: keep `consumeParentOtp` as it is, but call it from the call sites (onboarding, resendOtp, send-parent-code) AFTER `sendVerificationOTP` resolves, then pass the consumed OTP to `sendParentSignatureEmail`.

- [ ] **Step 3 (revised): Update callers to consume OTP and pass to email function**

In `frontend/src/routes/(talent)/onboarding/+page.server.ts`, replace lines 114-120:

```typescript
        // Send OTP via BetterAuth (stores in parentToken table for parent role)
        await auth.api.sendVerificationOTP({
          body: { email: parentEmail, type: 'sign-up' },
        });

        // Consume OTP from DB and send combined email with link + code
        const otp = await consumeParentOtp(parentEmail);
        await sendParentSignatureEmail(parentEmail, talentId, studentName, otp ?? undefined);
```

Add the import at top of file:

```typescript
import { consumeParentOtp } from '$lib/server/services/parentTokens';
```

- [ ] **Step 4: Update resendOtp action in `/parent/sign`**

In `frontend/src/routes/parent/sign/+page.server.ts`, in the `resendOtp` action, replace lines 250-260:

```typescript
      // sendVerificationOTP stores the OTP in DB (parent role + non-sign-in type)
      await auth.api.sendVerificationOTP({
        body: { email, type: 'sign-up' },
      });

      // Consume OTP from DB and send combined email with link + code
      const otp = await consumeParentOtp(email);
      await sendParentSignatureEmail(
        email,
        talentId,
        profile ? `${profile.prenom} ${profile.nom}` : '',
        otp ?? undefined,
      );
```

Add the import at top of file:

```typescript
import {
  createSignToken,
  verifySignToken,
  consumeParentOtp,
} from '$lib/server/services/parentTokens';
```

(Replace the existing import that only imports `createSignToken` and `verifySignToken`.)

- [ ] **Step 5: Update the API endpoint**

In `frontend/src/routes/api/onboarding/send-parent-code/+server.ts`, replace the entire file:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { sendParentSignatureEmail } from '$lib/server/services/parentEmail';
import { consumeParentOtp } from '$lib/server/services/parentTokens';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const profile = locals.talent;

  if (!profile.parentEmail) {
    throw error(400, 'Aucun email parent renseigné');
  }

  // Send OTP via BetterAuth (stores in parentToken table for parent role)
  await auth.api.sendVerificationOTP({
    body: { email: profile.parentEmail, type: 'sign-up' },
  });

  // Consume OTP from DB and send combined email with link + code
  const otp = await consumeParentOtp(profile.parentEmail);
  await sendParentSignatureEmail(
    profile.parentEmail,
    profile.id,
    `${profile.prenom} ${profile.nom}`,
    otp ?? undefined,
  );

  return json({ success: true });
};
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/server/services/parentEmail.ts frontend/src/lib/server/services/parentTokens.ts frontend/src/routes/(talent)/onboarding/+page.server.ts frontend/src/routes/parent/sign/+page.server.ts frontend/src/routes/api/onboarding/send-parent-code/+server.ts
git commit -m "fix(parent-sign): eliminate OTP race condition by passing OTP directly to email"
```

---

### Task 4: Verify full build

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

Run: `cd frontend && bunx tsc --noEmit --pretty`

- [ ] **Step 2: Run linter**

Run: `cd frontend && bun run lint`

- [ ] **Step 3: Run formatter**

Run: `cd frontend && bun run format`

- [ ] **Step 4: Build**

Run: `cd frontend && bun run build`

- [ ] **Step 5: Commit formatting changes if any**

```bash
git add -A
git commit -m "style: format parent sign fix files"
```
