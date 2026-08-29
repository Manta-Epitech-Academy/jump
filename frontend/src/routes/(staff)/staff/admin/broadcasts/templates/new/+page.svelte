<script lang="ts">
  import TemplateForm from '$lib/components/admin/broadcasts/TemplateForm.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();
</script>

<div class="space-y-4">
  <PageHeader
    title="Nouveau"
    accent="template"
    subtitle="Canal et contenu : réutilisable pour un envoi en masse ou un mail transactionnel"
  />
  <TemplateForm
    data={data.form}
    submitLabel="Créer"
    smsEnabled={data.smsEnabled}
    userEmail={data.userEmail}
  />
</div>
