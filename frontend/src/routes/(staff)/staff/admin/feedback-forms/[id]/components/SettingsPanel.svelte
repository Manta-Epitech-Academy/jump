<script lang="ts">
  import { page } from '$app/state';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import * as Select from '$lib/components/ui/select';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import FieldLabel from './FieldLabel.svelte';
  import type { FormEditor, FormStatus, FormMeta } from '../editor.svelte';

  let { editor }: { editor: FormEditor } = $props();

  const STATUS_LABELS: Record<FormStatus, string> = {
    draft: 'Brouillon',
    published: 'Publié',
    archived: 'Archivé',
  };

  const publicUrl = $derived(`${page.url.origin}/bilan/${editor.slug}`);

  const TOGGLES = [
    {
      key: 'allowsAuthenticatedAccess',
      label: 'Accès authentifié',
      help: 'Proposé aux stagiaires connectés depuis leur espace.',
    },
    {
      key: 'allowsPublicAccess',
      label: 'Accès public',
      help: 'Accessible sans compte via un lien partageable.',
    },
    {
      key: 'dashboardNudge',
      label: 'Relance sur le tableau de bord',
      help: 'Affiche une carte de rappel tant que le stagiaire n’a pas répondu.',
    },
  ] as const;
</script>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="space-y-5 rounded-sm border bg-card p-5 shadow-sm">
    <div class="grid gap-4 sm:grid-cols-2">
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
            {STATUS_LABELS[editor.status]}
          </Select.Trigger>
          <Select.Content>
            {#each Object.entries(STATUS_LABELS) as [value, label] (value)}
              <Select.Item {value}>{label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="space-y-1.5">
        <FieldLabel
          text="Mascotte"
          info="Nom de l'interlocuteur du fil (laisser vide pour la valeur par défaut)."
        />
        <Input
          value={editor.personaName ?? ''}
          class="h-9 rounded-sm"
          onblur={(e) =>
            (e.currentTarget.value || null) !== editor.personaName &&
            editor.patchForm({ personaName: e.currentTarget.value || null })}
        />
      </div>
    </div>
  </div>

  <div class="space-y-3 rounded-sm border bg-card p-5 shadow-sm">
    <FieldLabel text="Accès & diffusion" />
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

    {#if editor.allowsPublicAccess}
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
  </div>
</div>
