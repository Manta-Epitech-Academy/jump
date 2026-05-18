<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CheckCircle2 from '@lucide/svelte/icons/circle-check-big';
  import { Button } from '$lib/components/ui/button';

  let { data } = $props();
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
    <table class="w-full text-sm">
      <thead class="border-b bg-muted/50 text-left text-xs uppercase">
        <tr>
          <th class="px-4 py-3">Action</th>
          <th class="px-4 py-3">Description</th>
          <th class="px-4 py-3">Variables</th>
          <th class="px-4 py-3">Template lié</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rows as { action, mapping } (action.key)}
          <tr class="border-b last:border-b-0">
            <td class="px-4 py-3 align-top">
              <div class="font-medium">{action.label}</div>
              <code class="mt-1 inline-block text-[10px] text-muted-foreground"
                >{action.key}</code
              >
            </td>
            <td class="px-4 py-3 align-top text-xs text-muted-foreground">
              {action.description}
            </td>
            <td class="px-4 py-3 align-top">
              <div class="flex flex-wrap gap-1">
                {#each action.variables as v (v)}
                  <code
                    class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >{`{{${v}}}`}</code
                  >
                {/each}
              </div>
            </td>
            <td class="px-4 py-3 align-top">
              <form
                method="POST"
                action="?/save"
                use:enhance
                class="flex items-center gap-2"
              >
                <input type="hidden" name="actionKey" value={action.key} />
                <select
                  name="templateId"
                  class="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— Aucun (email ignoré) —</option>
                  {#each data.templates as t (t.id)}
                    <option
                      value={t.id}
                      selected={mapping?.templateId === t.id}
                    >
                      {t.name}
                    </option>
                  {/each}
                </select>
                <Button type="submit" size="sm" class="rounded-sm">
                  Enregistrer
                </Button>
              </form>
              {#if !mapping}
                <p class="mt-2 text-[11px] font-semibold text-destructive">
                  Non configuré — emails ignorés
                </p>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
