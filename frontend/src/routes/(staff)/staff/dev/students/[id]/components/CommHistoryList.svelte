<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { formatDateFr, cn } from '$lib/utils';

  type Reminder = {
    id: string;
    type: 'student' | 'parent';
    subject?: string | null;
    body?: string | null;
    sentAt: Date | string;
    sender: { name: string | null; email: string | null } | null;
  };

  let { reminders, timezone }: { reminders: Reminder[]; timezone: string } =
    $props();

  const labelByType: Record<Reminder['type'], string> = {
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

<EpiSection overline="Historique" title="Relances envoyées" accent="blue">
  {#snippet meta()}
    <span
      class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      {reminders.length}
    </span>
  {/snippet}

  {#if reminders.length === 0}
    <p class="text-sm text-muted-foreground italic">
      Aucune relance envoyée à ce talent.
    </p>
  {:else}
    <ul class="space-y-2">
      {#each reminders as r (r.id)}
        {@const hasContent = Boolean(r.subject || r.body)}
        {@const isOpen = expanded.has(r.id)}
        <li class="rounded-sm border border-border bg-card">
          <button
            type="button"
            onclick={() => hasContent && toggle(r.id)}
            class={cn(
              'flex w-full items-start gap-3 p-3 text-left',
              hasContent
                ? 'cursor-pointer hover:bg-muted/30'
                : 'cursor-default',
            )}
            aria-expanded={hasContent ? isOpen : undefined}
          >
            <span
              class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground"
            >
              <Mail class="h-3.5 w-3.5" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p class="text-sm font-bold">{labelByType[r.type]}</p>
                <span class="text-[11px] text-muted-foreground">
                  {formatDateFr(r.sentAt, timezone)}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                Envoyée par {r.sender?.name ??
                  r.sender?.email ??
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
            <div class="space-y-2 border-t border-border bg-muted/20 px-3 py-3">
              {#if r.subject}
                <p class="text-[11px] font-bold tracking-wider uppercase">
                  <span class="text-muted-foreground">Objet :</span>
                  <span class="text-foreground">{r.subject}</span>
                </p>
              {/if}
              {#if r.body}
                <pre
                  class="rounded-sm border border-border bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{r.body}</pre>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</EpiSection>
