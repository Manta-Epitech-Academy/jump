<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { cn } from '$lib/utils';

  // The onboarding step CTA. Every step submits a form and waits on a server
  // round-trip (profile fans out parent emails + resolves the school; rules
  // generates a PDF), so the button owns the `submitting` spinner + disable to
  // block double-submits and give feedback on slow mobile. Extracted so all five
  // steps share one source of truth instead of copy-pasting the teal class.
  let {
    submitting = false,
    disabled = false,
    class: className,
    children,
  }: {
    submitting?: boolean;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<Button
  type="submit"
  disabled={disabled || submitting}
  class={cn(
    'h-auto w-full gap-2 rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110 disabled:opacity-50',
    className,
  )}
>
  {#if submitting}
    <LoaderCircle class="h-4 w-4 animate-spin" />
  {/if}
  {#if children}{@render children()}{:else}Continuer{/if}
</Button>
