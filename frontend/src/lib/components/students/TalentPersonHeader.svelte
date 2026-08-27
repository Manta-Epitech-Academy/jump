<script lang="ts">
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import TalentAvatar from './TalentAvatar.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { formatGivenName } from '$lib/domain/profile';
  import { cn } from '$lib/utils';

  /**
   * The header of a staff page that is ABOUT ONE PERSON rather than about a list,
   * an event or a setting.
   *
   * `PageHeader` names a screen; this names a human. The difference is not
   * decoration: a closing synthesis read under a plain page title reads as a
   * document that happens to mention somebody, and the fiche one click away
   * opens on a monogram, a first name and a surname in the display face. Two
   * views of the same person that share no visual identity make the second feel
   * like a different product.
   *
   * So the pieces that carry identity are the SAME pieces the fiche's hero uses:
   * `TalentAvatar` with its per-talent ground, squared off, and the given name
   * light against the surname in Anton. What it deliberately does not reuse is
   * `PageHero`'s brand-blue band, which is the fiche's own signature: a
   * sub-page borrowing it whole would read as the fiche rather than as a page
   * belonging to it.
   *
   * Register: staff-facing, so the link back vouvoie like everything around it.
   * It says "la fiche talent" rather than "la fiche": on its own the noun names
   * no object, and the reader has to supply one from context. "Talent" is the
   * word this product uses for the person (see `JARGON.md`), so naming it costs
   * two words and removes the guess.
   */
  let {
    talent,
    subtitle,
    ficheHref = null,
    class: className,
  }: {
    talent: { id: string; nom: string; prenom: string };
    /** What this page is, under the name. Bold uppercase, as `PageHeader` sets it. */
    subtitle?: string;
    /** Link back to the full fiche, already resolved (see `talentFicheHref`,
     *  which carries the `?event=` the dev layout needs). Omitted when the
     *  header IS the fiche. */
    ficheHref?: string | null;
    class?: string;
  } = $props();
</script>

<div
  class={cn(
    'flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between md:border-b-0 md:pb-0',
    className,
  )}
>
  <div class="flex min-w-0 items-center gap-4">
    <!-- Squared off and raised, exactly as the fiche's hero draws it, so the
         same person is recognisable at a glance from one page to the other. -->
    <TalentAvatar
      {talent}
      size="lg"
      class="h-14 w-14 rounded-sm shadow-raised sm:h-16 sm:w-16"
    />
    <div class="min-w-0">
      <h1 class="flex flex-wrap items-baseline font-heading text-display-l">
        <span class="font-light normal-case"
          >{formatGivenName(talent.prenom)}</span
        >
        <span class="ml-2.5">{talent.nom}<TitleCursor /></span>
      </h1>
      {#if subtitle}
        <p
          class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
        >
          {subtitle}
        </p>
      {/if}
    </div>
  </div>

  {#if ficheHref}
    <a
      href={ficheHref}
      class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
    >
      Voir la fiche talent
      <ArrowUpRight class="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  {/if}
</div>
