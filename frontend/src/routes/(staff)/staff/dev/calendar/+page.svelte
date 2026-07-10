<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import Users from '@lucide/svelte/icons/users';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import Calendar from '@lucide/svelte/icons/calendar';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { buttonVariants } from '$lib/components/ui/button';

  let { data } = $props();

  let selectedYear = $derived(data.selectedYear);
  let events = $derived(data.events);

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const monthYearFmt = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  const statusLabels: Record<string, string> = {
    ongoing: 'En cours',
    upcoming: 'À venir',
    past: 'Terminé',
  };

  const statusColors: Record<string, string> = {
    ongoing: 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid',
    upcoming: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
    past: 'border-border bg-muted text-muted-foreground',
  };

  // Group events by month for the timeline
  let groupedEvents = $derived.by(() => {
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const date = new Date(e.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, list]) => {
        const parts = key.split('-');
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
        return {
          monthLabel: monthYearFmt.format(date),
          events: list,
        };
      });
  });
</script>

<svelte:head>
  <title>Planning annuel · {selectedYear}</title>
</svelte:head>

<div class="space-y-6 pb-10" in:fly={{ y: 15, duration: 300 }}>
  <PageHeader
    title="Planning annuel"
    subtitle="Année Scolaire {selectedYear}"
  />

  {#if events.length > 0}
    <!-- Timeline -->
    <div class="relative ml-4 space-y-8 border-l border-border pl-6">
      {#each groupedEvents as group}
        <div class="relative">
          <!-- Month indicator -->
          <div class="absolute top-1.5 -left-[31px] flex h-4 items-center">
            <div
              class="size-4 rounded-full border border-muted-foreground/30 bg-background ring-4 ring-background"
            ></div>
          </div>
          <h2
            class="mb-4 pl-4 text-sm font-bold tracking-widest text-muted-foreground uppercase"
          >
            {group.monthLabel}
          </h2>

          <div class="grid grid-cols-1 gap-4 pl-4 md:grid-cols-2">
            {#each group.events as e (e.id)}
              <!-- Event Timeline Card -->
              <div
                class="relative flex flex-col justify-between rounded-sm border bg-card p-6 shadow-sm"
              >
                <div>
                  <div class="mb-3 flex items-start justify-between gap-2">
                    <Badge variant="outline" class={statusColors[e.status]}>
                      {statusLabels[e.status] || e.status}
                    </Badge>
                    <span class="font-mono text-xs text-muted-foreground">
                      {e.externalId ? 'Salesforce' : 'Manuel'}
                    </span>
                  </div>

                  <h3
                    class="mb-2 text-base leading-snug font-semibold tracking-tight"
                  >
                    {e.publicName || e.titre}
                  </h3>

                  <p
                    class="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Calendar class="h-3.5 w-3.5 shrink-0" />
                    <span class="capitalize"
                      >{dateFmt.format(new Date(e.date))}</span
                    >
                  </p>
                </div>

                <!-- Surface Links -->
                <div class="border-t pt-4">
                  <span
                    class="mb-2 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
                  >
                    Accéder aux espaces :
                  </span>
                  <div class="flex flex-wrap gap-2">
                    {#if e.modules.includes('inscrits')}
                      <a
                        href={resolve(
                          `/staff/dev/events/${e.id}/inscrits` as any,
                        )}
                        class={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                          class: 'flex cursor-pointer items-center gap-1.5',
                        })}
                      >
                        <Users class="h-3.5 w-3.5" />
                        <span>Inscrits</span>
                      </a>
                    {/if}
                    {#if e.modules.includes('emargement')}
                      <a
                        href={resolve(
                          `/staff/dev/events/${e.id}/emargement` as any,
                        )}
                        class={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                          class: 'flex cursor-pointer items-center gap-1.5',
                        })}
                      >
                        <UserCheck class="h-3.5 w-3.5" />
                        <span>Présences</span>
                      </a>
                    {/if}
                    {#if e.hasPlanning}
                      <a
                        href={resolve(
                          `/staff/dev/events/${e.id}/planning` as any,
                        )}
                        class={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                          class: 'flex cursor-pointer items-center gap-1.5',
                        })}
                      >
                        <CalendarDays class="h-3.5 w-3.5" />
                        <span>Planning</span>
                      </a>
                    {/if}
                    {#if e.hasFeedbackForm && e.modules.includes('bilan')}
                      <a
                        href={resolve(`/staff/dev/events/${e.id}/bilan` as any)}
                        class={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                          class: 'flex cursor-pointer items-center gap-1.5',
                        })}
                      >
                        <MessageSquareText class="h-3.5 w-3.5" />
                        <span>Bilan</span>
                      </a>
                    {/if}
                    {#if e.modules.includes('entretiens')}
                      <a
                        href={resolve(
                          `/staff/dev/events/${e.id}/entretiens` as any,
                        )}
                        class={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                          class: 'flex cursor-pointer items-center gap-1.5',
                        })}
                      >
                        <MessageSquare class="h-3.5 w-3.5" />
                        <span>Entretiens</span>
                      </a>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="mx-auto mt-12 max-w-xl rounded-sm border border-dashed bg-card px-8 py-12 text-center shadow-sm dark:shadow-none"
    >
      <CalendarRange class="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
      <h1 class="mb-2 font-heading text-2xl tracking-wide uppercase">
        Aucun événement
      </h1>
      <p class="text-sm leading-relaxed text-muted-foreground">
        Il n'y a pas d'événements programmés pour l'année scolaire {selectedYear}
        sur votre campus.
      </p>
    </div>
  {/if}
</div>
