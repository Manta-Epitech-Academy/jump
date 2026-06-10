<script lang="ts">
  import { scaleEmoji, scaleLevelColor } from './scale';

  interface Props {
    options: string[];
    onanswer?: (value: string, display: string) => void;
  }

  let { options, onanswer }: Props = $props();

  // Display reversed: best (index 0) on the left
  const reversed = $derived([...options].reverse());
</script>

<div
  class="grid gap-2 px-4 pb-2"
  style:grid-template-columns="repeat({options.length}, 1fr)"
>
  {#each reversed as label, ri}
    {@const origIdx = options.length - 1 - ri}
    {@const emoji = scaleEmoji(origIdx, options.length)}
    {@const color = scaleLevelColor(origIdx, options.length)}
    <button
      type="button"
      class="flex flex-col items-center gap-1 rounded-xl border-2 border-transparent p-3 text-center transition-colors hover:border-[var(--lvl)]"
      style:--lvl={color}
      onclick={() => onanswer?.(label, `${emoji}  ${label}`)}
    >
      <span class="text-2xl">{emoji}</span>
      <span class="text-xs leading-tight font-medium">{label}</span>
    </button>
  {/each}
</div>
