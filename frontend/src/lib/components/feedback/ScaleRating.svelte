<script lang="ts">
  import { typesetChat } from '$lib/domain/feedbackForms/schema';
  import { scaleEmoji, scaleLevelColor } from './scale';

  interface Props {
    options: string[];
    onanswer?: (value: string, display: string) => void;
  }

  let { options, onanswer }: Props = $props();

  // Display reversed: best (index 0) on top / on the left.
  const reversed = $derived([...options].reverse());
</script>

<!--
  Mobile (default): full-width stacked rows (emoji + label) with big tap targets
  and readable labels - a horizontal row of N labelled options never fits a phone.
  sm+: the compact horizontal grid, one column per option.
-->
<div
  class="flex flex-col gap-2 px-4 pb-2 sm:grid"
  style:grid-template-columns="repeat({options.length}, minmax(0, 1fr))"
>
  {#each reversed as label, ri (label)}
    {@const origIdx = options.length - 1 - ri}
    {@const emoji = scaleEmoji(origIdx, options.length)}
    {@const color = scaleLevelColor(origIdx, options.length)}
    <button
      type="button"
      class="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-[var(--lvl)] p-3 text-left transition-colors active:bg-background sm:flex-col sm:items-center sm:gap-1 sm:border-transparent sm:text-center sm:hover:border-[var(--lvl)] sm:active:bg-transparent"
      style:--lvl={color}
      onclick={() => onanswer?.(label, `${emoji}  ${label}`)}
    >
      <span class="text-2xl">{emoji}</span>
      <span class="text-sm leading-tight font-medium sm:text-xs"
        >{typesetChat(label)}</span
      >
    </button>
  {/each}
</div>
