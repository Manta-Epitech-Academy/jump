<script lang="ts">
  import { FileCheck, FileClock } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';

  let {
    student,
  }: {
    student: {
      charterAcceptedAt: Date | string | null;
      rulesSignedAt: Date | string | null;
      imageRightsSignedAt: Date | string | null;
      imageRightsSignerName: string | null;
    };
  } = $props();

  const documents = $derived([
    {
      label: 'Charte informatique',
      signedAt: student.charterAcceptedAt,
      signer: null,
    },
    {
      label: 'Règlement intérieur',
      signedAt: student.rulesSignedAt,
      signer: null,
    },
    {
      label: "Droit à l'image",
      signedAt: student.imageRightsSignedAt,
      signer: student.imageRightsSignerName,
    },
  ]);

  function formatDate(date: Date | string | null): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  const completedCount = $derived(
    documents.filter((d) => d.signedAt).length,
  );
</script>

<Card.Root class="shadow-md">
  <Card.Header class="pb-3">
    <Card.Title class="text-sm font-bold uppercase">
      Onboarding
      <span class="ml-1 text-xs font-normal text-muted-foreground">
        ({completedCount}/3)
      </span>
    </Card.Title>
  </Card.Header>
  <Card.Content class="space-y-2">
    {#each documents as doc}
      <div class="flex items-center gap-2 text-sm">
        {#if doc.signedAt}
          <FileCheck class="h-4 w-4 shrink-0 text-green-500" />
          <div class="flex-1">
            <span class="text-foreground">{doc.label}</span>
            {#if doc.signer}
              <span class="text-xs text-muted-foreground">
                — {doc.signer}
              </span>
            {/if}
          </div>
          <span class="text-xs text-muted-foreground">
            {formatDate(doc.signedAt)}
          </span>
        {:else}
          <FileClock class="h-4 w-4 shrink-0 text-amber-500" />
          <span class="flex-1 text-muted-foreground">{doc.label}</span>
          <span class="text-xs text-amber-500">En attente</span>
        {/if}
      </div>
    {/each}
  </Card.Content>
</Card.Root>
