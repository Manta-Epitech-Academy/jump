<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import type { HomeTalent } from '$lib/domain/eventHome';
  import { formatGivenName } from '$lib/domain/profile';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { talentFicheHref } from '$lib/components/dev/talentFiche';
  import HomeCard, { type HomeCardEmpty } from './HomeCard.svelte';

  // A short list of talents (furthest into their parcours, most XP), each
  // opening their fiche. `xp` shows the detail as the roster's XP pill: raw XP,
  // never a level (`AGENTS.md`).
  let {
    title,
    talents,
    eventId,
    xp = false,
    empty,
    footer,
  }: {
    title: string;
    talents: HomeTalent[];
    eventId: string;
    xp?: boolean;
    empty?: HomeCardEmpty | null;
    footer?: Snippet;
  } = $props();
</script>

<HomeCard {title} {empty} {footer}>
  <ol class="flex flex-col">
    {#each talents as t, i (t.talentId)}
      <li>
        <a
          href={talentFicheHref(t.talentId, eventId)}
          class="flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-1.5 transition-colors hover:bg-accent"
        >
          {#if xp}
            <span
              class="w-5 shrink-0 font-heading text-display-s text-muted-foreground"
            >
              {i + 1}
            </span>
          {/if}
          <TalentAvatar
            talent={{ id: t.talentId, nom: t.nom, prenom: t.prenom }}
            size="sm"
          />
          <!-- The name, then its detail under it, as a contact reads: the
               name gets the row's whole width, so it holds in a card of the
               narrowest grid step instead of being cut short. -->
          <span class="flex min-w-0 flex-1 flex-col items-start gap-1 py-1.5">
            <span class="max-w-full truncate text-sm leading-snug">
              <span class="font-medium">{formatGivenName(t.prenom)}</span>
              <span class="font-bold uppercase">{t.nom}</span>
            </span>
            {#if xp}
              <span
                class="inline-flex items-center gap-1 rounded-full bg-epi-tech-ink/10 px-2 py-0.5 text-xs font-bold text-epi-tech-ink"
              >
                <Sparkles class="h-3 w-3" aria-hidden="true" />
                {t.detail} XP
              </span>
            {:else}
              <span class="text-xs text-muted-foreground">{t.detail}</span>
            {/if}
          </span>
          <ChevronRight
            class="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </a>
      </li>
    {/each}
  </ol>
</HomeCard>
