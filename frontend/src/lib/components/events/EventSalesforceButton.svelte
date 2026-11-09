<script lang="ts">
  import SalesforceLinkButton from '$lib/components/salesforce/SalesforceLinkButton.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  // The event's Salesforce campaign, as one of the actions on its home: a tile
  // like the others (`SalesforceLinkButton`'s `tile` layout), the brand glyph
  // over its label.
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
          layout="tile"
          size="default"
        />
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>
      Ouvrir la campagne Salesforce associée à cet événement
    </Tooltip.Content>
  </Tooltip.Root>
{/if}
