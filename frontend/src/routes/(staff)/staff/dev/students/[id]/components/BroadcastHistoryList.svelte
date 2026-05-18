<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import MailOpen from '@lucide/svelte/icons/mail-open';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import X from '@lucide/svelte/icons/x';
  import Clock from '@lucide/svelte/icons/clock';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { resolve } from '$app/paths';

  const STATUS_LABELS: Record<Item['status'], string> = {
    sent: 'Envoyé',
    failed: 'Échec',
    pending: 'En attente',
  };

  type Item = {
    id: string;
    status: 'pending' | 'sent' | 'failed';
    sentAt: Date | string | null;
    openedAt: Date | string | null;
    talentId: string | null;
    parentOfTalentId: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    broadcast: {
      id: string;
      name: string;
      channel: 'mail' | 'sms';
      subjectSnapshot: string | null;
      createdAt: Date | string;
    };
  };

  let {
    items,
    talentId,
  }: { items: Item[]; timezone: string; talentId: string } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
</script>

<EpiSection overline="Diffusions" title="Communications reçues" accent="blue">
  {#snippet meta()}
    <span
      class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      {items.length}
    </span>
  {/snippet}

  {#if items.length === 0}
    <p class="text-sm text-muted-foreground italic">
      Aucun envoi reçu pour le moment.
    </p>
  {:else}
    <ul class="space-y-2 text-sm">
      {#each items as item (item.id)}
        <li
          class="flex items-start justify-between gap-3 rounded-sm border bg-muted/20 px-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              {#if item.broadcast.channel === 'mail'}
                <Mail class="h-3.5 w-3.5" />
              {:else}
                <MessageSquare class="h-3.5 w-3.5" />
              {/if}
              <span>
                {item.parentOfTalentId
                  ? 'envoyé au parent'
                  : 'envoyé au talent'}
              </span>
              <span
                >· {formatter.format(new Date(item.broadcast.createdAt))}</span
              >
            </div>
            <a
              href={`${resolve(`/staff/dev/broadcasts/${item.broadcast.id}`)}?from=${talentId}`}
              class="block truncate font-medium hover:underline"
            >
              {item.broadcast.name}
            </a>
            {#if item.broadcast.subjectSnapshot}
              <p class="truncate text-xs text-muted-foreground">
                {item.broadcast.subjectSnapshot}
              </p>
            {/if}
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
            {#if item.status === 'failed'}
              <span
                class="inline-flex items-center gap-1 rounded-full bg-epi-orange px-2 py-0.5 font-semibold text-white"
              >
                <X class="h-3.5 w-3.5" />
                {STATUS_LABELS.failed}
              </span>
            {:else if item.status === 'pending'}
              <span
                class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-semibold text-muted-foreground"
              >
                <Clock class="h-3.5 w-3.5" />
                {STATUS_LABELS.pending}
              </span>
            {/if}
            {#if item.openedAt}
              <span
                class="inline-flex items-center gap-1 rounded-full bg-epi-teal-solid px-2 py-0.5 font-semibold text-white"
              >
                <MailOpen class="h-3.5 w-3.5" />
                Ouvert
              </span>
              <span class="text-[11px] text-muted-foreground">
                {formatter.format(new Date(item.openedAt))}
              </span>
            {:else}
              <span
                class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground"
              >
                Non ouvert
                <Tooltip.Provider delayDuration={150}>
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      class="inline-flex cursor-help items-center"
                      aria-label="Comment l'ouverture est détectée"
                    >
                      <CircleHelp class="h-3.5 w-3.5 opacity-70" />
                    </Tooltip.Trigger>
                    <Tooltip.Content class="max-w-xs">
                      <p class="text-xs">
                        Un message est marqué « Ouvert » uniquement si le
                        destinataire a cliqué sur un lien qu'il contient. Un
                        envoi sans lien restera toujours « Non ouvert ».
                      </p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</EpiSection>
