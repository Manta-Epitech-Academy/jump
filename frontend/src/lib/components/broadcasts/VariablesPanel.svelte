<script lang="ts">
  import { BROADCAST_VARIABLES } from '$lib/domain/broadcasts';

  type Props = {
    onInsert: (token: string) => void;
    channel?: 'mail' | 'sms';
  };

  let { onInsert, channel = 'mail' }: Props = $props();

  const recipientVars = BROADCAST_VARIABLES.filter((v) => !v.contextual);
  const contextVars = BROADCAST_VARIABLES.filter((v) => v.contextual);

  const markdownSnippets: { label: string; snippet: string; hint: string }[] = [
    {
      label: 'Bouton CTA',
      snippet: '\n\n:button[Mon libellé](https://jump.epiboost.fr/...)\n\n',
      hint: ':button[label](url)',
    },
    {
      label: 'Titre',
      snippet: '\n\n## Mon titre\n\n',
      hint: '## titre',
    },
    {
      label: 'Liste',
      snippet: '\n\n- Premier point\n- Second point\n- Troisième point\n\n',
      hint: '- item',
    },
    {
      label: 'Séparateur',
      snippet: '\n\n---\n\n',
      hint: '---',
    },
  ];
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

  <div class="mb-3 space-y-1">
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

  {#if channel === 'mail'}
    <div class="space-y-1 border-t pt-3">
      <p
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Markdown
      </p>
      {#each markdownSnippets as s}
        <button
          type="button"
          onclick={() => onInsert(s.snippet)}
          class="block w-full rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
        >
          <code class="font-mono text-epi-blue">{s.hint}</code>
          <span class="ml-2 text-muted-foreground">{s.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
