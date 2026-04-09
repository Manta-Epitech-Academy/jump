<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import {
    Search,
    BookOpen,
    Tag,
    Sparkles,
    School,
    MapPin,
    Check,
    Save,
    X,
    SignalLow,
    SignalMedium,
    SignalHigh,
    ExternalLink,
  } from '@lucide/svelte';
  import { cn, translateDifficulty, translateTheme } from '$lib/utils';
  import { m } from '$lib/paraglide/messages.js';
  import { page } from '$app/state';
  import { getSubjectXpValue } from '$lib/domain/xp';

  let {
    open = $bindable(false),
    subjects = [],
    themes = [],
    selectedSubjectIds = [],
    studentLevel = null,
    defaultThemeId = null,
    onSave,
  }: {
    open: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjects: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    themes: any[];
    selectedSubjectIds: string[];
    studentLevel?: string | null;
    defaultThemeId?: string | null;
    onSave: (ids: string[]) => void;
  } = $props();

  // Get user campus ID to detect "Mine" vs "Community"
  let userCampusId = $derived(page.data.user?.campus);

  let searchQuery = $state('');
  let selectedDifficulte = $state('all');
  let selectedTheme = $state('all');
  let selectedSource = $state('all'); // all, official, mine, community

  // Internal state for selection within the modal
  let currentSelection = $state<string[]>([]);

  // Reset/Sync local selection and filters when modal opens
  $effect(() => {
    if (open) {
      currentSelection = [...selectedSubjectIds];
      // Reset filters on open
      searchQuery = '';
      selectedDifficulte = 'all';
      selectedSource = 'all';
      // Set theme to event theme by default if provided
      selectedTheme = defaultThemeId || 'all';
    }
  });

  const difficulties = ['Débutant', 'Intermédiaire', 'Avancé'];

  let filteredSubjects = $derived(
    subjects
      .filter((sub) => {
        // Search
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          sub.nom.toLowerCase().includes(searchLower) ||
          (sub.description || '').toLowerCase().includes(searchLower);

        // Difficulty Filter
        const matchesDiff =
          selectedDifficulte === 'all' || sub.difficulte === selectedDifficulte;

        // Theme Filter
        const matchesTheme =
          selectedTheme === 'all' ||
          (sub.themes && sub.themes.includes(selectedTheme));

        // Source Filter Logic
        const isOfficial = !sub.campus;
        const isMine = sub.campus === userCampusId;
        let matchesSource = true;
        if (selectedSource === 'official') matchesSource = isOfficial;
        if (selectedSource === 'mine') matchesSource = isMine;
        if (selectedSource === 'community')
          matchesSource = !isOfficial && !isMine;

        return matchesSearch && matchesDiff && matchesTheme && matchesSource;
      })
      .sort((a, b) => {
        // 1. Selection priority
        const aSel = currentSelection.includes(a.id) ? 1 : 0;
        const bSel = currentSelection.includes(b.id) ? 1 : 0;
        if (aSel !== bSel) return bSel - aSel;

        // 2. Recommended priority (matching student's difficulty level)
        if (studentLevel) {
          const aMatch = a.difficulte === studentLevel ? 1 : 0;
          const bMatch = b.difficulte === studentLevel ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
        }

        // 3. Difficulty order
        const diffOrder: Record<string, number> = {
          Débutant: 1,
          Intermédiaire: 2,
          Avancé: 3,
        };
        const aDiff = diffOrder[a.difficulte] || 0;
        const bDiff = diffOrder[b.difficulte] || 0;
        if (aDiff !== bDiff) return aDiff - bDiff;

        // 4. Alphabetical
        return a.nom.localeCompare(b.nom);
      }),
  );

  function toggleSubject(id: string) {
    if (currentSelection.includes(id)) {
      currentSelection = currentSelection.filter((s) => s !== id);
    } else {
      currentSelection = [...currentSelection, id];
    }
  }

  function handleSave() {
    onSave(currentSelection);
    open = false;
  }

  function getDifficultyStyles(diff: string) {
    switch (diff) {
      case 'Débutant':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Intermédiaire':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Avancé':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }

  function getThemeName(id: string) {
    if (id === 'all') return m.common_all();
    const t = themes.find((th) => th.id === id);
    return t ? translateTheme(t.nom) : id;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex h-full max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
  >
    <Dialog.Header class="shrink-0 px-6 py-4 pb-2">
      <Dialog.Title class="flex items-center gap-2 uppercase">
        <BookOpen class="h-5 w-5 text-epi-blue" />
        {m.event_builder_subject_picker_title()}
      </Dialog.Title>
      <Dialog.Description>
        {m.event_builder_subject_picker_description_prefix()} <span
          class="font-bold text-foreground">{studentLevel ? translateDifficulty(studentLevel) : m.event_builder_level_undefined()}</span
        >.
      </Dialog.Description>
    </Dialog.Header>

    <!-- FILTERS & ACTIONS BAR -->
    <div class="shrink-0 border-b bg-muted/30 p-4">
      <div class="flex flex-col gap-3">
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Search
              class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              placeholder={m.event_builder_search_by_name()}
              class="bg-background pl-9"
              bind:value={searchQuery}
            />
          </div>
          <Button onclick={handleSave} class="bg-epi-blue shadow-lg">
            <Save class="mr-2 h-4 w-4" />
            {m.event_builder_save_count({ count: currentSelection.length })}
          </Button>
        </div>

        <div class="flex flex-wrap gap-2">
          <!-- Difficulty Filter -->
          <div class="flex h-9 items-center rounded-sm border bg-background">
            <div
              class="flex h-full items-center border-r bg-muted/10 px-2 text-xs font-bold text-muted-foreground uppercase"
            >
              {m.subject_filter_difficulty()}
            </div>
            <Select.Root type="single" bind:value={selectedDifficulte}>
              <Select.Trigger
                class="h-full min-w-20 border-0 bg-transparent px-2 text-xs font-bold uppercase shadow-none focus:ring-0"
              >
                {selectedDifficulte === 'all' ? m.common_all_feminine() : translateDifficulty(selectedDifficulte)}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">{m.common_all_feminine()}</Select.Item>
                {#each difficulties as diff}
                  <Select.Item value={diff}>{translateDifficulty(diff)}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Theme Filter -->
          <div class="flex h-9 items-center rounded-sm border bg-background">
            <div
              class="flex h-full items-center border-r bg-muted/10 px-2 text-xs font-bold text-muted-foreground uppercase"
            >
              {m.subject_filter_theme()}
            </div>
            <Select.Root type="single" bind:value={selectedTheme}>
              <Select.Trigger
                class="h-full min-w-20 border-0 bg-transparent px-2 text-xs font-bold uppercase shadow-none focus:ring-0"
              >
                {getThemeName(selectedTheme)}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">{m.common_all()}</Select.Item>
                {#each themes as t}
                  <Select.Item value={t.id}>{translateTheme(t.nom)}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Source Filter -->
          <div class="flex h-9 items-center rounded-sm border bg-background">
            <div
              class="flex h-full items-center border-r bg-muted/10 px-2 text-xs font-bold text-muted-foreground uppercase"
            >
              {m.event_builder_source_label()}
            </div>
            <Select.Root type="single" bind:value={selectedSource}>
              <Select.Trigger
                class="h-full min-w-25 border-0 bg-transparent px-2 text-xs font-bold uppercase shadow-none focus:ring-0"
              >
                {#if selectedSource === 'all'}{m.common_all()}
                {:else if selectedSource === 'official'}{m.subject_badge_official()}
                {:else if selectedSource === 'mine'}{m.subject_badge_local()}
                {:else}{m.subject_badge_community()}{/if}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">{m.common_all()}</Select.Item>
                <Select.Item value="official">{m.subject_badge_official()}</Select.Item>
                <Select.Item value="mine">{m.subject_tab_mine()}</Select.Item>
                <Select.Item value="community">{m.subject_badge_community()}</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>

          {#if studentLevel && selectedDifficulte !== studentLevel}
            <Button
              variant="outline"
              size="sm"
              class="h-9 border-epi-teal/50 bg-epi-teal/10 text-xs text-teal-700 hover:bg-epi-teal/20"
              onclick={() => (selectedDifficulte = studentLevel || 'all')}
            >
              <Sparkles class="mr-1 h-3 w-3" />
              {m.event_builder_recommended_label({ level: translateDifficulty(studentLevel) })}
            </Button>
          {/if}
        </div>

        <!-- Selection summary tags -->
        {#if currentSelection.length > 0}
          <div class="flex flex-wrap gap-1 border-t pt-2">
            {#each currentSelection as id}
              {@const sub = subjects.find((s) => s.id === id)}
              {#if sub}
                <Badge
                  variant="outline"
                  class="gap-1 border bg-background text-[10px]"
                >
                  {sub.nom}
                  <button
                    onclick={() => toggleSubject(id)}
                    class="ml-1 cursor-pointer hover:text-destructive"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </Badge>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- LIST -->
    <ScrollArea class="min-h-0 flex-1">
      <div class="divide-y p-0">
        {#each filteredSubjects as sub (sub.id)}
          {@const isSelected = currentSelection.includes(sub.id)}
          {@const isRecommended =
            studentLevel && sub.difficulte === studentLevel}
          {@const isOfficial = !sub.campus}
          {@const isMine = sub.campus === userCampusId}

          <button
            class={cn(
              'flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/50',
              isSelected && 'bg-epi-blue/5 hover:bg-epi-blue/10',
              isRecommended && !isSelected && 'bg-epi-teal/5',
            )}
            onclick={() => toggleSubject(sub.id)}
          >
            <div class="flex items-start gap-4">
              <div
                class={cn(
                  'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-all',
                  isSelected
                    ? 'border-epi-blue bg-epi-blue text-white'
                    : 'border-muted-foreground/30 bg-background',
                )}
              >
                {#if isSelected}
                  <Check class="h-4 w-4" />
                {/if}
              </div>

              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-foreground uppercase"
                    >{sub.nom}</span
                  >

                  {#if sub.link}
                    <a
                      href={sub.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-muted-foreground hover:text-epi-blue"
                      title={m.subject_view_support()}
                      onclick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink class="h-4 w-4" />
                    </a>
                  {/if}

                  {#if isOfficial}
                    <div
                      class="flex items-center gap-1 text-[10px] font-bold text-epi-blue uppercase"
                    >
                      <School class="h-3 w-3" />
                    </div>
                  {:else if isMine}
                    <div
                      class="flex items-center gap-1 text-[10px] font-bold text-teal-700 uppercase"
                    >
                      <MapPin class="h-3 w-3" />
                    </div>
                  {/if}

                  {#if isRecommended}
                    <Badge
                      variant="outline"
                      class="h-4 border-epi-teal bg-epi-teal/10 px-1 text-[8px] text-teal-700"
                    >
                      {m.event_builder_recommended_badge()}
                    </Badge>
                  {/if}
                </div>

                <p class="line-clamp-1 text-xs text-muted-foreground">
                  {sub.description}
                </p>

                <div class="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    class={cn(
                      'text-[9px] font-bold uppercase',
                      getDifficultyStyles(sub.difficulte),
                    )}
                  >
                    {#if sub.difficulte === 'Débutant'}
                      <SignalLow class="mr-1 h-3 w-3" />
                    {:else if sub.difficulte === 'Intermédiaire'}
                      <SignalMedium class="mr-1 h-3 w-3" />
                    {:else}
                      <SignalHigh class="mr-1 h-3 w-3" />
                    {/if}
                    {translateDifficulty(sub.difficulte)}
                  </Badge>

                  {#if sub.themes && sub.themes.length > 0}
                    <div class="flex items-center gap-1">
                      <Tag class="h-3 w-3 text-muted-foreground" />
                      {#each sub.themes as tId}
                        <span class="text-[9px] text-muted-foreground"
                          >#{getThemeName(tId)}</span
                        >
                      {/each}
                    </div>
                  {/if}

                </div>
              </div>
            </div>

            <div class="flex flex-col items-end gap-1">
              <Badge
                variant="secondary"
                class="font-mono font-bold text-epi-orange"
              >
                {getSubjectXpValue(sub.difficulte)} XP
              </Badge>
            </div>
          </button>
        {:else}
          <div
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <BookOpen class="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p class="text-sm font-bold text-muted-foreground uppercase">
              {m.event_builder_no_subject_found()}
            </p>
          </div>
        {/each}
      </div>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
