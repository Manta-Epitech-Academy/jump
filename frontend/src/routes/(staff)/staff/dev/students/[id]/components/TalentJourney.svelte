<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { resolve } from '$app/paths';
  import * as Avatar from '$lib/components/ui/avatar';
  import { getInitials } from '$lib/avatar';
  import { presenceLabel } from '$lib/domain/sfMemberStatus';
  import PullQuote from '$lib/components/staff/PullQuote.svelte';
  import ClosingVerdictChip from '$lib/components/dev/closings/ClosingVerdictChip.svelte';
  import type { TalentJourney } from '$lib/domain/talentJourney';
  import { formatGivenName } from '$lib/domain/profile';

  /**
   * Everything this talent has done with us, and what came of it.
   *
   * This replaces a bare event log, which enumerated the same events and told you
   * nothing about the person.
   *
   * Two levels, and the nesting is the meaning. An event is a line: its name,
   * whether they turned up, when. A closing is a PANEL under that line, because a
   * closing is one conversation and everything it produced belongs together - the
   * team's verdict, what the talent said, what the team wrote. Rendered flat, as
   * this was, the verdict floated at the far right of the event line and the two
   * sentences read as loose siblings; a reader could not tell which note answered
   * which quote, or that any of it came from one sitting.
   *
   * Inside the panel, who is speaking is stated rather than implied. The
   * typography still separates them (the talent's words italic in guillemets
   * behind the teal rule, the team's plain behind a neutral one), but at this
   * size two thin rules a few lines apart were carrying more than they could:
   * each block now names its author.
   *
   * There is deliberately no single quote leading the section. It had one, and
   * choosing WHICH quote had no honest answer: the most recent is often a
   * fragment ("mon avenir"), and preferring a stage's over a Coding Club's is
   * not expressible - Jump retired `Event.eventType` and nothing in the schema
   * ranks one format above another. Ranking them would have meant inventing a
   * distinction the product does not make. So every closing shows its own
   * sentence, next to the event that prompted it, and the reader compares them
   * instead of being handed one. The page still opens on the talent's voice:
   * `TalentInterestQuotes` leads with it, one card above.
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
  <!-- A regular attends eight to ten events a year, so the length of this list
         is decided by the data: it scrolls in its own box, sized against the
         viewport rather than a pixel cap. -->
  <ul class="max-h-[45svh] space-y-2 overflow-y-auto pr-1 text-sm">
    {#each journey.entries as entry (entry.participationId)}
      <li>
        <!-- The event line, and only the event: its name goes to the event, as
               an event name anywhere else in this space does. It used to link to
               the closing, which nobody guesses - you click a name expecting the
               thing it names. -->
        <div class="flex items-center gap-3 py-1">
          <!-- The truncation lives on the wrapper, the link on the words. Put
               `flex-1` on the anchor itself and it stretches all the way to the
               date, so the whole empty half of the row lights up as a link while
               the pointer is nowhere near the text it names. `min-w-0` is what
               truncation actually needs; growing was never part of it. -->
          <span class="min-w-0 flex-1 truncate font-medium text-foreground">
            <!-- A link only where it leads somewhere this reader may open (see
                 `eventHref`): an event from another campus, one an admin never
                 activated in the dev space, or one exposing no Inscrits list
                 stays plain text rather than becoming a 404 or opening under
                 another event's sidebar.

                 The dotted underline is worn at rest, not on hover, which is
                 what tells the two apart: half a list linking and half not,
                 with both drawn identically until the pointer lands, reads as
                 rows that are broken rather than as rows that lead nowhere.
                 Same affordance `OriginBreakdownCard` gives its clickable
                 rows. -->
            {#if entry.eventHref}
              <a
                href={entry.eventHref}
                class="cursor-pointer underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 transition-colors hover:text-epi-blue hover:decoration-epi-blue"
              >
                {entry.eventName}
              </a>
            {:else}
              {entry.eventName}
            {/if}
          </span>
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

        <!-- The closing as one contained object, not as extra lines under the
               event. Three things were floating loose before: the verdict sat at
               the far right of the event line, the talent's sentence and the
               team's note followed as siblings of it, and nothing said the four
               belonged to the same conversation. An indent said it even worse -
               it read as the event being nested inside the one above.

               So: a panel that states what the closing CONCLUDED, and carries
               the two voices under it, each signed by whoever wrote it. -->
        {#if entry.closing}
          <div class="mt-1 space-y-2.5 rounded-sm border bg-muted/25 p-3">
            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {#if entry.closing.recommendation}
                <ClosingVerdictChip
                  recommendation={entry.closing.recommendation}
                />
              {:else}
                <span class="epi-overline text-muted-foreground">
                  Closing en cours
                </span>
              {/if}
              <a
                href={resolve(
                  `/staff/dev/events/${entry.eventId}/closings/${entry.participationId}`,
                )}
                class="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-medium text-epi-blue transition-colors hover:underline"
              >
                Voir le closing
                <ArrowRight class="h-3.5 w-3.5 shrink-0" />
              </a>
            </div>

            <!-- Attributed, not merely styled differently. The rule colours and
                 the italic still carry the distinction, but at this size two thin
                 rules three lines apart were not telling anybody who had spoken.
                 A signature does, and the staff one is the same avatar
                 `TalentNoteCard` signs a note with two cards to the right: the
                 same person was reading as two different kinds of thing on one
                 screen.

                 Each name appears once. The panel header used to repeat "closing
                 mené par Maëlle Fevre" three lines above her own signature, which
                 is what actually crowded this box. -->
            {#if entry.closing.quote}
              <PullQuote
                text={entry.closing.quote}
                size="inline"
                lead={name}
                clamp
              />
            {/if}
            {#if entry.closing.verdictNote}
              <figure class="space-y-1">
                <figcaption
                  class="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Avatar.Root class="h-5 w-5 shrink-0">
                    <Avatar.Image
                      src={entry.closing.staffImage ?? undefined}
                      alt={entry.closing.staffName ?? 'Staff'}
                      class="object-cover"
                    />
                    <Avatar.Fallback
                      class="bg-epi-blue/10 text-[0.625rem] font-bold text-epi-blue"
                    >
                      {getInitials(entry.closing.staffName)}
                    </Avatar.Fallback>
                  </Avatar.Root>
                  {entry.closing.staffName ?? "L'équipe"}
                </figcaption>
                <p
                  class="line-clamp-3 border-l-2 border-muted-foreground/25 pl-3 text-sm leading-relaxed text-foreground-secondary"
                >
                  {entry.closing.verdictNote}
                </p>
              </figure>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
