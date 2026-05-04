<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { FileText, Zap, ExternalLink, Clock } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { activityTypeLabels } from '$lib/validation/templates';

  let { data } = $props();

  const difficultyColors: Record<string, string> = {
    Débutant:
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    Intermédiaire:
      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    Avancé:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
</script>

<div class="space-y-6">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      { label: 'Catalogue' },
    ]}
  />
  <PageHeader
    title="Catalogue Epitech"
    subtitle="Fiches descriptives vulgarisées pour argumenter avec les Talents et les parents."
  />

  <div class="rounded-sm border bg-card shadow-sm">
    <Table.Root>
      <Table.Header class="bg-muted/50">
        <Table.Row>
          <Table.Head class="w-64 text-xs font-bold uppercase"
            >Atelier / Contenu</Table.Head
          >
          <Table.Head class="text-xs font-bold uppercase"
            >Domaine & Technologies</Table.Head
          >
          <Table.Head class="w-32 text-center text-xs font-bold uppercase"
            >Durée estimée</Table.Head
          >
          <Table.Head class="text-xs font-bold uppercase"
            >Description (Pitch de vente)</Table.Head
          >
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.templates as template}
          <Table.Row class="hover:bg-muted/20">
            <Table.Cell>
              <div class="flex items-start gap-2">
                {#if template.isDynamic}
                  <Zap class="mt-0.5 h-4 w-4 shrink-0 text-epi-orange" />
                {:else}
                  <FileText
                    class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  />
                {/if}
                <div class="flex flex-col gap-1">
                  <span class="text-sm leading-tight font-bold">
                    {#if template.link}
                      <a
                        href={template.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-1 hover:text-epi-blue hover:underline"
                      >
                        {template.nom}
                        <ExternalLink class="h-3 w-3" />
                      </a>
                    {:else}
                      {template.nom}
                    {/if}
                  </span>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <Badge
                      variant="secondary"
                      class="text-[9px] tracking-wider uppercase"
                      >{activityTypeLabels[template.activityType] ||
                        template.activityType}</Badge
                    >
                    {#if template.difficulte}
                      <span
                        class={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${difficultyColors[template.difficulte] || 'bg-muted'}`}
                      >
                        {template.difficulte}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            </Table.Cell>

            <Table.Cell>
              <div class="flex flex-wrap gap-1.5">
                {#each template.activityTemplateThemes as att}
                  <Badge
                    variant="outline"
                    class="border-epi-teal-solid/30 bg-epi-teal-solid/10 text-[10px] text-epi-teal-solid"
                  >
                    {att.theme.nom}
                  </Badge>
                {/each}
                {#if template.activityTemplateThemes.length === 0}
                  <span class="text-xs text-muted-foreground italic"
                    >Non catégorisé</span
                  >
                {/if}
              </div>
            </Table.Cell>

            <Table.Cell class="text-center">
              {#if template.defaultDuration}
                <div
                  class="inline-flex items-center justify-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  <Clock class="h-3.5 w-3.5" />
                  {template.defaultDuration} min
                </div>
              {:else}
                <span class="text-xs text-muted-foreground">—</span>
              {/if}
            </Table.Cell>

            <Table.Cell>
              <p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {template.description ||
                  'Aucun argumentaire de vente renseigné pour cet atelier.'}
              </p>
            </Table.Cell>
          </Table.Row>
        {:else}
          <Table.Row>
            <Table.Cell
              colspan={4}
              class="py-12 text-center text-muted-foreground"
            >
              Le catalogue officiel est vide pour le moment.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
