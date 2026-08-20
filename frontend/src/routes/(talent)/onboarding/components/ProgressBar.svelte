<script lang="ts">
  let { progress }: { progress: number } = $props();
</script>

<div class="fixed top-0 right-0 left-0 z-50 h-1 bg-muted/50">
  <div
    class="h-full rounded-r-full bg-epi-tech transition-ui duration-320 ease-out"
    style="width: {Math.min(progress, 100)}%"
  ></div>
</div>
