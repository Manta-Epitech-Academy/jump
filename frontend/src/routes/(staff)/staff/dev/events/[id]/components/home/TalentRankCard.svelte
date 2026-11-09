<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import type { HomeTalent } from '$lib/domain/eventHome';
  import { formatGivenName } from '$lib/domain/profile';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { talentFicheHref } from '$lib/components/dev/talentFiche';
  import HomeCard, { type HomeCardEmpty } from './HomeCard.svelte';

  // A short list of talents, each opening their fiche, as the 2027 mockup draws
  // its two rankings:
  //   - `parcours`: the name, « Déjà venu 3 fois » under it, and the talent's
  //     lifetime XP at the right of the row;
  //   - `xp`: a rank, the name, and the XP earned at the event at the right.
  // The XP sits at the right in both, where the eye looks for a figure, rather
  // than under the name (PO, 30/10/2026). Raw XP, never a level (`AGENTS.md`).
  let {
    title,
    talents,
    eventId,
    variant,
    empty,
    footer,
  }: {
    title: string;
    talents: HomeTalent[];
    eventId: string;
    variant: 'parcours' | 'xp';
    empty?: HomeCardEmpty | null;
    footer?: Snippet;
  } = $props();
</script>

<HomeCard {title} {empty} {footer}>
  <ol class="flex flex-col">
    {#each talents as t, i (t.talentId)}
      {@const xp = variant === 'xp' ? t.detail : t.totalXp}
      <li>
        <a
          href={talentFicheHref(t.talentId, eventId)}
          class="flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-1.5 transition-colors hover:bg-accent"
        >
          {#if variant === 'xp'}
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
          <span class="flex min-w-0 flex-1 flex-col gap-0.5 py-1.5">
            <span class="truncate text-sm leading-snug">
              <span class="font-medium">{formatGivenName(t.prenom)}</span>
              <span class="font-bold uppercase">{t.nom}</span>
            </span>
            {#if variant === 'parcours'}
              <span class="truncate text-xs text-muted-foreground"
                >{t.detail}</span
              >
            {/if}
          </span>
          {#if xp}
            <span
              class="inline-flex shrink-0 items-center gap-1 rounded-full bg-epi-tech-ink/10 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-epi-tech-ink"
            >
              <Sparkles class="h-3 w-3" aria-hidden="true" />
              {xp} XP
            </span>
          {/if}
          <ChevronRight
            class="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </a>
      </li>
    {/each}
  </ol>
</HomeCard>
