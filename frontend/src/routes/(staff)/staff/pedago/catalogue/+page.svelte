<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import {
    FileText,
    Zap,
    Clock,
    Search,
    X,
    ExternalLink,
    Filter,
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { activityTypeLabels } from '$lib/validation/templates';
  import { resolve } from '$app/paths';

  let { data } = $props();

  const DIFFICULTIES = ['Débutant', 'Intermédiaire', 'Avancé'] as const;
  type Difficulty = (typeof DIFFICULTIES)[number];

  const TYPE_KEYS = ['atelier', 'conference', 'quiz', 'special'] as const;
  type TypeKey = (typeof TYPE_KEYS)[number];

  type Format = 'dynamique' | 'lecture';

  let search = $state('');
  let showFilters = $state(false);
  let difficulty = $state<Difficulty | null>(null);
  let type = $state<TypeKey | null>(null);
  let format = $state<Format | null>(null);
  let selectedThemeIds = $state<string[]>([]);

  let allThemes = $derived.by(() => {
    const seen = new Map<string, { id: string; nom: string }>();
    for (const t of data.templates) {
      for (const att of t.activityTemplateThemes) {
        if (!seen.has(att.theme.id))
          seen.set(att.theme.id, { id: att.theme.id, nom: att.theme.nom });
      }
    }
    return [...seen.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  });

  function toggleTheme(id: string) {
    selectedThemeIds = selectedThemeIds.includes(id)
      ? selectedThemeIds.filter((t) => t !== id)
      : [...selectedThemeIds, id];
  }

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return data.templates.filter((t) => {
      if (difficulty && t.difficulte !== difficulty) return false;
      if (type && t.activityType !== type) return false;
      if (format === 'dynamique' && !t.isDynamic) return false;
      if (format === 'lecture' && t.isDynamic) return false;
      if (selectedThemeIds.length > 0) {
        const themeIds = t.activityTemplateThemes.map((a) => a.theme.id);
        if (!selectedThemeIds.every((id) => themeIds.includes(id)))
          return false;
      }
      if (q) {
        const haystack = [
          t.nom,
          ...t.activityTemplateThemes.map((a) => a.theme.nom),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  let activeCount = $derived(
    (difficulty ? 1 : 0) +
      (type ? 1 : 0) +
      (format ? 1 : 0) +
      selectedThemeIds.length +
      (search.trim() ? 1 : 0),
  );

  function resetFilters() {
    search = '';
    difficulty = null;
    type = null;
    format = null;
    selectedThemeIds = [];
  }

  function chipClass(active: boolean) {
    return cn(
      'cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition-colors border',
      active
        ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
        : 'border-border bg-transparent text-muted-foreground hover:bg-muted/50',
    );
  }

  function getDifficultyColor(diff: string | null) {
    switch (diff) {
      case 'Débutant':
        return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400';
      case 'Intermédiaire':
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400';
      case 'Avancé':
        return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400';
      default:
        return 'border-border text-muted-foreground';
    }
  }
</script>

<div class="space-y-8">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      { label: 'Bibliothèque' },
    ]}
  />
  <PageHeader
    title="Bibliothèque"
    subtitle="Sujets, corrections et exercices prêts à être rejoués par la péda et les mantas."
  />

  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <div class="relative flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          bind:value={search}
          placeholder="Rechercher un sujet ou un thème..."
          class="h-10 rounded-sm border bg-card pl-10 text-sm shadow-sm"
        />
      </div>
      <Button
        variant={activeCount > 0 ? 'default' : 'outline'}
        class={cn(
          'h-10 gap-2 rounded-sm shadow-sm',
          activeCount > 0 && 'bg-epi-blue text-white hover:bg-epi-blue/90',
        )}
        onclick={() => (showFilters = !showFilters)}
      >
        <Filter class="h-4 w-4" /> Filtres {activeCount > 0
          ? `(${activeCount})`
          : ''}
      </Button>
      {#if activeCount > 0}
        <Button
          variant="ghost"
          class="h-10 rounded-sm px-3 text-muted-foreground"
          onclick={resetFilters}
        >
          <X class="h-4 w-4" />
        </Button>
      {/if}
    </div>

    {#if showFilters}
      <div
        class="animate-in rounded-sm border bg-card p-6 shadow-sm slide-in-from-top-2"
      >
        <div class="grid gap-6 md:grid-cols-3">
          <div class="space-y-3">
            <div
              class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
            >
              Format
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class={chipClass(format === 'dynamique')}
                onclick={() =>
                  (format = format === 'dynamique' ? null : 'dynamique')}
                ><Zap class="mr-1 inline h-3 w-3" /> Dynamique</button
              >
              <button
                class={chipClass(format === 'lecture')}
                onclick={() =>
                  (format = format === 'lecture' ? null : 'lecture')}
                ><FileText class="mr-1 inline h-3 w-3" /> Lecture</button
              >
            </div>
          </div>
          <div class="space-y-3">
            <div
              class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
            >
              Difficulté
            </div>
            <div class="flex flex-wrap gap-2">
              {#each DIFFICULTIES as level}
                <button
                  class={chipClass(difficulty === level)}
                  onclick={() =>
                    (difficulty = difficulty === level ? null : level)}
                  >{level}</button
                >
              {/each}
            </div>
          </div>
          <div class="space-y-3">
            <div
              class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
            >
              Type
            </div>
            <div class="flex flex-wrap gap-2">
              {#each TYPE_KEYS as key}
                <button
                  class={chipClass(type === key)}
                  onclick={() => (type = type === key ? null : key)}
                  >{activityTypeLabels[key]}</button
                >
              {/each}
            </div>
          </div>
          {#if allThemes.length > 0}
            <div class="space-y-3 md:col-span-3">
              <div
                class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                Thèmes
              </div>
              <div class="flex flex-wrap gap-2">
                {#each allThemes as theme}
                  <button
                    class={chipClass(selectedThemeIds.includes(theme.id))}
                    onclick={() => toggleTheme(theme.id)}>#{theme.nom}</button
                  >
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div
    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
  >
    {filtered.length} résultats
  </div>

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each filtered as template (template.id)}
      <a
        href={resolve(`/staff/pedago/catalogue/${template.id}`)}
        class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-epi-blue"
      >
        <Card.Root
          class="rounded-sm bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-epi-blue/50 hover:shadow-md"
        >
          <Card.Content class="p-5">
            <div class="mb-3 flex items-start justify-between gap-4">
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="shrink-0 rounded-sm bg-muted/50 p-2 text-muted-foreground"
                >
                  {#if template.isDynamic}<Zap
                      class="h-4 w-4 text-epi-orange"
                    />{:else}<FileText class="h-4 w-4" />{/if}
                </div>
                <div class="min-w-0">
                  <div
                    class="truncate text-sm leading-tight font-bold text-foreground"
                    style:view-transition-name={`tpl-title-${template.id}`}
                  >
                    {template.nom}
                  </div>
                  <div
                    class="mt-0.5 truncate text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
                  >
                    {activityTypeLabels[
                      template.activityType as keyof typeof activityTypeLabels
                    ] ?? template.activityType}
                  </div>
                </div>
              </div>
              {#if template.link}<ExternalLink
                  class="h-4 w-4 shrink-0 text-muted-foreground opacity-50"
                />{/if}
            </div>

            <div
              class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/50 pt-3 text-xs font-medium text-muted-foreground"
            >
              {#if template.difficulte}
                <Badge
                  variant="outline"
                  class={cn(
                    'rounded-sm px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase',
                    getDifficultyColor(template.difficulte),
                  )}
                >
                  {template.difficulte}
                </Badge>
              {/if}
              {#if template.defaultDuration}<span
                  class="flex items-center gap-1.5"
                  ><Clock class="h-3.5 w-3.5" />{template.defaultDuration} min</span
                >{/if}
            </div>
          </Card.Content>
        </Card.Root>
      </a>
    {:else}
      <div
        class="col-span-full rounded-sm bg-muted/10 border border-dashed border-border py-12 text-center text-sm"
      >
        {#if data.templates.length === 0}
          <p class="text-muted-foreground">Aucune ressource disponible.</p>
        {:else}
          <p class="text-muted-foreground">
            Aucun sujet ne correspond à ces critères.
          </p>
          <Button variant="link" onclick={resetFilters} class="mt-2 text-xs"
            >Réinitialiser les filtres</Button
          >
        {/if}
      </div>
    {/each}
  </div>
</div>
