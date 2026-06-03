<script lang="ts">
  import TemplateForm from '$lib/components/admin/broadcasts/TemplateForm.svelte';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';

  let { data } = $props();
</script>

<div class="space-y-4">
  <AdminPageHeader
    title="Nouveau"
    accent="template"
    subtitle="Canal et contenu — réutilisable pour un envoi en masse ou un mail transactionnel"
  />
  <TemplateForm
    data={data.form}
    submitLabel="Créer"
    smsEnabled={data.smsEnabled}
    userEmail={data.userEmail}
  />
</div>
