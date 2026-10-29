<script lang="ts">
  import { version } from '$app/environment';
  import { cn } from '$lib/utils';

  /**
   * The commit this build was made from, so anyone can tell which code an
   * environment runs, including from a login page when the admin will not open.
   *
   * `version` is the commit (svelte.config.js). A build that had none carries
   * kit's timestamp instead, and that renders nothing rather than a number that
   * reads like a commit.
   */
  let { link = false, class: className }: { link?: boolean; class?: string } =
    $props();

  const revision = /^[0-9a-f]{40}$/.test(version) ? version : null;
</script>

{#if revision}
  {#if link}
    <a
      href="https://github.com/Manta-Epitech-Academy/jump/commit/{revision}"
      target="_blank"
      rel="noopener noreferrer"
      class={cn(
        'cursor-pointer font-mono text-xs transition-colors hover:underline',
        className,
      )}
    >
      {revision.slice(0, 7)}
    </a>
  {:else}
    <span class={cn('font-mono text-xs', className)}>
      {revision.slice(0, 7)}
    </span>
  {/if}
{/if}
