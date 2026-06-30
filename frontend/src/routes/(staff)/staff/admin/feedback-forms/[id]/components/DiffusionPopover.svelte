<script lang="ts">
  import { page } from '$app/state';
  import Users from '@lucide/svelte/icons/users';
  import Globe from '@lucide/svelte/icons/globe';
  import Send from '@lucide/svelte/icons/send';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Link2Off from '@lucide/svelte/icons/link-2-off';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import * as Popover from '$lib/components/ui/popover';
  import * as Select from '$lib/components/ui/select';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import {
    FORM_STATUS_LABELS,
    FORM_STATUS_OPTIONS,
  } from '$lib/domain/feedbackForms/status';
  import { publicFormPath } from '$lib/domain/feedback';
  import { EVENT_TYPE_VALUES, eventTypeLabel } from '$lib/domain/event';
  import FieldLabel from './FieldLabel.svelte';

  // Sentinel for "not a default" in the select (bits-ui Select wants a non-empty
  // value); mapped back to null on the way to the patch.
  const NO_DEFAULT = 'none';
  import type { FormEditor, FormMeta, FormStatus } from '../editor.svelte';

  let { editor }: { editor: FormEditor } = $props();

  // Google-Forms-style "Send" pattern: a sharing control in the header chrome,
  // replacing the settings tab. Owns the publish statut, who can answer (the two
  // access modes), the dashboard relance, and the public link. The persona name
  // is edited inline in the header card.
  const TOGGLES = [
    {
      key: 'allowsAuthenticatedAccess',
      label: 'Talents connectés',
      help: 'Proposé aux stagiaires connectés depuis leur espace.',
    },
    {
      key: 'allowsPublicAccess',
      label: 'Répondants publics',
      help: 'Accessible sans compte via un lien partageable.',
    },
  ] as const;

  const publicUrl = $derived(
    `${page.url.origin}${publicFormPath(editor.slug)}`,
  );

  // A misconfiguration that breaks a live form: flag it on the trigger so it is
  // visible without opening the popover.
  const hasAlert = $derived(
    editor.publishedButUnreachable || editor.publicMissingEmail,
  );

  // The honest "who can respond right now": folds the publish statut into the
  // access modes, so a draft or archived form never reads as if it were live.
  const summary = $derived(
    !editor.isPublished
      ? editor.status === 'archived'
        ? 'Formulaire archivé : il n’accepte plus de réponses.'
        : 'Brouillon : personne ne peut répondre tant qu’il n’est pas publié.'
      : editor.liveForAuthenticated && editor.liveForPublic
        ? 'En ligne pour les talents connectés et les répondants publics.'
        : editor.liveForAuthenticated
          ? 'En ligne pour les talents connectés.'
          : editor.liveForPublic
            ? 'En ligne pour les répondants publics.'
            : 'Publié, mais personne ne peut répondre pour l’instant.',
  );
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm" class="rounded-sm">
        {#if hasAlert}
          <TriangleAlert class="mr-1.5 h-4 w-4 text-amber-600" />
        {:else}
          <Send class="mr-1.5 h-4 w-4" />
        {/if}
        Diffusion
        <!-- Audience at a glance: an enabled mode is solid, a disabled one dimmed. -->
        <span class="ml-2 flex items-center gap-1">
          <Users
            class="h-3.5 w-3.5 {editor.allowsAuthenticatedAccess
              ? 'text-foreground'
              : 'text-muted-foreground/30'}"
          />
          <Globe
            class="h-3.5 w-3.5 {editor.allowsPublicAccess
              ? 'text-foreground'
              : 'text-muted-foreground/30'}"
          />
        </span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="end"
    class="max-h-[80vh] w-96 space-y-3 overflow-y-auto p-4"
  >
    <div class="space-y-0.5">
      <p class="text-sm font-semibold">Diffusion</p>
      <p class="text-[11px] leading-snug text-muted-foreground">{summary}</p>
    </div>

    <div class="space-y-1.5">
      <FieldLabel text="Statut" />
      <Select.Root
        type="single"
        value={editor.status}
        onValueChange={(v) =>
          v &&
          v !== editor.status &&
          editor.patchForm({ status: v as FormStatus })}
      >
        <Select.Trigger class="h-9 w-full rounded-sm">
          {FORM_STATUS_LABELS[editor.status]}
        </Select.Trigger>
        <Select.Content>
          {#each FORM_STATUS_OPTIONS as opt (opt.value)}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    {#if editor.publishedButUnreachable}
      <div
        class="flex items-start gap-2 rounded-sm border border-amber-300 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
      >
        <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p class="min-w-0 flex-1">
          Ce formulaire est publié mais aucun mode d'accès n'est activé :
          personne ne peut y répondre.
        </p>
      </div>
    {/if}

    {#each TOGGLES as t (t.key)}
      <label
        class="flex cursor-pointer items-start justify-between gap-3 rounded-sm border px-3 py-2.5"
      >
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-medium">{t.label}</span>
          <span class="text-[11px] leading-snug text-muted-foreground"
            >{t.help}</span
          >
        </span>
        <Switch
          checked={editor[t.key]}
          onCheckedChange={(v) =>
            v !== editor[t.key] &&
            editor.patchForm({ [t.key]: v } as Partial<FormMeta>)}
        />
      </label>
    {/each}

    {#if editor.allowsAuthenticatedAccess}
      <!-- Relance only reaches connected talents (the public has no dashboard),
           so it is offered only when authenticated access is on. -->
      <label
        class="flex cursor-pointer items-start justify-between gap-3 rounded-sm border px-3 py-2.5"
      >
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-medium">Relance sur le tableau de bord</span
          >
          <span class="text-[11px] leading-snug text-muted-foreground">
            Affiche une carte de rappel aux talents connectés tant qu’ils n’ont
            pas répondu.
          </span>
        </span>
        <Switch
          checked={editor.dashboardNudge}
          onCheckedChange={(v) =>
            v !== editor.dashboardNudge &&
            editor.patchForm({ dashboardNudge: v } as Partial<FormMeta>)}
        />
      </label>
    {/if}

    <!-- Default form for an event type: events of that type auto-use this form
         (their Bilan tab, QR and export resolve to it) unless a specific form is
         chosen for the event. At most one form per type, so picking it here
         releases whatever form held it before. -->
    <div class="space-y-1.5">
      <FieldLabel
        text="Formulaire par défaut pour"
        info="Les événements de ce type utilisent ce formulaire par défaut (sauf si un autre formulaire est choisi pour l'événement). Un seul formulaire par défaut par type : le choisir ici le retire du formulaire qui l'avait."
      />
      <Select.Root
        type="single"
        value={editor.defaultForEventType ?? NO_DEFAULT}
        onValueChange={(v) => {
          const next = v === NO_DEFAULT ? null : v;
          if (next !== editor.defaultForEventType)
            editor.patchForm({ defaultForEventType: next });
        }}
      >
        <Select.Trigger class="h-9 w-full rounded-sm">
          {editor.defaultForEventType
            ? eventTypeLabel(editor.defaultForEventType)
            : 'Aucun'}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={NO_DEFAULT}>Aucun</Select.Item>
          {#each EVENT_TYPE_VALUES as t (t)}
            <Select.Item value={t}>{eventTypeLabel(t)}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    {#if editor.allowsPublicAccess}
      {#if editor.publicMissingEmail}
        <div
          class="flex items-start gap-2 rounded-sm border border-amber-300 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p class="min-w-0 flex-1">
            Aucune question ne collecte l'e-mail : chaque réponse publique sera
            refusée. Ajoutez une question « Donnée d'identité : E-mail ».
          </p>
        </div>
      {/if}
      <!-- The public route 404s unless the form is published with an e-mail
           question, so the link only reads as copyable when it actually
           resolves. Otherwise it's a dimmed, dashed "inactive" block (not just a
           missing copy button) with the reason, so a dead link is never mistaken
           for a shareable one. -->
      {#if editor.liveForPublic}
        <div
          class="flex flex-wrap items-center gap-2 rounded-sm bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          <span>Lien public :</span>
          <code class="rounded bg-background px-1.5 py-0.5"
            >{publicFormPath(editor.slug)}</code
          >
          <CopyButton value={publicUrl} label="Copier le lien public" />
        </div>
      {:else}
        <div
          class="space-y-1.5 rounded-sm border border-dashed border-muted-foreground/30 px-3 py-2.5"
        >
          <div
            class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70"
          >
            <Link2Off class="h-3.5 w-3.5 shrink-0" />
            <span>Lien public inactif :</span>
            <code
              class="rounded bg-muted px-1.5 py-0.5 break-all text-muted-foreground/60"
              >{publicFormPath(editor.slug)}</code
            >
          </div>
          {#if !editor.isPublished}
            <p class="text-[11px] leading-snug text-muted-foreground">
              {editor.status === 'archived'
                ? 'Formulaire archivé : ce lien renvoie une erreur.'
                : 'Le lien sera actif une fois le formulaire publié.'}
            </p>
          {/if}
        </div>
      {/if}
    {/if}
  </Popover.Content>
</Popover.Root>
