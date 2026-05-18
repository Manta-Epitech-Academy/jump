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
  }: {
    open: boolean;
    editForm: SuperForm<EventForm>['form'];
    editErrors: SuperForm<EventForm>['errors'];
    editEnhance: SuperForm<EventForm>['enhance'];
    editDelayed: Readable<boolean>;
    themes: any[];
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-125">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight uppercase"
        >Paramètres de l'événement</Dialog.Title
      >
    </Dialog.Header>
    <div class="space-y-6">
      <form
        method="POST"
        action="?/updateEvent"
        use:editEnhance
        class="space-y-4 py-2"
      >
        <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
          <div class="space-y-2">
            <Label class="text-[10px] font-bold tracking-widest uppercase"
              >Notes & Planning</Label
            >
            <Textarea
              name="notes"
              bind:value={$editForm.notes}
              placeholder="Ex: 14h00 Intro, 15h30 Pause..."
              class="min-h-25 rounded-sm bg-background"
            />
            {#if $editErrors.notes}<p class="text-xs text-destructive">
                {$editErrors.notes}
              </p>{/if}
          </div>
        </div>

        <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
          <div class="space-y-2">
            <Label class="text-[10px] font-bold tracking-widest uppercase"
              >Thème</Label
            >
            <div class="rounded-sm bg-background">
              <ThemeSelect {themes} bind:value={$editForm.theme} name="theme" />
            </div>
            {#if $editErrors.theme}<p class="text-xs text-destructive">
                {$editErrors.theme}
              </p>{/if}
          </div>
        </div>

        <div class="flex justify-end pt-4">
          <Button
            type="submit"
            disabled={$editDelayed}
            class="rounded-sm bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
          >
            {#if $editDelayed}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
              Sauvegarde...
            {:else}
              Sauvegarder
            {/if}
          </Button>
        </div>
      </form>
    </div>
  </Dialog.Content>
</Dialog.Root>
