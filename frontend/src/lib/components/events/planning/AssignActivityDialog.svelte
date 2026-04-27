<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import * as Tabs from '$lib/components/ui/tabs';
  import {
    LoaderCircle,
    Trash2,
    Search,
    Zap,
    Clock,
    LayoutGrid,
    Pencil,
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { enhance as kitEnhance } from '$app/forms';
  import { difficultes } from '$lib/domain/xp';
  import {
    activityTypeLabels,
    activityTypeStyles,
    activityTypes,
  } from '$lib/validation/templates';
  import { cn } from '$lib/utils';
  import type { ActivityTemplate, ActivityType } from '@prisma/client';

  type Template = ActivityTemplate & {
    activityTemplateThemes: { theme: { nom: string } }[];
  };

  let {
    open = $bindable(false),
    timeSlotId,
    templates,
    onClose,
    onDelete,
    onAssignTemplate,
  }: {
    open: boolean;
    timeSlotId: string;
    templates: Template[];
    onClose?: () => void;
    onDelete?: () => void;
    // Fires when a catalogue template is picked. CalendarPlanner handles the
    // optimistic mutation + form submission; the dialog just closes.
    onAssignTemplate: (template: Template) => void;
  } = $props();

  let tab = $state<'catalogue' | 'manual'>('catalogue');
  let searchQuery = $state('');
  let submitting = $state(false);

  // Manual form fields
  let nom = $state('');
  let description = $state('');
  let difficulte = $state('');
  let link = $state('');
  let content = $state('');
  let activityType = $state<ActivityType>('atelier');

  const typesWithoutDifficulty = ['conference', 'orga', 'special', 'break'];
  const showDifficulty = $derived(
    !typesWithoutDifficulty.includes(activityType),
  );

  $effect(() => {
    if (!showDifficulty) difficulte = '';
  });

  // Reset on (re)open so a stale draft from a previous slot doesn't leak.
  $effect(() => {
    if (!open) return;
    tab = 'catalogue';
    searchQuery = '';
    nom = '';
    description = '';
    difficulte = '';
    link = '';
    content = '';
    activityType = 'atelier';
  });

  const filteredTemplates = $derived(
    templates.filter((t) =>
      t.nom.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  function pickTemplate(template: Template) {
    open = false;
    onAssignTemplate(template);
  }

  function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
  }
</script>

<Dialog.Root
  bind:open
  onOpenChange={(v) => {
    if (!v && onClose) onClose();
  }}
>
  <Dialog.Content class="flex max-h-[85vh] flex-col sm:max-w-2xl">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="font-heading text-xl tracking-tight uppercase">
        Assigner une activité
      </Dialog.Title>
      <Dialog.Description>
        Choisissez depuis le catalogue ou créez une activité manuelle.
      </Dialog.Description>
    </Dialog.Header>

    <Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col">
      <Tabs.List class="grid w-full shrink-0 grid-cols-2">
        <Tabs.Trigger value="catalogue">
          <LayoutGrid class="mr-1.5 h-3.5 w-3.5" /> Catalogue
        </Tabs.Trigger>
        <Tabs.Trigger value="manual">
          <Pencil class="mr-1.5 h-3.5 w-3.5" /> Manuel
        </Tabs.Trigger>
      </Tabs.List>

      <!-- Catalogue tab -->
      <Tabs.Content
        value="catalogue"
        class="flex min-h-0 flex-1 flex-col gap-3 pt-3"
      >
        <div class="relative shrink-0">
          <Search
            class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
          />
          <Input
            placeholder="Rechercher un atelier..."
            class="bg-muted/50 pl-9"
            bind:value={searchQuery}
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div class="grid grid-cols-1 gap-2 pr-1 sm:grid-cols-2">
            {#each filteredTemplates as template (template.id)}
              {@const s =
                activityTypeStyles[
                  template.activityType as keyof typeof activityTypeStyles
                ]}
              <button
                type="button"
                onclick={() => pickTemplate(template)}
                class="group flex flex-col gap-1.5 rounded-lg border bg-background p-2.5 text-left shadow-sm transition-colors hover:border-epi-blue hover:bg-epi-blue/5 dark:shadow-none"
              >
                <span class="text-xs leading-tight font-bold">
                  {template.nom}
                </span>
                <div class="flex flex-wrap items-center gap-1">
                  <span
                    class={cn(
                      'rounded border px-1 py-0 text-[8px] font-bold uppercase',
                      s.bg,
                      s.accent,
                    )}
                  >
                    {activityTypeLabels[
                      template.activityType as keyof typeof activityTypeLabels
                    ] || template.activityType}
                  </span>
                  {#if template.isDynamic}
                    <span
                      class="flex items-center gap-0.5 rounded border border-epi-orange px-1 py-0 text-[8px] font-bold text-epi-orange uppercase"
                    >
                      <Zap class="h-2.5 w-2.5" />
                      Dynamique
                    </span>
                  {/if}
                  {#if template.defaultDuration}
                    <span
                      class="flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground"
                    >
                      <Clock class="h-2.5 w-2.5" />
                      {formatDuration(template.defaultDuration)}
                    </span>
                  {/if}
                </div>
              </button>
            {:else}
              <p
                class="col-span-full py-8 text-center text-xs text-muted-foreground italic"
              >
                Aucun résultat trouvé.
              </p>
            {/each}
          </div>
        </div>
      </Tabs.Content>

      <!-- Manual tab -->
      <Tabs.Content value="manual" class="min-h-0 flex-1 overflow-y-auto pt-3">
        <form
          id="assign-manual-form"
          method="POST"
          action="?/assignActivity"
          use:kitEnhance={() => {
            submitting = true;
            return async ({ result, update }) => {
              submitting = false;
              if (result.type === 'success') {
                open = false;
                onClose?.();
                toast.success('Activité assignée !');
              } else {
                toast.error("Erreur lors de l'assignation.");
              }
              await update({ reset: false });
            };
          }}
          class="grid gap-4"
        >
          <input type="hidden" name="timeSlotId" value={timeSlotId} />

          <div class="grid gap-2">
            <Label>Nom</Label>
            <Input
              name="nom"
              bind:value={nom}
              placeholder="Ex: Atelier Scratch"
              required
              minlength={1}
              maxlength={100}
            />
          </div>

          <div class="grid gap-2">
            <Label>Type</Label>
            <input type="hidden" name="activityType" value={activityType} />
            <div class="grid grid-cols-3 gap-1.5">
              {#each activityTypes as t}
                {@const ts = activityTypeStyles[t]}
                <button
                  type="button"
                  class={cn(
                    'rounded border px-2 py-1.5 text-[10px] font-bold uppercase transition-colors',
                    ts.bg,
                    ts.accent,
                    activityType === t &&
                      'ring-2 ring-foreground/40 ring-offset-1',
                  )}
                  onclick={() => (activityType = t)}
                >
                  {activityTypeLabels[t]}
                </button>
              {/each}
            </div>
          </div>

          {#if showDifficulty}
            <div class="grid gap-2">
              <Label>Difficulté</Label>
              <Select.Root type="single" bind:value={difficulte}>
                <Select.Trigger>{difficulte || 'Difficulté'}</Select.Trigger>
                <Select.Content>
                  {#each difficultes as d}
                    <Select.Item value={d}>{d}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <input type="hidden" name="difficulte" value={difficulte} />
            </div>
          {/if}

          <div class="grid gap-2">
            <Label>Description</Label>
            <Input name="description" bind:value={description} />
          </div>

          <div class="grid gap-2">
            <Label>Lien externe</Label>
            <Input name="link" bind:value={link} placeholder="https://..." />
          </div>

          <div class="grid gap-2">
            <Label>Contenu (Markdown)</Label>
            <Textarea name="content" bind:value={content} rows={4} />
          </div>
        </form>
      </Tabs.Content>
    </Tabs.Root>

    <Dialog.Footer class="shrink-0 pt-3 sm:justify-between">
      {#if onDelete}
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          class="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onclick={() => {
            open = false;
            onDelete();
          }}
        >
          <Trash2 class="mr-2 h-4 w-4" /> Supprimer le créneau
        </Button>
      {:else}
        <span></span>
      {/if}
      {#if tab === 'manual'}
        <Button
          type="submit"
          form="assign-manual-form"
          disabled={submitting}
          class="bg-epi-blue text-white"
        >
          {#if submitting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
            Enregistrement...
          {:else}
            Assigner
          {/if}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
