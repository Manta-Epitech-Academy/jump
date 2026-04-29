<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Save, Eye } from '@lucide/svelte';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';

  let { data, form: actionData }: { data: PageData; form: ActionData } =
    $props();

  let content = $state(data.cmsContent);
  let showPreview = $state(false);
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
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Page d'accueil Talents</h1>
      <p class="text-sm text-muted-foreground">
        Ce contenu est affiché aux talents lorsqu'ils arrivent sur la
        plateforme.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showPreview = !showPreview)}
      >
        <Eye class="mr-2 h-4 w-4" />
        {showPreview ? 'Éditer' : 'Aperçu'}
      </Button>
    </div>
  </div>

  {#if showPreview}
    <div class="rounded-lg border border-border bg-card p-8">
      <div class="prose max-w-none prose-slate dark:prose-invert">
        {@html content}
      </div>
    </div>
  {:else}
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
  {/if}
</div>
