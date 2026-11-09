<script lang="ts">
  // Canonical "jump to Salesforce" button. Inline, the trailing ExternalLink
  // glyph is the affordance that matters: paired with the brand icon it reads,
  // at a glance, as a control that takes you off-platform into a new tab. Every
  // Salesforce deep-link button in the dev space routes through here so that
  // affordance stays identical; surface-specific chrome rides in via `class`.
  //
  // As a `tile`, among an event's square actions, it wears their shape and
  // drops the glyph: none of its neighbours carries a trailing arrow, and the
  // one that did stood out of the row (PO, 29/10/2026). The brand icon still
  // says where it leads, and the tile's tooltip says it opens Salesforce.
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import { Button, type ButtonProps } from '$lib/components/ui/button';
  import { salesforceUrl } from '$lib/domain/salesforce';
  import { ACTION_TILE_CLASS } from '$lib/components/events/actionTile';
  import { cn } from '$lib/utils';

  type Props = Omit<ButtonProps, 'href' | 'children' | 'class'> & {
    /** Salesforce 18-char id; renders nothing when absent. */
    externalId: string | null | undefined;
    label: string;
    layout?: 'inline' | 'tile';
    class?: string;
  };

  let {
    externalId,
    label,
    layout = 'inline',
    variant = 'outline',
    size = 'sm',
    class: className,
    ...restProps
  }: Props = $props();

  const href = $derived(externalId == null ? null : salesforceUrl(externalId));
</script>

{#if href}
  <Button
    {...restProps}
    {href}
    {variant}
    {size}
    target="_blank"
    rel="noopener noreferrer"
    class={cn(
      'gap-2 rounded-sm',
      layout === 'tile' && ACTION_TILE_CLASS,
      className,
    )}
  >
    <SalesforceIcon class={layout === 'tile' ? undefined : 'h-3.5 w-3.5'} />
    {label}
    {#if layout === 'inline'}
      <ExternalLink class="h-3.5 w-3.5" />
    {/if}
  </Button>
{/if}
