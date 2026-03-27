<script lang="ts">
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '$lib/components/ui/table';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Avatar from '$lib/components/ui/avatar';
  import {
    Calendar,
    Tag,
    Archive,
    Users,
    UserCheck,
    Ellipsis,
    Pencil,
    Copy,
    Trash2,
  } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { formatDateFr } from '$lib/utils';
  import { resolve } from '$app/paths';
  import DuplicateEventDialog from '$lib/components/events/DuplicateEventDialog.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  let deleteDialogOpen = $state(false);
  let eventToDelete = $state<string | null>(null);

  let duplicateDialogOpen = $state(false);
  let eventToDuplicate = $state<{
    id: string;
    titre: string;
    date: Date;
  } | null>(null);

  function confirmDelete(id: string) {
    eventToDelete = id;
    deleteDialogOpen = true;
  }

  function openDuplicate(event: { id: string; titre: string; date: Date }) {
    eventToDuplicate = event;
    duplicateDialogOpen = true;
  }
</script>

<div class="space-y-6">
  <PageHeader title="Historique" subtitle="Archives des événements passés" />

  {#if data.events.length > 0}
    <div class="rounded-sm border bg-card shadow-sm">
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
            >
              Mantas
            </TableHead>
            <TableHead class="text-center text-xs font-bold uppercase"
              >Participation</TableHead
            >
            <TableHead class="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.events as event}
            <TableRow class="hover:bg-muted/30">
              <TableCell class="font-bold">
                <a
                  href={resolve(`/events/${event.id}/builder`)}
                  class="text-muted-foreground transition-colors hover:text-epi-blue hover:underline"
                >
                  {event.titre}
                </a>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar class="h-4 w-4 text-muted-foreground" />
                  <span class="font-medium">{formatDateFr(event.date)}</span>
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
                            href={resolve(`/events/${event.id}/appel`)}
                            class="h-9 w-9 border-epi-teal/30 bg-epi-teal/10 text-teal-700 hover:bg-epi-teal hover:text-black dark:text-epi-teal dark:hover:text-black"
                          >
                            <UserCheck class="h-5 w-5" />
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        <p>Consulter l'appel</p>
                      </Tooltip.Content>
                    </Tooltip.Root>
                  </Tooltip.Provider>

                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
                    >
                      <Ellipsis class="h-4 w-4" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Item class="p-0">
                        {#snippet child({ props })}
                          <a
                            {...props}
                            href={resolve(`/events/${event.id}/builder`)}
                            class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <Pencil
                              class="mr-2 h-4 w-4 text-muted-foreground"
                            />
                            Modifier / Builder
                          </a>
                        {/snippet}
                      </DropdownMenu.Item>

                      <DropdownMenu.Separator />

                      <DropdownMenu.Item
                        class="cursor-pointer"
                        onclick={() => openDuplicate(event)}
                      >
                        <Copy class="mr-2 h-4 w-4 text-muted-foreground" />
                        Dupliquer
                      </DropdownMenu.Item>

                      <DropdownMenu.Separator />

                      <DropdownMenu.Item
                        class="cursor-pointer text-destructive"
                        onclick={() => confirmDelete(event.id)}
                      >
                        <Trash2 class="mr-2 h-4 w-4" />
                        Supprimer
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
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
        Aucun événement passé n'a été trouvé.
      </p>
    </div>
  {/if}

  <DuplicateEventDialog bind:open={duplicateDialogOpen} {eventToDuplicate} />

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/deleteEvent&id={eventToDelete}"
    title="Supprimer l'événement"
    description="Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible et retirera les XP acquis par les participants."
    buttonText="Supprimer définitivement"
  />
</div>
