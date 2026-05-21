<script lang="ts">
  // Single source of truth for rendering the stage welcome message (CMS HTML).
  // Used by the dedicated /welcome page, the Actualités card preview, and the
  // card's full dialog — so prose styling stays in sync across all three.
  import { cn } from '$lib/utils';

  let { content, class: className }: { content: string; class?: string } =
    $props();
</script>

<div class={cn('prose max-w-none prose-slate dark:prose-invert', className)}>
  {@html content}
</div>
