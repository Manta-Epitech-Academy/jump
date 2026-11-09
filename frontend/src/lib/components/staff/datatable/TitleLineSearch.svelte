<script lang="ts">
  import type { Snippet } from 'svelte';
  import SearchBox from './SearchBox.svelte';
  import type { createUrlSearch } from './urlSearch.svelte';

  // An event list's search on its title's line (Inscrits, Closings, Feedback;
  // PO, 29/10/2026), followed by the page's own controls (`children`), for
  // `PageHeader`'s actions. Its page passes `class="md:items-start"` to the
  // header. One layout for the three, because each page set its own and the
  // first QA found two faults in them:
  //   - the box sat centred against Inscrits' 112px export tile, floating
  //     between the title and the table. It sits at the top now, the height
  //     of the title it is beside, and the tile hangs down from the same line.
  //     Aligning everything on the foot instead pushed the title 60px lower
  //     than on the event's other pages, so it jumped from one tab to the next;
  //   - the row wrapped as soon as the window narrowed, leaving the tile alone
  //     under the box. The box gives up width instead, down to what still
  //     shows its placeholder's first words, and `PageHeader` moves the whole
  //     row under the title when even that does not fit.
  let {
    search,
    placeholder,
    children,
  }: {
    search: ReturnType<typeof createUrlSearch>;
    placeholder: string;
    children?: Snippet;
  } = $props();
</script>

<div class="flex w-full items-start gap-3 md:w-auto">
  <SearchBox
    value={search.value}
    onInput={(v) => (search.value = v)}
    {placeholder}
    class="min-w-40 flex-1 md:w-64 md:flex-initial"
  />
  {@render children?.()}
</div>
