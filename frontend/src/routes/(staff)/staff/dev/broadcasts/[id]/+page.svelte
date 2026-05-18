<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import {
    BROADCAST_AUDIENCE_LABELS,
    BROADCAST_CHANNEL_LABELS,
  } from '$lib/domain/broadcasts';
  import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';

  let { data } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const backHref = $derived(
    data.fromTalentId
      ? resolve(`/staff/dev/students/${data.fromTalentId}?tab=communications`)
      : resolve('/staff/dev'),
  );
  const backLabel = $derived(data.fromTalentId ? 'Retour au profil' : 'Retour');
</script>

<div class="space-y-4">
  <Button variant="ghost" size="sm" href={backHref}>
    <ArrowLeft class="mr-1 h-4 w-4" />
    {backLabel}
  </Button>

  <header class="space-y-1">
    <h2 class="text-xl font-bold">{data.broadcast.name}</h2>
    <p class="text-sm text-muted-foreground">
      {BROADCAST_CHANNEL_LABELS[data.broadcast.channel]} · {BROADCAST_AUDIENCE_LABELS[
        data.broadcast.audience
      ]}
      · {data.broadcast.campus.name}
      {#if data.broadcast.event}
        · {data.broadcast.event.titre}
      {/if}
      · Envoyé le {formatter.format(data.broadcast.createdAt)} par {data
        .broadcast.createdBy?.name ?? data.broadcast.createdBy?.email}
    </p>
  </header>

  <section class="space-y-2">
    <h3
      class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      Contenu envoyé
    </h3>
    {#if data.broadcast.subjectSnapshot}
      <p class="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <span class="font-semibold">Sujet :</span>
        {data.broadcast.subjectSnapshot}
      </p>
    {/if}
    {#if data.broadcast.channel === 'mail'}
      <div class="overflow-hidden rounded-lg border bg-white">
        {@html renderBroadcastMail(data.broadcast.bodySnapshot)}
      </div>
    {:else}
      <pre
        class="overflow-x-auto rounded-lg border bg-white p-3 text-xs whitespace-pre-wrap text-slate-800 dark:bg-slate-900 dark:text-slate-200">{data
          .broadcast.bodySnapshot}</pre>
    {/if}
  </section>
</div>
