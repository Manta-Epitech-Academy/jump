<script lang="ts">
  import { enhance } from '$app/forms';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Check from '@lucide/svelte/icons/check';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
  import SalesforceIconLink from '$lib/components/salesforce/SalesforceIconLink.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import * as Table from '$lib/components/ui/table';
  import { formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import { track, daysBetween } from '$lib/analytics';

  let { data } = $props();

  let filterCampus = $state<string>('all');

  const campusFilterOptions = $derived([
    { value: 'all', label: 'Tous les campus' },
    ...data.campusNames.map((name: string) => ({ value: name, label: name })),
  ]);

  const filteredErrors = $derived(
    data.errors.filter((e) => {
      if (filterCampus !== 'all' && e.campusName !== filterCampus) return false;
      return true;
    }),
  );

  // "Tout résoudre" clears every unresolved row in the DB, not just the ones
  // on screen — only offer it on the unfiltered view so a narrowed list can't
  // mislead an admin into a global wipe.
  const isFiltered = $derived(filterCampus !== 'all');
  // When filtered, the active filter *is* the selection: resolve exactly the
  // unresolved rows currently on screen.
  const filteredUnresolved = $derived(
    filteredErrors.filter((e) => !e.resolved),
  );
</script>

<svelte:head>
  <title>Erreurs de sync</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Erreurs de <span class="text-epi-tomorrow">Sync</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Conflits détectés lors de la synchronisation Worker
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <FilterSelect
        options={campusFilterOptions}
        value={filterCampus}
        onChange={(v) => (filterCampus = v)}
        ariaLabel="Filtrer par campus"
        triggerClass="text-xs"
      />

      {#if data.unresolvedCount > 0 && !isFiltered}
        <form
          method="POST"
          action="?/resolveAll"
          use:enhance={() =>
            async ({ result, update }) => {
              if (result.type === 'success') {
                const unresolved = data.errors.filter((e) => !e.resolved);
                const oldestDaysOpen = unresolved
                  .map((e) => daysBetween(e.createdAt) ?? 0)
                  .reduce((max, d) => (d > max ? d : max), 0);
                track('sync_errors_resolved_all', {
                  count: data.unresolvedCount,
                  oldestDaysOpen,
                });
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

      {#if isFiltered && filteredUnresolved.length > 0}
        <form
          method="POST"
          action="?/resolveSelected"
          use:enhance={() =>
            async ({ result, update }) => {
              if (result.type === 'success') {
                track('sync_errors_resolved_selected', {
                  count: filteredUnresolved.length,
                });
                toast.success('Erreurs filtrées résolues');
                await update();
              } else {
                toast.error('Une erreur est survenue');
              }
            }}
        >
          {#each filteredUnresolved as e (e.id)}
            <input type="hidden" name="ids" value={e.id} />
          {/each}
          <Button type="submit" variant="outline" class="gap-2">
            <Check class="h-4 w-4" />
            Résoudre les {filteredUnresolved.length} affichés
          </Button>
        </form>
      {/if}
    </div>
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
          {#each filteredErrors as error}
            <Table.Row class={error.resolved ? 'opacity-50' : ''}>
              <Table.Cell>
                {#if error.resolved}
                  <Badge variant="secondary">Résolu</Badge>
                {:else}
                  <Badge variant="destructive">Actif</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class="font-mono text-sm">{error.email}</Table.Cell>
              <Table.Cell class="font-mono text-xs">
                <span class="inline-flex items-center gap-1">
                  {error.attemptedExtId}
                  <SalesforceIconLink
                    externalId={error.attemptedExtId}
                    kind="lead"
                    label="Ouvrir l'extId tenté dans Salesforce"
                  />
                </span>
              </Table.Cell>
              <Table.Cell class="font-mono text-xs">
                {#if error.existingExtId}
                  <span class="inline-flex items-center gap-1">
                    {error.existingExtId}
                    <SalesforceIconLink
                      externalId={error.existingExtId}
                      kind="lead"
                      label="Ouvrir l'extId existant dans Salesforce"
                    />
                  </span>
                {:else}
                  —
                {/if}
              </Table.Cell>
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
                  <div class="flex items-center justify-end gap-1">
                    {#if error.existingExtId}
                      <form
                        method="POST"
                        action="?/rebind"
                        use:enhance={({ cancel }) => {
                          // Migrer extId means flipping the talent's identity
                          // in our DB — confirm explicitly so an admin doesn't
                          // misclick from a row that's actually a real email
                          // collision between two people.
                          const ok = confirm(
                            `Migrer le talent "${error.talentName}" (${error.email})\n` +
                              `  de extId ${error.existingExtId}\n` +
                              `  vers extId ${error.attemptedExtId} ?\n\n` +
                              `À utiliser quand Salesforce a régénéré l'ID pour la même personne. Non destructif.`,
                          );
                          if (!ok) {
                            cancel();
                            return;
                          }
                          return async ({ result, update }) => {
                            if (result.type === 'success') {
                              track('sync_error_rebound', {
                                occurrenceCount: error.occurrenceCount,
                                daysOpen: daysBetween(error.createdAt),
                              });
                              toast.success('extId migré, erreur résolue.');
                              await update();
                            } else if (result.type === 'failure') {
                              const data = result.data as
                                | { rebindError?: string }
                                | undefined;
                              toast.error(
                                data?.rebindError ?? 'Migration impossible.',
                              );
                            } else {
                              toast.error('Une erreur est survenue');
                            }
                          };
                        }}
                      >
                        <input type="hidden" name="id" value={error.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          class="gap-1"
                        >
                          <ArrowRightLeft class="h-3 w-3" />
                          Migrer extId
                        </Button>
                      </form>
                    {/if}
                    <form
                      method="POST"
                      action="?/resolve"
                      use:enhance={() =>
                        async ({ result, update }) => {
                          if (result.type === 'success') {
                            track('sync_error_resolved', {
                              occurrenceCount: error.occurrenceCount,
                              daysOpen: daysBetween(error.createdAt),
                              surface: 'admin',
                            });
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
                  </div>
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
