<script lang="ts">
  import type { Snippet } from 'svelte';
  import SearchBox from './SearchBox.svelte';
  import type { createUrlSearch } from './urlSearch.svelte';

  // An event list's search on its title's line (Inscrits, Émargement,
  // Closings, Feedback; PO, 29/10/2026), followed by the page's own controls
  // (`children`), for `PageHeader`'s actions. Its page passes
  // `class="md:items-start"` to the header. One layout for the four, because
  // each page set its own and the first QA found three faults in them:
  //   - the box sat centred against a taller control beside it (Inscrits' export
  //     tile, since retired), floating between the title and the table. It sits
  //     at the top, the height of the title it is beside, and the buttons
  //     after it centre on it. Aligning on the foot instead pushed the title
  //     lower than on the event's other pages, so it jumped between tabs;
  //   - the row wrapped as soon as the window narrowed, leaving a control alone
  //     under the box. The box gives up width instead, down to what still
  //     shows its placeholder's first words, and `PageHeader` moves the whole
  //     row under the title when even that does not fit;
  //   - on Émargement it shared the toolbar with the créneau and the statut
  //     filter, in the list's 70 % column, and shrank to « Reche… ».
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

<div class="flex w-full items-center gap-3 md:w-auto">
  <SearchBox
    value={search.value}
    onInput={(v) => (search.value = v)}
    {placeholder}
    class="min-w-40 flex-1 md:w-64 md:flex-initial"
  />
  {@render children?.()}
</div>
