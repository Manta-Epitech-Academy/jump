<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import { resolve } from '$app/paths';
  import { presenceLabel } from '$lib/domain/sfMemberStatus';
  import PullQuote from '$lib/components/staff/PullQuote.svelte';
  import ClosingVerdictChip from '$lib/components/dev/closings/ClosingVerdictChip.svelte';
  import type { TalentJourney } from '$lib/domain/talentJourney';
  import { formatGivenName } from '$lib/domain/profile';

  /**
   * Everything this talent has done with us, and what came of it.
   *
   * This replaces a bare event log, which enumerated the same events and told you
   * nothing about the person. Each row now carries the team's verdict, what the
   * talent said about the event in their own words, and the note the team wrote
   * about them - and the page's rule is visible in the markup: the talent's
   * sentence gets the quote treatment (teal rule, italic, guillemets), the team's
   * note stays plain behind a neutral rule.
   *
   * Everything is resolved server-side (`talentJourneyService`), including the
   * dates, so this component only paints.
   */
  let {
    journey,
    firstName,
  }: {
    journey: TalentJourney;
    firstName: string;
  } = $props();

  const name = $derived(formatGivenName(firstName));
</script>

{#if journey.entries.length === 0}
  <div
    class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-6 text-center"
  >
    <CalendarDays class="h-8 w-8 text-muted-foreground opacity-30" />
    <h3 class="mt-3 epi-overline text-muted-foreground">Aucun événement</h3>
    <p class="mt-1 max-w-[250px] text-xs text-muted-foreground">
      Ce talent n'a encore participé à aucun événement passé. Son parcours
      s'écrira au premier.
    </p>
  </div>
{:else}
  <div class="space-y-5">
    <!-- The one line on this page written by the person the page is about, so it
         leads rather than sitting somewhere down the list. -->
    {#if journey.latestQuote}
      <PullQuote
        text={journey.latestQuote.text}
        lead="{name} nous résume {journey.latestQuote.eventName}"
      />
    {/if}

    <!-- A regular attends eight to ten events a year, so the length of this list
         is decided by the data: it scrolls in its own box, sized against the
         viewport rather than a pixel cap. -->
    <ul class="max-h-[40svh] space-y-3 overflow-y-auto pr-1 text-sm">
      {#each journey.entries as entry (entry.participationId)}
        <li class="space-y-1.5">
          <div class="flex items-center gap-3">
            <span class="min-w-0 flex-1 truncate font-medium text-foreground">
              {#if entry.closing}
                <a
                  href={resolve(
                    `/staff/dev/events/${entry.eventId}/closings/${entry.participationId}`,
                  )}
                  class="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-epi-blue"
                >
                  {entry.eventName}
                </a>
              {:else}
                {entry.eventName}
              {/if}
            </span>
            {#if entry.closing?.recommendation}
              <ClosingVerdictChip
                recommendation={entry.closing.recommendation}
                short
              />
            {/if}
            {#if entry.presence}
              <span
                class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium {entry.presence ===
                'present'
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-foreground-secondary'}"
              >
                {presenceLabel(entry.presence)}
              </span>
            {/if}
            <span class="shrink-0 font-mono text-xs text-muted-foreground">
              {entry.dateLabel}
            </span>
          </div>

          {#if entry.closing?.quote}
            <PullQuote text={entry.closing.quote} size="inline" clamp />
          {/if}
          {#if entry.closing?.verdictNote}
            <!-- The team writing about the talent: same grammar as the quote
                 above, minus the italic, the guillemets and the teal, exactly as
                 `TalentNoteCard` does it. You can tell who is speaking without
                 reading a label. -->
            <p
              class="line-clamp-2 border-l-2 border-muted-foreground/25 pl-3 text-sm leading-relaxed text-foreground-secondary"
            >
              {entry.closing.verdictNote}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}
