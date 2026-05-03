<script lang="ts">
  import { enhance } from '$app/forms';
  import { TriangleAlert, Check, CheckCheck } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';

  let { data } = $props();
</script>

<svelte:head>
  <title>Erreurs de sync</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Erreurs de <span class="text-epi-pink">Sync</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Conflits détectés lors de la synchronisation Worker
      </p>
    </div>

    {#if data.unresolvedCount > 0}
      <form
        method="POST"
        action="?/resolveAll"
        use:enhance={() =>
          async ({ result, update }) => {
            if (result.type === 'success') {
              toast.success('Toutes les erreurs ont été résolues');
              await update();
            } else {
              toast.error('Une erreur est survenue');
            }
          }}
      >
        <Button type="submit" variant="outline" class="gap-2">
          <CheckCheck class="h-4 w-4" />
          Tout résoudre ({data.unresolvedCount})
        </Button>
      </form>
    {/if}
  </div>

  <Card.Root>
    <Card.Content class="p-0">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Statut</Table.Head>
            <Table.Head>Email</Table.Head>
            <Table.Head>ExtId tenté</Table.Head>
            <Table.Head>ExtId existant</Table.Head>
            <Table.Head>Talent</Table.Head>
            <Table.Head>Événement</Table.Head>
            <Table.Head class="text-center">Occurrences</Table.Head>
            <Table.Head>Dernière occurrence</Table.Head>
            <Table.Head class="text-right">Action</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.errors as error}
            <Table.Row class={error.resolved ? 'opacity-50' : ''}>
              <Table.Cell>
                {#if error.resolved}
                  <Badge variant="secondary">Résolu</Badge>
                {:else}
                  <Badge variant="destructive">Actif</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class="font-mono text-sm">{error.email}</Table.Cell>
              <Table.Cell class="font-mono text-xs"
                >{error.attemptedExtId}</Table.Cell
              >
              <Table.Cell class="font-mono text-xs"
                >{error.existingExtId ?? '—'}</Table.Cell
              >
              <Table.Cell class="font-bold">{error.talentName}</Table.Cell>
              <Table.Cell>
                {#if error.eventName}
                  <div class="font-bold">{error.eventName}</div>
                  <div class="text-xs text-muted-foreground">
                    {error.campusName ?? '—'}
                  </div>
                {:else}
                  <span class="font-mono text-xs"
                    >{error.eventExtId ?? '—'}</span
                  >
                {/if}
              </Table.Cell>
              <Table.Cell class="text-center font-bold"
                >{error.occurrenceCount}</Table.Cell
              >
              <Table.Cell>{formatDateTimeFr(error.lastOccurredAt)}</Table.Cell>
              <Table.Cell class="text-right">
                {#if !error.resolved}
                  <form
                    method="POST"
                    action="?/resolve"
                    use:enhance={() =>
                      async ({ result, update }) => {
                        if (result.type === 'success') {
                          toast.success('Erreur résolue');
                          await update();
                        } else {
                          toast.error('Une erreur est survenue');
                        }
                      }}
                  >
                    <input type="hidden" name="id" value={error.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      class="gap-1"
                    >
                      <Check class="h-3 w-3" />
                      Résoudre
                    </Button>
                  </form>
                {:else}
                  <span class="text-xs text-muted-foreground"
                    >{formatDateTimeFr(error.resolvedAt ?? undefined)}</span
                  >
                {/if}
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={9} class="py-12 text-center">
                <div
                  class="flex flex-col items-center gap-2 text-muted-foreground"
                >
                  <TriangleAlert class="h-8 w-8 opacity-30" />
                  <p class="text-sm font-bold">
                    Aucune erreur de synchronisation.
                  </p>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</div>
