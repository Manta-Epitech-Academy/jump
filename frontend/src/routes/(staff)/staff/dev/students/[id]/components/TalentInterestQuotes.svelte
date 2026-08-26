<script lang="ts">
  import { formatGivenName } from '$lib/domain/profile';
  import PullQuote from '$lib/components/staff/PullQuote.svelte';

  // Free-text the talent wrote about themselves during onboarding, surfaced as
  // warm pull-quotes so they speak in their own words — the human, "shiny"
  // counterpart to the structured interest chips. Each line is optional and the
  // block self-hides when empty; interestsFreeText leads (broader), the setup
  // description follows.
  //
  // The quote treatment itself lives in `PullQuote`, shared with the parcours
  // section below, so the page has one way of showing the talent speaking.
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

  type Quote = { id: string; lead: string; text: string };
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
      ] as (Quote | null)[]
    ).filter((q): q is Quote => q !== null),
  );
</script>

{#if quotes.length > 0}
  <div class="space-y-4">
    {#each quotes as q (q.id)}
      <PullQuote text={q.text} lead={q.lead} />
    {/each}
  </div>
{/if}
