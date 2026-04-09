<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { buttonVariants } from '$lib/components/ui/button';
  import { Plus } from '@lucide/svelte';
  import type { SuperForm } from 'sveltekit-superforms/client';
  import type { StudentForm } from '$lib/validation/students';
  import { m } from '$lib/paraglide/messages.js';

  let {
    open = $bindable(false),
    createForm,
    createEnhance,
  }: {
    open: boolean;
    createForm: SuperForm<StudentForm>['form'];
    createEnhance: SuperForm<StudentForm>['enhance'];
  } = $props();

  const niveauxScolaires = [
    '6eme',
    '5eme',
    '4eme',
    '3eme',
    '2nde',
    '1ere',
    'Terminale',
    'Sup',
  ];
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'sm' })}>
    <Plus class="mr-2 h-4 w-4" /> {m.common_new()}
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>{m.event_builder_quick_add_title()}</Dialog.Title></Dialog.Header>
    <form
      method="POST"
      action="?/quickCreateStudent"
      use:createEnhance
      class="space-y-4 py-4"
    >
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label>{m.student_form_nom()}</Label>
          <Input name="nom" bind:value={$createForm.nom} />
        </div>
        <div class="space-y-2">
          <Label>{m.student_form_prenom()}</Label>
          <Input name="prenom" bind:value={$createForm.prenom} />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label>{m.student_form_email()}</Label>
          <Input name="email" type="email" bind:value={$createForm.email} />
        </div>
        <div class="space-y-2">
          <Label>{m.student_form_phone()}</Label>
          <Input name="phone" type="tel" bind:value={$createForm.phone} />
        </div>
      </div>

      <div class="space-y-2">
        <Label>{m.student_form_level()}</Label>
        <Select.Root
          type="single"
          name="niveau"
          bind:value={$createForm.niveau}
        >
          <Select.Trigger>{$createForm.niveau || m.common_select()}</Select.Trigger
          >
          <Select.Content>
            {#each niveauxScolaires as nv}
              <Select.Item value={nv}>{nv}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <input type="hidden" name="niveau" value={$createForm.niveau} />
      </div>
      <Dialog.Footer
        ><Button type="submit">{m.event_builder_quick_create_submit()}</Button></Dialog.Footer
      >
    </form>
  </Dialog.Content>
</Dialog.Root>
