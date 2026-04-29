<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import { resolve } from '$app/paths';
  import { CalendarRange, CheckCircle2, Users, Radio } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  type LucideIcon = typeof CalendarRange;

  let {
    event,
    totals,
  }: {
    event: { id: string; titre: string };
    totals: {
      totalSlots: number;
      completedSlots: number;
      liveSlots: number;
      upcomingSlots: number;
      totalParticipants: number;
    };
  } = $props();
</script>

{#snippet kpiTile(
  Icon: LucideIcon,
  label: string,
  value: number | string,
  highlight: boolean = false,
)}
  <div
    class={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-3',
      highlight && 'border-epi-blue/40 bg-epi-blue/5',
    )}
  >
    <div
      class={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
        highlight
          ? 'bg-epi-blue/15 text-epi-blue'
          : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon class="h-4 w-4" />
    </div>
    <div class="min-w-0">
      <div
        class="truncate text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
      >
        {label}
      </div>
      <div class="text-lg font-bold tracking-tight">
        {value}
      </div>
    </div>
  </div>
{/snippet}

<div class="space-y-4">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      {
        label: event.titre,
        href: resolve(`/staff/pedago/events/${event.id}`),
      },
      { label: 'Présences' },
    ]}
  />
  <PageHeader
    title={event.titre}
    subtitle="Présences"
    titleViewTransitionName={`event-title-${event.id}`}
  />

  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {@render kpiTile(CalendarRange, "Créneaux d'appel", totals.totalSlots)}
    {@render kpiTile(Radio, 'En cours', totals.liveSlots, totals.liveSlots > 0)}
    {@render kpiTile(
      CheckCircle2,
      'Terminés',
      `${totals.completedSlots}/${totals.totalSlots}`,
    )}
    {@render kpiTile(Users, 'Participants', totals.totalParticipants)}
  </div>
</div>
