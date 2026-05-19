<script lang="ts">
  import TemplateForm from '$lib/components/broadcasts/TemplateForm.svelte';

  let { data, form } = $props();
</script>

<div class="space-y-4">
  <header class="flex items-center justify-between">
    <h2 class="text-lg font-semibold">Modifier le template</h2>
    <span class="text-xs text-muted-foreground">
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

  <TemplateForm
    data={data.form}
    submitLabel="Enregistrer"
    formAction="?/update"
  />
</div>
