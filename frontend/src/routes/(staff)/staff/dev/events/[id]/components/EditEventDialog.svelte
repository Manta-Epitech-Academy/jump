<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ThemeSelect from '$lib/components/ThemeSelect.svelte';
  import type { Readable } from 'svelte/store';
  import type { SuperForm } from 'sveltekit-superforms/client';
  import type { EventForm } from '$lib/validation/events';

  let {
    open = $bindable(false),
    editForm,
    editErrors,
    editEnhance,
    editDelayed,
    themes,
    canHaveTheme,
  }: {
    open: boolean;
    editForm: SuperForm<EventForm>['form'];
    editErrors: SuperForm<EventForm>['errors'];
    editEnhance: SuperForm<EventForm>['enhance'];
    editDelayed: Readable<boolean>;
    themes: any[];
    canHaveTheme: boolean;
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-125">
    <Dialog.Header>
      <Dialog.Title>
        {canHaveTheme ? 'Notes & thème' : 'Notes pour le staff'}
      </Dialog.Title>
    </Dialog.Header>
    <form
      method="POST"
      action="?/updateEvent"
      use:editEnhance
      class="space-y-4"
    >
      <div class="space-y-2">
        <p class="text-xs text-muted-foreground">
          Mémo partagé avec l'équipe pédago (déroulé, consignes, infos
          pratiques).
        </p>
        <Textarea
          name="notes"
          bind:value={$editForm.notes}
          placeholder="Ex: déroulé de la journée, consignes pour l'équipe pédago, infos pratiques..."
          class="min-h-25 rounded-sm"
        />
        {#if $editErrors.notes}<p class="text-xs text-destructive">
            {$editErrors.notes}
          </p>{/if}
      </div>

      {#if canHaveTheme}
        <div class="space-y-2">
          <Label class="text-sm">Thème</Label>
          <ThemeSelect {themes} bind:value={$editForm.theme} name="theme" />
          {#if $editErrors.theme}<p class="text-xs text-destructive">
              {$editErrors.theme}
            </p>{/if}
        </div>
      {/if}

      <div class="flex justify-end pt-2">
        <Button type="submit" size="sm" disabled={$editDelayed}>
          {#if $editDelayed}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
            Sauvegarde...
          {:else}
            Enregistrer
          {/if}
        </Button>
      </div>
    </form>
  </Dialog.Content>
</Dialog.Root>
