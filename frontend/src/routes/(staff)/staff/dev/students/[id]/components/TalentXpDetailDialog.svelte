<script lang="ts">
  import type { Component } from 'svelte';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Trophy from '@lucide/svelte/icons/trophy';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Award from '@lucide/svelte/icons/award';
  import Coins from '@lucide/svelte/icons/coins';
  import * as Dialog from '$lib/components/ui/dialog';
  import { formatGivenName } from '$lib/domain/profile';
  import type { XpStory } from '$lib/domain/xpStory';

  // The full, newest-first history of how the talent earned their XP: one row per
  // grant, explicitly labelled, so a recruiter can point to exactly what the
  // student did ("t'as fait le jeu tous les jours", "t'es souvent premier"). Sober
  // and airy: square dialog, an icon per entry, tabular amounts. No summary or
  // highlight chips - the log itself is the story.
  let {
    open = $bindable(false),
    story,
    prenom,
  }: {
    open?: boolean;
    story: XpStory;
    prenom: string;
  } = $props();

  const name = $derived(formatGivenName(prenom));

  function iconFor(source: string): Component {
    if (source === 'minigame') return Gamepad2;
    if (source === 'minigame_rank') return Trophy;
    if (source === 'onboarding' || source === 'onboarding_early_bird') {
      return CircleCheck;
    }
    if (source === 'reward') return Award;
    return Coins;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Comment {name} gagne ses XP</Dialog.Title>
      <Dialog.Description>Du plus récent au plus ancien.</Dialog.Description>
    </Dialog.Header>

    {#if story.history.length}
      <ul class="max-h-96 divide-y overflow-y-auto pr-1">
        {#each story.history as h (h.id)}
          {@const Icon = iconFor(h.source)}
          <li class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground"
            >
              <Icon class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{h.label}</p>
              <p class="text-xs text-muted-foreground">{h.dateLabel}</p>
            </div>
            <span
              class="shrink-0 font-mono text-sm font-bold text-epi-teal-solid tabular-nums"
            >
              {h.amount >= 0 ? '+' : ''}{h.amount}
            </span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground italic">
        Aucun XP gagné pour le moment.
      </p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
