<script lang="ts">
  import TemplateForm from '$lib/components/admin/broadcasts/TemplateForm.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data, form } = $props();
</script>

<div class="space-y-4">
  {#snippet usage()}
    <span class="text-xs text-muted-foreground">
      Utilisé dans {data.template._count.broadcasts} envoi(s)
    </span>
  {/snippet}
  <PageHeader
    title="Modifier le"
    accent="template"
    subtitle="Les envois déjà partis gardent leur snapshot"
    actions={usage}
  />

  {#if form?.success}
    <p
      class="rounded-sm border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700"
    >
      Enregistré.
    </p>
  {/if}

  <TemplateForm
    data={data.form}
    submitLabel="Enregistrer"
    formAction="?/update"
    smsEnabled={data.smsEnabled}
    userEmail={data.userEmail}
  />
</div>
