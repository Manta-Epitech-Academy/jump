<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Select from '$lib/components/ui/select';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Search, Zap, FileText, Plus } from '@lucide/svelte';
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { enhance as kitEnhance } from '$app/forms';
  import { activityTypeLabels } from '$lib/validation/templates';
  import { difficultes } from '$lib/domain/xp';
  import type { ActivityTemplate } from '@prisma/client';

  let {
    open = $bindable(false),
    timeSlotId,
    templates,
    staticActivityForm: staticFormData,
    templateActivityForm: templateFormData,
  }: {
    open: boolean;
    timeSlotId: string;
    templates: (ActivityTemplate & {
      activityTemplateThemes: { theme: { nom: string } }[];
    })[];
    staticActivityForm: any;
    templateActivityForm: any;
  } = $props();

  const formId = untrack(() => `create-static-${timeSlotId}`);

  const {
    form: staticForm,
    errors: staticErrors,
    enhance: staticEnhance,
    delayed: staticDelayed,
  } = superForm(
    untrack(() => staticFormData),
    {
      id: formId,
      invalidateAll: true,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message || 'Activité créée !');
        }
      },
    },
  );

  let searchQuery = $state('');
  let typeFilter = $state<string>('all');
  let isAddingTemplate = $state<string | null>(null);

  const activityTypesWithoutDifficulty = ['conference', 'orga', 'special'];
  let showDifficulty = $derived(
    !activityTypesWithoutDifficulty.includes($staticForm.activityType),
  );

  $effect(() => {
    if (!showDifficulty) {
      $staticForm.difficulte = '';
    }
  });

  let filteredTemplates = $derived(
    templates.filter((t) => {
      if (typeFilter !== 'all' && t.activityType !== typeFilter) return false;
      if (
        searchQuery &&
        !t.nom.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    }),
  );

  const difficultyColors: Record<string, string> = {
    Débutant:
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    Intermédiaire:
      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    Avancé:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Ajouter une activité</Dialog.Title>
      <Dialog.Description>
        Choisissez un template existant ou créez une activité statique.
      </Dialog.Description>
    </Dialog.Header>

    <Tabs.Root value="template" class="w-full">
      <Tabs.List class="grid w-full grid-cols-2">
        <Tabs.Trigger value="template">Depuis un template</Tabs.Trigger>
        <Tabs.Trigger value="static">Activité statique</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="template" class="mt-4">
        <div class="mb-3 flex gap-2">
          <div class="relative flex-1">
            <Search
              class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              placeholder="Rechercher un template..."
              class="pl-9"
              bind:value={searchQuery}
            />
          </div>
          <Select.Root type="single" bind:value={typeFilter}>
            <Select.Trigger class="w-40">
              {typeFilter === 'all'
                ? 'Tous les types'
                : activityTypeLabels[
                    typeFilter as keyof typeof activityTypeLabels
                  ] || typeFilter}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">Tous les types</Select.Item>
              {#each Object.entries(activityTypeLabels) as [value, label]}
                <Select.Item {value}>{label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <ScrollArea class="h-72">
          {#if filteredTemplates.length === 0}
            <div
              class="flex h-full items-center justify-center py-12 text-center text-sm text-muted-foreground"
            >
              Aucun template trouvé.
            </div>
          {:else}
            <div class="space-y-2 pr-3">
              {#each filteredTemplates as template}
                <div
                  class="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div class="flex flex-1 flex-col gap-1">
                    <div class="flex items-center gap-2">
                      {#if template.isDynamic}
                        <Zap class="h-3.5 w-3.5 text-epi-orange" />
                      {:else}
                        <FileText class="h-3.5 w-3.5 text-muted-foreground" />
                      {/if}
                      <span class="text-sm font-medium">{template.nom}</span>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <Badge variant="outline" class="text-[10px]">
                        {activityTypeLabels[
                          template.activityType as keyof typeof activityTypeLabels
                        ] || template.activityType}
                      </Badge>
                      {#if template.difficulte}
                        <span
                          class={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${difficultyColors[template.difficulte] || ''}`}
                        >
                          {template.difficulte}
                        </span>
                      {/if}
                      {#if template.isDynamic}
                        <Badge variant="secondary" class="text-[10px]"
                          >Dynamique</Badge
                        >
                      {/if}
                      {#if template.campusId}
                        <Badge variant="secondary" class="text-[10px]"
                          >Mon campus</Badge
                        >
                      {:else}
                        <Badge variant="outline" class="text-[10px]"
                          >National</Badge
                        >
                      {/if}
                      {#each template.activityTemplateThemes as att}
                        <Badge variant="secondary" class="text-[10px]"
                          >#{att.theme.nom}</Badge
                        >
                      {/each}
                    </div>
                    {#if template.description}
                      <p class="line-clamp-1 text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    {/if}
                  </div>
                  <form
                    method="POST"
                    action="?/addActivityFromTemplate"
                    use:kitEnhance={() => {
                      isAddingTemplate = template.id;
                      return async ({ result, update }) => {
                        isAddingTemplate = null;
                        if (result.type === 'success') {
                          open = false;
                          toast.success(
                            `Activité « ${template.nom} » ajoutée !`,
                          );
                          await update();
                        } else {
                          toast.error("Erreur lors de l'ajout.");
                          await update();
                        }
                      };
                    }}
                  >
                    <input
                      type="hidden"
                      name="templateId"
                      value={template.id}
                    />
                    <input type="hidden" name="timeSlotId" value={timeSlotId} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={isAddingTemplate === template.id}
                      class="ml-3 shrink-0"
                    >
                      <Plus class="mr-1 h-3.5 w-3.5" />
                      {isAddingTemplate === template.id ? '...' : 'Ajouter'}
                    </Button>
                  </form>
                </div>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </Tabs.Content>

      <Tabs.Content value="static" class="mt-4">
        <form
          method="POST"
          action="?/createStaticActivity"
          use:staticEnhance
          class="grid gap-4"
        >
          <input type="hidden" name="timeSlotId" value={timeSlotId} />

          <div class="grid gap-2">
            <Label>Nom de l'activité</Label>
            <Input
              name="nom"
              bind:value={$staticForm.nom}
              placeholder="Ex: Conférence d'ouverture"
            />
            {#if $staticErrors.nom}
              <span class="text-xs text-destructive">{$staticErrors.nom}</span>
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label>Type</Label>
              <Select.Root type="single" bind:value={$staticForm.activityType}>
                <Select.Trigger>
                  {$staticForm.activityType
                    ? activityTypeLabels[
                        $staticForm.activityType as keyof typeof activityTypeLabels
                      ] || $staticForm.activityType
                    : "Type d'activité"}
                </Select.Trigger>
                <Select.Content>
                  {#each Object.entries(activityTypeLabels) as [value, label]}
                    <Select.Item {value}>{label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <input
                type="hidden"
                name="activityType"
                value={$staticForm.activityType || ''}
              />
              {#if $staticErrors.activityType}
                <span class="text-xs text-destructive"
                  >{$staticErrors.activityType}</span
                >
              {/if}
            </div>

            {#if showDifficulty}
              <div class="grid gap-2">
                <Label>Difficulté</Label>
                <Select.Root type="single" bind:value={$staticForm.difficulte}>
                  <Select.Trigger>
                    {$staticForm.difficulte || 'Difficulté'}
                  </Select.Trigger>
                  <Select.Content>
                    {#each difficultes as d}
                      <Select.Item value={d}>{d}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                {#if $staticErrors.difficulte}
                  <span class="text-xs text-destructive"
                    >{$staticErrors.difficulte}</span
                  >
                {/if}
              </div>
            {/if}
          </div>
          <input
            type="hidden"
            name="difficulte"
            value={$staticForm.difficulte || ''}
          />

          <div class="grid gap-2">
            <Label
              >Description <span class="text-muted-foreground">(optionnel)</span
              ></Label
            >
            <Input
              name="description"
              bind:value={$staticForm.description}
              placeholder="Brève description"
            />
          </div>

          <div class="grid gap-2">
            <Label>Contenu (Markdown)</Label>
            <Textarea
              name="content"
              bind:value={$staticForm.content}
              placeholder="Contenu de l'activité en Markdown..."
              rows={5}
            />
            {#if $staticErrors.content}
              <span class="text-xs text-destructive"
                >{$staticErrors.content}</span
              >
            {/if}
          </div>

          <div class="grid gap-2">
            <Label
              >Lien externe <span class="text-muted-foreground"
                >(optionnel)</span
              ></Label
            >
            <Input
              name="link"
              bind:value={$staticForm.link}
              placeholder="https://..."
            />
            {#if $staticErrors.link}
              <span class="text-xs text-destructive">{$staticErrors.link}</span>
            {/if}
          </div>

          <Dialog.Footer>
            <Button
              type="submit"
              disabled={$staticDelayed}
              class="bg-epi-blue text-white hover:bg-epi-blue/90"
            >
              {$staticDelayed ? 'Création...' : "Créer l'activité"}
            </Button>
          </Dialog.Footer>
        </form>
      </Tabs.Content>
    </Tabs.Root>
  </Dialog.Content>
</Dialog.Root>
