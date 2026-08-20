<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CheckCircle2 from '@lucide/svelte/icons/circle-check-big';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();

  // Plain (non-superForm) POST: the shadcn Select doesn't emit a native form
  // control, so each row carries a controlled value mirrored into a hidden
  // input for submission. Seeded from the saved mapping. `''` = no template.
  // svelte-ignore state_referenced_locally
  let selectedTemplate = $state<Record<string, string>>(
    Object.fromEntries(
      data.rows.map(({ action, mapping }) => [
        action.key,
        mapping?.templateId ?? '',
      ]),
    ),
  );
  const templateOptions: SelectOption[] = $derived(
    data.templates.map((t) => ({ value: t.id, label: t.name })),
  );

  const th = 'text-xs uppercase';
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <PageHeader
      title="Mails"
      accent="transactionnels"
      subtitle="Chaque action automatique relayée vers un template"
    />
    <p class="max-w-3xl text-sm text-muted-foreground">
      Associe chaque action (OTP, bienvenue parent…) à un template
      <a
        href={resolve('/staff/admin/broadcasts/templates')}
        class="font-medium text-epi-blue hover:underline">éditable ici</a
      >. Si aucun template n'est lié, l'email n'est <strong>pas envoyé</strong> :
      l'utilisateur ne reçoit rien et le login OTP échoue silencieusement.
    </p>
  </div>

  {#if data.missingCount > 0}
    <div
      class="flex items-start gap-3 rounded-sm border-2 border-destructive bg-destructive/10 p-4 text-sm"
      role="alert"
    >
      <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div class="space-y-1">
        <p class="font-bold tracking-tight text-destructive uppercase">
          {data.missingCount} action{data.missingCount > 1 ? 's' : ''} sans template
        </p>
        <p>
          Les emails correspondants <strong>ne partent pas</strong>. Crée un
          template (canal mail), puis associe-le ci-dessous. Les actions
          concernées : OTP login talent/parent, bienvenue parent.
        </p>
      </div>
    </div>
  {:else}
    <div
      class="flex items-start gap-3 rounded-sm border border-success/40 bg-success/10 p-4 text-sm text-success"
    >
      <CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-success" />
      <p>
        Toutes les actions sont configurées. Les emails transactionnels partent
        normalement.
      </p>
    </div>
  {/if}

  <div class="overflow-hidden rounded-sm border">
    <Table.Root>
      <Table.Header class="bg-muted/50">
        <Table.Row>
          <Table.Head class={th}>Action</Table.Head>
          <Table.Head class={th}>Description</Table.Head>
          <Table.Head class={th}>Variables</Table.Head>
          <Table.Head class={th}>Template lié</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.rows as { action, mapping } (action.key)}
          <Table.Row>
            <Table.Cell class="align-top">
              <div class="font-medium">{action.label}</div>
              <code class="mt-1 inline-block text-xs text-muted-foreground"
                >{action.key}</code
              >
            </Table.Cell>
            <Table.Cell
              class="align-top text-xs whitespace-normal text-muted-foreground"
            >
              {action.description}
            </Table.Cell>
            <Table.Cell class="align-top">
              <div class="flex flex-wrap gap-1">
                {#each action.variables as v (v)}
                  <code
                    class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                    >{`{{${v}}}`}</code
                  >
                {/each}
              </div>
            </Table.Cell>
            <Table.Cell class="align-top">
              <form
                method="POST"
                action="?/save"
                use:enhance={() =>
                  async ({ result, update }) => {
                    if (result.type === 'success') {
                      toast.success(`« ${action.label} » enregistré.`);
                      await update();
                    } else {
                      toast.error(
                        (result.type === 'failure' &&
                          (result.data?.error as string)) ||
                          "Échec de l'enregistrement.",
                      );
                    }
                  }}
                class="flex items-center gap-2"
              >
                <input type="hidden" name="actionKey" value={action.key} />
                <input
                  type="hidden"
                  name="templateId"
                  value={selectedTemplate[action.key]}
                />
                <SearchableSelect
                  options={templateOptions}
                  value={selectedTemplate[action.key] || 'all'}
                  onChange={(v) =>
                    (selectedTemplate[action.key] = v === 'all' ? '' : v)}
                  allLabel="— Aucun (email ignoré) —"
                  placeholder="— Aucun (email ignoré) —"
                  searchPlaceholder="Rechercher un modèle…"
                  emptyLabel="Aucun modèle."
                  triggerClass="h-9 flex-1"
                />
                <Button type="submit" size="sm" class="rounded-sm">
                  Enregistrer
                </Button>
              </form>
              {#if !mapping}
                <p class="mt-2 text-xs font-semibold text-destructive">
                  Non configuré — emails ignorés
                </p>
              {/if}
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
