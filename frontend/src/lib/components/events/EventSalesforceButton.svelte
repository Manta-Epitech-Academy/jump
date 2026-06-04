<script lang="ts">
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { salesforceCampaignUrl } from '$lib/domain/salesforce';

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
          <Button
            {...props}
            href={salesforceCampaignUrl(externalId)}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            class="rounded-sm shadow-sm"
          >
            <SalesforceIcon class="mr-2 h-3.5 w-3.5" />
            Campagne Salesforce
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>
        Ouvrir la campagne Salesforce associée dans un nouvel onglet
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
