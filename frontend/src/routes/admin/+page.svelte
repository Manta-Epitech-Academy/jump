<script lang="ts">
  import { Map, Users, GraduationCap, CalendarDays } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '$lib/components/ui/table';
  import { formatDateFr, i18nHref } from '$lib/utils';
  import { m } from '$lib/paraglide/messages.js';

  let { data } = $props();
</script>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      {m.admin_dashboard_title()} <span class="text-epi-pink">{m.admin_dashboard_title_accent()}</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      {m.admin_dashboard_subtitle()}
    </p>
  </div>

  <!-- KPIs -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <a
      href={i18nHref('/admin/campuses')}
      class="block transition-all hover:-translate-y-1"
    >
      <Card.Root
        class="h-full border-t-4 border-t-epi-pink shadow-sm hover:border-epi-pink/80"
      >
        <Card.Header
          class="flex flex-row items-center justify-between space-y-0 pb-2"
        >
          <Card.Title
            class="text-sm font-bold uppercase transition-colors hover:text-epi-pink"
            >{m.admin_kpi_network()}</Card.Title
          >
          <Map class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.campuses}</div>
          <p class="text-xs text-muted-foreground">{m.admin_kpi_network_detail()}</p>
        </Card.Content>
      </Card.Root>
    </a>

    <a
      href={i18nHref('/admin/users')}
      class="block transition-all hover:-translate-y-1"
    >
      <Card.Root
        class="h-full border-t-4 border-t-epi-pink shadow-sm hover:border-epi-pink/80"
      >
        <Card.Header
          class="flex flex-row items-center justify-between space-y-0 pb-2"
        >
          <Card.Title
            class="text-sm font-bold uppercase transition-colors hover:text-epi-pink"
            >{m.admin_kpi_staff()}</Card.Title
          >
          <Users class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.users}</div>
          <p class="text-xs text-muted-foreground">{m.admin_kpi_staff_detail()}</p>
        </Card.Content>
      </Card.Root>
    </a>

    <Card.Root class="border-t-4 border-t-epi-pink shadow-sm">
      <Card.Header
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <Card.Title class="text-sm font-bold uppercase">{m.admin_kpi_students()}</Card.Title>
        <GraduationCap class="h-4 w-4 text-muted-foreground" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{data.stats.students}</div>
        <p class="text-xs text-muted-foreground">{m.admin_kpi_students_detail()}</p>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-t-4 border-t-epi-pink shadow-sm">
      <Card.Header
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <Card.Title class="text-sm font-bold uppercase">{m.admin_kpi_events()}</Card.Title>
        <CalendarDays class="h-4 w-4 text-muted-foreground" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{data.stats.events}</div>
        <p class="text-xs text-muted-foreground">{m.admin_kpi_events_detail()}</p>
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Latest Events -->
  <Card.Root>
    <Card.Header>
      <Card.Title class="uppercase">{m.admin_recent_events()}</Card.Title>
    </Card.Header>
    <Card.Content>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.admin_column_title()}</TableHead>
            <TableHead>{m.admin_column_date()}</TableHead>
            <TableHead class="text-right">{m.admin_column_campus()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.recentEvents as event}
            <TableRow>
              <TableCell class="font-bold">{event.titre}</TableCell>
              <TableCell>{formatDateFr(event.date)}</TableCell>
              <TableCell class="text-right text-epi-pink"
                >{event.campus}</TableCell
              >
            </TableRow>
          {:else}
            <TableRow>
              <TableCell colspan={3} class="text-center text-muted-foreground"
                >{m.admin_no_events()}</TableCell
              >
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </Card.Content>
  </Card.Root>
</div>
