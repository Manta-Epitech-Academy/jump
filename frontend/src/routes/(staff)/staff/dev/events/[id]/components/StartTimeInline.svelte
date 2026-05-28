<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import { TimePicker } from '$lib/components/ui/time-picker';
  import Pencil from '@lucide/svelte/icons/pencil';
  import { can } from '$lib/domain/permissions';
  import { effectiveStartMinutes, minutesToHHMM } from '$lib/domain/event';

  let {
    eventType,
    startMinutes,
    // Auto-open the editor once on mount for a lead while the time is still
    // unconfirmed — used on upcoming events so the arrival time gets set before
    // talents need it. Stays dismissable ("Plus tard"); the inline control
    // remains the persistent entry point.
    promptWhenUnset = false,
  }: {
    eventType: string;
    startMinutes: number | null;
    promptWhenUnset?: boolean;
  } = $props();

  // `null` = no human has set the time yet → show the type default, tinted as a
  // soft nag. A stored value is confirmed (and talents now see it). Mirrors the
  // server-side `effectiveStartMinutes` rule so display and storage can't drift.
  const confirmed = $derived(startMinutes != null);
  const label = $derived(
    minutesToHHMM(effectiveStartMinutes(eventType, startMinutes)),
  );
  const isLead = $derived(can('devLead', page.data.staffProfile?.staffRole));

  let open = $state(false);
  let editValue = $state('');

  function openEditor() {
    editValue = label;
    open = true;
  }

  onMount(() => {
    if (promptWhenUnset && !confirmed && isLead) openEditor();
  });

  const onSubmit: SubmitFunction = () => {
    return async ({ result, update }) => {
      if (result.type === 'success') {
        open = false;
        toast.success('Horaire enregistré.');
        await update();
      } else {
        toast.error("Échec de l'enregistrement de l'horaire.");
      }
    };
  };
</script>

<!-- Font size/weight are inherited from the host (hero sentence vs. mono date
     row); we only own colour and the edit affordance. -->
{#if isLead}
  <button
    type="button"
    onclick={openEditor}
    title="Modifier l'heure d'arrivée des jeunes"
    class="group inline-flex cursor-pointer items-baseline gap-1 underline decoration-dotted underline-offset-4 transition hover:decoration-solid"
  >
    <span class={confirmed ? 'text-epi-teal' : 'text-epi-orange'}>{label}</span>
    {#if !confirmed}<span class="text-epi-orange">(par défaut)</span>{/if}
    <Pencil
      class="h-3 w-3 shrink-0 self-center opacity-0 transition group-hover:opacity-100"
    />
  </button>
{:else}
  <span class={confirmed ? 'text-epi-teal' : 'text-epi-orange'}>{label}</span>
  {#if !confirmed}<span class="text-epi-orange">(par défaut)</span>{/if}
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-105">
    <Dialog.Header>
      <Dialog.Title>Heure d'arrivée des jeunes</Dialog.Title>
      <Dialog.Description class="text-xs">
        L'heure que les jeunes verront pour savoir quand venir le premier jour.
        Tant qu'elle n'est pas renseignée, ils ne voient que la date, sans
        heure.
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="?/setStartTime"
      use:enhance={onSubmit}
      class="space-y-4"
    >
      <div class="space-y-1.5">
        <Label for="startTime" class="text-sm">Heure d'arrivée</Label>
        <TimePicker
          id="startTime"
          name="startTime"
          bind:value={editValue}
          class="w-40"
        />
      </div>
      <Dialog.Footer class="gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onclick={() => (open = false)}
        >
          Plus tard
        </Button>
        <Button type="submit" size="sm" class="rounded-sm">Enregistrer</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
