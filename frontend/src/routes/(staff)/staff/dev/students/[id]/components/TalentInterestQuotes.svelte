<script lang="ts">
  import Quote from '@lucide/svelte/icons/quote';
  import { formatGivenName } from '$lib/domain/profile';

  // Free-text the talent wrote about themselves during onboarding, surfaced as
  // warm pull-quotes so they speak in their own words — the human, "shiny"
  // counterpart to the structured interest chips. Each line is optional and the
  // block self-hides when empty; interestsFreeText leads (broader), the setup
  // description follows.
  let {
    firstName,
    interestsFreeText = null,
    setupDescription = null,
  }: {
    firstName: string;
    interestsFreeText?: string | null;
    setupDescription?: string | null;
  } = $props();

  const name = $derived(formatGivenName(firstName));

  type PullQuote = { id: string; lead: string; text: string };
  const quotes = $derived(
    (
      [
        interestsFreeText?.trim()
          ? {
              id: 'interests',
              lead: `${name} nous parle de ses passions`,
              text: interestsFreeText.trim(),
            }
          : null,
        setupDescription?.trim()
          ? {
              id: 'setup',
              lead: `${name} nous décrit son setup`,
              text: setupDescription.trim(),
            }
          : null,
      ] as (PullQuote | null)[]
    ).filter((q): q is PullQuote => q !== null),
  );
</script>

{#if quotes.length > 0}
  <div class="space-y-4">
    {#each quotes as q (q.id)}
      <figure class="space-y-1.5">
        <figcaption
          class="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Quote class="h-3.5 w-3.5 shrink-0 text-epi-tech-ink" />
          {q.lead}
        </figcaption>
        <blockquote
          class="border-l-2 border-epi-tech-ink/50 pl-4 text-base leading-relaxed text-foreground italic"
        >
          «&nbsp;{q.text}&nbsp;»
        </blockquote>
      </figure>
    {/each}
  </div>
{/if}
