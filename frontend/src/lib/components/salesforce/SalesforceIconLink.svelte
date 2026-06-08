<script lang="ts">
  // Compact, icon-only Salesforce deep-link for dense tables and inline lists
  // where a full button would not fit. Same off-platform target as
  // SalesforceLinkButton, but the affordance is the brand glyph alone: there is
  // no room for a label or a second external-link icon, so `title` / `aria-label`
  // carry the "opens in Salesforce" meaning instead.
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import {
    salesforceUrl,
    type SalesforceRecordKind,
  } from '$lib/domain/salesforce';
  import { cn } from '$lib/utils';

  type Props = {
    /** Salesforce 18-char id; renders nothing when absent. */
    externalId: string | null | undefined;
    kind: SalesforceRecordKind;
    /** Accessible label, e.g. "Ouvrir le contact dans Salesforce". */
    label: string;
    class?: string;
  };

  let { externalId, kind, label, class: className }: Props = $props();
</script>

{#if externalId}
  <a
    href={salesforceUrl(kind, externalId)}
    target="_blank"
    rel="noopener noreferrer"
    title="Ouvrir dans Salesforce"
    aria-label={label}
    class={cn('transition-opacity hover:opacity-70', className)}
  >
    <SalesforceIcon class="h-3.5 w-3.5" />
  </a>
{/if}
