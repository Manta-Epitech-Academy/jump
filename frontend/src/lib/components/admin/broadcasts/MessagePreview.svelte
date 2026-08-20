<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import {
    substituteVariables,
    buildDemoContext,
    findUnknownTokens,
  } from '$lib/domain/broadcastVariables';
  import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';

  type Props = {
    channel: 'mail' | 'sms';
    subject?: string | null;
    body: string;
    /** Event name used to fill {{event_name}} in the demo render. */
    eventName?: string | null;
  };

  let { channel, subject = '', body, eventName = null }: Props = $props();

  const demoCtx = $derived(buildDemoContext(eventName));
  const previewSubject = $derived(
    subject ? substituteVariables(subject, demoCtx) : '',
  );
  const previewBody = $derived(substituteVariables(body ?? '', demoCtx));
  const previewMailHtml = $derived(
    channel === 'mail' ? renderBroadcastMail(previewBody) : '',
  );
  // Tokens the author typed that aren't real variables — they would render
  // empty at send time, so warn rather than silently drop them.
  const unknown = $derived(
    findUnknownTokens(`${subject ?? ''}\n${body ?? ''}`),
  );
</script>

<div class="space-y-2">
  {#if unknown.length > 0}
    <div
      class="flex items-start gap-2 rounded-sm border border-epi-together/40 bg-epi-together/10 p-2 text-xs text-epi-together"
    >
      <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        Variable{unknown.length > 1 ? 's' : ''} inconnue{unknown.length > 1
          ? 's'
          : ''} (rendu vide) :
        {#each unknown as t, i (t)}<code class="font-mono">{`{{${t}}}`}</code
          >{#if i < unknown.length - 1},
          {/if}{/each}
      </p>
    </div>
  {/if}

  {#if !body?.trim()}
    <div
      class="rounded-sm border border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      L'aperçu s'affichera ici dès que le message aura un contenu.
    </div>
  {:else if channel === 'mail'}
    {#if previewSubject}
      <p class="truncate text-xs">
        <span class="font-semibold">Sujet : </span>{previewSubject}
      </p>
    {/if}
    <div class="overflow-hidden rounded-sm border">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderBroadcastMail (DOMPurify) -->
      {@html previewMailHtml}
    </div>
  {:else}
    <!-- SMS handset mock -->
    <div class="mx-auto max-w-xs rounded-2xl border bg-muted/40 p-3">
      <div
        class="mb-2 flex items-center justify-center gap-1.5 epi-overline text-muted-foreground"
      >
        <Smartphone class="h-3 w-3" /> Aperçu SMS
      </div>
      <div
        class="rounded-2xl rounded-bl-sm bg-epi-blue px-3 py-2 text-sm whitespace-pre-wrap text-white"
      >
        {previewBody}
      </div>
      <p class="mt-1.5 text-center text-xs text-muted-foreground">
        Expéditeur : Epitech
      </p>
    </div>
  {/if}

  <p class="text-xs text-muted-foreground">
    Rendu avec des données fictives — chaque destinataire reçoit ses propres
    valeurs.
  </p>
</div>
