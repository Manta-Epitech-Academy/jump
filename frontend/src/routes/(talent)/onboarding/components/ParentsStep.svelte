<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { PhoneInput } from '$lib/components/ui/phone-input';
  import Users from '@lucide/svelte/icons/users';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import { CIVILITE_OPTIONS, PARENT_TYPE_OPTIONS } from '$lib/domain/profile';
  import ContinueButton from './ContinueButton.svelte';

  let {
    profile,
    errors,
  }: {
    profile: {
      parentType: string;
      parentCivilite: string;
      parentNom: string;
      parentPrenom: string;
      parentEmail: string;
      parentPhone: string;
      parent2Type: string;
      parent2Civilite: string;
      parent2Nom: string;
      parent2Prenom: string;
      parent2Email: string;
      parent2Phone: string;
    };
    errors?: Record<string, string[]>;
  } = $props();

  let submitting = $state(false);
  let formEl: HTMLFormElement | undefined;
  // Seed once from the loaded profile; the keyed step view recreates this
  // component per step, so the prop never changes while mounted.
  let localParentType = $state(untrack(() => profile.parentType));
  let localParentCivilite = $state(untrack(() => profile.parentCivilite));
  let localP2Type = $state(untrack(() => profile.parent2Type));
  let localP2Civilite = $state(untrack(() => profile.parent2Civilite));
  let showParent2 = $state(
    untrack(
      () =>
        !!(profile.parent2Nom || profile.parent2Prenom || profile.parent2Email),
    ),
  );

  const fieldInput =
    'rounded-lg border-slate-300 bg-white/80 text-slate-900 placeholder:text-slate-400 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600';
  // Glass skin for the PhoneInput chrome so the country selector and its
  // dropdown match the talent fields; the component itself ships theme-neutral.
  const fieldPopover =
    'rounded-xl border border-slate-200 bg-white/80 shadow-lg backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/80';
  const fieldLabel =
    'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

  // This form is long (two referents + civilité chips), so a validation error
  // can land below the fold and read as "nothing happened" after submit. Bring
  // the first error into view — error spans all carry .text-destructive next to
  // their field, so the first match in document order is the topmost failure.
  $effect(() => {
    if (errors && Object.keys(errors).length > 0) {
      requestAnimationFrame(() => {
        const errorEl = formEl?.querySelector('.text-destructive');
        if (!errorEl) return;
        const scrollParent = formEl?.closest('[class*="overflow-y"]');
        if (scrollParent) {
          const parentRect = scrollParent.getBoundingClientRect();
          const errorRect = errorEl.getBoundingClientRect();
          const offset = errorRect.top - parentRect.top - parentRect.height / 2;
          scrollParent.scrollBy({ top: offset, behavior: 'smooth' });
        }
      });
    }
  });
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Users class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Contacts d'urgence
  </h1>
</div>

<form
  bind:this={formEl}
  method="POST"
  action="?/validateParents"
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
  class="space-y-6"
>
  <input type="hidden" name="parentType" value={localParentType} />
  <input type="hidden" name="parentCivilite" value={localParentCivilite} />
  {#if showParent2}
    <input type="hidden" name="parent2Type" value={localP2Type} />
    <input type="hidden" name="parent2Civilite" value={localP2Civilite} />
  {/if}

  <!-- Parent 1 -->
  <div class="space-y-3">
    <div
      class="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl sm:grid-cols-2 dark:bg-slate-900/80"
    >
      <div>
        <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          Lien <span class="text-red-500">*</span>
        </p>
        <div class="flex flex-wrap gap-2">
          {#each PARENT_TYPE_OPTIONS as opt}
            <button
              type="button"
              onclick={() => (localParentType = opt.value)}
              class="inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm font-medium transition-all {localParentType ===
              opt.value
                ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
              >{opt.label}</button
            >
          {/each}
        </div>
        {#if errors?.parentType}<span class="mt-1 text-xs text-destructive"
            >{errors.parentType[0]}</span
          >{/if}
      </div>
      <div>
        <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          Civilité <span class="text-red-500">*</span>
        </p>
        <div class="flex flex-wrap gap-2">
          {#each CIVILITE_OPTIONS as opt}
            <button
              type="button"
              onclick={() => (localParentCivilite = opt.value)}
              class="inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm font-medium transition-all {localParentCivilite ===
              opt.value
                ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
              >{opt.label}</button
            >
          {/each}
        </div>
        {#if errors?.parentCivilite}<span class="mt-1 text-xs text-destructive"
            >{errors.parentCivilite[0]}</span
          >{/if}
      </div>
    </div>

    <div
      class="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
        <Label for="parentPrenom" class={fieldLabel}
          >Prénom <span class="text-red-500">*</span></Label
        >
        <Input
          id="parentPrenom"
          name="parentPrenom"
          type="text"
          value={profile?.parentPrenom || ''}
          placeholder="Marie"
          required
          class={fieldInput}
        />
        {#if errors?.parentPrenom}<span class="text-xs text-destructive"
            >{errors.parentPrenom[0]}</span
          >{/if}
      </div>
      <div>
        <Label for="parentNom" class={fieldLabel}
          >Nom <span class="text-red-500">*</span></Label
        >
        <Input
          id="parentNom"
          name="parentNom"
          type="text"
          value={profile?.parentNom || ''}
          placeholder="Dupont"
          required
          class={fieldInput}
        />
        {#if errors?.parentNom}<span class="text-xs text-destructive"
            >{errors.parentNom[0]}</span
          >{/if}
      </div>
    </div>

    <!-- Stacked so the phone field gets full width — see IdentityStep. -->
    <div
      class="space-y-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
        <Label for="parentEmail" class={fieldLabel}
          >Email <span class="text-red-500">*</span></Label
        >
        <Input
          id="parentEmail"
          name="parentEmail"
          type="email"
          value={profile?.parentEmail || ''}
          placeholder="parent@mail.com"
          required
          class={fieldInput}
        />
        {#if errors?.parentEmail}<span class="text-xs text-destructive"
            >{errors.parentEmail[0]}</span
          >{/if}
      </div>
      <div>
        <Label for="parentPhone" class={fieldLabel}
          >Téléphone <span class="text-red-500">*</span></Label
        >
        <PhoneInput
          id="parentPhone"
          name="parentPhone"
          value={profile?.parentPhone || ''}
          placeholder="06 12 34 56 78"
          required
          error={!!errors?.parentPhone}
          aria-describedby={errors?.parentPhone
            ? 'parentPhone-error'
            : undefined}
          class={fieldInput}
          triggerClass={fieldInput}
          popoverClass={fieldPopover}
        />
        {#if errors?.parentPhone}<span
            id="parentPhone-error"
            class="text-xs text-destructive">{errors.parentPhone[0]}</span
          >{/if}
      </div>
    </div>
  </div>

  <!-- Parent 2 -->
  {#if !showParent2}
    <button
      type="button"
      onclick={() => (showParent2 = true)}
      class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-epi-blue/30 bg-epi-blue/5 px-4 py-4 text-sm font-semibold text-epi-blue transition-colors hover:border-epi-blue/50 hover:bg-epi-blue/10 dark:border-epi-blue/40 dark:bg-epi-blue/10 dark:hover:border-epi-blue/60 dark:hover:bg-epi-blue/20"
    >
      <Plus class="h-4 w-4" /> Ajouter un second parent
    </button>
  {:else}
    <div class="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div class="flex items-center justify-between">
        <h2
          class="text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
        >
          Second parent <span
            class="text-xs font-normal text-slate-400 normal-case"
            >(facultatif)</span
          >
        </h2>
        <button
          type="button"
          onclick={() => {
            showParent2 = false;
            localP2Type = '';
            localP2Civilite = '';
          }}
          class="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-red-500"
        >
          <X class="h-3.5 w-3.5" /> Retirer
        </button>
      </div>
      <div
        class="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl sm:grid-cols-2 dark:bg-slate-900/80"
      >
        <div>
          <p
            class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Lien
          </p>
          <div class="flex flex-wrap gap-2">
            {#each PARENT_TYPE_OPTIONS as opt}
              <button
                type="button"
                onclick={() => (localP2Type = opt.value)}
                class="inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm font-medium transition-all {localP2Type ===
                opt.value
                  ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
                >{opt.label}</button
              >
            {/each}
          </div>
        </div>
        <div>
          <p
            class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Civilité
          </p>
          <div class="flex gap-2">
            {#each CIVILITE_OPTIONS as opt}
              <button
                type="button"
                onclick={() => (localP2Civilite = opt.value)}
                class="inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm font-medium transition-all {localP2Civilite ===
                opt.value
                  ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
                >{opt.label}</button
              >
            {/each}
          </div>
        </div>
      </div>
      <div
        class="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <Label for="parent2Prenom" class={fieldLabel}>Prénom</Label>
          <Input
            id="parent2Prenom"
            name="parent2Prenom"
            type="text"
            value={profile?.parent2Prenom || ''}
            placeholder="Sophie"
            class={fieldInput}
          />
        </div>
        <div>
          <Label for="parent2Nom" class={fieldLabel}>Nom</Label>
          <Input
            id="parent2Nom"
            name="parent2Nom"
            type="text"
            value={profile?.parent2Nom || ''}
            placeholder="Dupont"
            class={fieldInput}
          />
        </div>
      </div>
      <!-- Stacked so the phone field gets full width — see IdentityStep. -->
      <div
        class="space-y-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <Label for="parent2Email" class={fieldLabel}>Email</Label>
          <Input
            id="parent2Email"
            name="parent2Email"
            type="email"
            value={profile?.parent2Email || ''}
            placeholder="parent2@mail.com"
            class={fieldInput}
          />
        </div>
        <div>
          <Label for="parent2Phone" class={fieldLabel}>Téléphone</Label>
          <PhoneInput
            id="parent2Phone"
            name="parent2Phone"
            value={profile?.parent2Phone || ''}
            placeholder="06 12 34 56 78"
            error={!!errors?.parent2Phone}
            aria-describedby={errors?.parent2Phone
              ? 'parent2Phone-error'
              : undefined}
            class={fieldInput}
            triggerClass={fieldInput}
            popoverClass={fieldPopover}
          />
          {#if errors?.parent2Phone}<span
              id="parent2Phone-error"
              class="text-xs text-destructive">{errors.parent2Phone[0]}</span
            >{/if}
        </div>
      </div>
    </div>
  {/if}

  <ContinueButton {submitting} class="mt-4" />
</form>
