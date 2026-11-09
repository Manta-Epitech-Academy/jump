<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import { Input } from '$lib/components/ui/input';
  import { cn } from '$lib/utils';

  // A list's search box, alone: `DataTableToolbar` renders it above a table,
  // and the event lists put it on their title's line (`ListHeaderSearch`).
  let {
    value,
    onInput,
    placeholder = 'Rechercher…',
    class: className = 'w-full max-w-72',
  }: {
    value: string;
    onInput: (value: string) => void;
    placeholder?: string;
    /** Width utilities for the box, a flex child of whatever row holds it. */
    class?: string;
  } = $props();
</script>

<div class={cn('relative', className)}>
  <Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
  <Input
    {placeholder}
    aria-label={placeholder}
    class="rounded-sm pl-9"
    {value}
    oninput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
  />
</div>
