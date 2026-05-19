<script lang="ts">
  import Send from '@lucide/svelte/icons/send';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import MailOpen from '@lucide/svelte/icons/mail-open';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import X from '@lucide/svelte/icons/x';
  import Clock from '@lucide/svelte/icons/clock';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { resolve } from '$app/paths';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { formatDateFr, cn } from '$lib/utils';
  import type { Communication } from '$lib/domain/communications';

  /**
   * Unified communications timeline on the talent fiche: every email or SMS
   * touching this talent, sent OR received, in one chronological list. Row
   * rendering branches on the `kind` tag — reminders (1:1 staff-sent) are
   * collapsible to reveal the archived subject + body; broadcasts (mass
   * campaigns received) link out to the campaign detail and surface their
   * delivery/open status.
   *
   * Pagination is a single `?page=N` query param. Total volume per talent
   * caps in the low hundreds, so the server slices an already-merged stream
   * rather than juggling per-source offsets.
   */
  type Props = {
    items: Communication[];
    total: number;
    page: number;
    pageSize: number;
    talentId: string;
    timezone: string;
    onPageChange: (page: number) => void;
  };

  let {
    items,
    total,
    page,
    pageSize,
    talentId,
    timezone,
    onPageChange,
  }: Props = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  const REMINDER_LABEL: Record<'student' | 'parent', string> = {
    student: 'Relance Élève',
    parent: 'Relance Parent',
  };

  let expanded = $state<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }
</script>

<EpiSection overline="Communications" title="Historique" accent="blue">
  {#snippet meta()}
    <span
      class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      {total}
    </span>
  {/snippet}

  {#if items.length === 0}
    <p class="text-sm text-muted-foreground italic">
      Aucune communication enregistrée avec ce stagiaire.
    </p>
  {:else}
    <ul class="space-y-2">
      {#each items as item (item.id)}
        {#if item.kind === 'reminder'}
          {@const hasContent = Boolean(item.subject || item.body)}
          {@const isOpen = expanded.has(item.id)}
          <li class="rounded-sm border border-border bg-card">
            <button
              type="button"
              onclick={() => hasContent && toggle(item.id)}
              class={cn(
                'flex w-full items-start gap-3 p-3 text-left',
                hasContent
                  ? 'cursor-pointer hover:bg-muted/30'
                  : 'cursor-default',
              )}
              aria-expanded={hasContent ? isOpen : undefined}
            >
              <span
                class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-epi-blue text-white"
              >
                <Send class="h-3.5 w-3.5" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p class="text-sm font-bold">
                    {REMINDER_LABEL[item.audience]}
                  </p>
                  <span class="text-[11px] text-muted-foreground">
                    {formatDateFr(item.sentAt, timezone)}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground">
                  Envoyée par {item.sender?.name ??
                    item.sender?.email ??
                    'staff inconnu'}
                  {#if !hasContent}
                    <span class="ml-1 italic">— contenu non archivé</span>
                  {/if}
                </p>
              </div>
              {#if hasContent}
                <span
                  class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground"
                >
                  {#if isOpen}
                    <ChevronDown class="h-4 w-4" />
                  {:else}
                    <ChevronRight class="h-4 w-4" />
                  {/if}
                </span>
              {/if}
            </button>
            {#if hasContent && isOpen}
              <div
                class="space-y-2 border-t border-border bg-muted/20 px-3 py-3"
              >
                {#if item.subject}
                  <p class="text-[11px] font-bold tracking-wider uppercase">
                    <span class="text-muted-foreground">Objet :</span>
                    <span class="text-foreground">{item.subject}</span>
                  </p>
                {/if}
                {#if item.body}
                  <pre
                    class="rounded-sm border border-border bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{item.body}</pre>
                {/if}
              </div>
            {/if}
          </li>
        {:else}
          <li
            class="flex items-start gap-3 rounded-sm border border-border bg-muted/20 p-3"
          >
            <span
              class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground"
            >
              {#if item.channel === 'mail'}
                <Mail class="h-3.5 w-3.5" />
              {:else}
                <MessageSquare class="h-3.5 w-3.5" />
              {/if}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p class="text-sm font-bold">
                  Diffusion
                  <span class="text-muted-foreground">·</span>
                  <a
                    href={`${resolve(`/staff/dev/broadcasts/${item.broadcast.id}`)}?from=${talentId}`}
                    class="hover:underline"
                  >
                    {item.broadcast.name}
                  </a>
                </p>
                <span class="text-[11px] text-muted-foreground">
                  {formatDateFr(item.sentAt, timezone)}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                Reçue par {item.audience === 'parent'
                  ? 'le parent'
                  : 'le stagiaire'}
                {#if item.broadcast.subjectSnapshot}
                  <span class="ml-1">— {item.broadcast.subjectSnapshot}</span>
                {/if}
              </p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
              {#if item.status === 'failed'}
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-epi-orange px-2 py-0.5 font-semibold text-white"
                >
                  <X class="h-3.5 w-3.5" />
                  Échec
                </span>
              {:else if item.status === 'pending'}
                <span
                  class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-semibold text-muted-foreground"
                >
                  <Clock class="h-3.5 w-3.5" />
                  En attente
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
                  {formatDateFr(item.openedAt, timezone)}
                </span>
              {:else if item.status !== 'failed' && item.status !== 'pending'}
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
        {/if}
      {/each}
    </ul>

    {#if total > pageSize}
      <div
        class="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground"
      >
        <span>
          Page {page} sur {totalPages}
          <span class="ml-2">·</span>
          <span class="ml-2">{total} au total</span>
        </span>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="rounded-sm"
            disabled={page <= 1}
            onclick={() => onPageChange(page - 1)}
          >
            ← Précédent
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="rounded-sm"
            disabled={page >= totalPages}
            onclick={() => onPageChange(page + 1)}
          >
            Suivant →
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</EpiSection>
