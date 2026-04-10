<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Plus,
    Pencil,
    Trash2,
    Copy,
    FileText,
    ExternalLink,
    Globe,
    Zap,
    RotateCcw,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import MultiThemeSelect from '$lib/components/MultiThemeSelect.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { toast } from 'svelte-sonner';
  import {
    difficultes,
    activityTypes,
    activityTypeLabels,
  } from '$lib/validation/templates';

  let { data } = $props();

  const { form, errors, enhance, delayed, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message);
        }
      },
    },
  );

  // Dialog state
  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');

  // Delete confirmation
  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  // Filters
  let filterType = $state('all');
  let filterDifficulty = $state('all');
  let filterTheme = $state('all');

  let filteredTemplates = $derived(
    data.templates.filter((t) => {
      if (filterType !== 'all' && t.activityType !== filterType) return false;
      if (filterDifficulty !== 'all' && t.difficulte !== filterDifficulty)
        return false;
      if (
        filterTheme !== 'all' &&
        !t.activityTemplateThemes.some((att) => att.theme.nom === filterTheme)
      )
        return false;
      return true;
    }),
  );

  let hasActiveFilters = $derived(
    filterType !== 'all' || filterDifficulty !== 'all' || filterTheme !== 'all',
  );

  function resetFilters() {
    filterType = 'all';
    filterDifficulty = 'all';
    filterTheme = 'all';
  }

  function openCreate() {
    reset();
    $form.difficulte = 'Débutant';
    $form.activityType = 'atelier';
    $form.isDynamic = false;
    $form.themes = [];
    $form.content = '';
    $form.contentStructure = '';
    $form.defaultDuration = undefined;
    $form.link = '';
    $form.description = '';
    isEditing = false;
    editId = '';
    open = true;
  }

  function openEdit(template: (typeof data.templates)[number]) {
    reset();
    $form.nom = template.nom;
    $form.description = template.description || '';
    $form.difficulte = template.difficulte as typeof $form.difficulte;
    $form.activityType = template.activityType as typeof $form.activityType;
    $form.isDynamic = template.isDynamic;
    $form.defaultDuration = template.defaultDuration ?? undefined;
    $form.link = template.link || '';
    $form.themes =
      template.activityTemplateThemes?.map((att) => att.theme.nom) || [];
    $form.content = template.content || '';
    $form.contentStructure = template.contentStructure
      ? JSON.stringify(template.contentStructure, null, 2)
      : '';
    isEditing = true;
    editId = template.id;
    open = true;
  }

  function openDuplicate(template: (typeof data.templates)[number]) {
    openEdit(template);
    $form.nom = template.nom + ' (copie)';
    isEditing = false;
    editId = '';
  }

  function confirmDelete(id: string) {
    itemToDelete = id;
    deleteDialogOpen = true;
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Templates <span class="text-epi-pink">Officiels</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Modèles d'activités distribués à tous les campus
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> Nouveau Template
    </Button>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <Select.Root
      type="single"
      value={filterType}
      onValueChange={(v) => (filterType = v ?? 'all')}
    >
      <Select.Trigger class="h-8 w-40 text-xs">
        {filterType !== 'all'
          ? activityTypeLabels[filterType as keyof typeof activityTypeLabels]
          : 'Type'}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">Tous</Select.Item>
        {#each activityTypes as type}
          <Select.Item value={type}>{activityTypeLabels[type]}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <Select.Root
      type="single"
      value={filterDifficulty}
      onValueChange={(v) => (filterDifficulty = v ?? 'all')}
    >
      <Select.Trigger class="h-8 w-40 text-xs">
        {filterDifficulty !== 'all' ? filterDifficulty : 'Difficulté'}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">Toutes</Select.Item>
        {#each difficultes as diff}
          <Select.Item value={diff}>{diff}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <Select.Root
      type="single"
      value={filterTheme}
      onValueChange={(v) => (filterTheme = v ?? 'all')}
    >
      <Select.Trigger class="h-8 w-40 text-xs">
        {filterTheme !== 'all' ? filterTheme : 'Thème'}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">Tous</Select.Item>
        {#each data.themes as theme}
          <Select.Item value={theme.nom}>{theme.nom}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    {#if hasActiveFilters}
      <Button
        variant="ghost"
        size="sm"
        class="h-8 text-xs"
        onclick={resetFilters}
      >
        <RotateCcw class="mr-1 h-3 w-3" /> Réinitialiser
      </Button>
    {/if}
  </div>

  <!-- Table or Empty State -->
  {#if filteredTemplates.length === 0}
    <EmptyState
      icon={FileText}
      title="Aucun template"
      description={hasActiveFilters
        ? 'Aucun template ne correspond aux filtres sélectionnés.'
        : "Créez votre premier template officiel pour l'ajouter à la bibliothèque."}
      actionLabel={hasActiveFilters ? undefined : 'Nouveau Template'}
      actionCallback={hasActiveFilters ? undefined : openCreate}
    />
  {:else}
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head class="w-12 text-center">
              <Globe class="mx-auto h-4 w-4 text-epi-pink" />
            </Table.Head>
            <Table.Head>Template</Table.Head>
            <Table.Head>Type</Table.Head>
            <Table.Head>Thèmes</Table.Head>
            <Table.Head>Difficulté</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filteredTemplates as template}
            <Table.Row>
              <Table.Cell class="text-center">
                {#if template.isDynamic}
                  <Zap class="mx-auto h-4 w-4 text-epi-teal" />
                {:else}
                  <FileText class="mx-auto h-4 w-4 text-muted-foreground" />
                {/if}
              </Table.Cell>
              <Table.Cell>
                <div class="font-bold">
                  {#if template.link}
                    <a
                      href={template.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="transition-colors hover:text-epi-pink hover:underline"
                    >
                      {template.nom}
                    </a>
                  {:else}
                    {template.nom}
                  {/if}
                </div>
                <div
                  class="line-clamp-1 max-w-sm text-xs text-muted-foreground"
                >
                  {template.description || ''}
                </div>
                {#if template.defaultDuration}
                  <span class="text-[10px] text-muted-foreground">
                    {template.defaultDuration} min
                  </span>
                {/if}
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline" class="text-[10px] uppercase">
                  {activityTypeLabels[template.activityType]}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-wrap gap-1">
                  {#each template.activityTemplateThemes || [] as att}
                    <Badge variant="secondary" class="text-[10px]">
                      #{att.theme.nom}
                    </Badge>
                  {/each}
                </div>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline" class="text-[10px] uppercase">
                  {template.difficulte}
                </Badge>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Tooltip.Provider delayDuration={300}>
                  {#if template.link}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            href={template.link}
                            target="_blank"
                            class="text-epi-blue"
                          >
                            <ExternalLink class="h-4 w-4" />
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content><p>Voir le support</p></Tooltip.Content>
                    </Tooltip.Root>
                  {/if}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          onclick={() => openEdit(template)}
                        >
                          <Pencil class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Modifier</p></Tooltip.Content>
                  </Tooltip.Root>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          onclick={() => openDuplicate(template)}
                        >
                          <Copy class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Dupliquer</p></Tooltip.Content>
                  </Tooltip.Root>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          class="text-destructive hover:text-destructive"
                          onclick={() => confirmDelete(template.id)}
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Supprimer</p></Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}

  <!-- Create/Edit Dialog -->
  <Dialog.Root bind:open>
    <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <Dialog.Header>
        <Dialog.Title>
          {isEditing ? 'Modifier le template' : 'Créer un template OFFICIEL'}
        </Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        use:enhance
        class="grid gap-4 py-4"
      >
        {#if isEditing}
          <input type="hidden" name="id" value={editId} />
        {/if}

        <div class="grid gap-2">
          <Label>Nom</Label>
          <Input name="nom" bind:value={$form.nom} />
          {#if $errors.nom}
            <span class="text-xs text-destructive">{$errors.nom}</span>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label>Type d'activité</Label>
            <Select.Root
              type="single"
              value={$form.activityType}
              onValueChange={(v) => {
                if (v) $form.activityType = v as typeof $form.activityType;
              }}
            >
              <Select.Trigger>
                {$form.activityType
                  ? activityTypeLabels[
                      $form.activityType as keyof typeof activityTypeLabels
                    ]
                  : 'Sélectionner un type'}
              </Select.Trigger>
              <Select.Content>
                {#each activityTypes as type}
                  <Select.Item value={type}>
                    {activityTypeLabels[type]}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <input
              type="hidden"
              name="activityType"
              value={$form.activityType}
            />
            {#if $errors.activityType}
              <span class="text-xs text-destructive">
                {$errors.activityType}
              </span>
            {/if}
          </div>

          <div class="grid gap-2">
            <Label>Durée par défaut (min)</Label>
            <Input
              type="number"
              name="defaultDuration"
              bind:value={$form.defaultDuration}
              placeholder="ex: 90"
            />
            {#if $errors.defaultDuration}
              <span class="text-xs text-destructive">
                {$errors.defaultDuration}
              </span>
            {/if}
          </div>
        </div>

        <div class="grid gap-2">
          <Label>Difficulté</Label>
          <div class="flex gap-2">
            {#each difficultes as diff}
              <Button
                type="button"
                variant={$form.difficulte === diff ? 'default' : 'outline'}
                size="sm"
                onclick={() => ($form.difficulte = diff)}
                class={$form.difficulte === diff ? 'bg-epi-pink' : ''}
              >
                {diff}
              </Button>
            {/each}
            <input type="hidden" name="difficulte" value={$form.difficulte} />
          </div>
        </div>

        <div class="flex items-center gap-3">
          <Switch
            checked={$form.isDynamic}
            onCheckedChange={(v) => {
              $form.isDynamic = v;
              if (v) {
                $form.content = '';
              } else {
                $form.contentStructure = '';
              }
            }}
          />
          <Label>Activité dynamique (avec étapes)</Label>
          <input
            type="hidden"
            name="isDynamic"
            value={$form.isDynamic?.toString()}
          />
        </div>

        <div class="grid gap-2">
          <Label>Support (Lien URL)</Label>
          <Input name="link" bind:value={$form.link} />
          {#if $errors.link}
            <span class="text-xs text-destructive">{$errors.link}</span>
          {/if}
        </div>

        <div class="grid gap-2">
          <Label>Thèmes Officiels</Label>
          <MultiThemeSelect
            themes={data.themes}
            bind:value={$form.themes}
            officialOnly
          />
        </div>

        <div class="grid gap-2">
          <Label>Description</Label>
          <Textarea
            name="description"
            bind:value={$form.description}
            class="h-24"
          />
          {#if $errors.description}
            <span class="text-xs text-destructive">
              {$errors.description}
            </span>
          {/if}
        </div>

        {#if $form.isDynamic}
          <div class="grid gap-2">
            <Label>Structure du contenu (JSON)</Label>
            <Textarea
              name="contentStructure"
              bind:value={$form.contentStructure}
              class="h-40 font-mono text-sm"
              placeholder={'[\n  { "titre": "Étape 1", "type": "auto_qcm" },\n  { "titre": "Étape 2", "type": "manual_manta" }\n]'}
            />
            {#if $errors.contentStructure}
              <span class="text-xs text-destructive">
                {$errors.contentStructure}
              </span>
            {/if}
          </div>
        {:else}
          <div class="grid gap-2">
            <Label>Contenu (Markdown)</Label>
            <Textarea
              name="content"
              bind:value={$form.content}
              class="h-40"
              placeholder="Rédigez le contenu de l'activité en Markdown..."
            />
            {#if $errors.content}
              <span class="text-xs text-destructive">
                {$errors.content}
              </span>
            {/if}
          </div>
        {/if}

        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed
              ? 'Traitement...'
              : isEditing
                ? 'Mettre à jour'
                : 'Publier'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer un template officiel ?"
    description="Cela le supprimera des bibliothèques de TOUS les campus."
  />
</div>
