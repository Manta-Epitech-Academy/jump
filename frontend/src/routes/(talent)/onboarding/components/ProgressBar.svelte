<script lang="ts">
  let { progress }: { progress: number } = $props();
</script>

<div
  class="fixed top-0 right-0 left-0 z-50 h-1 bg-slate-200/50 dark:bg-slate-800/50"
>
  <div
    class="h-full rounded-r-full bg-epi-teal transition-all duration-500 ease-out"
    style="width: {Math.min(progress, 100)}%"
  ></div>
</div>
