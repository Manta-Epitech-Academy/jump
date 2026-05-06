<script lang="ts">
  import Heart from '@lucide/svelte/icons/heart';

  type InterestRow = { interest: { id: string; label: string } };

  let { interests }: { interests: InterestRow[] } = $props();
</script>

{#if interests.length > 0}
  <section class="space-y-2">
    <h3
      class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      <Heart class="h-3 w-3 text-epi-orange" />
      Centres d'intérêt
    </h3>
    <div class="flex flex-wrap gap-1.5">
      {#each interests as ti (ti.interest.id)}
        <span
          class="rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground"
        >
          {ti.interest.label}
        </span>
      {/each}
    </div>
  </section>
{/if}
