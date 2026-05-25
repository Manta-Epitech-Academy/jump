<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { PhoneInput } from '$lib/components/ui/phone-input';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import { CIVILITE_OPTIONS } from '$lib/domain/profile';
  import { cn } from '$lib/utils';
  import ContinueButton from './ContinueButton.svelte';

  let {
    profile,
    errors,
  }: {
    profile: {
      civilite: string;
      nom: string;
      prenom: string;
      email: string;
      phone: string;
    };
    errors?: Record<string, string[]>;
  } = $props();

  let submitting = $state(false);
  // Seed the chip selector from the loaded profile once; the keyed step view
  // recreates this component per step, so the prop never changes while mounted.
  let localCivilite = $state(untrack(() => profile.civilite));

  const fieldInput =
    'rounded-lg border-slate-200 bg-white/70 text-slate-900 placeholder:text-slate-300 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600';
  const fieldLabel =
    'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <UserCheck class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Qui es-tu ?
  </h1>
</div>

<form
  method="POST"
  action="?/validateIdentity"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'success') {
        await invalidateAll();
        return;
      }
      await update();
      submitting = false;
    };
  }}
  class="space-y-4"
>
  <input type="hidden" name="civilite" value={localCivilite} />

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
      Civilité <span class="text-red-500">*</span>
    </p>
    <div class="flex gap-2">
      {#each CIVILITE_OPTIONS as opt}
        <button
          type="button"
          onclick={() => (localCivilite = opt.value)}
          class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all {localCivilite ===
          opt.value
            ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
        >
          {opt.label}
        </button>
      {/each}
    </div>
    {#if errors?.civilite}<span class="mt-1 text-xs text-destructive"
        >{errors.civilite[0]}</span
      >{/if}
  </div>

  <div
    class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <div>
      <Label for="prenom" class={fieldLabel}
        >Prénom <span class="text-red-500">*</span></Label
      >
      <Input
        id="prenom"
        name="prenom"
        type="text"
        value={profile?.prenom || ''}
        placeholder="Jean"
        required
        class={fieldInput}
      />
      {#if errors?.prenom}<span class="text-xs text-destructive"
          >{errors.prenom[0]}</span
        >{/if}
    </div>
    <div>
      <Label for="nom" class={fieldLabel}
        >Nom <span class="text-red-500">*</span></Label
      >
      <Input
        id="nom"
        name="nom"
        type="text"
        value={profile?.nom || ''}
        placeholder="Dupont"
        required
        class={fieldInput}
      />
      {#if errors?.nom}<span class="text-xs text-destructive"
          >{errors.nom[0]}</span
        >{/if}
    </div>
  </div>

  <div
    class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <div>
      <Label for="email" class={fieldLabel}>Email</Label>
      <!-- Account/login identity (OTP) — fixed here. Read-only and unnamed, so
           it's never submitted; editing it would be a no-op (see identitySchema). -->
      <Input
        id="email"
        type="email"
        value={profile?.email || ''}
        readonly
        tabindex={-1}
        aria-describedby="email-hint"
        class={cn(
          fieldInput,
          'cursor-not-allowed text-slate-400 dark:text-slate-500',
        )}
      />
      <span id="email-hint" class="text-xs text-slate-400 dark:text-slate-500"
        >Lié à ton compte</span
      >
    </div>
    <div>
      <Label for="phone" class={fieldLabel}
        >Téléphone <span class="text-red-500">*</span></Label
      >
      <PhoneInput
        name="phone"
        value={profile?.phone || ''}
        placeholder="6 12 34 56 78"
        required
        class={fieldInput}
      />
      {#if errors?.phone}<span class="text-xs text-destructive"
          >{errors.phone[0]}</span
        >{/if}
    </div>
  </div>

  <ContinueButton {submitting} class="mt-4" />
</form>
