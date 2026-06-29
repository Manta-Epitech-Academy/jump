<script lang="ts">
  import { resolve } from '$app/paths';
  import X from '@lucide/svelte/icons/x';
  import { DEFAULT_PERSONA } from '$lib/domain/feedbackForms/schema';

  let {
    eventId,
    formId,
    personaIconUrl,
  }: { eventId: string; formId: string; personaIconUrl?: string } = $props();
  let dismissed = $state(false);
</script>

{#if !dismissed}
  <div
    class="flex items-center gap-3 rounded-2xl border border-epi-blue/20 bg-epi-blue/5 p-4"
  >
    <img
      src={personaIconUrl ?? DEFAULT_PERSONA.iconUrl}
      alt=""
      class="h-8 w-8 shrink-0 rounded-full object-cover"
    />
    <p class="flex-1 text-sm font-medium text-foreground">
      Ton avis compte ! Donne ton feedback sur ton stage.
    </p>
    <a
      href={resolve(`/feedback/${eventId}/${formId}`)}
      class="shrink-0 rounded-xl bg-epi-blue px-4 py-2 text-sm font-bold text-white hover:bg-epi-blue/90"
    >
      C'est parti !
    </a>
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
