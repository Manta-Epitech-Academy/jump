<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import * as Select from '$lib/components/ui/select';
  import {
    FORM_STATUS_LABELS,
    FORM_STATUS_OPTIONS,
  } from '$lib/domain/feedbackForms/status';
  import FieldLabel from './FieldLabel.svelte';
  import type { FormEditor, FormStatus, FormMeta } from '../editor.svelte';

  let { editor }: { editor: FormEditor } = $props();

  // Access modes (who can answer) and the public link live in the header
  // "Diffusion" control, not here. This tab owns form behaviour only.
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
            {FORM_STATUS_LABELS[editor.status]}
          </Select.Trigger>
          <Select.Content>
            {#each FORM_STATUS_OPTIONS as opt (opt.value)}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
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
    <FieldLabel text="Relance" />
    <label
      class="flex cursor-pointer items-start justify-between gap-3 rounded-sm border px-3 py-2.5"
    >
      <span class="flex flex-col gap-0.5">
        <span class="text-sm font-medium">Relance sur le tableau de bord</span>
        <span class="text-[11px] leading-snug text-muted-foreground">
          Affiche une carte de rappel tant que le stagiaire n’a pas répondu.
        </span>
      </span>
      <Switch
        checked={editor.dashboardNudge}
        onCheckedChange={(v) =>
          v !== editor.dashboardNudge &&
          editor.patchForm({ dashboardNudge: v } as Partial<FormMeta>)}
      />
    </label>
  </div>
</div>
