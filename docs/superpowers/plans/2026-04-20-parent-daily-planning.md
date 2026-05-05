# Parent Daily Planning View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the child's daily planning (today's activities with time slots) on the parent child detail page, so parents can check what their child is doing today, like checking a WhatsApp group from a camp.

**Architecture:** Add a "today's planning" query to the child detail page server (same pattern as talent dashboard), then render a read-only timeline in the UI. Replace the simple "upcoming event" card with a richer "programme du jour" section when there's an event today.

**Tech Stack:** SvelteKit 2, Prisma, Tailwind CSS

---

## File Structure

Modified files:
- `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.server.ts` — add today's participation query with planning → timeSlots → activities chain
- `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.svelte` — add daily planning timeline section

---

### Task 1: Add today's planning data to child detail server

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.server.ts`

- [ ] **Step 1: Add timezone imports and today's planning query**

Add imports at the top of the file:

```typescript
import { now } from '@internationalized/date';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { getStartOfDay } from '$lib/utils';
```

- [ ] **Step 2: Add `cookies` to the load function parameter and add the today query**

Update the load function signature from `async ({ locals, params })` to `async ({ locals, params, cookies })`.

After the `siblingCount` query and before the `upcomingParticipation` query, add:

```typescript
  // Calculate today boundaries
  const tz = getBrowserTimezone(cookies);
  const filterDateStart = getStartOfDay(tz);
  const tzNow = now(tz);
  const endOfDay = tzNow.set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
  const filterDateEnd = endOfDay.toDate();
  const filterDateStartDate = new Date(filterDateStart);

  // Fetch today's participation with full planning chain (timeSlots → activities)
  const todayParticipation = await prisma.participation.findFirst({
    where: {
      talentId,
      event: {
        date: { gte: filterDateStartDate, lte: filterDateEnd },
      },
    },
    include: {
      event: {
        include: {
          planning: {
            include: {
              timeSlots: {
                include: {
                  activities: {
                    where: { activityType: { not: 'orga' } },
                    select: { id: true, nom: true, activityType: true, difficulte: true },
                  },
                },
                orderBy: { startTime: 'asc' },
              },
            },
          },
        },
      },
    },
    orderBy: { event: { date: 'asc' } },
  });
```

- [ ] **Step 3: Update the upcomingParticipation query to exclude today**

Change the `upcomingParticipation` query's date filter from `{ gt: new Date() }` to `{ gt: filterDateEnd }` so today's event doesn't show in both "today" and "upcoming":

```typescript
  const upcomingParticipation = await prisma.participation.findFirst({
    where: {
      talentId,
      event: { date: { gt: filterDateEnd } },
    },
    include: {
      event: { select: { id: true, titre: true, date: true } },
    },
    orderBy: { event: { date: 'asc' } },
  });
```

- [ ] **Step 4: Add todayPlanning to the return object**

Add to the return object, after `hasMultipleChildren`:

```typescript
    todayPlanning: todayParticipation
      ? {
          eventName: todayParticipation.event.titre,
          eventDate: todayParticipation.event.date,
          timeSlots: (todayParticipation.event.planning?.timeSlots ?? []).map((slot) => ({
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
        }
      : null,
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/\(parent\)/parent/enfant/\[talentId\]/+page.server.ts
git commit -m "feat(parent): add today's planning data to child detail page"
```

---

### Task 2: Render daily planning timeline in child detail UI

**Files:**
- Modify: `frontend/src/routes/(parent)/parent/enfant/[talentId]/+page.svelte`

- [ ] **Step 1: Add new icon imports**

In the script section, update the imports from `@lucide/svelte`. Add `Clock` and `MapPin` to the existing import:

```typescript
  import {
    ArrowLeft,
    CalendarDays,
    Check,
    X,
    ChevronDown,
    FileCheck,
    FilePen,
    ExternalLink,
    History,
    Rocket,
    LogOut,
    Clock,
    MapPin,
  } from '@lucide/svelte';
```

- [ ] **Step 2: Add formatTime helper in the script section**

After the `activityTypeLabels` declaration, add:

```typescript
  const difficultyColors: Record<string, string> = {
    'Débutant': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    'Intermédiaire': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    'Avancé': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  function formatTime(dateString: string | Date | undefined) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
```

- [ ] **Step 3: Add today's planning section in the template**

Insert after the image rights section (after the closing `{/if}` of the image rights block, before `<!-- Upcoming event -->`), add a new "Programme du jour" section:

```svelte
    <!-- Today's planning -->
    {#if data.todayPlanning}
      <div
        class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
        in:fly={{ y: 20, duration: 400, delay: 250 }}
      >
        <div
          class="border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div
            class="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase"
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
            Programme du jour<span class="text-epi-teal">_</span>
          </h2>

          {#if data.todayPlanning.timeSlots.length > 0}
            <div class="space-y-4">
              {#each data.todayPlanning.timeSlots as slot (slot.id)}
                <div>
                  <div class="mb-2 flex items-center gap-2">
                    <Clock class="h-3.5 w-3.5 shrink-0 text-epi-blue" />
                    <span class="text-[11px] font-bold text-slate-400 uppercase">
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
                            class="hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold sm:inline {difficultyColors[activity.difficulty] ?? ''}"
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
            <div class="flex flex-col items-center justify-center py-8 text-center">
              <p class="text-sm text-slate-400">
                Le planning de la journée n'est pas encore disponible.
              </p>
            </div>
          {/if}
        </div>
      </div>
    {/if}
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/\(parent\)/parent/enfant/\[talentId\]/+page.svelte
git commit -m "feat(parent): add daily planning timeline to child detail page"
```

---

### Task 3: Verify full build

- [ ] **Step 1: Run type check**

Run: `cd frontend && bunx tsc --noEmit --pretty`

- [ ] **Step 2: Run linter**

Run: `cd frontend && bun run lint`

- [ ] **Step 3: Run formatter and build**

Run: `cd frontend && bun run format && bun run build`

- [ ] **Step 4: Commit formatting changes if any**

```bash
git add -A
git commit -m "style: format daily planning files"
```
