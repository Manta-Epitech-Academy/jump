<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { CircleCheck, Eye } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';

  let { data, form }: { data: PageData; form: any } = $props();

  let groupedBySubject = $derived.by(() => {
    const map = new Map<string, typeof data.pending>();
    for (const p of data.pending) {
      const list = map.get(p.projectSlug) ?? [];
      list.push(p);
      map.set(p.projectSlug, list);
    }
    return map;
  });

  $effect(() => {
    if (form?.success) {
      toast.success(
        form.newlyCertifiedCount > 0
          ? `Observable validé — ${form.newlyCertifiedCount} compétence${form.newlyCertifiedCount > 1 ? 's' : ''} certifiée${form.newlyCertifiedCount > 1 ? 's' : ''} !`
          : 'Observable validé.',
      );
    } else if (form?.message) {
      toast.error(form.message);
    }
  });
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      {
        label: data.event.titre,
        href: resolve(`/staff/pedago/events/${data.event.id}`),
      },
      {
        label: 'Validation',
        href: resolve(`/staff/pedago/events/${data.event.id}/validation`),
      },
      { label: `${data.talent.prenom} ${data.talent.nom}` },
    ]}
  />

  <header class="space-y-1">
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Observables à valider
    </h1>
    <p class="text-sm text-muted-foreground">
      {data.talent.prenom}
      {data.talent.nom} — {data.event.titre}
    </p>
  </header>

  {#if data.pending.length === 0}
    <div
      class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center dark:border-slate-800 dark:bg-slate-950/50"
    >
      <CircleCheck class="mx-auto mb-3 h-10 w-10 text-emerald-500" />
      <p class="font-bold uppercase">Aucun observable en attente</p>
      <p class="text-sm text-muted-foreground">
        Le talent n'a aucun observable en attente de validation pour cet
        événement.
      </p>
    </div>
  {:else}
    {#each [...groupedBySubject.entries()] as [slug, items] (slug)}
      <section class="space-y-3">
        <h2
          class="font-bold tracking-wider text-slate-700 uppercase dark:text-slate-200"
        >
          Sujet : {slug}
        </h2>
        <div class="space-y-2">
          {#each items as obs (obs.observableId)}
            <article
              class="flex items-start gap-4 rounded-xl border bg-card p-4"
            >
              <div class="flex-1 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {obs.skillName} · {obs.level}
                  </Badge>
                  <span class="text-xs text-muted-foreground">
                    Observable #{obs.externalId}
                  </span>
                </div>
                <p class="text-sm">{obs.observableDesc}</p>
                {#if obs.sectionTitle && obs.documentPath}
                  <p class="text-xs text-muted-foreground">
                    Section : <span class="font-medium">{obs.sectionTitle}</span
                    >
                    ({obs.documentPath})
                  </p>
                {/if}
              </div>
              <form method="POST" action="?/validate" use:enhance>
                <input
                  type="hidden"
                  name="observableId"
                  value={obs.observableId}
                />
                <Button type="submit" class="gap-2">
                  <Eye class="h-4 w-4" />
                  Valider
                </Button>
              </form>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>
