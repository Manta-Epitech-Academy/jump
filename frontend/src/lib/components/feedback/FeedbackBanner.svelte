<script lang="ts">
  import { resolve } from '$app/paths';
  import X from '@lucide/svelte/icons/x';
  import PersonaAvatar from './PersonaAvatar.svelte';
  import CardAction from '#lib/components/talent/CardAction.svelte';

  let {
    eventId,
    formId,
    personaIconUrl,
  }: { eventId: string; formId: string; personaIconUrl?: string } = $props();
  let dismissed = $state(false);
</script>

{#if !dismissed}
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-epi-blue/20 bg-epi-blue/5 p-4"
  >
    <PersonaAvatar iconUrl={personaIconUrl} class="h-8 w-8 shrink-0" />
    <!-- basis-56: on a phone the sentence keeps a readable width and the
         action wraps under it, instead of the pill squeezing it to a column. -->
    <p class="min-w-0 flex-1 basis-56 text-sm font-medium text-foreground">
      Ton avis compte ! Dis-nous ce que tu en as pensé, ça prend deux minutes.
    </p>
    <!-- The talent cards' one secondary voice (`CardAction`), not a filled
         button: the home's heavy action is the hero's. Not « C'est parti »
         either, which the training card beside it already says. -->
    <CardAction
      href={resolve(`feedback/${eventId}/${formId}`)}
      class="shrink-0 self-center">Donner mon avis</CardAction
    >
    <button
      type="button"
      onclick={() => (dismissed = true)}
      class="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
      aria-label="Fermer"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
{/if}
