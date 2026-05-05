# Onboarding Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a semi-automatic onboarding reminder page in the Dev space, allowing superdevs to send targeted email reminders to students and parents with incomplete onboarding.

**Architecture:** New Prisma model `OnboardingReminder` tracks sent reminders. Two new Resend email functions (student + parent templates). A new `/staff/dev/reminders/` page with server load + action, gated to `devLead`. Sidebar link added under the existing "Gestion" section.

**Tech Stack:** SvelteKit, Prisma, Resend, Superforms + Zod, Bits UI (Table, Checkbox, Dialog), Tailwind CSS

---

## File Map

| File                                                     | Action | Responsibility                                                 |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `prisma/schema.prisma`                                   | Modify | Add `OnboardingReminder` model + relation on `Talent`          |
| `src/lib/server/otp.ts`                                  | Modify | Add `sendStudentReminderEmail` and `sendParentReminderEmail`   |
| `src/lib/validation/reminders.ts`                        | Create | Zod schema for the reminder send action                        |
| `src/routes/(staff)/staff/dev/reminders/+page.server.ts` | Create | Load incomplete onboardings + send reminder action             |
| `src/routes/(staff)/staff/dev/reminders/+page.svelte`    | Create | UI: table, filters, selection, send button with confirm dialog |
| `src/lib/server/auth/guards.ts`                          | Modify | Add route gate for `/staff/dev/reminders`                      |
| `src/routes/(staff)/staff/dev/+layout.svelte`            | Modify | Add "Relances" nav link in Gestion section                     |

---

### Task 1: Prisma model `OnboardingReminder`

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the OnboardingReminder model**

In `prisma/schema.prisma`, add after the last model:

```prisma
model OnboardingReminder {
  id       String   @id @default(cuid())
  talentId String
  type     String   // "student" | "parent"
  sentAt   DateTime @default(now())
  sentBy   String   // staff userId

  talent Talent @relation(fields: [talentId], references: [id], onDelete: Cascade)

  @@index([talentId])
}
```

- [ ] **Step 2: Add the relation on Talent**

In the `Talent` model, add the reverse relation after the `interviews` line:

```prisma
  reminders      OnboardingReminder[]
```

- [ ] **Step 3: Generate Prisma client and create migration**

Run from `frontend/`:

```bash
bunx prisma migrate dev --name add_onboarding_reminder
```

Expected: Migration created, Prisma client regenerated. No errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add OnboardingReminder model for tracking sent reminders"
```

---

### Task 2: Email reminder functions

**Files:**

- Modify: `src/lib/server/otp.ts`

- [ ] **Step 1: Add `sendStudentReminderEmail` function**

Append to `src/lib/server/otp.ts`:

```typescript
export async function sendStudentReminderEmail(
  email: string,
  studentName: string,
) {
  const displayName =
    studentName.charAt(0).toUpperCase() + studentName.slice(1).toLowerCase();
  const onboardingUrl = `${env.ORIGIN}${base}/onboarding`;
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: 'Finalise ton inscription sur Jump',
    text: `Salut ${displayName} !\n\nTon inscription sur Jump n'est pas encore terminée. Il ne te reste que quelques étapes pour accéder à ton espace.\n\nFinalise ton inscription ici : ${onboardingUrl}\n\nÀ très vite,\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Salut <strong>${displayName}</strong> !</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Ton inscription sur <strong>Jump</strong> n'est pas encore terminée. Il ne te reste que quelques étapes pour accéder à ton espace.</p>
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${onboardingUrl}" style="display: inline-block; background-color: #013afb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">Finaliser mon inscription &rarr;</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">À très vite,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
```

- [ ] **Step 2: Add `sendParentReminderEmail` function**

Append to `src/lib/server/otp.ts`:

```typescript
export async function sendParentReminderEmail(
  email: string,
  parentName: string,
  childName: string,
) {
  const displayName =
    parentName.charAt(0).toUpperCase() + parentName.slice(1).toLowerCase();
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: `Rappel : signez le droit à l'image de ${childName}`,
    text: `Bonjour Mr/Mme ${displayName},\n\nNous n'avons pas encore reçu votre autorisation pour le droit à l'image de ${childName} dans le cadre de son stage Epitech Academy.\n\nCette signature est nécessaire avant le début du stage et ne prend qu'une minute.\n\nSignez le droit à l'image ici : ${loginUrl}\n\nCordialement,\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Bonjour <strong>Mr/Mme ${displayName}</strong>,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Nous n'avons pas encore reçu votre autorisation pour le <strong>droit à l'image</strong> de <strong>${childName}</strong> dans le cadre de son stage Epitech Academy.</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Cette signature est nécessaire avant le début du stage et ne prend qu'une minute.</p>
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #013afb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">Signer le droit à l'image &rarr;</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Cordialement,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/otp.ts
git commit -m "feat(email): add student and parent onboarding reminder templates"
```

---

### Task 3: Validation schema

**Files:**

- Create: `src/lib/validation/reminders.ts`

- [ ] **Step 1: Create the Zod schema for the send action**

```typescript
import { z } from 'zod/v4';

export const sendRemindersSchema = z.object({
  talentIds: z
    .array(z.string().min(1))
    .min(1, 'Sélectionnez au moins un talent'),
  type: z.enum(['student', 'parent']),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validation/reminders.ts
git commit -m "feat(validation): add reminder send schema"
```

---

### Task 4: Route gate + sidebar link

**Files:**

- Modify: `src/lib/server/auth/guards.ts`
- Modify: `src/routes/(staff)/staff/dev/+layout.svelte`

- [ ] **Step 1: Add route gate in guards.ts**

In `src/lib/server/auth/guards.ts`, add a new entry to `STAFF_ROLE_GATES` array (after the `/staff/dev/team` entry, around line 41):

```typescript
  {
    pattern: /^\/staff\/dev\/reminders(?:\/|$)/,
    group: 'devLead',
  },
```

- [ ] **Step 2: Add sidebar link in dev layout**

In `src/routes/(staff)/staff/dev/+layout.svelte`, find the Gated "Gestion" section (around line 196). Add a "Relances" nav link inside the `<nav>` element, after the existing "Équipe" link:

Import `BellRing` from lucide at the top of the script alongside other icon imports:

```typescript
import BellRing from '@lucide/svelte/icons/bell-ring';
```

Then add the link after the Équipe `<a>` tag (around line 207):

```svelte
<a
  href={resolve('/staff/dev/reminders')}
  class={navLinkClass(isActive('/staff/dev/reminders'))}
>
  <BellRing class="h-5 w-5" />
  <span>Relances</span>
</a>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/auth/guards.ts src/routes/\(staff\)/staff/dev/+layout.svelte
git commit -m "feat(nav): add reminders route gate and sidebar link"
```

---

### Task 5: Page server — load + action

**Files:**

- Create: `src/routes/(staff)/staff/dev/reminders/+page.server.ts`

- [ ] **Step 1: Create the page server file**

```typescript
import type { PageServerLoad, Actions } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { sendRemindersSchema } from '$lib/validation/reminders';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  sendStudentReminderEmail,
  sendParentReminderEmail,
} from '$lib/server/otp';

const COOLDOWN_DAYS = 3;

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = scopedPrisma(getCampusId(locals));

  const filter = url.searchParams.get('filter') || 'all';

  const incompleteWhere: Record<string, object> = {
    student: {
      OR: [{ infoValidatedAt: null }, { rulesSignedAt: null }],
    },
    parent: {
      imageRightsSignedAt: null,
      parentEmail: { not: null },
    },
    all: {
      OR: [
        { infoValidatedAt: null },
        { rulesSignedAt: null },
        { imageRightsSignedAt: null },
      ],
    },
  };

  const talents = await db.talent.findMany({
    where: incompleteWhere[filter] || incompleteWhere.all,
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      parentEmail: true,
      parentNom: true,
      parentPrenom: true,
      infoValidatedAt: true,
      rulesSignedAt: true,
      imageRightsSignedAt: true,
      reminders: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { sentAt: true, type: true },
      },
    },
    orderBy: { nom: 'asc' },
  });

  const form = await superValidate(zod4(sendRemindersSchema));

  return { talents, filter, form };
};

export const actions: Actions = {
  send: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(sendRemindersSchema));

    if (!form.valid) {
      return message(form, 'Données invalides.', { status: 400 });
    }

    const { talentIds, type } = form.data;
    const db = scopedPrisma(getCampusId(locals));

    const talents = await db.talent.findMany({
      where: { id: { in: talentIds } },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        parentEmail: true,
        parentNom: true,
        infoValidatedAt: true,
        rulesSignedAt: true,
        imageRightsSignedAt: true,
        reminders: {
          where: { type },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true },
        },
      },
    });

    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

    let sent = 0;
    let skipped = 0;

    for (const talent of talents) {
      const lastReminder = talent.reminders[0];
      if (lastReminder && lastReminder.sentAt > cooldownDate) {
        skipped++;
        continue;
      }

      try {
        if (type === 'student' && talent.email) {
          await sendStudentReminderEmail(talent.email, talent.prenom);
        } else if (type === 'parent' && talent.parentEmail) {
          await sendParentReminderEmail(
            talent.parentEmail,
            talent.parentNom || talent.parentPrenom || 'Parent',
            `${talent.prenom} ${talent.nom}`,
          );
        } else {
          skipped++;
          continue;
        }

        await prisma.onboardingReminder.create({
          data: {
            talentId: talent.id,
            type,
            sentBy: locals.user!.id,
          },
        });
        sent++;
      } catch {
        skipped++;
      }
    }

    const msg =
      sent > 0
        ? `${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}.${skipped > 0 ? ` ${skipped} ignorée${skipped > 1 ? 's' : ''} (cooldown ou email manquant).` : ''}`
        : `Aucune relance envoyée. ${skipped} ignorée${skipped > 1 ? 's' : ''} (cooldown ou email manquant).`;

    return message(form, msg);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/\(staff\)/staff/dev/reminders/+page.server.ts
git commit -m "feat(reminders): add page server with load and send action"
```

---

### Task 6: Page UI

**Files:**

- Create: `src/routes/(staff)/staff/dev/reminders/+page.svelte`

- [ ] **Step 1: Create the page component**

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { superForm } from 'sveltekit-superforms/client';
  import * as Table from '$lib/components/ui/table';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Send from '@lucide/svelte/icons/send';
  import { cn } from '$lib/utils';

  let { data } = $props();

  const { form, enhance, message } = superForm(data.form, {
    resetForm: false,
  });

  let selectedIds = $state<Set<string>>(new Set());
  let sendType = $state<'student' | 'parent'>('student');
  let showConfirm = $state(false);

  const filteredTalents = $derived(() => {
    if (data.filter === 'student') {
      return data.talents.filter((t) => !t.infoValidatedAt || !t.rulesSignedAt);
    }
    if (data.filter === 'parent') {
      return data.talents.filter(
        (t) => !t.imageRightsSignedAt && t.parentEmail,
      );
    }
    return data.talents;
  });

  function toggleAll() {
    const talents = filteredTalents();
    if (selectedIds.size === talents.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(talents.map((t) => t.id));
    }
  }

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function lastReminderLabel(
    reminders: { sentAt: Date; type: string }[],
  ): string {
    if (reminders.length === 0) return 'Jamais';
    const d = new Date(reminders[0].sentAt);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  }

  function prepareSend(type: 'student' | 'parent') {
    sendType = type;
    showConfirm = true;
  }
</script>

<div class="space-y-6 p-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Relances onboarding</h1>
      <p class="text-sm text-muted-foreground">
        Envoyez des rappels aux familles dont l'onboarding est incomplet.
      </p>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex gap-2">
    {#each [{ value: 'all', label: 'Tous' }, { value: 'student', label: 'Étudiant incomplet' }, { value: 'parent', label: "Droit à l'image manquant" }] as f}
      <Button
        variant={data.filter === f.value ? 'default' : 'outline'}
        size="sm"
        onclick={() => goto(`?filter=${f.value}`)}
      >
        {f.label}
      </Button>
    {/each}
  </div>

  <!-- Actions -->
  <div class="flex items-center gap-3">
    <span class="text-sm text-muted-foreground">
      {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
    </span>
    {#if data.filter !== 'parent'}
      <Button
        size="sm"
        disabled={selectedIds.size === 0}
        onclick={() => prepareSend('student')}
      >
        <Send class="mr-2 h-4 w-4" />
        Relancer étudiants
      </Button>
    {/if}
    {#if data.filter !== 'student'}
      <Button
        size="sm"
        variant="outline"
        disabled={selectedIds.size === 0}
        onclick={() => prepareSend('parent')}
      >
        <Send class="mr-2 h-4 w-4" />
        Relancer parents
      </Button>
    {/if}
  </div>

  {#if $message}
    <div class="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
      {$message}
    </div>
  {/if}

  <!-- Table -->
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head class="w-10">
          <Checkbox
            checked={selectedIds.size === filteredTalents().length &&
              filteredTalents().length > 0}
            indeterminate={selectedIds.size > 0 &&
              selectedIds.size < filteredTalents().length}
            onCheckedChange={toggleAll}
          />
        </Table.Head>
        <Table.Head>Nom</Table.Head>
        <Table.Head>Info</Table.Head>
        <Table.Head>Règlement</Table.Head>
        <Table.Head>Droit image</Table.Head>
        <Table.Head>Email parent</Table.Head>
        <Table.Head>Dernière relance</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each filteredTalents() as talent (talent.id)}
        <Table.Row>
          <Table.Cell>
            <Checkbox
              checked={selectedIds.has(talent.id)}
              onCheckedChange={() => toggle(talent.id)}
            />
          </Table.Cell>
          <Table.Cell class="font-medium">
            {talent.prenom}
            {talent.nom}
          </Table.Cell>
          <Table.Cell>
            {#if talent.infoValidatedAt}
              <Check class="h-4 w-4 text-green-600" />
            {:else}
              <Clock class="h-4 w-4 text-amber-500" />
            {/if}
          </Table.Cell>
          <Table.Cell>
            {#if talent.rulesSignedAt}
              <Check class="h-4 w-4 text-green-600" />
            {:else}
              <Clock class="h-4 w-4 text-amber-500" />
            {/if}
          </Table.Cell>
          <Table.Cell>
            {#if talent.imageRightsSignedAt}
              <Check class="h-4 w-4 text-green-600" />
            {:else}
              <Clock class="h-4 w-4 text-amber-500" />
            {/if}
          </Table.Cell>
          <Table.Cell class="text-sm text-muted-foreground">
            {talent.parentEmail || '—'}
          </Table.Cell>
          <Table.Cell class="text-sm text-muted-foreground">
            {lastReminderLabel(talent.reminders)}
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>

  {#if filteredTalents().length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">
      Aucun onboarding incomplet trouvé.
    </p>
  {/if}
</div>

<!-- Confirm dialog -->
<AlertDialog.Root bind:open={showConfirm}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Confirmer l'envoi</AlertDialog.Title>
      <AlertDialog.Description>
        Envoyer une relance {sendType === 'student' ? 'étudiant' : 'parent'} à
        <strong>{selectedIds.size}</strong>
        destinataire{selectedIds.size > 1 ? 's' : ''} ? Les relances envoyées il y
        a moins de 3 jours seront ignorées.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
      <form method="POST" action="?/send" use:enhance>
        {#each [...selectedIds] as id}
          <input type="hidden" name="talentIds" value={id} />
        {/each}
        <input type="hidden" name="type" value={sendType} />
        <Button type="submit" onclick={() => (showConfirm = false)}>
          Envoyer
        </Button>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
```

- [ ] **Step 2: Verify the dev server starts without errors**

Run from `frontend/`:

```bash
bun run check
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(staff\)/staff/dev/reminders/+page.svelte
git commit -m "feat(reminders): add onboarding reminders page UI"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Start the dev server and verify**

```bash
bun run dev
```

Open `http://localhost:3030/staff/dev/reminders` while logged in as a `superdev`. Verify:

1. Page loads with the table of incomplete onboardings
2. Filters work (all / student / parent)
3. Checkboxes select/deselect correctly
4. "Envoyer les relances" opens the confirmation dialog
5. Submitting the form shows a success message
6. The sidebar "Relances" link appears under "Gestion"

- [ ] **Step 2: Verify a `dev` role user cannot access the page**

Log in as `dev` role. Confirm:

- The "Relances" link is hidden in sidebar
- Direct URL `/staff/dev/reminders` returns 403

- [ ] **Step 3: Final commit if any fixes needed**

If adjustments were made during verification, commit them.
