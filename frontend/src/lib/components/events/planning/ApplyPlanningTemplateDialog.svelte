<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { LayoutTemplate, TriangleAlert, LoaderCircle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import * as Alert from '$lib/components/ui/alert';
  import { toast } from 'svelte-sonner';
  import { onErrorToast } from '$lib/utils/formErrors';
  import type { PlanningWithSlots } from '$lib/types';

  let {
    open = $bindable(false),
    planningTemplates,
    applyTemplateForm: formData,
    planning,
  }: {
    open: boolean;
    planningTemplates: {
      id: string;
      nom: string;
      nbDays: number;
      description: string | null;
      _count: { days: number };
    }[];
    applyTemplateForm: any;
    planning: PlanningWithSlots | null;
  } = $props();

  const { form, errors, enhance, delayed } = superForm(
    untrack(() => formData),
    {
      id: 'apply-template',
      invalidateAll: true,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message || 'Modèle appliqué !');
        }
      },
      onError: onErrorToast(),
    },
  );

  const hasExistingPlanning = $derived(
    planning && planning.timeSlots && planning.timeSlots.length > 0,
  );

  const selectedTemplate = $derived(
    planningTemplates.find((t) => t.id === $form.planningTemplateId),
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title
        class="flex items-center gap-2 text-xl font-bold tracking-tight uppercase"
      >
        <LayoutTemplate class="h-5 w-5 text-epi-teal-solid" />
        Appliquer un modèle de planning
      </Dialog.Title>
      <Dialog.Description>
        Sélectionnez un modèle national pour générer automatiquement tous les
        créneaux et activités.
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="?/applyTemplate"
      use:enhance
      class="grid gap-6 py-4"
    >
      <div class="grid gap-2">
        <Select.Root
          type="single"
          value={$form.planningTemplateId}
          onValueChange={(v) => {
            if (v) $form.planningTemplateId = v;
          }}
        >
          <Select.Trigger class="font-bold">
            {selectedTemplate ? selectedTemplate.nom : 'Sélectionner un modèle'}
          </Select.Trigger>
          <Select.Content>
            {#each planningTemplates as pt}
              <Select.Item value={pt.id}>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold tracking-tight uppercase"
                    >{pt.nom}</span
                  >
                  <Badge
                    variant="secondary"
                    class="px-1.5 py-0 text-[10px] tracking-widest uppercase"
                  >
                    {pt.nbDays} jour{pt.nbDays > 1 ? 's' : ''}
                  </Badge>
                </div>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <input
          type="hidden"
          name="planningTemplateId"
          value={$form.planningTemplateId || ''}
        />
        {#if $errors.planningTemplateId}
          <span class="text-xs text-destructive">
            {$errors.planningTemplateId}
          </span>
        {/if}
      </div>

      {#if selectedTemplate?.description}
        <p
          class="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground"
        >
          {selectedTemplate.description}
        </p>
      {/if}

      {#if hasExistingPlanning}
        <Alert.Root
          variant="destructive"
          class="border-destructive/50 bg-destructive/5"
        >
          <TriangleAlert class="h-4 w-4" />
          <Alert.Title class="text-[11px] font-bold tracking-widest uppercase"
            >Planning existant</Alert.Title
          >
          <Alert.Description class="text-xs">
            Cette action remplacera tous les créneaux et activités actuels. Les
            données de présence associées seront perdues.
          </Alert.Description>
        </Alert.Root>
      {/if}

      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (open = false)}>Annuler</Button>
        <Button
          type="submit"
          disabled={$delayed || !$form.planningTemplateId}
          class="bg-epi-teal-solid font-bold text-white shadow-md hover:bg-epi-teal-solid/90 dark:shadow-none"
        >
          {#if $delayed}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
            Application...
          {:else}
            Appliquer
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
