<script lang="ts">
  import { page } from '$app/state';
  import Users from '@lucide/svelte/icons/users';
  import Globe from '@lucide/svelte/icons/globe';
  import Send from '@lucide/svelte/icons/send';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import * as Popover from '$lib/components/ui/popover';
  import * as Select from '$lib/components/ui/select';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import {
    FORM_STATUS_LABELS,
    FORM_STATUS_OPTIONS,
  } from '$lib/domain/feedbackForms/status';
  import FieldLabel from './FieldLabel.svelte';
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

  const publicUrl = $derived(`${page.url.origin}/bilan/${editor.slug}`);

  // A misconfiguration that breaks a live form: flag it on the trigger so it is
  // visible without opening the popover.
  const hasAlert = $derived(
    editor.publishedButUnreachable || editor.publicMissingEmail,
  );

  const summary = $derived(
    editor.allowsAuthenticatedAccess && editor.allowsPublicAccess
      ? 'Proposé aux talents connectés et aux répondants publics.'
      : editor.allowsAuthenticatedAccess
        ? 'Proposé aux talents connectés uniquement.'
        : editor.allowsPublicAccess
          ? 'Accessible publiquement uniquement.'
          : 'Aucun mode d’accès n’est activé : personne ne peut répondre.',
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
    class="max-h-[80vh] w-80 space-y-3 overflow-y-auto p-4"
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
      <div
        class="flex flex-wrap items-center gap-2 rounded-sm bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      >
        <span>Lien public :</span>
        <code class="rounded bg-background px-1.5 py-0.5"
          >/bilan/{editor.slug}</code
        >
        <CopyButton value={publicUrl} label="Copier le lien public" />
      </div>
    {/if}
  </Popover.Content>
</Popover.Root>
