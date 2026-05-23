<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';

  type Props = {
    value: string | null | undefined;
    label?: string;
    class?: string;
  };

  let { value, label = 'Copier', class: className }: Props = $props();

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

<button
  type="button"
  onclick={copy}
  disabled={!value}
  aria-label={label}
  title={label}
  class={cn(
    'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
    className,
  )}
>
  {#if copied}
    <Check class="h-3.5 w-3.5 text-emerald-600" />
  {:else}
    <Copy class="h-3.5 w-3.5" />
  {/if}
</button>
