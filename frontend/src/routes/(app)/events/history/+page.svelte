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
  import { Calendar, Tag, Archive, Users, UserCheck } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { formatDate, formatTime, i18nHref, translateTheme } from '$lib/utils';
  import { resolve } from '$app/paths';
  import { m } from '$lib/paraglide/messages.js';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import EventDropdownMenu from '$lib/components/events/EventDropdownMenu.svelte';
  import EventActionManager from '$lib/components/events/EventActionManager.svelte';

  let { data } = $props();

  let actionManager: ReturnType<typeof EventActionManager>;
</script>

<div class="space-y-6">
  <PageHeader title={m.event_history_title()} subtitle={m.event_history_subtitle()} />

  {#if data.events.length > 0}
    <div class="rounded-sm border bg-card shadow-sm">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="text-xs font-bold uppercase">{m.event_column_event()}</TableHead>
            <TableHead class="text-xs font-bold uppercase">{m.common_field_date()}</TableHead>
            <TableHead class="hidden text-xs font-bold uppercase md:table-cell"
              >{m.common_field_theme()}</TableHead
            >
            <TableHead
              class="hidden text-center text-xs font-bold uppercase md:table-cell"
              >{m.event_form_mantas_label()}</TableHead
            >
            <TableHead class="text-center text-xs font-bold uppercase"
              >{m.event_history_column_participation()}</TableHead
            >
            <TableHead class="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.events as event}
            <TableRow class="hover:bg-muted/30">
              <TableCell class="font-bold">
                <a
                  href={i18nHref(`/events/${event.id}/builder`)}
                  class="text-muted-foreground transition-colors hover:text-epi-blue hover:underline"
                >
                  {event.titre}
                </a>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar class="h-4 w-4 text-muted-foreground" />
                  <span class="font-medium">{formatDate(event.date)}</span>
                  <span class="text-xs text-muted-foreground"
                    >{formatTime(event.date)}</span
                  >
                </div>
              </TableCell>
              <TableCell class="hidden md:table-cell">
                {#if event.theme}
                  <div class="flex items-center gap-2">
                    <Tag class="h-4 w-4 text-teal-700/70" />
                    <span class="font-bold text-teal-800/70">{translateTheme(event.theme)}</span
                    >
                  </div>
                {:else}
                  <span class="text-sm text-muted-foreground italic"
                    >{m.event_no_theme()}</span
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
                            href={i18nHref(`/events/${event.id}/appel`)}
                            class="h-9 w-9 border-epi-teal/30 bg-epi-teal/10 text-teal-700 hover:bg-epi-teal hover:text-black dark:text-epi-teal dark:hover:text-black"
                          >
                            <UserCheck class="h-5 w-5" />
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content><p>{m.event_history_attendance()}</p></Tooltip.Content
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
      class="flex flex-col items-center justify-center rounded-sm border bg-card p-20 text-center shadow-sm"
    >
      <Archive class="mx-auto h-12 w-12 text-muted" />
      <h3 class="mt-4 text-lg font-bold uppercase">{m.event_history_empty_title()}</h3>
      <p class="mt-1 text-sm font-bold text-muted-foreground uppercase">
        {m.event_history_empty_description()}
      </p>
    </div>
  {/if}

  <EventActionManager bind:this={actionManager} />
</div>
