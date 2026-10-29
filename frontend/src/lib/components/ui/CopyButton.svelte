<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import type { Snippet } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';
  import * as Tooltip from '$lib/components/ui/tooltip';

  type Props = {
    value: string | null | undefined;
    label?: string;
    class?: string;
    /**
     * What the button shows before its icon, which makes the whole field the
     * copy control rather than a square beside it: a value read in place and
     * copied from where it is read, like the catalogue's supervisor code. The
     * `label` then names the value too, since it replaces the content for a
     * screen reader and is what the tooltip shows.
     */
    children?: Snippet;
  };

  let { value, label = 'Copier', class: className, children }: Props = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function copy(event: MouseEvent) {
    // The button often sits inside a clickable parent (`<a href="mailto:…">`);
    // stop the click from triggering it.
    event.preventDefault();
    event.stopPropagation();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      toast.success('Copié');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1200);
    } catch {
      toast.error('Impossible de copier');
    }
  }
</script>

<Tooltip.Provider delayDuration={300}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          onclick={copy}
          disabled={!value}
          aria-label={label}
          class={cn(
            'inline-flex cursor-pointer items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
            children ? 'justify-between gap-2' : 'h-6 w-6 justify-center',
            className,
          )}
        >
          {@render children?.()}
          {#if copied}
            <Check class="h-3.5 w-3.5 shrink-0 text-success" />
          {:else}
            <Copy class="h-3.5 w-3.5 shrink-0" />
          {/if}
        </button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>
      <p>{copied ? 'Copié' : label}</p>
    </Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
