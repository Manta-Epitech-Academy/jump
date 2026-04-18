<script lang="ts">
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Calendar, Tag, Archive, Users, FileCheck } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { formatDateFr } from '$lib/utils';
  import { resolve } from '$app/paths';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import EventDropdownMenu from '$lib/components/events/EventDropdownMenu.svelte';
  import EventActionManager from '$lib/components/events/EventActionManager.svelte';

  let { data } = $props();

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: data.timezone,
    });
  }

  let actionManager: ReturnType<typeof EventActionManager>;
</script>

<div class="space-y-6">
  <PageHeader title="Historique" subtitle="Archives des campagnes passées" />

  {#if data.events.length > 0}
    <div class="rounded-sm border bg-card shadow-sm">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="text-xs font-bold uppercase">Campagne</TableHead>
            <TableHead class="text-xs font-bold uppercase">Date</TableHead>
            <TableHead class="hidden text-xs font-bold uppercase md:table-cell"
              >Thème</TableHead
            >
            <TableHead
              class="hidden text-center text-xs font-bold uppercase md:table-cell"
              >Mantas</TableHead
            >
            <TableHead class="text-center text-xs font-bold uppercase"
              >Présents</TableHead
            >
            <TableHead class="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.events as event}
            <TableRow class="hover:bg-muted/30">
              <TableCell class="font-bold">
                <a
                  href={resolve(`/staff/dev/events/${event.id}/manage`)}
                  class="text-muted-foreground uppercase transition-colors hover:text-epi-blue hover:underline"
                >
                  {event.titre}
                </a>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar class="h-4 w-4 text-muted-foreground" />
                  <span class="font-medium"
                    >{formatDateFr(event.date, data.timezone)}</span
                  >
                  <span class="text-xs text-muted-foreground"
                    >{formatTime(event.date)}</span
                  >
                </div>
              </TableCell>
              <TableCell class="hidden md:table-cell">
                {#if event.theme}
                  <div class="flex items-center gap-2">
                    <Tag class="h-4 w-4 text-teal-700/70" />
                    <span class="font-bold text-teal-800/70">{event.theme}</span
                    >
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
                                class="bg-muted text-[9px] font-bold text-foreground opacity-70"
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
              <TableCell class="text-center">
                <Badge variant="secondary" class="gap-1 font-mono opacity-70">
                  <Users class="h-3 w-3" />
                  {event.presentCount}
                </Badge>
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
                            href={resolve(
                              `/staff/dev/events/${event.id}/manage`,
                            )}
                            class="h-9 w-9 border-epi-blue/30 bg-epi-blue/10 text-epi-blue hover:bg-epi-blue hover:text-white"
                          >
                            <FileCheck class="h-5 w-5" />
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content><p>Voir les Talents</p></Tooltip.Content>
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
    <div
      class="flex flex-col items-center justify-center rounded-sm border bg-card p-20 text-center shadow-sm"
    >
      <Archive class="mx-auto h-12 w-12 text-muted" />
      <h3 class="mt-4 text-lg font-bold uppercase">Historique vide</h3>
      <p class="mt-1 text-sm font-bold text-muted-foreground uppercase">
        Aucune campagne passée n'a été trouvée.
      </p>
    </div>
  {/if}

  <EventActionManager bind:this={actionManager} />
</div>
