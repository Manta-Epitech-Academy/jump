<script lang="ts">
  import type { PageData, ActionData } from './$types';
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
  import Save from '@lucide/svelte/icons/save';
  import Eye from '@lucide/svelte/icons/eye';
  import Pencil from '@lucide/svelte/icons/pencil';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Mail from '@lucide/svelte/icons/mail';
  import Users from '@lucide/svelte/icons/users';
  import Lock from '@lucide/svelte/icons/lock';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  let { data, form: actionData }: { data: PageData; form: ActionData } =
    $props();

  let editorRef = $state<CmsEditor>();
  // svelte-ignore state_referenced_locally
  let content = $state(data.selectedContent);
  // svelte-ignore state_referenced_locally
  let savedContent = $state(data.selectedContent);
  let saving = $state(false);

  // Reset the editor buffer whenever the load function hands us a different
  // stage (navigating via the picker re-runs `load`).
  // svelte-ignore state_referenced_locally
  let loadedFor = $state(data.selectedEventId);
  $effect(() => {
    if (data.selectedEventId !== loadedFor) {
      loadedFor = data.selectedEventId;
      content = data.selectedContent;
      savedContent = data.selectedContent;
    }
  });

  const dirty = $derived(content !== savedContent);

  $effect(() => {
    if (actionData?.success) {
      savedContent = content;
      toast.success("Page d'accueil enregistrée.");
    } else if (actionData?.error) {
      toast.error(actionData.error);
    }
  });

  const STATUS_META: Record<
    'ongoing' | 'upcoming' | 'past',
    { label: string; class: string }
  > = {
    ongoing: {
      label: 'En cours',
      class: 'bg-epi-teal/15 text-epi-teal-solid border-epi-teal/30',
    },
    upcoming: {
      label: 'À venir',
      class: 'bg-epi-blue/10 text-epi-blue border-epi-blue/20',
    },
    past: { label: 'Archivé', class: 'bg-muted text-muted-foreground' },
  };

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fmtRange = (start: string, end: string) =>
    `${dateFmt.format(new Date(start))} → ${dateFmt.format(new Date(end))}`;

  function selectHref(eventId: string) {
    return `?event=${eventId}`;
  }

  // Preview what a talent sees: sample person name, but the selected campus's
  // real name + contact email + stage title, run through the same renderer the
  // talent surfaces use.
  const previewHtml = $derived.by(() => {
    const sel = data.selected;
    const ctx = sel
      ? {
          ...sampleWelcomeContext(),
          campusName: sel.campusName,
          campusContactEmail: sel.campusContactEmail,
          stageName: sel.titre,
        }
      : sampleWelcomeContext();
    return renderWelcomeMessage(content, ctx);
  });
</script>

<div class="mb-6">
  <h1 class="text-2xl font-bold">
    Pages d'accueil talents<span class="text-epi-pink">_</span>
  </h1>
  <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
    Le message de bienvenue affiché aux talents dans le fil « Actualités » de
    leur tableau de bord, pendant toute la durée du stage. Vous éditez ici la
    page de <strong>n'importe quel campus</strong> et de
    <strong>n'importe quel stage</strong> — au-delà du seul stage en cours
    accessible aux équipes dev et pédago. Insérez des <strong>variables</strong> (prénom,
    campus, email de contact…) ; elles sont remplacées par les valeurs réelles de
    chaque talent.
  </p>
</div>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
  <!-- Campus / stage picker -->
  <aside class="space-y-5 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
    {#each data.campuses as campus (campus.id)}
      <div class="rounded-lg border border-border bg-card">
        <div
          class="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2">
            <MapPin class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="truncate text-sm font-bold">{campus.name}</span>
          </div>
          {#if campus.flagEnabled}
            <Badge
              variant="outline"
              class="shrink-0 gap-1 border-epi-teal/30 bg-epi-teal/10 text-[10px] text-epi-teal-solid"
              title="Flag staff_welcome_page actif : les équipes dev et pédago peuvent aussi éditer la page de ce campus."
            >
              <Users class="h-3 w-3" /> Dev & pédago aussi
            </Badge>
          {:else}
            <Badge
              variant="outline"
              class="shrink-0 gap-1 text-[10px] text-muted-foreground"
              title="Flag staff_welcome_page inactif : seul l'admin peut éditer ici (les talents voient quand même le contenu enregistré)."
            >
              <Lock class="h-3 w-3" /> Admin uniquement
            </Badge>
          {/if}
        </div>

        {#if campus.events.length === 0}
          <p class="px-3 py-3 text-xs text-muted-foreground">
            Aucun stage de seconde. Créez d'abord un événement pour ce campus.
          </p>
        {:else}
          <ul class="divide-y divide-border">
            {#each campus.events as ev (ev.id)}
              {@const active = ev.id === data.selectedEventId}
              <li>
                <a
                  href={selectHref(ev.id)}
                  class={cn(
                    'flex flex-col gap-1 px-3 py-2.5 text-sm transition-colors hover:bg-accent',
                    active &&
                      'bg-epi-pink/10 ring-1 ring-epi-pink/30 ring-inset',
                  )}
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-medium">{ev.titre}</span>
                    <Badge
                      variant="outline"
                      class={cn(
                        'shrink-0 text-[10px]',
                        STATUS_META[ev.status].class,
                      )}
                    >
                      {STATUS_META[ev.status].label}
                    </Badge>
                  </div>
                  <div
                    class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span>{fmtRange(ev.date, ev.endDate)}</span>
                    {#if ev.hasContent}
                      <span class="flex items-center gap-1 text-epi-teal-solid">
                        <CircleCheck class="h-3 w-3" /> Contenu
                      </span>
                    {:else}
                      <span class="flex items-center gap-1">
                        <CircleDashed class="h-3 w-3" /> Vide
                      </span>
                    {/if}
                  </div>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </aside>

  <!-- Editor / preview -->
  <section class="min-w-0">
    {#if !data.selected}
      <div
        class="rounded-lg border border-dashed border-border bg-card p-10 text-center"
      >
        <p class="text-sm text-muted-foreground">
          Aucun stage de seconde n'existe encore. Créez un événement pour
          commencer à rédiger une page d'accueil.
        </p>
      </div>
    {:else}
      {@const sel = data.selected}
      <div class="rounded-lg border border-border bg-card">
        <!-- Selection header -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-base font-bold">{sel.titre}</h2>
              <Badge
                variant="outline"
                class={cn('text-[10px]', STATUS_META[sel.status].class)}
              >
                {STATUS_META[sel.status].label}
              </Badge>
            </div>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {sel.campusName} · {fmtRange(sel.date, sel.endDate)}
            </p>
          </div>
          <div class="text-right text-xs text-muted-foreground">
            {#if sel.updatedAt}
              Modifié le {dateTimeFmt.format(new Date(sel.updatedAt))}
              {#if sel.updatedByName}<br />par {sel.updatedByName}{/if}
            {:else}
              Jamais rédigé
            {/if}
          </div>
        </div>

        <Tabs.Root value="edit" class="w-full">
          <div
            class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2"
          >
            <Tabs.List>
              <Tabs.Trigger value="edit">
                <Pencil class="mr-1.5 h-3.5 w-3.5" /> Éditer
              </Tabs.Trigger>
              <Tabs.Trigger value="preview">
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
                return async ({ update }) => {
                  saving = false;
                  await update({ reset: false });
                };
              }}
            >
              <input type="hidden" name="eventId" value={sel.id} />
              <input type="hidden" name="content" value={content} />

              <div class="mb-2 flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-xs text-muted-foreground"
                  >Variables :</span
                >
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
                <div
                  class="flex items-center gap-2 border-b border-border px-6 py-4"
                >
                  <Mail class="h-5 w-5 text-epi-blue" />
                  <span class="text-lg font-semibold">Message de bienvenue</span
                  >
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
              Vu par les talents dans le fil « Actualités » du tableau de bord,
              ouvert en fenêtre. Les variables affichent le campus
              <strong>{sel.campusName}</strong> et un nom d'exemple (Marie Dupont).
            </p>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    {/if}
  </section>
</div>
