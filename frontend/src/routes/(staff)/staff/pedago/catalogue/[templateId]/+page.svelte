<script lang="ts">
  import type { PageData } from './$types';
  import { renderMarkdown } from '$lib/markdown';
  import { resolve } from '$app/paths';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import {
    ExternalLink,
    FlaskConical,
    Zap,
    FileText,
    Clock,
    CirclePlay,
    BookOpenCheck,
    Eye,
    CircleCheck,
  } from '@lucide/svelte';
  import { activityTypeLabels } from '$lib/validation/templates';
  import type {
    ActivityStep,
    ActivityStructure,
  } from '$lib/server/services/progressService';

  let { data }: { data: PageData } = $props();
  let template = $derived(data.template);

  let content = $derived(
    (template.contentStructure as ActivityStructure | null) ?? { steps: [] },
  );
  let steps = $derived<ActivityStep[]>(content.steps ?? []);

  let showCorrections = $state(false);

  let staticHtml = $derived(
    !template.isDynamic && template.content
      ? renderMarkdown(template.content)
      : '',
  );

  function stepHtml(step: ActivityStep) {
    return step.content_markdown ? renderMarkdown(step.content_markdown) : '';
  }

  const stepTypeLabel: Record<ActivityStep['type'], string> = {
    theory: 'Théorie',
    exercise: 'Exercice',
    checkpoint: 'Validation',
  };
</script>

<div class="space-y-6">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      { label: 'Bibliothèque', href: resolve('/staff/pedago/catalogue') },
      { label: template.nom },
    ]}
  />

  <PageHeader
    title={template.nom}
    subtitle={template.description ?? undefined}
    titleViewTransitionName={`tpl-title-${template.id}`}
  >
    {#if template.link}
      <Button
        variant="outline"
        size="sm"
        href={template.link}
        target="_blank"
        rel="noopener noreferrer"
        class="gap-2"
      >
        Support externe <ExternalLink class="h-3.5 w-3.5" />
      </Button>
    {/if}
    <Button
      size="sm"
      href={resolve(`/staff/pedago/catalogue/${template.id}/practice`)}
      class="gap-2 bg-epi-blue text-white hover:bg-epi-blue/90"
    >
      <FlaskConical class="h-3.5 w-3.5" />
      S'exercer sur ce sujet
    </Button>
  </PageHeader>

  <div class="flex flex-wrap items-center gap-2">
    <Badge
      variant="secondary"
      class="gap-1.5 px-2 py-0.5 text-[10px] uppercase"
    >
      {#if template.isDynamic}
        <Zap class="h-3 w-3 text-epi-orange" /> Dynamique
      {:else}
        <FileText class="h-3 w-3" /> Lecture
      {/if}
    </Badge>
    <Badge variant="secondary" class="px-2 py-0.5 text-[10px] uppercase">
      {activityTypeLabels[
        template.activityType as keyof typeof activityTypeLabels
      ] ?? template.activityType}
    </Badge>
    {#if template.difficulte}
      <Badge
        variant="outline"
        class="border-epi-blue px-2 py-0.5 text-[10px] text-blue-700 uppercase dark:text-blue-300"
      >
        {template.difficulte}
      </Badge>
    {/if}
    {#if template.defaultDuration}
      <Badge variant="outline" class="gap-1 px-2 py-0.5 text-[10px] uppercase">
        <Clock class="h-3 w-3" />
        {template.defaultDuration} min
      </Badge>
    {/if}
    {#each template.activityTemplateThemes as att}
      <Badge
        variant="secondary"
        class="px-2 py-0.5 text-[10px] text-muted-foreground lowercase"
      >
        #{att.theme.nom}
      </Badge>
    {/each}
  </div>

  {#if template.isDynamic}
    <div
      class="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50"
    >
      <div
        class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
      >
        <Eye class="h-4 w-4" />
        <span class="font-bold uppercase">Corrections</span>
        <span class="text-xs text-muted-foreground normal-case">
          Révèle les bonnes réponses des QCM et les codes de validation Manta.
        </span>
      </div>
      <div class="flex items-center gap-2">
        <Label
          for="detail-corrections"
          class="cursor-pointer text-xs font-bold text-slate-600 uppercase dark:text-slate-300"
        >
          {showCorrections ? 'Affichées' : 'Masquées'}
        </Label>
        <Switch id="detail-corrections" bind:checked={showCorrections} />
      </div>
    </div>
  {/if}

  {#if !template.isDynamic}
    {#if staticHtml}
      <Card.Root class="shadow-sm">
        <Card.Content class="p-6 md:p-8">
          <div
            class="prose max-w-none text-base leading-relaxed prose-slate dark:prose-invert"
          >
            {@html staticHtml}
          </div>
        </Card.Content>
      </Card.Root>
    {:else}
      <Card.Root class="border-dashed shadow-none">
        <Card.Content
          class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
        >
          <FileText class="mb-2 h-10 w-10 opacity-50" />
          <p>Aucun contenu texte renseigné pour ce sujet.</p>
        </Card.Content>
      </Card.Root>
    {/if}
  {:else if steps.length === 0}
    <Card.Root class="border-dashed shadow-none">
      <Card.Content
        class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
      >
        <Zap class="mb-2 h-10 w-10 opacity-50" />
        <p>Ce sujet dynamique n'a pas encore d'étapes définies.</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="space-y-4">
      {#each steps as step, i (step.id)}
        <Card.Root class="shadow-sm">
          <Card.Header class="gap-2">
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-epi-teal-solid/10 text-sm font-bold text-epi-teal-solid"
              >
                {i + 1}
              </div>
              <Card.Title class="flex-1 text-lg leading-tight">
                {step.title}
              </Card.Title>
              <Badge variant="secondary" class="text-[10px] uppercase">
                {stepTypeLabel[step.type] ?? step.type}
              </Badge>
            </div>
          </Card.Header>
          <Card.Content class="space-y-6 pt-0">
            {#if step.content_markdown}
              <div
                class="prose max-w-none text-sm leading-relaxed prose-slate dark:prose-invert"
              >
                {@html stepHtml(step)}
              </div>
            {/if}

            {#if step.validation?.type === 'auto_qcm' && step.validation.qcm_data}
              {@const qcm = step.validation.qcm_data}
              <div
                class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50"
              >
                <div
                  class="mb-3 flex items-center gap-2 text-xs font-bold text-epi-blue uppercase"
                >
                  <CirclePlay class="h-4 w-4" /> QCM automatique
                </div>
                <p
                  class="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {qcm.question}
                </p>
                <ul class="space-y-1.5">
                  {#each qcm.options as option, idx}
                    {@const isCorrect = idx === qcm.correct_index}
                    <li
                      class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors {showCorrections &&
                      isCorrect
                        ? 'border-epi-teal-solid bg-epi-teal-solid/10 text-epi-teal-solid'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}"
                    >
                      {#if showCorrections && isCorrect}
                        <CircleCheck class="h-4 w-4" />
                      {:else}
                        <span
                          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400 dark:border-slate-600"
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                      {/if}
                      <span>{option}</span>
                    </li>
                  {/each}
                </ul>
                {#if !showCorrections}
                  <p
                    class="mt-3 text-[10px] font-bold text-muted-foreground uppercase"
                  >
                    Active "Corrections" pour voir la bonne réponse.
                  </p>
                {/if}
              </div>
            {:else if step.validation?.type === 'manual_manta'}
              <div
                class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50"
              >
                <div
                  class="mb-2 flex items-center gap-2 text-xs font-bold text-epi-orange uppercase"
                >
                  <BookOpenCheck class="h-4 w-4" /> Validation Manta
                </div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  En événement réel, le Camper appelle un Manta et saisit un PIN
                  local pour débloquer l'étape.
                </p>
                {#if step.validation.unlock_code}
                  {#if showCorrections}
                    <div
                      class="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-100"
                    >
                      <Eye class="h-3 w-3" />
                      Code : {step.validation.unlock_code}
                    </div>
                  {:else}
                    <p
                      class="mt-3 text-[10px] font-bold text-muted-foreground uppercase"
                    >
                      Un code de secours est défini. Active "Corrections" pour
                      l'afficher.
                    </p>
                  {/if}
                {/if}
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
