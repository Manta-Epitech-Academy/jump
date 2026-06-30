<script lang="ts">
  // Single source of truth for rendering a news post's HTML body on the
  // dashboard: the Actualites card preview and the full /actus page - so
  // prose styling stays in sync across both.
  import { cn } from '$lib/utils';

  let { content, class: className }: { content: string; class?: string } =
    $props();
</script>

<div
  class={cn(
    'news-post-body prose max-w-none prose-slate dark:prose-invert',
    className,
  )}
>
  {@html content}
</div>

<style>
  /* Images carry an explicit px width (the author's chosen size). Cap it so a
     wide image never overflows a narrow card or mobile drawer, and preserve the
     aspect ratio. */
  .news-post-body :global(img) {
    max-width: 100%;
    height: auto;
  }
</style>
