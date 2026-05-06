<script lang="ts">
  import ChecklistItem from '$lib/components/staff/ChecklistItem.svelte';
  import type {
    ChecklistGroup,
    ChecklistItem as ChecklistItemData,
  } from '$lib/server/services/eventTasks';

  type Props = {
    items: ChecklistItemData[];
  };

  let { items }: Props = $props();

  let hideDone = $state(true);

  const total = $derived(items.length);
  const doneCount = $derived(items.filter((i) => i.done).length);
  const pct = $derived(total === 0 ? 0 : Math.round((doneCount / total) * 100));
  const visible = $derived(hideDone ? items.filter((i) => !i.done) : items);

  const GROUP_ORDER: ChecklistGroup[] = ['team', 'onboarding', 'documents'];
  const GROUP_LABELS: Record<ChecklistGroup, string> = {
    team: 'Équipe & planning',
    onboarding: 'Onboarding plateforme',
    documents: 'Documents administratifs',
  };

  const grouped = $derived(
    GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      items: visible.filter((i) => i.group === group),
    })).filter((g) => g.items.length > 0),
  );
</script>

<div class="space-y-4">
  <div class="flex items-baseline justify-between gap-3">
    <span
      class="font-mono text-xs font-bold tracking-widest text-foreground uppercase"
    >
      <span class="text-epi-teal-solid">{doneCount}</span>
      <span class="text-muted-foreground">/ {total} réglés · {pct} %</span>
    </span>
    {#if doneCount > 0 && doneCount < total}
      <button
        type="button"
        onclick={() => (hideDone = !hideDone)}
        class="cursor-pointer font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase transition-colors hover:text-epi-blue"
      >
        {hideDone ? 'Tout afficher' : 'Masquer terminés'}
      </button>
    {/if}
  </div>

  <div class="h-1.5 overflow-hidden rounded-full bg-muted dark:bg-muted/30">
    <div
      class="h-full bg-epi-teal-solid transition-[width] duration-700 ease-out"
      style="width: {pct}%"
    ></div>
  </div>

  {#each grouped as g (g.group)}
    <section class="space-y-1.5">
      <h3
        class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        {g.label}
      </h3>
      <div class="overflow-hidden rounded-sm border bg-card">
        {#each g.items as item (item.key)}
          <ChecklistItem
            title={item.title}
            meta={item.meta}
            severity={item.severity}
            done={item.done}
            href={item.href}
          />
        {/each}
      </div>
    </section>
  {/each}
</div>
