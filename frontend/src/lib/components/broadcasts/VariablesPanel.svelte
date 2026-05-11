<script lang="ts">
  import { BROADCAST_VARIABLES } from '$lib/domain/broadcasts';

  type Props = {
    onInsert: (token: string) => void;
  };

  let { onInsert }: Props = $props();

  const recipientVars = BROADCAST_VARIABLES.filter((v) => !v.contextual);
  const contextVars = BROADCAST_VARIABLES.filter((v) => v.contextual);
</script>

<div class="rounded-lg border bg-muted/30 p-4 text-sm">
  <h3
    class="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
  >
    Variables disponibles
  </h3>
  <p class="mb-3 text-xs text-muted-foreground">
    Clique pour insérer dans le corps. Substituées au moment de l'envoi.
  </p>

  <div class="mb-3 space-y-1">
    <p
      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      Destinataire
    </p>
    {#each recipientVars as v}
      <button
        type="button"
        onclick={() => onInsert(v.token)}
        class="block w-full rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
      >
        <code class="font-mono text-epi-pink">{v.token}</code>
        <span class="ml-2 text-muted-foreground">{v.label}</span>
      </button>
    {/each}
  </div>

  <div class="space-y-1">
    <p
      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      Contexte d'envoi
    </p>
    {#each contextVars as v}
      <button
        type="button"
        onclick={() => onInsert(v.token)}
        class="block w-full rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
      >
        <code class="font-mono text-epi-pink">{v.token}</code>
        <span class="ml-2 text-muted-foreground">{v.label}</span>
      </button>
    {/each}
  </div>
</div>
