<script lang="ts">
  import Trophy from '@lucide/svelte/icons/trophy';
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import { getInitials } from '$lib/avatar';
  import { cn } from '$lib/utils';
  import type { TopInterviewer } from './types';

  let { interviewers }: { interviewers: TopInterviewer[] } = $props();

  // Podium ring for the top three; the rest sit ringless. The list is already
  // ordered by count desc, so position conveys rank.
  const ringClass = (i: number) =>
    i === 0
      ? 'ring-2 ring-epi-orange'
      : i === 1
        ? 'ring-2 ring-muted-foreground/40'
        : i === 2
          ? 'ring-2 ring-epi-teal-solid'
          : '';
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <Trophy class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Top interviewers
    </h3>
  </div>

  <Card.Content class="p-4">
    {#if interviewers.length === 0}
      <p class="text-xs text-muted-foreground">
        Aucun entretien mené pour le moment.
      </p>
    {:else}
      <ol class="space-y-2.5">
        {#each interviewers as person, i (person.id)}
          <li class="flex items-center gap-3">
            <Avatar.Root class={cn('h-8 w-8 shrink-0', ringClass(i))}>
              <Avatar.Image
                src={person.image ?? undefined}
                alt={person.name}
                class="object-cover"
              />
              <Avatar.Fallback
                class="bg-epi-blue/10 text-[10px] font-bold text-epi-blue"
              >
                {getInitials(person.name)}
              </Avatar.Fallback>
            </Avatar.Root>
            <span class="min-w-0 flex-1 truncate text-sm font-medium">
              {person.name}
            </span>
            <span
              class="shrink-0 text-sm font-bold text-foreground tabular-nums"
            >
              {person.count}
            </span>
          </li>
        {/each}
      </ol>
    {/if}
  </Card.Content>
</Card.Root>
