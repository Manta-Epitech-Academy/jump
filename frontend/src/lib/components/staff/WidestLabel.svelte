<script lang="ts">
  // Sizes a Select trigger to its WIDEST option, so the trigger never resizes as
  // the selection changes and carries no dead whitespace. Every label is stacked
  // invisibly in one grid cell to set the width to the longest; the active label
  // is overlaid on top. Lives on its own so the trick is shared by FilterSelect
  // (toolbar filters) and FormStatusSelect (status pill) rather than re-derived.
  let { labels, selected }: { labels: string[]; selected: string } = $props();
</script>

<span class="grid min-w-0 text-left">
  {#each labels as label, i (i)}
    <span
      class="invisible col-start-1 row-start-1 h-0 overflow-hidden"
      aria-hidden="true">{label}</span
    >
  {/each}
  <span class="col-start-1 row-start-1 truncate">{selected}</span>
</span>
