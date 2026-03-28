<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Calendar, Tag, Plus, Coffee, UserCheck } from 'lucide-svelte';

  import { resolve } from '$app/paths';
  import EventActionManager from '$lib/components/events/EventActionManager.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import EventDropdownMenu from '$lib/components/events/EventDropdownMenu.svelte';

  let { data } = $props();

  function formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getEventStatus(date: Date) {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours > 1) return 'future';
    if (hours < -4) return 'past';
    return 'now';
  }

  let actionManager: ReturnType<typeof EventActionManager>;
</script>

<div class="space-y-6">
  <PageHeader
    title="Dashboard"
    subtitle="{data.events.length} événement{data.events.length > 1
      ? 's'
      : ''} programmés"
  >
    <Button
      size="sm"
      href={resolve('/events/new')}
      class="bg-epi-blue shadow-lg"
    >
      <Plus class="mr-2 h-4 w-4" />
      <span class="hidden sm:inline">Nouvel Événement</span>
      <span class="inline sm:hidden">Nouveau</span>
    </Button>
  </PageHeader>

  {#if data.events.length > 0}
    <div class="rounded-sm border bg-card shadow-sm">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="text-xs font-bold uppercase">Événement</TableHead>
            <TableHead class="text-xs font-bold uppercase"
              >Date & Heure</TableHead
            >
            <TableHead class="hidden text-xs font-bold uppercase md:table-cell"
              >Thème</TableHead
            >
            <TableHead
              class="hidden text-center text-xs font-bold uppercase md:table-cell"
              >Mantas</TableHead
            >
            <TableHead
              class="hidden text-center text-xs font-bold uppercase md:table-cell"
              >Statut</TableHead
            >
            <TableHead class="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.events as event}
            {@const status = getEventStatus(event.date)}
            <TableRow class="hover:bg-muted/30">
              <TableCell class="font-bold">
                <a
                  href={resolve(`/events/${event.id}/builder`)}
                  class="transition-colors hover:text-epi-blue hover:underline"
                >
                  <span style:view-transition-name="event-title-{event.id}"
                    >{event.titre}</span
                  >
                </a>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar
                    class="hidden h-4 w-4 text-muted-foreground sm:block"
                  />
                  <div
                    class="flex flex-col sm:flex-row sm:items-center sm:gap-2"
                  >
                    <span class="font-medium">{formatDate(event.date)}</span>
                    <span class="text-xs text-muted-foreground sm:text-sm"
                      >• {formatTime(event.date)}</span
                    >
                  </div>
                </div>
              </TableCell>
              <TableCell class="hidden md:table-cell">
                {#if event.theme}
                  <div class="flex items-center gap-2">
                    <Tag class="h-4 w-4 text-teal-700" />
                    <span class="font-bold text-teal-800">{event.theme}</span>
                  </div>
                {:else}
                  <span class="text-sm text-muted-foreground italic"
                    >Aucun thème</span
                  >
                {/if}
              </TableCell>
              <TableCell class="hidden text-center md:table-cell">
                {#if event.mantas && event.mantas.length > 0}
                  <div class="flex justify-center -space-x-2">
                    {#each event.mantas as manta}
                      <Tooltip.Provider delayDuration={0}>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            <Avatar.Root
                              class="relative h-7 w-7 border-2 border-background hover:z-10"
                            >
                              {#if manta.avatarUrl}
                                <Avatar.Image
                                  src={manta.avatarUrl}
                                  alt={manta.name}
                                />
                              {/if}
                              <Avatar.Fallback
                                class="bg-muted text-[9px] font-bold text-foreground"
                              >
                                {manta.name.substring(0, 2).toUpperCase()}
                              </Avatar.Fallback>
                            </Avatar.Root>
                          </Tooltip.Trigger>
                          <Tooltip.Content><p>{manta.name}</p></Tooltip.Content>
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    {/each}
                  </div>
                {:else}
                  <span class="text-xs text-muted-foreground italic">-</span>
                {/if}
              </TableCell>
              <TableCell class="hidden text-center md:table-cell">
                {#if status === 'future'}
                  <span
                    class="inline-block rounded-sm bg-blue-100 px-2 py-1 text-[10px] font-black tracking-widest text-blue-700 uppercase"
                    >À venir</span
                  >
                {:else if status === 'now'}
                  <span
                    class="inline-block rounded-sm bg-epi-orange/20 px-2 py-1 text-[10px] font-black tracking-widest text-epi-orange uppercase"
                    >En cours</span
                  >
                {:else}
                  <span
                    class="inline-block rounded-sm bg-epi-teal/20 px-2 py-1 text-[10px] font-black tracking-widest text-green-700 uppercase"
                    >Terminé</span
                  >
                {/if}
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <Tooltip.Provider delayDuration={300}>
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <Button
                            {...props}
                            variant="outline"
                            size="icon"
                            href={resolve(`/events/${event.id}/appel`)}
                            class="h-9 w-9 border-epi-teal/30 bg-epi-teal/10 text-teal-700 hover:bg-epi-teal hover:text-black dark:text-epi-teal dark:hover:text-black"
                          >
                            <UserCheck class="h-5 w-5" />
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content><p>Faire l'appel</p></Tooltip.Content>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                  <EventDropdownMenu
                    {event}
                    onDuplicate={(e) => actionManager.openDuplicate(e)}
                    onDelete={(id) => actionManager.confirmDelete(id)}
                  />
                </div>
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  {:else}
    <EmptyState
      icon={Coffee}
      title="Allo l'équipe Dev ?"
      description="C'est louche... Le calendrier est vide.<br />Vous êtes partis en vacances ou vous avez fini le game ?"
      actionLabel="Créer un événement"
      actionLink={resolve('/events/new')}
    />
  {/if}

  <EventActionManager bind:this={actionManager} />
</div>
