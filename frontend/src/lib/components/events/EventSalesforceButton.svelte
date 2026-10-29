<script lang="ts">
  import SalesforceLinkButton from '$lib/components/salesforce/SalesforceLinkButton.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ACTION_TILE_CLASS } from './actionTile';

  // The event's Salesforce campaign, as one of the actions on its home. Through
  // `SalesforceLinkButton`, so it keeps the brand glyph and the "opens off
  // Jump" arrow every Salesforce link in the dev space carries.
  type Props = {
    externalId: string | null | undefined;
  };

  let { externalId }: Props = $props();
</script>

{#if externalId}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <SalesforceLinkButton
          {...props}
          {externalId}
          label="Campagne Salesforce"
          size="default"
          class={ACTION_TILE_CLASS}
        />
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>
      Ouvrir la campagne Salesforce associée à cet événement
    </Tooltip.Content>
  </Tooltip.Root>
{/if}
