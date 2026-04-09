<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Plus,
    Pencil,
    Trash2,
    BookOpen,
    ExternalLink,
    Globe,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import MultiThemeSelect from '$lib/components/MultiThemeSelect.svelte';
  import { toast } from 'svelte-sonner';
  import { difficultes } from '$lib/validation/subjects';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { getSubjectXpValue } from '$lib/domain/xp';
  import { m } from '$lib/paraglide/messages.js';
  import { translateDifficulty, translateTheme } from '$lib/utils';

  let { data } = $props();

  // Form handling and server response toasts
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

  // Dialog visibility variables
  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');

  // Delete confirmation states
  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  // Reset form with default values for a new entry
  function openCreate() {
    reset();
    $form.difficulte = 'Débutant';
    $form.themes = [];
    isEditing = false;
    editId = '';
    open = true;
  }

  // Populate form with existing data when editing
  function openEdit(subject: any) {
    reset();
    $form.nom = subject.nom;
    $form.description = subject.description;
    $form.difficulte = subject.difficulte;
    $form.link = subject.link || '';
    $form.themes = subject.subjectThemes?.map((st: any) => st.theme.nom) || [];
    isEditing = true;
    editId = subject.id;
    open = true;
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
        {m.admin_subjects_page_title()} <span class="text-epi-pink">{m.subject_tab_official()}</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        {m.admin_subjects_subtitle()}
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> {m.admin_subjects_new()}
    </Button>
  </div>

  <div class="rounded-sm border bg-card shadow-sm">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-12 text-center"
            ><Globe class="mx-auto h-4 w-4 text-epi-pink" /></Table.Head
          >
          <Table.Head>{m.subject_column_subject()}</Table.Head>
          <Table.Head>{m.common_field_themes()}</Table.Head>
          <Table.Head>{m.admin_subjects_col_level_xp()}</Table.Head>
          <Table.Head class="text-right">{m.common_actions()}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.subjects as subject}
          <Table.Row>
            <Table.Cell class="text-center"
              ><BookOpen
                class="mx-auto h-4 w-4 text-muted-foreground"
              /></Table.Cell
            >
            <Table.Cell>
              <div class="font-bold">
                {#if subject.link}
                  <a
                    href={subject.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="transition-colors hover:text-epi-pink hover:underline"
                  >
                    {subject.nom}
                  </a>
                {:else}
                  {subject.nom}
                {/if}
              </div>
              <div class="line-clamp-1 max-w-sm text-xs text-muted-foreground">
                {subject.description}
              </div>
            </Table.Cell>
            <Table.Cell>
              <div class="flex flex-wrap gap-1">
                {#each subject.subjectThemes || [] as st}
                  <Badge variant="secondary" class="text-[10px]"
                    >#{translateTheme(st.theme.nom)}</Badge
                  >
                {/each}
              </div>
            </Table.Cell>
            <Table.Cell>
              <Badge variant="outline" class="text-[10px] uppercase"
                >{translateDifficulty(subject.difficulte)}</Badge
              >
              <span class="ml-2 text-xs font-bold text-muted-foreground"
                >{getSubjectXpValue(subject.difficulte)} XP</span
              >
            </Table.Cell>
            <Table.Cell class="text-right">
              {#if subject.link}
                <Button
                  variant="ghost"
                  size="icon"
                  href={subject.link}
                  target="_blank"
                  class="text-epi-blue"
                >
                  <ExternalLink class="h-4 w-4" />
                </Button>
              {/if}
              <Button
                variant="ghost"
                size="icon"
                onclick={() => openEdit(subject)}
              >
                <Pencil class="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="text-destructive hover:text-destructive"
                onclick={() => confirmDelete(subject.id)}
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  <Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-xl">
      <Dialog.Header>
        <Dialog.Title
          >{isEditing
            ? m.subject_form_title_edit()
            : m.admin_subjects_form_create()}</Dialog.Title
        >
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        use:enhance
        class="grid gap-4 py-4"
      >
        {#if isEditing}<input type="hidden" name="id" value={editId} />{/if}
        <div class="grid gap-2">
          <Label>{m.common_field_name()}</Label>
          <Input name="nom" bind:value={$form.nom} />
          {#if $errors.nom}<span class="text-xs text-destructive"
              >{$errors.nom}</span
            >{/if}
        </div>
        <div class="grid gap-2">
          <Label>{m.admin_subjects_form_link()}</Label>
          <Input name="link" bind:value={$form.link} />
          {#if $errors.link}<span class="text-xs text-destructive"
              >{$errors.link}</span
            >{/if}
        </div>
        <div class="grid gap-2">
          <Label>{m.admin_subjects_form_themes()}</Label>
          <MultiThemeSelect themes={data.themes} bind:value={$form.themes} />
        </div>
        <div class="grid gap-2">
          <Label>{m.common_field_difficulty()}</Label>
          <div class="flex gap-2">
            {#each difficultes as diff}
              <Button
                type="button"
                variant={$form.difficulte === diff ? 'default' : 'outline'}
                size="sm"
                onclick={() => ($form.difficulte = diff)}
                class={$form.difficulte === diff ? 'bg-epi-pink' : ''}
              >
                {translateDifficulty(diff)}
              </Button>
            {/each}
            <input type="hidden" name="difficulte" value={$form.difficulte} />
          </div>
        </div>
        <div class="grid gap-2">
          <Label>{m.subject_form_description()}</Label>
          <Textarea
            name="description"
            bind:value={$form.description}
            class="h-24"
          />
        </div>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed ? m.common_processing() : m.admin_subjects_publish()}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title={m.admin_subjects_delete_title()}
    description={m.admin_subjects_delete_description()}
  />
</div>
