<script lang="ts">
  import { eventVisualAccent } from '$lib/domain/eventHero';
  import { cn } from '$lib/utils';

  // The 2027 mockup's visual for an event that has no picture of its own: the
  // brand's signature over the event's name, its last word in the colour of
  // its kind and closed by the terminal cursor. Drawn, not stored, so every
  // event has one without anybody writing anything. The mockup paints it on a
  // gradient; DESIGN.md forbids them, so the ground is the brand's flat dark.
  // Decorative: the hero's own title says the same.
  //
  // Also the visual of a subject that has no cover (`SubjectVisual`): the same
  // block over the subject's name, so a hero never has an empty picture column.
  // `size` is where it sits: the picture column of a hero, or the full width
  // of one tile among several choices.
  let {
    name,
    categoryColor,
    size = 'hero',
  }: {
    name: string;
    categoryColor: string | null;
    size?: 'hero' | 'tile';
  } = $props();

  const words = $derived(name.trim().split(/\s+/));
  const lead = $derived(words.slice(0, -1).join(' '));
  const last = $derived(words.at(-1) ?? '');
  // A category colour too dark for the ground gives way to the neon.
  const accent = $derived(eventVisualAccent(categoryColor));
</script>

<div
  aria-hidden="true"
  class={cn(
    'flex aspect-video w-full shrink-0 flex-col justify-center gap-0.5 overflow-hidden border border-white/25 bg-epi-dark px-4 py-4',
    size === 'hero' && 'max-w-70 sm:w-2/5',
  )}
>
  <span class="font-mono text-xs font-bold text-white">&#123;EPITECH&#125;</span
  >
  {#if lead}
    <span
      class={cn(
        'font-heading leading-none break-words text-white',
        size === 'hero' ? 'text-display-l' : 'text-display-m',
      )}>{lead}</span
    >
  {/if}
  <span
    class={cn(
      'font-heading leading-none break-words',
      size === 'hero' ? 'text-display-l' : 'text-display-m',
      accent ? 'text-(--accent)' : 'text-epi-tech',
    )}
    style:--accent={accent}>{last}_</span
  >
</div>
