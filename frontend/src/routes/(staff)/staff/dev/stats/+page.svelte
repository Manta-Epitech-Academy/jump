<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Users from '@lucide/svelte/icons/users';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { buttonVariants } from '$lib/components/ui/button';

  let { data } = $props();

  let selectedYear = $derived(data.selectedYear);
  let stats = $derived(data.stats);

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const statusLabels: Record<string, string> = {
    ongoing: 'En cours',
    upcoming: 'À venir',
    past: 'Terminé',
  };

  const statusColors: Record<string, string> = {
    ongoing:
      'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid hover:bg-epi-teal/15',
    upcoming:
      'border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/15',
    past: 'border-border bg-muted text-muted-foreground hover:bg-muted/80',
  };
</script>

<svelte:head>
  <title>Tableau de bord · {selectedYear}</title>
</svelte:head>

<div class="space-y-6 pb-10" in:fly={{ y: 15, duration: 300 }}>
  <PageHeader
    title="Tableau de bord"
    subtitle="Année Scolaire {selectedYear}"
  />

  <!-- Key Metrics Grid -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <!-- Events Card -->
    <div class="rounded-sm border bg-card p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h2
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Événements
        </h2>
        <CalendarDays class="h-4 w-4 text-epi-blue" />
      </div>
      <p class="mt-2 text-3xl font-bold text-epi-blue">
        {stats.totalEvents}
      </p>
      <p class="mt-1 text-xs text-muted-foreground">
        Actifs dans l'espace dev pour cette année.
      </p>
    </div>

    <!-- Participants Card -->
    <div class="rounded-sm border bg-card p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h2
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Candidats
        </h2>
        <Users class="h-4 w-4 text-epi-orange" />
      </div>
      <p class="mt-2 text-3xl font-bold text-epi-orange">
        {stats.totalParticipants}
      </p>
      <p class="mt-1 text-xs text-muted-foreground">
        Inscriptions totales sur les événements.
      </p>
    </div>

    <!-- Attendance Card -->
    <div class="rounded-sm border bg-card p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h2
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Taux d'assiduité
        </h2>
        <ClipboardCheck class="h-4 w-4 text-epi-teal-solid" />
      </div>
      <p class="mt-2 text-3xl font-bold text-epi-teal-solid">
        {stats.presenceRate}%
      </p>
      <p class="mt-1 text-xs text-muted-foreground">
        Présence moyenne à l'émargement.
      </p>
    </div>

    <!-- Interviews Card -->
    <div class="rounded-sm border bg-card p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h2
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Entretiens
        </h2>
        <MessageSquare class="h-4 w-4 text-epi-pink" />
      </div>
      <p class="mt-2 text-3xl font-bold text-epi-pink">
        {stats.totalInterviews}
      </p>
      <p class="mt-1 text-xs text-muted-foreground">
        Entretiens d'admission menés.
      </p>
    </div>
  </div>

  <!-- Detailed Events Table -->
  <div class="rounded-sm border bg-card shadow-sm">
    <div class="border-b p-4">
      <h3 class="text-sm font-semibold">
        Détails des événements ({selectedYear})
      </h3>
      <p class="text-xs text-muted-foreground">
        Statistiques individuelles et statut de chaque session.
      </p>
    </div>

    {#if stats.eventBreakdown.length > 0}
      <Table.Root>
        <Table.Header>
          <Table.Row class="bg-muted/50">
            <Table.Head
              class="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >Nom de l'événement</Table.Head
            >
            <Table.Head
              class="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >Date de début</Table.Head
            >
            <Table.Head
              class="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >Statut</Table.Head
            >
            <Table.Head
              class="text-right text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >Participants</Table.Head
            >
            <Table.Head
              class="text-right text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >Entretiens</Table.Head
            >
            <Table.Head class="w-12"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each stats.eventBreakdown as e (e.id)}
            <Table.Row class="hover:bg-muted/30">
              <Table.Cell class="font-semibold">{e.name}</Table.Cell>
              <Table.Cell class="text-muted-foreground">
                {dateFmt.format(new Date(e.date))}
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline" class={statusColors[e.status]}>
                  {statusLabels[e.status] || e.status}
                </Badge>
              </Table.Cell>
              <Table.Cell class="text-right font-mono font-medium"
                >{e.participants}</Table.Cell
              >
              <Table.Cell class="text-right font-mono font-medium"
                >{e.interviews}</Table.Cell
              >
              <Table.Cell class="py-2">
                <a
                  href={resolve(`/staff/dev/events/${e.id}/inscrits` as any)}
                  class={buttonVariants({
                    variant: 'ghost',
                    size: 'icon',
                    class: 'h-8 w-8 cursor-pointer rounded-sm',
                  })}
                >
                  <ChevronRight class="h-4 w-4" />
                </a>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {:else}
      <div class="py-12 text-center text-sm text-muted-foreground">
        Aucun événement configuré pour cette année scolaire.
      </div>
    {/if}
  </div>
</div>
