<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import {
    FileText,
    Zap,
    BookOpenText,
    ExternalLink,
    Clock,
  } from '@lucide/svelte';
  import { activityTypeLabels } from '$lib/validation/templates';

  let { data } = $props();

  let selectedTemplate = $state<any>(null);
  let dialogOpen = $state(false);

  function openTemplate(template: any) {
    selectedTemplate = template;
    dialogOpen = true;
  }
</script>

<div class="space-y-6">
  <PageHeader
    title="Bibliothèque"
    subtitle="Ressources pédagogiques, sujets et corrections pour les Mantas."
  />

  <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {#each data.templates as template}
      <Card.Root
        class="flex cursor-pointer flex-col shadow-sm transition-all hover:border-epi-blue hover:shadow-md"
        onclick={() => openTemplate(template)}
      >
        <Card.Header class="pb-2">
          <div class="flex items-start gap-2">
            <div class="mt-1 shrink-0">
              {#if template.isDynamic}
                <Zap class="h-4 w-4 text-epi-orange" />
              {:else}
                <FileText class="h-4 w-4 text-muted-foreground" />
              {/if}
            </div>
            <Card.Title class="text-base leading-tight"
              >{template.nom}</Card.Title
            >
          </div>
        </Card.Header>
        <Card.Content class="flex-1 py-2">
          <div class="flex flex-wrap gap-1">
            <Badge variant="secondary" class="text-[9px] uppercase">
              {activityTypeLabels[
                template.activityType as keyof typeof activityTypeLabels
              ] || template.activityType}
            </Badge>
            {#if template.difficulte}
              <Badge
                variant="outline"
                class="border-epi-blue text-[9px] text-blue-700 uppercase dark:text-blue-300"
              >
                {template.difficulte}
              </Badge>
            {/if}
            {#each template.activityTemplateThemes as att}
              <Badge
                variant="secondary"
                class="text-[9px] text-muted-foreground lowercase"
              >
                #{att.theme.nom}
              </Badge>
            {/each}
          </div>
          {#if template.defaultDuration}
            <div
              class="mt-3 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
            >
              <Clock class="h-3 w-3" />
              {template.defaultDuration} min
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {:else}
      <div
        class="col-span-full py-12 text-center border-2 border-dashed rounded-lg bg-muted/10"
      >
        <p class="text-muted-foreground">Aucune ressource disponible.</p>
      </div>
    {/each}
  </div>
</div>

<!-- Modal de lecture de contenu -->
<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content
    class="flex h-[85vh] flex-col overflow-hidden p-0 sm:max-w-3xl"
  >
    {#if selectedTemplate}
      <div
        class="flex shrink-0 items-center justify-between border-b bg-muted/20 px-6 py-4"
      >
        <div class="flex items-center gap-3">
          <BookOpenText class="h-5 w-5 text-epi-blue" />
          <h2 class="text-xl font-bold uppercase">{selectedTemplate.nom}</h2>
        </div>
        {#if selectedTemplate.link}
          <Button
            variant="outline"
            size="sm"
            href={selectedTemplate.link}
            target="_blank"
            rel="noopener noreferrer"
            class="gap-2"
          >
            Support externe <ExternalLink class="h-3.5 w-3.5" />
          </Button>
        {/if}
      </div>

      <ScrollArea class="flex-1 p-6">
        {#if selectedTemplate.isDynamic}
          <div class="space-y-4">
            <h3 class="flex items-center gap-2 font-bold text-epi-orange">
              <Zap class="h-4 w-4" /> Activité Dynamique (Étapes)
            </h3>
            <pre
              class="overflow-x-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-slate-300">{JSON.stringify(
                selectedTemplate.contentStructure,
                null,
                2,
              )}</pre>
          </div>
        {:else if selectedTemplate.content}
          <div class="markdown-content">
            <!-- Rendering raw in a <pre>: no markdown lib (marked/mdsvex), so the original formatting is preserved. -->
            <pre
              class="font-sans text-sm leading-relaxed whitespace-pre-wrap">{selectedTemplate.content}</pre>
          </div>
        {:else}
          <div
            class="flex flex-col items-center justify-center py-20 text-muted-foreground"
          >
            <FileText class="mb-2 h-10 w-10 opacity-50" />
            <p>Aucun contenu texte renseigné pour cet atelier.</p>
          </div>
        {/if}
      </ScrollArea>
    {/if}
  </Dialog.Content>
</Dialog.Root>
