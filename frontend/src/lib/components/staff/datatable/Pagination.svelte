<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { Button } from '$lib/components/ui/button';

  // Shared prev / "x / y" / next control for paginated staff lists. The parent
  // owns where the page number actually lives (a URL param, a $state, …) — this
  // just renders the chrome and reports the target page through `onPageChange`.
  // Renders nothing for a single page, so callers drop it in unconditionally.
  let {
    page,
    totalPages,
    onPageChange,
  }: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  } = $props();
</script>

{#if totalPages > 1}
  <div class="flex items-center justify-end">
    <div class="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8"
        disabled={page <= 1}
        onclick={() => onPageChange(page - 1)}
        aria-label="Page précédente"
      >
        <ChevronLeft class="h-4 w-4" />
      </Button>
      <span class="px-3 text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8"
        disabled={page >= totalPages}
        onclick={() => onPageChange(page + 1)}
        aria-label="Page suivante"
      >
        <ChevronRight class="h-4 w-4" />
      </Button>
    </div>
  </div>
{/if}
