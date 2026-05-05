# Parent Portal UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the parent portal UI to clearly serve parents following their child's activity, with a reassuring/institutional tone and explicit status labels.

**Architecture:** Frontend-only changes on 2 Svelte pages + 2 minimal server-side additions (`parentLastName` + `delay` in history). No new components, no new routes.

**Tech Stack:** SvelteKit 2 (Svelte 5), Tailwind CSS 4, Bits UI, Lucide icons.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/routes/(parent)/parent/+page.server.ts:56-59` | Add `parentLastName` to return |
| Modify | `frontend/src/routes/(parent)/parent/+page.svelte` | Rework dashboard UI (header, cards) |
| Modify | `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.server.ts:120-133,135-193` | Add `parentLastName` + `delay` to history data |
| Modify | `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.svelte` | Rework detail page UI (header, sections, statuses) |

---

### Task 1: Add `parentLastName` to dashboard server

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/+page.server.ts:56-59`

- [ ] **Step 1: Add `parentLastName` to return object**

Replace lines 56-59:

```typescript
  const parentName = locals.user.name ?? '';
  const parentLastName = parentName.split(' ').slice(1).join(' ') || parentName;

  return {
    parentName,
    parentLastName,
    children: childrenWithEvents,
  };
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/+page.server.ts && git commit -m "feat(parent-ui): add parentLastName to dashboard server data"
```

---

### Task 2: Rework dashboard UI

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/+page.svelte`

- [ ] **Step 1: Rewrite the full page**

Replace the entire file with:

```svelte
<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import {
    CalendarDays,
    Users,
    ChevronRight,
    FileCheck,
    FilePen,
    LogOut,
    ShieldCheck,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';

  let { data } = $props();
</script>

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-12">
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <div class="flex items-center gap-4">
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-xl shadow-epi-blue/20"
      >
        <ShieldCheck class="h-8 w-8" />
      </div>
      <div class="flex-1">
        <h1
          class="font-heading text-3xl tracking-tight text-slate-900 uppercase dark:text-white sm:text-4xl"
        >
          Bonjour, <span class="text-epi-blue">M./Mme {data.parentLastName}</span>
        </h1>
        <p class="text-sm font-bold text-slate-500 uppercase">
          Espace de suivi parental
        </p>
      </div>
      <form action="{resolve('/logout')}?type=parent" method="POST">
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-slate-400 hover:text-destructive"
        >
          <LogOut class="h-4 w-4" />
          <span class="sr-only">Déconnexion</span>
        </Button>
      </form>
    </div>
  </header>

  {#if data.children.length === 0}
    <div
      class="flex min-h-62.5 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/50"
      in:fly={{ y: 20, duration: 400, delay: 200 }}
    >
      <div class="mb-4 rounded-full bg-slate-200/50 p-4 dark:bg-slate-800">
        <Users class="h-8 w-8 text-slate-400" />
      </div>
      <h3
        class="text-lg font-bold text-slate-700 uppercase dark:text-slate-300"
      >
        Aucun enfant inscrit
      </h3>
      <p class="mt-2 max-w-sm text-sm text-slate-500">
        Aucun enfant n'est rattaché à votre compte pour le moment.
      </p>
    </div>
  {:else}
    <div class="grid gap-6 sm:grid-cols-2">
      {#each data.children as child, i}
        <a
          href={resolve(`/parent/enfant/${child.id}`)}
          class="group"
          in:fly={{ y: 20, duration: 400, delay: 200 + i * 100 }}
        >
          <div
            class="relative h-full overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 transition-all hover:shadow-2xl hover:shadow-epi-blue/10 dark:bg-slate-900 dark:shadow-none dark:hover:shadow-none"
          >
            <div
              class="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-epi-blue/5 blur-2xl"
            ></div>

            <div class="relative z-10">
              <div class="flex items-start justify-between">
                <div class="space-y-3">
                  <h2
                    class="font-heading text-2xl tracking-tight text-slate-900 uppercase dark:text-white"
                  >
                    {child.prenom}
                    <span class="text-epi-blue">{child.nom}</span>
                  </h2>

                  <div
                    class="flex items-center gap-2 text-sm font-bold text-slate-500"
                  >
                    <CalendarDays class="h-4 w-4 text-epi-blue" />
                    <span
                      >{child.eventsCount} événement{child.eventsCount !== 1
                        ? 's'
                        : ''} au programme</span
                    >
                  </div>

                  {#if child.upcomingEvent}
                    <div
                      class="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 dark:border-blue-900/20 dark:bg-blue-950/20"
                    >
                      <p class="text-[10px] font-bold text-epi-blue uppercase">
                        Prochain rendez-vous
                      </p>
                      <p
                        class="mt-0.5 text-sm font-bold text-slate-900 dark:text-white"
                      >
                        {child.upcomingEvent.titre}
                      </p>
                      <p class="text-xs text-slate-500">
                        Le {new Date(child.upcomingEvent.date).toLocaleDateString(
                          'fr-FR',
                          {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          },
                        )}
                      </p>
                    </div>
                  {:else}
                    <p class="text-xs font-bold text-slate-400">
                      Pas d'événement prévu pour le moment
                    </p>
                  {/if}
                </div>

                <ChevronRight
                  class="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-epi-blue"
                />
              </div>

              <div
                class="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800"
              >
                {#if child.imageRightsSigned}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    <FileCheck class="h-3 w-3" />
                    Droit à l'image signé
                  </Badge>
                {:else}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    <FilePen class="h-3 w-3" />
                    Droit à l'image à signer
                  </Badge>
                {/if}
              </div>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

Changes from original:
- Header: "Bonjour, M./Mme {lastName}" with `ShieldCheck` icon
- Subtitle: "Espace de suivi parental"
- Event count: "au programme" instead of "suivi(s)"
- Next event: "Prochain rendez-vous" + "Le {date}" prefix
- No event: "Pas d'événement prévu pour le moment"

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/+page.svelte && git commit -m "feat(parent-ui): rework dashboard with parental tone and explicit labels"
```

---

### Task 3: Add `parentLastName` and `delay` to child detail server

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.server.ts:135-193`

- [ ] **Step 1: Add `delay` to the participation query select**

In the participations query (line 120-133), the `include` already fetches the full participation. The `delay` field is on the `Participation` model directly, so it's already included. No query change needed.

- [ ] **Step 2: Update the return object**

Replace lines 135-194:

```typescript
  const parentName = locals.user.name ?? '';
  const parentLastName = parentName.split(' ').slice(1).join(' ') || parentName;

  return {
    parentName,
    parentLastName,
    hasMultipleChildren: siblingCount > 1,
    todayPlanning: todayParticipation
      ? {
          eventName: todayParticipation.event.titre,
          eventDate: todayParticipation.event.date,
          timeSlots: (todayParticipation.event.planning?.timeSlots ?? []).map(
            (slot) => ({
              id: slot.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: slot.label,
              activities: slot.activities.map((a) => ({
                id: a.id,
                name: a.nom,
                type: a.activityType,
                difficulty: a.difficulte,
              })),
            }),
          ),
        }
      : null,
    child: {
      id: child.id,
      prenom: child.prenom,
      nom: child.nom,
      imageRightsSigned: !!child.imageRightsSignedAt,
    },
    upcomingEvents: upcomingParticipations.map((p) => ({
      id: p.event.id,
      name: p.event.titre,
      date: p.event.date,
      timeSlots: (p.event.planning?.timeSlots ?? []).map((slot) => ({
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label,
        activities: slot.activities.map((a) => ({
          id: a.id,
          name: a.nom,
          type: a.activityType,
          difficulty: a.difficulte,
        })),
      })),
    })),
    participations: participations.map((p) => ({
      id: p.id,
      eventName: p.event.titre,
      eventDate: p.event.date,
      isPresent: p.isPresent,
      delay: p.delay ?? 0,
      activities: p.activities
        .filter((a) => a.activity.activityType !== 'orga')
        .map((a) => ({
          id: a.activity.id,
          name: a.activity.nom,
          type: a.activity.activityType,
        })),
    })),
  };
```

Changes: added `parentLastName`, added `delay: p.delay ?? 0` to each participation.

- [ ] **Step 3: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/enfant/\[talentId\]/+page.server.ts && git commit -m "feat(parent-ui): add parentLastName and delay to child detail server data"
```

---

### Task 4: Rework child detail page UI

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.svelte`

- [ ] **Step 1: Rewrite the full page**

Replace the entire file with:

```svelte
<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import {
    ArrowLeft,
    CalendarDays,
    Check,
    X,
    ChevronDown,
    FileCheck,
    FilePen,
    Rocket,
    LogOut,
    Clock,
    MapPin,
    ShieldCheck,
    History,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';

  let { data } = $props();

  const activityTypeLabels: Record<string, string> = {
    atelier: 'Atelier',
    conference: 'Conférence',
    quiz: 'Quiz',
    special: 'Spécial',
  };

  const difficultyColors: Record<string, string> = {
    Débutant:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Intermédiaire:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    Avancé:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  function formatTime(dateString: string | Date | undefined) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusLabel(isPresent: boolean, delay: number): { icon: typeof Check; color: string; text: string } {
    if (!isPresent) {
      return { icon: X, color: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400', text: 'Absent(e)' };
    }
    if (delay > 0) {
      return { icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400', text: `En retard — ${delay} min` };
    }
    return { icon: Check, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400', text: 'Présent(e)' };
  }
</script>

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-12">
  <!-- Header -->
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <div class="flex items-center gap-4">
      {#if data.hasMultipleChildren}
        <a
          href={resolve('/parent')}
          class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg shadow-slate-200/50 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:shadow-none dark:hover:bg-slate-800"
        >
          <ArrowLeft class="h-5 w-5 text-epi-blue" />
        </a>
      {/if}
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-xl shadow-epi-blue/20"
      >
        <ShieldCheck class="h-8 w-8" />
      </div>
      <div class="flex-1">
        <h1
          class="font-heading text-3xl tracking-tight text-slate-900 uppercase dark:text-white sm:text-4xl"
        >
          Bonjour, <span class="text-epi-blue">M./Mme {data.parentLastName}</span>
        </h1>
        <p class="text-sm font-bold text-slate-500 uppercase">
          Suivi de votre enfant {data.child.prenom} {data.child.nom}
        </p>
      </div>
      <form action="{resolve('/logout')}?type=parent" method="POST">
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-slate-400 hover:text-destructive"
        >
          <LogOut class="h-4 w-4" />
          <span class="sr-only">Déconnexion</span>
        </Button>
      </form>
    </div>
  </header>

  <div class="space-y-6">
    <!-- Image rights banner -->
    {#if !data.child.imageRightsSigned}
      <div
        class="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 shadow-lg shadow-amber-100/50 dark:border-amber-900/30 dark:bg-amber-950/20 dark:shadow-none"
        in:fly={{ y: 20, duration: 400, delay: 200 }}
      >
        <div class="flex items-center justify-between p-6">
          <div class="flex items-center gap-4">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30"
            >
              <FilePen class="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p class="font-bold text-amber-800 dark:text-amber-300">
                Droit à l'image non signé
              </p>
              <p class="text-sm text-amber-600 dark:text-amber-400">
                La signature est requise pour continuer
              </p>
            </div>
          </div>
          <a
            href={resolve('/parent/signature')}
            class="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-amber-600/20 transition-all hover:bg-amber-700 active:scale-[0.98]"
          >
            Signer maintenant
          </a>
        </div>
      </div>
    {:else}
      <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
        <Badge
          variant="secondary"
          class="gap-1.5 bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
        >
          <FileCheck class="h-3.5 w-3.5" />
          Droit à l'image signé
        </Badge>
      </div>
    {/if}

    <!-- Today's planning -->
    {#if data.todayPlanning}
      <div
        class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
        in:fly={{ y: 20, duration: 400, delay: 250 }}
      >
        <div
          class="border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Votre enfant participe aujourd'hui à
          </p>
          <div
            class="mt-1 flex items-center gap-2 text-xs font-bold text-slate-500 uppercase"
          >
            <MapPin class="h-4 w-4 text-epi-blue" />
            <span>{data.todayPlanning.eventName}</span>
            <span class="text-slate-300 dark:text-slate-700">•</span>
            <Clock class="h-4 w-4" />
            <span>{formatTime(data.todayPlanning.eventDate)}</span>
          </div>
        </div>

        <div class="p-6">
          <h2
            class="mb-4 font-heading text-xl text-slate-800 uppercase dark:text-slate-200"
          >
            Programme du jour pour {data.child.prenom}<span class="text-epi-teal">_</span>
          </h2>

          {#if data.todayPlanning.timeSlots.length > 0}
            <div class="space-y-4">
              {#each data.todayPlanning.timeSlots as slot (slot.id)}
                <div>
                  <div class="mb-2 flex items-center gap-2">
                    <Clock class="h-3.5 w-3.5 shrink-0 text-epi-blue" />
                    <span
                      class="text-[11px] font-bold text-slate-400 uppercase"
                    >
                      {formatTime(slot.startTime)} — {formatTime(slot.endTime)}
                      {#if slot.label}
                        · {slot.label}
                      {/if}
                    </span>
                  </div>

                  <div
                    class="ml-5 space-y-1.5 border-l-2 border-slate-100 pl-3 dark:border-slate-800"
                  >
                    {#each slot.activities as activity (activity.id)}
                      <div
                        class="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      >
                        <Badge
                          variant="outline"
                          class="shrink-0 text-[9px] font-bold uppercase"
                        >
                          {activityTypeLabels[activity.type] ?? activity.type}
                        </Badge>
                        <span
                          class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white"
                        >
                          {activity.name}
                        </span>
                        {#if activity.difficulty}
                          <span
                            class="hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold sm:inline {difficultyColors[
                              activity.difficulty
                            ] ?? ''}"
                          >
                            {activity.difficulty}
                          </span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div
              class="flex flex-col items-center justify-center py-8 text-center"
            >
              <p class="text-sm text-slate-400">
                Le planning de la journée n'est pas encore disponible.
              </p>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Upcoming events -->
    {#if data.upcomingEvents.length > 0}
      <div in:fly={{ y: 20, duration: 400, delay: 300 }}>
        <div class="mb-4 flex items-center gap-3">
          <h2
            class="flex items-center gap-2 font-heading text-xl text-slate-800 uppercase dark:text-slate-200"
          >
            <Rocket class="h-5 w-5 text-epi-blue" />
            Prochains événements d'{data.child.prenom}<span class="text-epi-teal">_</span>
          </h2>
          <Badge variant="outline" class="text-[10px] font-bold">
            {data.upcomingEvents.length} à venir
          </Badge>
        </div>

        <div class="space-y-3">
          {#each data.upcomingEvents as event (event.id)}
            <Collapsible.Root>
              <div
                class="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-md shadow-blue-900/5 dark:border-blue-900/30 dark:bg-slate-900 dark:shadow-none"
              >
                <Collapsible.Trigger class="w-full">
                  <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-3 text-left">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/30"
                      >
                        <CalendarDays class="h-5 w-5 text-epi-blue" />
                      </div>
                      <div>
                        <p class="font-bold text-slate-900 dark:text-white">
                          {event.name}
                        </p>
                        <p class="text-xs font-bold text-slate-400">
                          Le {new Date(event.date).toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      {#if event.timeSlots.length > 0}
                        <Badge variant="outline" class="text-[10px] font-bold">
                          {event.timeSlots.reduce(
                            (sum, s) => sum + s.activities.length,
                            0,
                          )} activité{event.timeSlots.reduce(
                            (sum, s) => sum + s.activities.length,
                            0,
                          ) !== 1
                            ? 's'
                            : ''}
                        </Badge>
                      {/if}
                      <ChevronDown
                        class="h-4 w-4 text-slate-400 transition-transform [[data-state=open]_&]:rotate-180"
                      />
                    </div>
                  </div>
                </Collapsible.Trigger>

                <Collapsible.Content>
                  {#if event.timeSlots.length > 0}
                    <div
                      class="border-t border-slate-100 px-4 py-4 dark:border-slate-800"
                    >
                      <p class="mb-3 text-xs text-slate-500">
                        Votre enfant participera aux activités suivantes :
                      </p>
                      <div class="space-y-4">
                        {#each event.timeSlots as slot (slot.id)}
                          <div>
                            <div class="mb-2 flex items-center gap-2">
                              <Clock
                                class="h-3.5 w-3.5 shrink-0 text-epi-blue"
                              />
                              <span
                                class="text-[11px] font-bold text-slate-400 uppercase"
                              >
                                {formatTime(slot.startTime)} — {formatTime(
                                  slot.endTime,
                                )}
                                {#if slot.label}
                                  · {slot.label}
                                {/if}
                              </span>
                            </div>

                            <div
                              class="ml-5 space-y-1.5 border-l-2 border-slate-100 pl-3 dark:border-slate-800"
                            >
                              {#each slot.activities as activity (activity.id)}
                                <div
                                  class="flex items-center gap-3 rounded-xl px-3 py-2.5"
                                >
                                  <Badge
                                    variant="outline"
                                    class="shrink-0 text-[9px] font-bold uppercase"
                                  >
                                    {activityTypeLabels[activity.type] ??
                                      activity.type}
                                  </Badge>
                                  <span
                                    class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white"
                                  >
                                    {activity.name}
                                  </span>
                                  {#if activity.difficulty}
                                    <span
                                      class="hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold sm:inline {difficultyColors[
                                        activity.difficulty
                                      ] ?? ''}"
                                    >
                                      {activity.difficulty}
                                    </span>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {:else}
                    <div
                      class="border-t border-slate-100 px-4 py-3 dark:border-slate-800"
                    >
                      <p class="text-xs text-slate-400">
                        Le planning n'est pas encore disponible.
                      </p>
                    </div>
                  {/if}
                </Collapsible.Content>
              </div>
            </Collapsible.Root>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Event history -->
    <div in:fly={{ y: 20, duration: 400, delay: 400 }}>
      <h2
        class="mb-4 flex items-center gap-2 font-heading text-xl text-slate-800 uppercase dark:text-slate-200"
      >
        <History class="h-5 w-5 text-epi-blue" />
        Événements passés<span class="text-epi-teal">_</span>
      </h2>

      {#if data.participations.length === 0}
        <div
          class="flex min-h-40 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/50"
        >
          <p class="text-sm font-bold text-slate-400 uppercase">
            Aucun événement passé pour le moment
          </p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each data.participations as participation}
            {@const status = statusLabel(participation.isPresent, participation.delay)}
            <Collapsible.Root>
              <div
                class="overflow-hidden rounded-2xl bg-white shadow-md shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
              >
                <Collapsible.Trigger class="w-full">
                  <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-3 text-left">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-xl {status.color}"
                      >
                        <status.icon class="h-5 w-5" />
                      </div>
                      <div>
                        <p class="font-bold text-slate-900 dark:text-white">
                          {participation.eventName}
                        </p>
                        <p class="text-xs font-bold text-slate-400">
                          {new Date(participation.eventDate).toLocaleDateString(
                            'fr-FR',
                            {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            },
                          )}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        class="text-[10px] font-bold {status.color}"
                      >
                        {status.text}
                      </Badge>
                      {#if participation.activities.length > 0}
                        <Badge variant="outline" class="text-[10px] font-bold">
                          {participation.activities.length} activité{participation
                            .activities.length !== 1
                            ? 's'
                            : ''}
                        </Badge>
                      {/if}
                      <ChevronDown
                        class="h-4 w-4 text-slate-400 transition-transform [[data-state=open]_&]:rotate-180"
                      />
                    </div>
                  </div>
                </Collapsible.Trigger>

                <Collapsible.Content>
                  {#if participation.activities.length > 0}
                    <div
                      class="border-t border-slate-100 px-4 py-3 dark:border-slate-800"
                    >
                      <div class="space-y-2">
                        {#each participation.activities as activity}
                          <div
                            class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50"
                          >
                            <span
                              class="text-sm font-semibold text-slate-700 dark:text-slate-300"
                            >
                              {activity.name}
                            </span>
                            <Badge
                              variant="outline"
                              class="text-[10px] font-bold"
                            >
                              {activityTypeLabels[activity.type] ??
                                activity.type}
                            </Badge>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {:else}
                    <div
                      class="border-t border-slate-100 px-4 py-3 dark:border-slate-800"
                    >
                      <p class="text-xs text-slate-400">
                        Aucune activité enregistrée
                      </p>
                    </div>
                  {/if}
                </Collapsible.Content>
              </div>
            </Collapsible.Root>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
```

Changes from original:
- Header: "Bonjour, M./Mme {lastName}" with `ShieldCheck` icon + "Suivi de votre enfant..."
- Today's planning: "Programme du jour pour {prenom}" + "Votre enfant participe aujourd'hui à..."
- Upcoming: "Prochains événements d'{prenom}" + badge count + "Votre enfant participera aux activités suivantes"
- History: "Événements passés" + explicit status labels (Présent/Absent/En retard with text + icon + color)
- `statusLabel()` helper function for participation status rendering

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && bun run check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/routes/\(parent\)/parent/enfant/\[talentId\]/+page.svelte && git commit -m "feat(parent-ui): rework child detail with parental tone and explicit status labels"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full type-check**

Run: `cd frontend && bun run check`
Expected: Zero errors.

- [ ] **Step 2: Lint check**

Run: `cd frontend && bun run lint`
Expected: No new lint errors.

- [ ] **Step 3: Visual smoke test**

1. `bun run dev`
2. Login as `sophie.martin@mail.com` at `/parent/login`
3. Verify header shows "Bonjour, M./Mme Martin"
4. Verify subtitle shows "Suivi de votre enfant Alice Martin"
5. Verify today's planning says "Programme du jour pour Alice"
6. Verify history shows explicit status text (Présent(e) / Absent(e) / En retard)
7. If multi-children: verify dashboard shows "Espace de suivi parental" and "au programme"
