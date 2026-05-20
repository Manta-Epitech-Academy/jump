<script lang="ts">
  import TemplateForm from '$lib/components/admin/broadcasts/TemplateForm.svelte';
  import { enhance } from '$app/forms';

  let { data, form } = $props();

  let deleting = $state(false);
  let deleteForm = $state<HTMLFormElement>();

  function confirmDelete() {
    if (
      data.template._count.broadcasts > 0
        ? confirm(
            `Ce template a déjà servi pour ${data.template._count.broadcasts} envoi(s). La suppression bloquera. Continuer quand même ?`,
          )
        : confirm('Supprimer ce template ?')
    ) {
      deleting = true;
      deleteForm?.requestSubmit();
    }
  }
</script>

<div class="space-y-4">
  <header class="flex items-start justify-between gap-4">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Modifier le template</h1>
      <p class="text-sm text-muted-foreground">
        Met à jour le contenu ; les envois déjà partis gardent leur snapshot.
      </p>
    </div>
    <span class="shrink-0 text-xs text-muted-foreground">
      Utilisé dans {data.template._count.broadcasts} envoi(s)
    </span>
  </header>

  {#if form?.success}
    <p
      class="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700"
    >
      Enregistré.
    </p>
  {/if}
  {#if form?.deleteError}
    <p
      class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {form.deleteError}
    </p>
  {/if}

  <form
    bind:this={deleteForm}
    method="POST"
    action="?/delete"
    use:enhance
    class="hidden"
  ></form>

  <TemplateForm
    data={data.form}
    submitLabel="Enregistrer"
    formAction="?/update"
    onDelete={confirmDelete}
  />
</div>
