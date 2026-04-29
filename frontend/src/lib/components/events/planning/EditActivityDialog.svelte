<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { LoaderCircle } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { enhance as kitEnhance } from '$app/forms';
  import { difficultes } from '$lib/domain/xp';
  import {
    activityTypeLabels,
    activityTypeStyles,
    activityTypes,
  } from '$lib/validation/templates';
  import { cn } from '$lib/utils';
  import type { Activity, ActivityType } from '@prisma/client';

  let {
    open = $bindable(false),
    activity,
    onClose,
  }: {
    open: boolean;
    activity: Activity;
    onClose?: () => void;
  } = $props();

  let nom = $state('');
  let description = $state('');
  let difficulte = $state('');
  let link = $state('');
  let content = $state('');
  let activityType = $state<ActivityType>('atelier');
  let submitting = $state(false);

  const typesWithoutDifficulty = ['conference', 'orga', 'special', 'break'];
  const showDifficulty = $derived(
    !typesWithoutDifficulty.includes(activityType),
  );

  $effect(() => {
    if (!open) return;
    nom = activity.nom;
    description = activity.description ?? '';
    difficulte = activity.difficulte ?? '';
    link = activity.link ?? '';
    content = activity.content ?? '';
    activityType = activity.activityType;
  });

  $effect(() => {
    if (!showDifficulty) difficulte = '';
  });
</script>

<Dialog.Root
  bind:open
  onOpenChange={(v) => {
    if (!v && onClose) onClose();
  }}
>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title class="text-xl font-bold tracking-tight uppercase">
        Modifier l'activité
      </Dialog.Title>
      <Dialog.Description>
        Modifiez le nom, le type et les détails de cette activité.
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="?/updateActivity"
      use:kitEnhance={() => {
        submitting = true;
        return async ({ result, update }) => {
          submitting = false;
          if (result.type === 'success') {
            open = false;
            onClose?.();
            toast.success('Activité mise à jour !');
          } else {
            toast.error('Erreur lors de la mise à jour.');
          }
          await update({ reset: false });
        };
      }}
      class="grid gap-4 py-2"
    >
      <input type="hidden" name="activityId" value={activity.id} />

      <div class="grid gap-2">
        <Label>Nom</Label>
        <Input name="nom" bind:value={nom} placeholder="Ex: Atelier Scratch" />
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
                activityType === t && 'ring-2 ring-foreground/40 ring-offset-1',
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

      {#if !activity.isDynamic}
        <div class="grid gap-2">
          <Label>Contenu (Markdown)</Label>
          <Textarea name="content" bind:value={content} rows={4} />
        </div>
      {/if}

      <Dialog.Footer class="pt-2">
        <Button
          type="submit"
          disabled={submitting}
          class="bg-epi-blue text-white"
        >
          {#if submitting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
            Enregistrement...
          {:else}
            Enregistrer
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
