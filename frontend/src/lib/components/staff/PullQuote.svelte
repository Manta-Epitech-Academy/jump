<script lang="ts">
  import Quote from '@lucide/svelte/icons/quote';
  import { cn } from '$lib/utils';

  /**
   * A talent's own words, on a staff surface.
   *
   * Extracted from the fiche's onboarding quotes so there is ONE of these. The
   * page draws a line the components have to keep: what the talent wrote gets
   * this treatment, and what staff wrote about them stays plain (see
   * `TalentNoteCard`, which deliberately copies the rule and drops the italic,
   * the guillemets and the teal). A second hand-rolled blockquote is how that
   * distinction stops being legible.
   *
   * `lead` is the full treatment, for the one quote a section is built around.
   * `inline` is the same grammar one size down, for a quote inside a list, where
   * a column of full-size pull-quotes would shout over the rows carrying them.
   */
  let {
    text,
    lead = null,
    size = 'lead',
    clamp = false,
  }: {
    text: string;
    /** Who said it and about what, e.g. "Lucie nous résume le stage de février". */
    lead?: string | null;
    size?: 'lead' | 'inline';
    /** Cap an inline quote at two lines. The full text is one click away. */
    clamp?: boolean;
  } = $props();
</script>

<figure class="space-y-1.5">
  {#if lead}
    <figcaption class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Quote class="h-3.5 w-3.5 shrink-0 text-epi-tech-ink" />
      {lead}
    </figcaption>
  {/if}
  <!-- `whitespace-pre-wrap`, like the staff-note rail it is the counterpart of:
       the paragraph breaks somebody typed are part of what they wrote, and a
       testimony written in two paragraphs read as one run-on line here while the
       PDF of the same closing printed it as two. Safe against the markup's own
       indentation - Svelte trims a text node at an element boundary. -->
  <blockquote
    class={cn(
      'border-l-2 border-epi-tech-ink/50 leading-relaxed whitespace-pre-wrap text-foreground italic',
      size === 'lead' ? 'pl-4 text-base' : 'pl-3 text-sm',
      clamp && 'line-clamp-2',
    )}
  >
    «&nbsp;{text}&nbsp;»
  </blockquote>
</figure>
