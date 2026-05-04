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
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
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

<svelte:head>
  <title>Historique des événements</title>
</svelte:head>

<div class="space-y-6">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      { label: 'Historique' },
    ]}
  />
  <PageHeader title="Historique" subtitle="Archives des événements passés" />

  {#if data.events.length > 0}
    <div
      class="rounded-sm border bg-card shadow-sm dark:border-border/50 dark:shadow-none"
    >
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="text-xs font-bold uppercase">Événement</TableHead>
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
                  class="tracking-tight text-foreground transition-colors hover:text-epi-blue"
                >
                  {event.titre}
                </a>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar class="h-3.5 w-3.5 text-muted-foreground" />
                  <span class="text-sm font-medium"
                    >{formatDateFr(event.date, data.timezone)}</span
                  >
                  <span class="text-xs font-medium text-muted-foreground"
                    >{formatTime(event.date)}</span
                  >
                </div>
              </TableCell>
              <TableCell class="hidden md:table-cell">
                {#if event.theme}
                  <div class="flex items-center gap-2">
                    <Tag class="h-3.5 w-3.5 text-epi-teal-solid" />
                    <span
                      class="text-xs font-bold tracking-widest text-epi-teal-solid uppercase"
                      >{event.theme}</span
                    >
                  </div>
                {:else}
                  <span
                    class="text-[10px] tracking-widest text-muted-foreground uppercase"
                    >Aucun thème</span
                  >
                {/if}
              </TableCell>
              <TableCell class="hidden text-center md:table-cell">
                {#if event.mantas && event.mantas.length > 0}
                  <div class="flex justify-center -space-x-1.5">
                    {#each event.mantas as manta}
                      <Tooltip.Provider delayDuration={0}>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            <Avatar.Root
                              class="relative h-6 w-6 rounded-sm border-2 border-background hover:z-10"
                            >
                              {#if manta.avatarUrl}
                                <Avatar.Image
                                  src={manta.avatarUrl}
                                  alt={manta.name}
                                />
                              {/if}
                              <Avatar.Fallback
                                class="bg-muted text-[8px] font-bold text-foreground opacity-70"
                              >
                                {manta.name.substring(0, 2).toUpperCase()}
                              </Avatar.Fallback>
                            </Avatar.Root>
                          </Tooltip.Trigger>
                          <Tooltip.Content class="rounded-sm"
                            ><p>{manta.name}</p></Tooltip.Content
                          >
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    {/each}
                  </div>
                {:else}
                  <span class="text-xs text-muted-foreground">—</span>
                {/if}
              </TableCell>
              <TableCell class="text-center">
                <Badge
                  variant="secondary"
                  class="gap-1 rounded-sm font-mono text-[10px]"
                >
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
                            class="h-8 w-8 rounded-sm border-epi-blue/30 bg-epi-blue/10 text-epi-blue hover:bg-epi-blue hover:text-white"
                          >
                            <FileCheck class="h-4 w-4" />
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content class="rounded-sm"
                        ><p>Voir le Dashboard</p></Tooltip.Content
                      >
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
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-20 text-center text-muted-foreground"
    >
      <Archive class="mx-auto h-12 w-12 opacity-30" />
      <h3
        class="mt-4 font-sans text-lg font-bold tracking-wide text-foreground uppercase"
      >
        Historique vide
      </h3>
      <p class="mt-1 text-xs font-medium">
        Aucun événement passé n'a été trouvé.
      </p>
    </div>
  {/if}

  <EventActionManager bind:this={actionManager} />
</div>
