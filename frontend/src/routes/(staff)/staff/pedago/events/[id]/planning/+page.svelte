<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import CalendarPlanner from '$lib/components/events/planning/CalendarPlanner.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import { can } from '$lib/domain/permissions';

  let { data }: { data: PageData } = $props();
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col bg-background">
  <!-- HEADER -->
  <div class="shrink-0 border-b px-6 py-4">
    <PageBreadcrumb
      items={[
        { label: 'Dashboard', href: resolve('/staff/pedago') },
        { label: data.event.titre },
      ]}
    />
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

  <div class="flex-1 overflow-hidden p-4">
    <CalendarPlanner
      planning={data.planning}
      templates={data.templates}
      eventDate={data.event.date}
      eventEndDate={data.event.endDate}
      planningTemplates={data.planningTemplates}
      applyTemplateForm={data.applyTemplateForm}
      timezone={data.timezone}
      appelRouteBase={`/staff/pedago/events/${data.event.id}/cockpit`}
      containerClass="h-full"
      canEdit={can('pedaLead', data.staffProfile?.staffRole)}
      canTrain={can('pedaMember', data.staffProfile?.staffRole)}
      eventId={data.event.id}
    />
  </div>
</div>
