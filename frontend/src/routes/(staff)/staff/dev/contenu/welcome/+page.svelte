<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Save } from '@lucide/svelte';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';

  let { data, form: actionData }: { data: PageData; form: ActionData } =
    $props();

  let content = $state(data.cmsContent);
  let saving = $state(false);

  $effect(() => {
    if (actionData?.success) {
      toast.success("Page d'accueil mise à jour !");
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  });
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
  <div>
    <h1 class="text-2xl font-bold">Page d'accueil Talents</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Ce contenu est la première chose que les talents voient en arrivant sur la
      plateforme. Il s'affiche une seule fois, avant l'accès au tableau de bord.
      Utilisez-le pour présenter le programme, donner des consignes ou souhaiter
      la bienvenue.
    </p>
  </div>

  {#if data.canEdit}
    <form
      method="POST"
      action="?/save"
      use:enhance={() => {
        saving = true;
        return async ({ update }) => {
          saving = false;
          await update();
        };
      }}
    >
      <input type="hidden" name="content" value={content} />
      <CmsEditor
        bind:content
        placeholder="Rédigez le contenu de la page d'accueil..."
      />
      <div class="mt-4 flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save class="mr-2 h-4 w-4" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  {:else}
    <div class="rounded-lg border border-border bg-card p-8">
      {#if content}
        <div class="prose max-w-none prose-slate dark:prose-invert">
          {@html content}
        </div>
      {:else}
        <p class="text-center text-muted-foreground">
          Aucun contenu n'a encore été rédigé.
        </p>
      {/if}
    </div>
  {/if}
</div>
