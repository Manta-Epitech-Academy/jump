<script lang="ts">
  import { LoaderCircle } from '@lucide/svelte';

  let {
    isAnalyzing,
    isConfirming,
    currentMessage,
    progress,
  }: {
    isAnalyzing: boolean;
    isConfirming: boolean;
    currentMessage: string;
    progress: number;
  } = $props();
</script>

{#if isAnalyzing || isConfirming}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-300"
  >
    <div
      class="flex w-full max-w-sm animate-in flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center shadow-lg duration-200 zoom-in-95"
    >
      <div
        class="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted"
      >
        <LoaderCircle class="h-6 w-6 animate-spin text-epi-blue" />
      </div>
      <div class="space-y-1">
        <h3 class="text-lg font-bold tracking-tight uppercase">
          {isAnalyzing ? 'Analyse du fichier' : 'Traitement en cours'}
        </h3>
        <p class="min-h-[1.5em] font-mono text-xs text-muted-foreground">
          {currentMessage}<span class="animate-pulse">_</span>
        </p>
      </div>
      <div class="h-1.5 w-3/4 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-epi-blue transition-all duration-300 ease-out"
          style="width: {progress}%"
        ></div>
      </div>
      <span class="text-[10px] font-bold text-muted-foreground uppercase"
        >{Math.round(progress)}%</span
      >
    </div>
  </div>
{/if}
