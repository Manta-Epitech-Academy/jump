<script lang="ts">
  import {
    Map,
    Users,
    GraduationCap,
    CalendarDays,
    RefreshCw,
  } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '$lib/components/ui/table';
  import { formatDateFr } from '$lib/utils';
  import { resolve } from '$app/paths';

  let { data } = $props();

  const syncTypeLabels = {
    campus_list: 'Liste des campus',
    events: 'Événements',
    talents: 'Talents',
    ref_comp: 'Référentiel de compétences',
    subject_import: 'Import de sujet',
  } as const;

  function formatSyncDateTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<svelte:head>
  <title>Tableau de bord</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Système <span class="text-epi-pink">Global</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Vue d'ensemble du réseau Jump
    </p>
  </div>

  <!-- KPIs -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <a
      href={resolve('/staff/admin/campuses')}
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
            >Réseau</Card.Title
          >
          <Map class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.campuses}</div>
          <p class="text-xs text-muted-foreground">Campus actifs</p>
        </Card.Content>
      </Card.Root>
    </a>

    <a
      href={resolve('/staff/admin/users')}
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
            >Staff</Card.Title
          >
          <Users class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.users}</div>
          <p class="text-xs text-muted-foreground">Membres de l'équipe</p>
        </Card.Content>
      </Card.Root>
    </a>

    <Card.Root class="border-t-4 border-t-epi-pink shadow-sm">
      <Card.Header
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <Card.Title class="text-sm font-bold uppercase">Talents</Card.Title>
        <GraduationCap class="h-4 w-4 text-muted-foreground" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{data.stats.students}</div>
        <p class="text-xs text-muted-foreground">Inscrits en base</p>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-t-4 border-t-epi-pink shadow-sm">
      <Card.Header
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <Card.Title class="text-sm font-bold uppercase">Événements</Card.Title>
        <CalendarDays class="h-4 w-4 text-muted-foreground" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{data.stats.events}</div>
        <p class="text-xs text-muted-foreground">Organisés au total</p>
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Worker Sync Status -->
  <Card.Root>
    <Card.Header
      class="flex flex-row items-center justify-between space-y-0 pb-2"
    >
      <Card.Title class="text-sm font-bold uppercase"
        >Dernière synchro worker</Card.Title
      >
      <RefreshCw class="h-4 w-4 text-muted-foreground" />
    </Card.Header>
    <Card.Content>
      {#if data.lastSync}
        <div class="text-2xl font-black">
          {formatSyncDateTime(data.lastSync.at)}
        </div>
        <p class="text-xs text-muted-foreground">
          {syncTypeLabels[data.lastSync.type]}
          {#if data.lastSync.campusExtName}
            · {data.lastSync.campusExtName}
          {/if}
          {#if data.lastSync.eventExtId}
            · event {data.lastSync.eventExtId}
          {/if}
          {#if data.lastSync.created != null || data.lastSync.updated != null}
            · {data.lastSync.created ?? 0} créé(s),
            {data.lastSync.updated ?? 0} mis à jour
            {#if data.lastSync.removed != null}, {data.lastSync.removed} retiré(s){/if}
            {#if data.lastSync.skipped != null}, {data.lastSync.skipped} ignoré(s){/if}
          {/if}
        </p>
      {:else}
        <div class="text-2xl font-black text-muted-foreground">—</div>
        <p class="text-xs text-muted-foreground">
          Aucune synchro depuis le dernier redémarrage
        </p>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Latest Events -->
  <Card.Root>
    <Card.Header>
      <Card.Title class="uppercase">Derniers événements créés</Card.Title>
    </Card.Header>
    <Card.Content>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Titre</TableHead>
            <TableHead>Date</TableHead>
            <TableHead class="text-right">Campus</TableHead>
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
                >Aucun événement.</TableCell
              >
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </Card.Content>
  </Card.Root>
</div>
