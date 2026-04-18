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
  <!-- HEADER -->
  <div class="flex shrink-0 items-center justify-between border-b px-6 py-4">
    <div class="flex items-center gap-4">
      <a
        href={resolve('/staff/pedago')}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <div>
        <h1 class="text-2xl font-bold text-epi-blue uppercase">
          Planning Builder<span class="text-foreground">_</span>
        </h1>
        <p
          class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
        >
          {data.event.titre} • {new Date(data.event.date).toLocaleDateString(
            'fr-FR',
            { timeZone: data.timezone },
          )}
        </p>
      </div>
    </div>
  </div>

  <div class="flex-1 overflow-hidden p-4">
    <CalendarPlanner
      planning={data.planning}
      templates={data.templates}
      tsForm={data.tsForm}
      staticActivityForm={data.staticActivityForm}
      templateActivityForm={data.templateActivityForm}
      eventId={data.event.id}
      eventDate={data.event.date}
      eventEndDate={data.event.endDate}
      planningTemplates={data.planningTemplates}
      applyTemplateForm={data.applyTemplateForm}
      timezone={data.timezone}
      appelRouteBase={`/staff/pedago/events/${data.event.id}/cockpit`}
      containerClass="h-full"
      canEdit={can('pedaLead', data.staffProfile?.staffRole)}
    />
  </div>
</div>
