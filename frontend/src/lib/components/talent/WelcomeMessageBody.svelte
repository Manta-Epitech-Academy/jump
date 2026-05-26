<script lang="ts">
  // Single source of truth for rendering the CMS welcome message (HTML) on the
  // dashboard: the Actualités card preview and the card's full dialog — so
  // prose styling stays in sync across both. (The /welcome splash is a separate
  // fixed greeting and does not render through here.)
  import { cn } from '$lib/utils';

  let { content, class: className }: { content: string; class?: string } =
    $props();
</script>

<div class={cn('prose max-w-none prose-slate dark:prose-invert', className)}>
  {@html content}
</div>
