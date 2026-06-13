<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';

  // Pending placeholder for the streamed cohort region. It mirrors the two-column
  // results grid (table left, rail right) so the shell doesn't reflow when the
  // real content lands. Shared by the three stage pages.
  let { rows = 8, rail = true }: { rows?: number; rail?: boolean } = $props();
</script>

<div class="grid gap-6 xl:grid-cols-10">
  <div class="min-w-0 space-y-4 xl:col-span-7">
    <div class="flex items-center justify-between gap-2">
      <Skeleton class="h-9 w-[230px]" />
      <Skeleton class="h-9 w-40" />
    </div>
    <div class="space-y-2 rounded-sm border bg-card p-3 shadow-sm">
      {#each Array.from({ length: rows }, (_, i) => i) as i (i)}
        <Skeleton class="h-11 w-full" />
      {/each}
    </div>
  </div>
  {#if rail}
    <aside class="min-w-0 xl:col-span-3">
      <div class="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>
    </aside>
  {/if}
</div>
