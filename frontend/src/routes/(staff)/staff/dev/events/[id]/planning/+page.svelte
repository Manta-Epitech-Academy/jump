<script lang="ts">
  import type { PageData } from './$types';
  import { ArrowLeft } from '@lucide/svelte';
  import { buttonVariants } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import CalendarPlanner from '$lib/components/events/planning/CalendarPlanner.svelte';
  import { can } from '$lib/domain/permissions';

  let { data }: { data: PageData } = $props();
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col bg-background">
  <div class="flex shrink-0 items-center justify-between border-b px-6 py-4">
    <div class="flex items-center gap-4">
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/manage`)}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <div>
        <h1 class="text-2xl font-bold text-epi-blue uppercase">
          Planning<span class="text-epi-teal">_</span>
        </h1>
        <p
          class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
        >
          {data.event.titre} • {new Date(data.event.date).toLocaleDateString(
            'fr-FR',
            {
              day: 'numeric',
              month: 'short',
              timeZone: data.timezone,
            },
          )}{#if data.event.endDate}
            – {new Date(data.event.endDate).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
              timeZone: data.timezone,
            })}
          {/if}
        </p>
      </div>
    </div>
  </div>

  <div class="flex-1 overflow-hidden p-4">
    <CalendarPlanner
      planning={data.planning}
      templates={data.templates}
      eventDate={data.event.date}
      eventEndDate={data.event.endDate}
      planningTemplates={data.planningTemplates}
      applyTemplateForm={data.applyTemplateForm}
      timezone={data.timezone}
      containerClass="h-full"
      canEdit={can('devLead', data.staffProfile?.staffRole)}
      eventId={data.event.id}
    />
  </div>
</div>
