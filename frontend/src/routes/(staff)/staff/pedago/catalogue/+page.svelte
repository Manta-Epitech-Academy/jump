<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
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
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { activityTypeLabels } from '$lib/validation/templates';
  import { resolve } from '$app/paths';

  let { data } = $props();

  type Template = (typeof data.templates)[number];

  const DIFFICULTIES = ['Débutant', 'Intermédiaire', 'Avancé'] as const;
  type Difficulty = (typeof DIFFICULTIES)[number];

  const TYPE_KEYS = ['atelier', 'conference', 'quiz', 'special'] as const;
  type TypeKey = (typeof TYPE_KEYS)[number];

  type Format = 'dynamique' | 'lecture';

  let search = $state('');
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
      'cursor-pointer rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors',
      active
        ? 'border-epi-blue bg-epi-blue text-white shadow-sm'
        : 'border-slate-200 bg-white text-slate-600 hover:border-epi-blue/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    );
  }
</script>

<div class="space-y-6">
  <PageHeader
    title="Bibliothèque"
    subtitle="Sujets, corrections et exercices prêts à être rejoués par la péda et les mantas."
  />

  <div
    class="space-y-3 rounded-xl border bg-card p-4 shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/50"
  >
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <div class="relative flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          bind:value={search}
          placeholder="Rechercher un sujet ou un thème..."
          class="pl-9"
        />
      </div>
      {#if activeCount > 0}
        <Button
          variant="ghost"
          size="sm"
          onclick={resetFilters}
          class="shrink-0 gap-1.5 text-xs"
        >
          <X class="h-3.5 w-3.5" /> Réinitialiser ({activeCount})
        </Button>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
      >
        Format
      </span>
      <button
        class={chipClass(format === 'dynamique')}
        onclick={() => (format = format === 'dynamique' ? null : 'dynamique')}
      >
        <Zap class="mr-1 inline h-3 w-3" /> Dynamique
      </button>
      <button
        class={chipClass(format === 'lecture')}
        onclick={() => (format = format === 'lecture' ? null : 'lecture')}
      >
        <FileText class="mr-1 inline h-3 w-3" /> Lecture
      </button>

      <span
        class="ml-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
      >
        Difficulté
      </span>
      {#each DIFFICULTIES as level}
        <button
          class={chipClass(difficulty === level)}
          onclick={() => (difficulty = difficulty === level ? null : level)}
        >
          {level}
        </button>
      {/each}

      <span
        class="ml-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
      >
        Type
      </span>
      {#each TYPE_KEYS as key}
        <button
          class={chipClass(type === key)}
          onclick={() => (type = type === key ? null : key)}
        >
          {activityTypeLabels[key]}
        </button>
      {/each}
    </div>

    {#if allThemes.length > 0}
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
        >
          Thèmes
        </span>
        {#each allThemes as theme}
          <button
            class={chipClass(selectedThemeIds.includes(theme.id))}
            onclick={() => toggleTheme(theme.id)}
          >
            #{theme.nom}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div
    class="flex items-center justify-between text-xs font-bold tracking-wider text-muted-foreground uppercase"
  >
    <span>{filtered.length} / {data.templates.length} sujets</span>
  </div>

  <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {#each filtered as template (template.id)}
      <a
        href={resolve(`/staff/pedago/catalogue/${template.id}`)}
        class="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-epi-blue"
      >
        <Card.Root
          class="flex h-full flex-col shadow-sm transition-all group-hover:border-epi-blue group-hover:shadow-md dark:shadow-none dark:ring-1 dark:ring-border/50 dark:group-hover:shadow-none"
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
              <Card.Title class="text-base leading-tight">
                {template.nom}
              </Card.Title>
              {#if template.link}
                <ExternalLink
                  class="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
              {/if}
            </div>
          </Card.Header>
          <Card.Content class="flex-1 py-3">
            <div class="flex flex-wrap gap-1.5">
              <Badge
                variant="secondary"
                class="px-2 py-0.5 text-[9px] uppercase"
              >
                {activityTypeLabels[
                  template.activityType as keyof typeof activityTypeLabels
                ] ?? template.activityType}
              </Badge>
              {#if template.difficulte}
                <Badge
                  variant="outline"
                  class="border-epi-blue px-2 py-0.5 text-[9px] text-blue-700 uppercase dark:text-blue-300"
                >
                  {template.difficulte}
                </Badge>
              {/if}
              {#each template.activityTemplateThemes as att}
                <Badge
                  variant="secondary"
                  class="px-2 py-0.5 text-[9px] text-muted-foreground lowercase"
                >
                  #{att.theme.nom}
                </Badge>
              {/each}
            </div>
            {#if template.defaultDuration}
              <div
                class="mt-4 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
              >
                <Clock class="h-3 w-3" />
                {template.defaultDuration} min
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      </a>
    {:else}
      <div
        class="col-span-full rounded-xl border-2 border-dashed bg-muted/10 py-12 text-center"
      >
        {#if data.templates.length === 0}
          <p class="text-muted-foreground">Aucune ressource disponible.</p>
        {:else}
          <p class="text-muted-foreground">
            Aucun sujet ne correspond à ces filtres.
          </p>
          <Button variant="link" onclick={resetFilters} class="mt-2">
            Réinitialiser les filtres
          </Button>
        {/if}
      </div>
    {/each}
  </div>
</div>
