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
  import { formatDateFr } from '$lib/utils';
  import { resolve } from '$app/paths';

  let { data } = $props();
</script>

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
      href={resolve('/admin/campuses')}
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
      href={resolve('/admin/users')}
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
        <Card.Title class="text-sm font-bold uppercase">Staff</Card.Title>
        <Users class="h-4 w-4 text-muted-foreground" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{data.stats.users}</div>
        <p class="text-xs text-muted-foreground">Membres de l'équipe</p>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-t-4 border-t-epi-pink shadow-sm">
      <Card.Header
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <Card.Title class="text-sm font-bold uppercase">Étudiants</Card.Title>
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
