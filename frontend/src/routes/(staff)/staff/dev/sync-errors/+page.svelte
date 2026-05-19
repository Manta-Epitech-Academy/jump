<script lang="ts">
  import { enhance } from '$app/forms';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import Check from '@lucide/svelte/icons/check';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudUpload from '@lucide/svelte/icons/cloud-upload';
  import Phone from '@lucide/svelte/icons/phone';
  import Mail from '@lucide/svelte/icons/mail';
  import UserX from '@lucide/svelte/icons/user-x';
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { formatDateTimeFr, cn } from '$lib/utils';
  import { salesforceContactUrl } from '$lib/domain/salesforce';
  import { toast } from 'svelte-sonner';
  import { track } from '$lib/analytics';

  type Contact = {
    extId: string;
    prenom: string | null;
    nom: string | null;
    phone: string | null;
  };

  let { data } = $props();
</script>

{#snippet contactSub(
  title: string,
  icon: 'upload' | 'cloud',
  accent: string,
  contact: Contact,
)}
  <Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
    <Card.Header class="border-b bg-muted/30 pt-3 pb-3">
      <Card.Title
        class="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        {#if icon === 'upload'}
          <CloudUpload class={cn('h-3.5 w-3.5', accent)} />
        {:else}
          <Cloud class={cn('h-3.5 w-3.5', accent)} />
        {/if}
        {title}
      </Card.Title>
    </Card.Header>
    <Card.Content class="space-y-3 pt-4">
      <div class="space-y-1">
        <h4
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Identité
        </h4>
        <p class="text-sm font-bold">
          {#if contact.prenom || contact.nom}
            {`${contact.prenom ?? ''} ${contact.nom ?? ''}`.trim()}
          {:else}
            <span class="text-muted-foreground italic">Inconnue</span>
          {/if}
        </p>
      </div>
      <div class="space-y-1">
        <h4
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Téléphone
        </h4>
        {#if contact.phone}
          <a
            href={`tel:${contact.phone.replace(/\s+/g, '')}`}
            class="group flex items-center gap-2 text-sm transition-colors hover:text-epi-blue"
          >
            <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{contact.phone}</span>
          </a>
        {:else}
          <p
            class="flex items-center gap-2 text-sm text-muted-foreground italic"
          >
            <Phone class="h-4 w-4 shrink-0" />
            Non renseigné
          </p>
        {/if}
      </div>
      <div class="space-y-1">
        <h4
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Identifiant Salesforce
        </h4>
        <p class="font-mono text-xs break-all text-muted-foreground">
          {contact.extId}
        </p>
      </div>
      <a
        href={salesforceContactUrl(contact.extId)}
        target="_blank"
        rel="noopener noreferrer"
        class="block pt-1"
      >
        <Button variant="outline" size="sm" class="w-full gap-2 rounded-sm">
          <Cloud class="h-3.5 w-3.5" />
          Ouvrir dans Salesforce
        </Button>
      </a>
    </Card.Content>
  </Card.Root>
{/snippet}

<svelte:head>
  <title>Doublons Salesforce</title>
</svelte:head>

<div class="space-y-6 pb-12">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      { label: 'Doublons Salesforce' },
    ]}
  />
  <PageHeader
    title="Doublons Salesforce"
    subtitle="Conflits de synchronisation détectés sur votre campus."
  />

  {#if data.errors.length === 0}
    <Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
      <Card.Content
        class="flex flex-col items-center gap-3 py-16 text-muted-foreground"
      >
        <TriangleAlert class="h-10 w-10 opacity-30" />
        <p class="text-sm font-bold tracking-wider uppercase">
          Aucun doublon à traiter
        </p>
        <p class="text-xs">Votre campus est en sync avec Salesforce.</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="grid gap-4 xl:grid-cols-2">
      {#each data.errors as err (err.id)}
        <Card.Root
          class={cn(
            'rounded-sm border shadow-sm dark:shadow-none',
            err.isStage && 'border-l-4 border-l-destructive',
          )}
        >
          <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-1.5">
                <div class="flex flex-wrap items-center gap-2">
                  {#if err.isStage}
                    <Badge
                      class="gap-1 rounded-sm bg-destructive/10 px-2 py-0 text-[10px] font-bold tracking-widest text-destructive uppercase hover:bg-destructive/10"
                    >
                      <TriangleAlert class="h-3 w-3" /> Urgent
                    </Badge>
                  {:else}
                    <Badge
                      class="gap-1 rounded-sm bg-epi-orange/10 px-2 py-0 text-[10px] font-bold tracking-widest text-epi-orange uppercase hover:bg-epi-orange/10"
                    >
                      <AlertCircle class="h-3 w-3" /> Problématique
                    </Badge>
                  {/if}
                  {#if err.eventName}
                    <span
                      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                    >
                      {err.eventName}
                    </span>
                  {/if}
                </div>
                <div
                  class="flex items-center gap-2 font-mono text-base font-bold break-all text-epi-blue"
                >
                  <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
                  {err.email}
                </div>
                <p class="text-xs text-muted-foreground">
                  {err.occurrenceCount} occurrence{err.occurrenceCount > 1
                    ? 's'
                    : ''} · Dernière : {formatDateTimeFr(err.lastOccurredAt)}
                </p>
              </div>
              <form
                method="POST"
                action="?/resolve"
                use:enhance={() =>
                  async ({ result, update }) => {
                    if (result.type === 'success') {
                      track('sync_error_resolved');
                      toast.success('Doublon résolu');
                      await update();
                    } else {
                      toast.error('Une erreur est survenue');
                    }
                  }}
              >
                <input type="hidden" name="id" value={err.id} />
                <Button
                  type="submit"
                  size="sm"
                  class="gap-2 rounded-sm bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
                >
                  <Check class="h-3.5 w-3.5" />
                  Marquer comme résolu
                </Button>
              </form>
            </div>
          </Card.Header>
          <Card.Content class="p-4">
            <div
              class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
            >
              {@render contactSub(
                'Tenté · Nouveau',
                'upload',
                'text-epi-pink',
                err.attempted,
              )}
              {#if err.existing}
                {@render contactSub(
                  'Existant · Base actuelle',
                  'cloud',
                  'text-epi-teal',
                  err.existing,
                )}
              {:else}
                <div
                  class="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed bg-muted/20 py-6 text-muted-foreground"
                >
                  <UserX class="h-5 w-5 opacity-50" />
                  <p class="text-[10px] font-bold tracking-widest uppercase">
                    Aucun talent existant identifié
                  </p>
                </div>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
