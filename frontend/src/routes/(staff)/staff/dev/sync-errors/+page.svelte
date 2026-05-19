<script lang="ts">
  import { enhance } from '$app/forms';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import Check from '@lucide/svelte/icons/check';
  import CloudUpload from '@lucide/svelte/icons/cloud-upload';
  import Phone from '@lucide/svelte/icons/phone';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { formatDateTimeFr } from '$lib/utils';
  import { salesforceContactUrl } from '$lib/domain/salesforce';
  import { toast } from 'svelte-sonner';
  import { track } from '$lib/analytics';

  let { data } = $props();
</script>

<svelte:head>
  <title>Doublons Salesforce</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Doublons <span class="text-epi-pink">Salesforce</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Conflits de synchronisation sur votre campus
    </p>
  </div>

  {#if data.errors.length === 0}
    <Card.Root>
      <Card.Content
        class="flex flex-col items-center gap-2 py-16 text-muted-foreground"
      >
        <TriangleAlert class="h-8 w-8 opacity-30" />
        <p class="text-sm font-bold">Aucune erreur de synchronisation.</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="space-y-4">
      {#each data.errors as err (err.id)}
        <Card.Root class={err.isStage ? 'border-destructive' : ''}>
          <Card.Header class="flex flex-row items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                {#if err.isStage}
                  <Badge variant="destructive" class="gap-1">
                    <TriangleAlert class="h-3 w-3" /> Urgent
                  </Badge>
                {:else}
                  <Badge variant="secondary" class="gap-1">
                    <AlertCircle class="h-3 w-3" /> Problématique
                  </Badge>
                {/if}
                {#if err.eventName}
                  <span class="text-xs text-muted-foreground"
                    >{err.eventName}</span
                  >
                {/if}
              </div>
              <Card.Title class="font-mono text-lg break-all">
                {err.email}
              </Card.Title>
              <p class="text-xs text-muted-foreground">
                {err.occurrenceCount} occurrence{err.occurrenceCount > 1
                  ? 's'
                  : ''} · dernière : {formatDateTimeFr(err.lastOccurredAt)}
              </p>
            </div>
            <form
              method="POST"
              action="?/resolve"
              use:enhance={() =>
                async ({ result, update }) => {
                  if (result.type === 'success') {
                    track('sync_error_resolved');
                    toast.success('Erreur résolue');
                    await update();
                  } else {
                    toast.error('Une erreur est survenue');
                  }
                }}
            >
              <input type="hidden" name="id" value={err.id} />
              <Button type="submit" variant="outline" size="sm" class="gap-1">
                <Check class="h-3 w-3" /> Marquer comme résolu
              </Button>
            </form>
          </Card.Header>
          <Card.Content>
            <div class="grid gap-3 sm:grid-cols-2">
              <!-- Tenté (Salesforce) -->
              <Card.Root class="bg-muted/40">
                <Card.Header class="pb-2">
                  <Card.Description
                    class="text-[10px] font-bold tracking-wider uppercase"
                  >
                    Tenté (Salesforce)
                  </Card.Description>
                </Card.Header>
                <Card.Content class="space-y-2 pt-0 text-sm">
                  <div class="font-bold">
                    {err.attempted.prenom}
                    {err.attempted.nom}
                  </div>
                  <div
                    class="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Phone class="h-3 w-3" />
                    <span>{err.attempted.phone ?? '—'}</span>
                  </div>
                  <div class="font-mono text-xs text-muted-foreground">
                    {err.attempted.extId}
                  </div>
                  <a
                    href={salesforceContactUrl(err.attempted.extId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block"
                  >
                    <Button variant="outline" size="sm" class="w-full gap-1">
                      <CloudUpload class="h-3 w-3" /> Ouvrir dans Salesforce
                    </Button>
                  </a>
                </Card.Content>
              </Card.Root>

              <!-- Existant (Base actuelle) -->
              {#if err.existing}
                <Card.Root class="bg-muted/40">
                  <Card.Header class="pb-2">
                    <Card.Description
                      class="text-[10px] font-bold tracking-wider uppercase"
                    >
                      Existant (Base actuelle)
                    </Card.Description>
                  </Card.Header>
                  <Card.Content class="space-y-2 pt-0 text-sm">
                    <div class="font-bold">
                      {err.existing.prenom ?? '?'}
                      {err.existing.nom ?? ''}
                    </div>
                    <div
                      class="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Phone class="h-3 w-3" />
                      <span>{err.existing.phone ?? '—'}</span>
                    </div>
                    <div class="font-mono text-xs text-muted-foreground">
                      {err.existing.extId}
                    </div>
                    <a
                      href={salesforceContactUrl(err.existing.extId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="block"
                    >
                      <Button variant="outline" size="sm" class="w-full gap-1">
                        <CloudUpload class="h-3 w-3" /> Ouvrir dans Salesforce
                      </Button>
                    </a>
                  </Card.Content>
                </Card.Root>
              {:else}
                <Card.Root class="border-dashed bg-muted/20">
                  <Card.Content
                    class="flex items-center justify-center py-6 text-xs text-muted-foreground"
                  >
                    Aucun talent existant identifié
                  </Card.Content>
                </Card.Root>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
