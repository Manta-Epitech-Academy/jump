<script lang="ts">
  import SalesforceLinkButton from '$lib/components/salesforce/SalesforceLinkButton.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  type Props = {
    externalId: string | null | undefined;
  };

  let { externalId }: Props = $props();
</script>

{#if externalId}
  <Tooltip.Provider delayDuration={150}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <SalesforceLinkButton
            {...props}
            {externalId}
            kind="campaign"
            label="Campagne Salesforce"
            class="shadow-raised"
          />
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>
        Ouvrir la campagne Salesforce associée à cet événement
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
