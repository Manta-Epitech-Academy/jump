<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { buttonVariants } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import {
    ArrowLeft,
    CalendarRange,
    CheckCircle2,
    Users,
    Radio,
  } from '@lucide/svelte';
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
  <div class="flex items-start justify-between gap-4">
    <div class="flex items-center gap-3">
      <a
        href={resolve(`/staff/pedago/events/${event.id}/planning`)}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label="Retour au planning"
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <PageHeader title="Présences" subtitle={event.titre} />
    </div>
  </div>

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
