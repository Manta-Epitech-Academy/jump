<script lang="ts">
  import TemplateForm from '$lib/components/admin/broadcasts/TemplateForm.svelte';

  let { data } = $props();
</script>

<div class="space-y-4">
  <header class="space-y-2">
    <h1 class="text-2xl font-bold tracking-tight">Nouveau template</h1>
    <p class="text-sm text-muted-foreground">
      Définis le canal et le contenu de ce template ; il pourra ensuite servir
      pour un envoi en masse ou un mail transactionnel.
    </p>
  </header>
  <TemplateForm
    data={data.form}
    submitLabel="Créer"
    smsEnabled={data.smsEnabled}
    userEmail={data.userEmail}
  />
</div>
