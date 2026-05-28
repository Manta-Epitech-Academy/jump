<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CheckCircle2 from '@lucide/svelte/icons/circle-check-big';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
  import * as Table from '$lib/components/ui/table';

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
  const NONE = '__none__';

  const th = 'text-xs uppercase';
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-bold tracking-tight">Mails transactionnels</h1>
    <p class="text-sm text-muted-foreground">
      Associe chaque action (OTP, bienvenue parent…) à un template
      <a
        href={resolve('/staff/admin/broadcasts/templates')}
        class="font-medium text-epi-blue hover:underline">éditable ici</a
      >. Si aucun template n'est lié, l'email n'est <strong>pas envoyé</strong>
      — l'utilisateur ne reçoit rien et le login OTP échoue silencieusement.
    </p>
  </header>

  {#if data.missingCount > 0}
    <div
      class="flex items-start gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-4 text-sm"
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
      class="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-200"
    >
      <CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      <p>
        Toutes les actions sont configurées. Les emails transactionnels partent
        normalement.
      </p>
    </div>
  {/if}

  <div class="overflow-hidden rounded-lg border">
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
              <code class="mt-1 inline-block text-[10px] text-muted-foreground"
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
                    class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
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
                <Select.Root
                  type="single"
                  value={selectedTemplate[action.key] || NONE}
                  onValueChange={(v) =>
                    (selectedTemplate[action.key] = v === NONE ? '' : v)}
                >
                  <Select.Trigger class="h-9 flex-1">
                    {data.templates.find(
                      (t) => t.id === selectedTemplate[action.key],
                    )?.name ?? '— Aucun (email ignoré) —'}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value={NONE}>
                      — Aucun (email ignoré) —
                    </Select.Item>
                    {#each data.templates as t (t.id)}
                      <Select.Item value={t.id}>{t.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <Button type="submit" size="sm" class="rounded-sm">
                  Enregistrer
                </Button>
              </form>
              {#if !mapping}
                <p class="mt-2 text-[11px] font-semibold text-destructive">
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
