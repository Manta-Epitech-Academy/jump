<script lang="ts">
  import TemplateForm from '$lib/components/admin/broadcasts/TemplateForm.svelte';

  let { data } = $props();
</script>

<div class="space-y-4">
  <h2 class="text-lg font-semibold">Nouveau template</h2>
  <TemplateForm data={data.form} submitLabel="Créer" />
</div>
