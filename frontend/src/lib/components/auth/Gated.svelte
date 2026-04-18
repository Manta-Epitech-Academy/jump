<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { can, type StaffGroup } from '$lib/domain/permissions';
  import * as Tooltip from '$lib/components/ui/tooltip';

  type Props = {
    group: StaffGroup;
    mode?: 'hide' | 'disable';
    tooltipMessage?: string;
    children: Snippet;
  };

  let { group, mode = 'disable', tooltipMessage, children }: Props = $props();

  const role = $derived(page.data.staffProfile?.staffRole);
  const allowed = $derived(can(group, role));
  const message = $derived(
    tooltipMessage ?? "Réservé aux responsables de l'espace",
  );
</script>

{#if allowed}
  {@render children()}
{:else if mode === 'hide'}
  <!-- hidden -->
{:else}
  <Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <span
            {...props}
            class="inline-flex cursor-not-allowed opacity-50 [&>*]:pointer-events-none"
            aria-disabled="true"
          >
            {@render children()}
          </span>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content><p>{message}</p></Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
