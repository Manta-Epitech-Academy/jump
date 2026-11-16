<script lang="ts">
  import { eventVisualAccent } from '$lib/domain/eventHero';

  // The 2027 mockup's visual for an event that has no picture of its own: the
  // brand's signature over the event's name, its last word in the colour of
  // its kind and closed by the terminal cursor. Drawn, not stored, so every
  // event has one without anybody writing anything. The mockup paints it on a
  // gradient; DESIGN.md forbids them, so the ground is the brand's flat dark.
  // Decorative: the hero's own title says the same.
  let { name, categoryColor }: { name: string; categoryColor: string | null } =
    $props();

  const words = $derived(name.trim().split(/\s+/));
  const lead = $derived(words.slice(0, -1).join(' '));
  const last = $derived(words.at(-1) ?? '');
  // A category colour too dark for the ground gives way to the neon.
  const accent = $derived(eventVisualAccent(categoryColor));
</script>

<div
  aria-hidden="true"
  class="flex aspect-video w-full max-w-70 shrink-0 flex-col justify-center gap-0.5 overflow-hidden border border-white/25 bg-epi-dark px-4 py-4 sm:w-2/5"
>
  <span class="font-mono text-xs font-bold text-white">&#123;EPITECH&#125;</span
  >
  {#if lead}
    <span
      class="font-heading text-display-l leading-none break-words text-white"
      >{lead}</span
    >
  {/if}
  <span
    class={accent
      ? 'font-heading text-display-l leading-none break-words text-(--accent)'
      : 'font-heading text-display-l leading-none break-words text-epi-tech'}
    style:--accent={accent}>{last}_</span
  >
</div>
