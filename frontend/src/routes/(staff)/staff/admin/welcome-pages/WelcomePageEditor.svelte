<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Tabs from '$lib/components/ui/tabs';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';
  import WelcomeMessageBody from '$lib/components/talent/WelcomeMessageBody.svelte';
  import {
    WELCOME_VARIABLES,
    renderWelcomeMessage,
    sampleWelcomeContext,
  } from '$lib/domain/welcomeMessage';
  import { cn } from '$lib/utils';
  import {
    STAGE_STATUS_META,
    formatStageRange,
    formatEditedAt,
    type StageStatus,
  } from './stageDisplay';
  import Save from '@lucide/svelte/icons/save';
  import Eye from '@lucide/svelte/icons/eye';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Mail from '@lucide/svelte/icons/mail';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  type SelectedStage = {
    id: string;
    titre: string;
    status: StageStatus;
    date: string;
    endDate: string;
    updatedAt: string | null;
    updatedByName: string | null;
    campusName: string;
    campusContactEmail: string | null;
  };

  // `event` + `initialContent` are snapshotted at mount. The parent wraps this
  // component in `{#key event.id}`, so switching stages remounts it with fresh
  // values — that's what lets the Tiptap editor (which only reads `content`
  // once, on mount) reload the correct stage's text without a page refresh.
  let {
    event,
    initialContent,
  }: { event: SelectedStage; initialContent: string } = $props();

  let editorRef = $state<CmsEditor>();
  // Intentional one-time snapshot (see remount note above); not meant to track
  // later prop changes.
  // svelte-ignore state_referenced_locally
  let content = $state(initialContent);
  // svelte-ignore state_referenced_locally
  let savedContent = $state(initialContent);
  let saving = $state(false);

  const dirty = $derived(content !== savedContent);

  // Preview what a talent sees: sample person name, but this campus's real name
  // + contact email + stage title, through the same renderer the talent
  // surfaces use.
  const previewHtml = $derived(
    renderWelcomeMessage(content, {
      ...sampleWelcomeContext(),
      campusName: event.campusName,
      campusContactEmail: event.campusContactEmail,
      stageName: event.titre,
    }),
  );
</script>

<div class="rounded-lg border border-border bg-card">
  <!-- Selection header -->
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"
  >
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h2 class="truncate text-base font-bold">{event.titre}</h2>
        <Badge
          variant="outline"
          class={cn('text-[10px]', STAGE_STATUS_META[event.status].class)}
        >
          {STAGE_STATUS_META[event.status].label}
        </Badge>
      </div>
      <p class="mt-0.5 text-xs text-muted-foreground">
        {event.campusName} · {formatStageRange(event.date, event.endDate)}
      </p>
    </div>
    <div class="text-right text-xs text-muted-foreground">
      {#if event.updatedAt}
        Modifié le {formatEditedAt(event.updatedAt)}
        {#if event.updatedByName}<br />par {event.updatedByName}{/if}
      {:else}
        Jamais rédigé
      {/if}
    </div>
  </div>

  <Tabs.Root value="edit" class="w-full">
    <div class="border-b border-border px-4 py-2">
      <Tabs.List>
        <Tabs.Trigger value="edit" class="cursor-pointer">
          <Pencil class="mr-1.5 h-3.5 w-3.5" /> Éditer
        </Tabs.Trigger>
        <Tabs.Trigger value="preview" class="cursor-pointer">
          <Eye class="mr-1.5 h-3.5 w-3.5" /> Aperçu talent
        </Tabs.Trigger>
      </Tabs.List>
    </div>

    <Tabs.Content value="edit" class="p-4">
      <form
        method="POST"
        action="?/save"
        use:enhance={() => {
          saving = true;
          return async ({ result, update }) => {
            saving = false;
            if (result.type === 'success') {
              savedContent = content;
              toast.success("Page d'accueil enregistrée.");
            } else if (result.type === 'failure') {
              toast.error(
                (result.data?.error as string) ?? "Échec de l'enregistrement.",
              );
            }
            await update({ reset: false });
          };
        }}
      >
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="content" value={content} />

        <div class="mb-2 flex flex-wrap items-center gap-1.5">
          <span class="mr-1 text-xs text-muted-foreground">Variables :</span>
          {#each WELCOME_VARIABLES as variable (variable.token)}
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-7 gap-1 font-mono text-xs"
              title={variable.description}
              onclick={() => editorRef?.insertText(variable.token)}
            >
              {variable.label}
            </Button>
          {/each}
        </div>

        <CmsEditor
          bind:this={editorRef}
          bind:content
          allowImageUpload
          placeholder="Rédigez le mot de bienvenue affiché aux stagiaires…"
        />
        <div class="mt-4 flex items-center justify-end gap-3">
          {#if dirty}
            <span
              class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500"
            >
              <TriangleAlert class="h-3.5 w-3.5" /> Modifications non enregistrées
            </span>
          {/if}
          <Button type="submit" disabled={saving || !dirty}>
            <Save class="mr-2 h-4 w-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Tabs.Content>

    <Tabs.Content value="preview" class="p-0">
      <!--
        Faithful to what talents actually see: the message lives in the
        dashboard "Actualités" feed and opens in a ResponsiveDialog
        (sm:max-w-2xl, Mail header, left-aligned prose). We reuse the same
        WelcomeMessageBody as the real card/dialog so the rendering stays
        identical — no centering, no logo/footer chrome.
      -->
      <div class="flex justify-center bg-muted/40 p-6">
        <div
          class="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-lg"
        >
          <div class="flex items-center gap-2 border-b border-border px-6 py-4">
            <Mail class="h-5 w-5 text-epi-blue" />
            <span class="text-lg font-semibold">Message de bienvenue</span>
          </div>
          <div class="px-6 py-4">
            {#if content.trim()}
              <WelcomeMessageBody content={previewHtml} />
            {:else}
              <p class="text-sm text-muted-foreground">
                Aucun contenu à prévisualiser.
              </p>
            {/if}
          </div>
        </div>
      </div>
      <p
        class="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground"
      >
        Vu par les talents dans le fil « Actualités » du tableau de bord, ouvert
        en fenêtre. Les variables affichent le campus
        <strong>{event.campusName}</strong> et un nom d'exemple (Marie Dupont).
      </p>
    </Tabs.Content>
  </Tabs.Root>
</div>
