<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Avatar from '$lib/components/ui/avatar';
  import { ArrowRight, Eye, ShieldCheck, Users } from '@lucide/svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';

  let { data }: { data: PageData } = $props();

  let totalPending = $derived(
    data.rows.reduce((sum, r) => sum + r.pendingCount, 0),
  );
  let totalObserved = $derived(
    data.rows.reduce((sum, r) => sum + r.observedCount, 0),
  );

  let onlyPending = $state(true);
  let visibleRows = $derived(
    onlyPending ? data.rows.filter((r) => r.pendingCount > 0) : data.rows,
  );

  function getInitials(prenom: string, nom: string) {
    return ((nom?.[0] ?? '') + (prenom?.[0] ?? '')).toUpperCase();
  }
</script>

<div class="mx-auto max-w-5xl space-y-6 p-6">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      {
        label: data.event.titre,
        href: resolve(`/staff/pedago/events/${data.event.id}`),
      },
      { label: 'Validation' },
    ]}
  />

  <header class="space-y-1">
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Validation des observables
    </h1>
    <p class="text-sm text-muted-foreground">
      {data.event.titre}
    </p>
  </header>

  <div class="grid gap-3 sm:grid-cols-3">
    <div class="rounded-sm border bg-card p-4">
      <div class="flex items-center gap-3">
        <Users class="h-7 w-7 text-muted-foreground" />
        <div>
          <div class="text-2xl font-black">{data.rows.length}</div>
          <div
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            Talents inscrits
          </div>
        </div>
      </div>
    </div>
    <div class="rounded-sm border bg-card p-4">
      <div class="flex items-center gap-3">
        <Eye
          class="h-7 w-7 {totalPending > 0
            ? 'text-amber-500'
            : 'text-muted-foreground'}"
        />
        <div>
          <div
            class="text-2xl font-black {totalPending > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'}"
          >
            {totalPending}
          </div>
          <div
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            Observables en attente
          </div>
        </div>
      </div>
    </div>
    <div class="rounded-sm border bg-card p-4">
      <div class="flex items-center gap-3">
        <ShieldCheck class="h-7 w-7 text-emerald-500" />
        <div>
          <div class="text-2xl font-black">{totalObserved}</div>
          <div
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            Observables validés
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="flex items-center justify-end">
    <label
      class="flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase"
    >
      <input type="checkbox" bind:checked={onlyPending} />
      Masquer les talents sans observables en attente
    </label>
  </div>

  {#if visibleRows.length === 0}
    <div
      class="rounded-sm border border-dashed border-border bg-muted/10 py-10 text-center text-sm text-muted-foreground"
    >
      {#if data.rows.length === 0}
        Aucun talent inscrit à cet événement.
      {:else}
        Aucun talent n'a d'observable en attente.
      {/if}
    </div>
  {:else}
    <div class="space-y-2">
      {#each visibleRows as row (row.talentId)}
        <a
          href={resolve(
            `/staff/pedago/events/${data.event.id}/validation/${row.talentId}`,
          )}
          class="flex items-center gap-4 rounded-sm border bg-card p-3 transition-colors hover:border-epi-blue/50"
        >
          <Avatar.Root class="h-10 w-10 border-2 border-muted">
            <Avatar.Fallback class="bg-muted text-xs font-bold">
              {getInitials(row.prenom, row.nom)}
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="min-w-0 flex-1">
            <div
              class="flex items-center gap-2 truncate text-sm font-bold tracking-tight uppercase"
            >
              {row.nom}
              <span class="capitalize">{row.prenom}</span>
              {#if !row.isPresent}
                <Badge variant="outline" class="text-[10px]">Absent</Badge>
              {/if}
            </div>
            <div
              class="mt-0.5 flex items-center gap-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
            >
              <span class="flex items-center gap-1">
                <Eye
                  class="h-3 w-3 {row.pendingCount > 0 ? 'text-amber-500' : ''}"
                />
                {row.pendingCount} en attente
              </span>
              <span class="opacity-30">·</span>
              <span class="flex items-center gap-1">
                <ShieldCheck
                  class="h-3 w-3 {row.observedCount > 0
                    ? 'text-emerald-500'
                    : ''}"
                />
                {row.observedCount} validés
              </span>
            </div>
          </div>
          {#if row.pendingCount > 0}
            <Badge
              variant="default"
              class="bg-amber-500 text-white hover:bg-amber-500"
            >
              {row.pendingCount}
            </Badge>
          {/if}
          <ArrowRight class="h-4 w-4 text-muted-foreground" />
        </a>
      {/each}
    </div>
  {/if}

  <div class="pt-4">
    <Button
      variant="outline"
      size="sm"
      href={resolve(`/staff/pedago/events/${data.event.id}`)}
    >
      Retour à l'événement
    </Button>
  </div>
</div>
