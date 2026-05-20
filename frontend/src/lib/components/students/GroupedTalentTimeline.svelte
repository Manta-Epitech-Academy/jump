<script lang="ts">
  import Calendar from '@lucide/svelte/icons/calendar';
  import TalentTimelineItem from './_TalentTimelineItem.svelte';
  import { cn } from '$lib/utils';
  import type { TimelineGroups } from '$lib/domain/talentTimeline';

  /**
   * Three-section vertical timeline (Passés / En cours / À venir).
   *
   * Each section is labelled with a charte-style mono `< />` overline + a
   * small Anton heading; the future group uses a dashed connector to read
   * as "not yet done". Empty sections are hidden entirely.
   */
  type Props = {
    groups: TimelineGroups<any>;
    timezone: string;
  };

  let { groups, timezone }: Props = $props();

  const sections = $derived(
    [
      {
        id: 'current' as const,
        label: 'En cours',
        items: groups.current,
        connector: 'solid' as const,
        accent: 'text-epi-blue',
        rail: 'before:bg-epi-blue/30',
        dim: false,
      },
      {
        id: 'past' as const,
        label: 'Passés',
        items: groups.past,
        connector: 'solid' as const,
        accent: 'text-muted-foreground',
        rail: 'before:bg-border',
        dim: false,
      },
      {
        id: 'future' as const,
        label: 'À venir',
        items: groups.future,
        connector: 'dashed' as const,
        accent: 'text-epi-pink',
        rail: 'before:bg-[image:repeating-linear-gradient(to_bottom,theme(colors.epi-pink)_0_4px,transparent_4px_8px)] before:opacity-60',
        dim: true,
      },
    ].filter((s) => s.items.length > 0),
  );

  const totalCount = $derived(
    groups.past.length + groups.current.length + groups.future.length,
  );
</script>

{#if totalCount === 0}
  <div
    class="flex flex-col items-center justify-center gap-3 py-10 text-center"
  >
    <Calendar class="h-7 w-7 text-muted-foreground/60" />
    <p
      class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      &lt; Aucun historique /&gt;
    </p>
    <p class="text-sm text-muted-foreground">
      Ce Talent n'a pas encore participé à un événement.
    </p>
  </div>
{:else}
  <div class="space-y-7">
    {#each sections as section (section.id)}
      <section>
        <header class="mb-3 flex items-baseline gap-3">
          <p
            class={cn(
              'font-mono text-[10px] font-bold tracking-widest uppercase',
              section.accent,
            )}
          >
            <span class="opacity-60">&lt;</span>
            {section.label}
            <span class="opacity-60">/&gt;</span>
          </p>
          <span
            class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground"
          >
            {section.items.length}
          </span>
          <div class="h-px flex-1 bg-border"></div>
        </header>

        <div
          class={cn(
            'relative space-y-4',
            'before:absolute before:top-0 before:bottom-0 before:left-5 before:w-0.5 before:-translate-x-px',
            section.rail,
          )}
        >
          {#each section.items as p (p.id)}
            <TalentTimelineItem
              {p}
              {timezone}
              layout="linear"
              dim={section.dim}
            />
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}
