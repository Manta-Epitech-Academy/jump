<script lang="ts">
  // Canonical "jump to Salesforce" button. The trailing ExternalLink glyph is
  // the affordance that matters: paired with the brand icon it reads, at a
  // glance, as a control that takes you off-platform into a new tab. Every
  // Salesforce deep-link button in the dev space routes through here so that
  // affordance stays identical; surface-specific chrome rides in via `class`.
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import { Button, type ButtonProps } from '$lib/components/ui/button';
  import { salesforceUrl } from '$lib/domain/salesforce';
  import { cn } from '$lib/utils';

  type Props = Omit<ButtonProps, 'href' | 'children' | 'class'> & {
    /** Salesforce 18-char id; renders nothing when absent. */
    externalId: string | null | undefined;
    label: string;
    class?: string;
  };

  let {
    externalId,
    label,
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
    class={cn('gap-2 rounded-sm', className)}
  >
    <SalesforceIcon class="h-3.5 w-3.5" />
    {label}
    <ExternalLink class="h-3.5 w-3.5" />
  </Button>
{/if}
