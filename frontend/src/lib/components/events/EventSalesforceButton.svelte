<script lang="ts">
  import Cloud from '@lucide/svelte/icons/cloud';
  import { Button } from '$lib/components/ui/button';
  import { salesforceCampaignUrl } from '$lib/domain/salesforce';

  type Props = {
    externalId: string | null | undefined;
  };

  let { externalId }: Props = $props();
</script>

{#if externalId}
  <Button
    href={salesforceCampaignUrl(externalId)}
    target="_blank"
    rel="noopener noreferrer"
    variant="outline"
    size="sm"
    class="rounded-sm shadow-sm"
  >
    <Cloud class="mr-2 h-3.5 w-3.5" />
    Salesforce
  </Button>
{/if}
