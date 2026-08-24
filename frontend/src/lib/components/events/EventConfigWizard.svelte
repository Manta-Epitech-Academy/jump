<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import Database from '@lucide/svelte/icons/database';
  import CalendarCog from '@lucide/svelte/icons/calendar-cog';
  import LayoutTemplate from '@lucide/svelte/icons/layout-template';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Copy from '@lucide/svelte/icons/copy';
  import Plus from '@lucide/svelte/icons/plus';
  import Check from '@lucide/svelte/icons/check';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import X from '@lucide/svelte/icons/x';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import { TimePicker } from '$lib/components/ui/time-picker';
  import { DatePicker } from '$lib/components/ui/date-picker';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import InfoTooltip from '$lib/components/ui/info-tooltip/InfoTooltip.svelte';
  import EventModuleIcon from '$lib/components/events/EventModuleIcon.svelte';
  import AdminSfStatusInspectorDialog from '$lib/components/events/AdminSfStatusInspectorDialog.svelte';
  import {
    EVENT_MODULE_DEFS,
    EVENT_MODULE_KEYS,
    defaultModuleSettings,
    type EventModuleKey,
  } from '$lib/domain/eventModules';
  import { effectiveStartMinutes, minutesToHHMM } from '$lib/domain/event';
  import type { AdminEventForm } from '$lib/validation/events';
  import { enhance as kitEnhance, deserialize } from '$app/forms';
  import { toast } from 'svelte-sonner';

  // Structural subset of AdminEventVM the wizard needs (kept local so this
  // component doesn't import a +page.server type).
  type EditingEvent = {
    id: string;
    titre: string;
    publicName: string;
    cohortNoun: string | null;
    campusName: string;
    dateLabel: string;
    startDateKey: string;
    startTime: string;
    endDate: string;
    modules: EventModuleKey[];
    moduleSettings: Record<string, unknown>;
    devActivated: boolean;
    feedbackFormId: string;
    diplomaTemplateId: string;
    participations: number;
  };

  type TemplateVM = {
    id: string;
    name: string;
    description: string | null;
    publicName: string | null;
    cohortNoun: string | null;
    startTime: string;
    feedbackFormId: string | null;
    diplomaTemplateId: string | null;
    modules: EventModuleKey[];
    moduleSettings: Record<string, unknown>;
  };

  let {
    open = $bindable(false),
    editing,
    formData,
    feedbackForms,
    certificates,
    formPreviews,
    templates,
  }: {
    open: boolean;
    editing: EditingEvent | null;
    formData: SuperValidated<AdminEventForm>;
    feedbackForms: { value: string; label: string }[];
    /** The certificates an event can be set to issue. */
    certificates: { value: string; label: string }[];
    /** Per-form ordered question prompts, for the inline read-only preview. */
    formPreviews: Record<string, string[]>;
    templates: TemplateVM[];
  } = $props();

  const { form, errors, enhance, delayed } = superForm(
    untrack(() => formData),
    {
      // Nested moduleSettings + arrays post cleanly as JSON rather than as
      // flattened form fields.
      dataType: 'json',
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message || 'Événement mis à jour.');
        }
      },
    },
  );

  // ─── Wizard step state ───────────────────────────────────────────────────
  let step = $state<1 | 2>(1);
  let selectedTemplateId = $state<string | null>(null);

  // Local copy of the template catalogue, seeded ONCE from the prop at mount.
  // Save/delete mutate THIS optimistically rather than invalidating the page
  // (invalidation reloaded `data.form` and wiped the in-progress config). It is
  // deliberately NOT reseeded per open: the prop never refreshes without an
  // invalidation, so reseeding would drop a template just saved while configuring
  // another event (it would reappear only on a full reload).
  let workingTemplates = $state<TemplateVM[]>(untrack(() => [...templates]));
  let confirmingDeleteId = $state<string | null>(null);
  let inspectorOpen = $state(false);

  // Fill all module keys with their defaults, merged over any saved/template
  // values, so a freshly-toggled module already has a typed settings object.
  function withDefaults(
    existing: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of EVENT_MODULE_KEYS) {
      out[key] = {
        ...defaultModuleSettings(key),
        ...((existing[key] as object) ?? {}),
      };
    }
    return out;
  }

  function prefill(e: EditingEvent) {
    $form.id = e.id;
    $form.publicName = e.publicName;
    // The persisted noun, or '' when the event was never named (the field then
    // shows its placeholder). The SF type is never consulted here: a per-type
    // default rides the config template the admin starts from (the stage template
    // carries "stagiaire"), and an event keeps whatever staff last set.
    $form.cohortNoun = e.cohortNoun ?? '';
    $form.startTime = e.startTime;
    $form.endDate = e.endDate;
    $form.modules = [...e.modules];
    $form.moduleSettings = withDefaults(e.moduleSettings);
    $form.devActivated = e.devActivated;
    $form.feedbackFormId = e.feedbackFormId;
    $form.diplomaTemplateId = e.diplomaTemplateId;
    selectedTemplateId = null;
    confirmingDeleteId = null;
    dismissHighCount = false;
    // The catalogue mirrors (workingTemplates / workingForms / workingPreviews)
    // are NOT reseeded here: they are seeded once at mount and kept across opens
    // so an optimistic save/duplicate survives switching to another event.
    // Step 1 (pick a starting template) only matters the first time an event is
    // set up. A never-configured event has no module rows yet and opens on it;
    // an already-configured one opens straight on step 2 to tweak. The "Choisir
    // un modèle" link on step 2 still re-enters step 1 on demand.
    step = e.modules.length === 0 ? 1 : 2;
  }

  // Prefill once per open, keyed on the event id (re-runs when a different row
  // opens the dialog; the close resets the guard).
  let openedFor = $state<string | null>(null);
  $effect(() => {
    if (open && editing && editing.id !== openedFor) {
      const e = editing;
      untrack(() => prefill(e));
      openedFor = editing.id;
    } else if (!open && openedFor !== null) {
      openedFor = null;
    }
  });

  // ─── Templates (step 1) ──────────────────────────────────────────────────
  // A flat, alphabetical catalogue: the admin picks any template or none. There
  // is no per-kind grouping (events no longer carry a type to match against).
  const byName = (a: TemplateVM, b: TemplateVM) =>
    a.name.localeCompare(b.name, 'fr');
  const sortedTemplates = $derived(workingTemplates.slice().sort(byName));

  function applyTemplate(t: TemplateVM) {
    $form.modules = [...t.modules];
    $form.moduleSettings = withDefaults(t.moduleSettings);
    $form.feedbackFormId = t.feedbackFormId ?? '';
    $form.diplomaTemplateId = t.diplomaTemplateId ?? '';
    // Prefilled like the rest of the preset: a wholesale copy the admin can still
    // edit on step 2. Empty falls back as usual (publicName → the SF titre,
    // startTime → no arrival time).
    $form.publicName = t.publicName ?? '';
    $form.cohortNoun = t.cohortNoun ?? '';
    $form.startTime = t.startTime ?? '';
    selectedTemplateId = t.id;
    step = 2;
  }

  function skipTemplate() {
    selectedTemplateId = null;
    step = 2;
  }

  // ─── Module toggles + sub-options ────────────────────────────────────────
  function toggleModule(key: EventModuleKey, checked: boolean) {
    if (checked) {
      if (!$form.modules.includes(key)) $form.modules = [...$form.modules, key];
    } else {
      $form.modules = $form.modules.filter((k) => k !== key);
    }
  }

  function getModuleSetting<T>(moduleKey: string, key: string, fallback: T): T {
    const cur = $form.moduleSettings[moduleKey] as
      | Record<string, unknown>
      | undefined;
    return (cur?.[key] as T | undefined) ?? fallback;
  }

  function setModuleSetting(moduleKey: string, key: string, value: unknown) {
    const cur =
      ($form.moduleSettings[moduleKey] as Record<string, unknown>) ?? {};
    $form.moduleSettings = {
      ...$form.moduleSettings,
      [moduleKey]: { ...cur, [key]: value },
    };
  }

  const moduleActive = (key: EventModuleKey) => $form.modules.includes(key);

  // "Visible dans l'espace dev" only takes effect with at least one module: the
  // dev space is nothing but per-module surfaces, so making a section-less event
  // visible shows nothing (it would never get the "Espace dev" badge nor land in
  // the switcher). We gate the toggle on that rather than let an admin tick a
  // promise that silently does nothing. The displayed state is the EFFECTIVE
  // visibility (gate AND >=1 module), so toggling the last module off reads as
  // not-visible immediately, matching what the dev space will show.
  const canActivate = $derived(
    $form.modules.length > 0 &&
      $form.publicName.trim().length > 0 &&
      $form.endDate !== '',
  );
  const effectivelyVisible = $derived($form.devActivated && canActivate);

  // Local state for participant count warning
  let dismissHighCount = $state(false);

  // ─── Feedback form picker (bilan sub-option) ─────────────────────────────
  const NO_FORM = 'default';
  // Local, mutable mirrors of the catalogue + previews so a form duplicated from
  // the sub-option shows up immediately. Seeded ONCE from props at mount and
  // mutated optimistically (never reseeded per open, like workingTemplates), so a
  // duplicate survives switching to another event's dialog without invalidation.
  let workingForms = $state<{ value: string; label: string }[]>(
    untrack(() => [...feedbackForms]),
  );
  let workingPreviews = $state<Record<string, string[]>>(
    untrack(() => ({ ...formPreviews })),
  );
  let duplicatingForm = $state(false);
  // No feedback form picked yet: the event's Feedback surface stays hidden until
  // an admin selects one. There is no per-kind default anymore.
  const NO_FORM_LABEL = 'Aucun formulaire';

  // ─── Certificate picker (inscrits sub-option) ────────────────────────────
  // Same shape as the feedback form above: a nullable typed choice on the event,
  // whose picker sits under the module whose surface it feeds. Null is the whole
  // gate - an event that names no certificate shows no export.
  const NO_CERTIFICATE = 'none';
  const NO_CERTIFICATE_LABEL = 'Aucun certificat';
  const certificateTriggerLabel = $derived(
    $form.diplomaTemplateId
      ? (certificates.find((c) => c.value === $form.diplomaTemplateId)?.label ??
          'Certificat inconnu')
      : NO_CERTIFICATE_LABEL,
  );
  const feedbackTriggerLabel = $derived(
    $form.feedbackFormId
      ? (workingForms.find((f) => f.value === $form.feedbackFormId)?.label ??
          'Formulaire inconnu')
      : NO_FORM_LABEL,
  );
  // The form this event resolves to right now: its explicit feedbackFormId.
  // Drives the preview + "open in editor" deep-link; empty = nothing.
  const effectiveFormId = $derived($form.feedbackFormId || '');
  // Ordered question prompts of the resolved form, for the inline preview.
  const effectivePreview = $derived(workingPreviews[effectiveFormId] ?? []);
  // Cap the inline preview so a long form doesn't blow out the dialog; the rest
  // is summarized as "+ N autres questions" (no nested scroll area).
  const PREVIEW_LIMIT = 8;

  // "Dupliquer pour cet événement": branch the resolved form into a fresh copy.
  // Posted via fetch (not an enhanced <form>) because this lives inside the main
  // config <form> - a nested form is invalid HTML. On success the copy is added
  // to the local catalogue, bound to the event, and opened in the builder.
  async function duplicateSelectedForm() {
    const src = effectiveFormId;
    if (!src || duplicatingForm) return;
    duplicatingForm = true;
    try {
      const body = new FormData();
      body.set('sourceId', src);
      const res = await fetch('?/duplicateFeedbackForm', {
        method: 'POST',
        body,
      });
      const result = deserialize(await res.text());
      if (result.type === 'success' && result.data?.duplicatedFormId) {
        const id = result.data.duplicatedFormId as string;
        const title = result.data.duplicatedFormTitle as string;
        workingForms = [...workingForms, { value: id, label: title }];
        workingPreviews = {
          ...workingPreviews,
          [id]: workingPreviews[src] ?? [],
        };
        $form.feedbackFormId = id;
        toast.success('Copie créée. Ouverture de l’éditeur…');
        window.open(`/staff/admin/feedback-forms/${id}`, '_blank', 'noopener');
      } else if (result.type === 'failure') {
        toast.error(
          (result.data?.feedbackFormError as string | undefined) ??
            'Erreur lors de la duplication.',
        );
      } else if (result.type === 'error') {
        toast.error('Erreur lors de la duplication.');
      }
    } catch {
      toast.error('Erreur lors de la duplication.');
    } finally {
      duplicatingForm = false;
    }
  }

  const defaultStartTime = $derived(
    editing ? minutesToHHMM(effectiveStartMinutes(null)) : '',
  );

  // ─── Save current config as a template (upsert by name) ──────────────────
  let saveTemplateOpen = $state(false);
  let templateName = $state('');
  let templateDescription = $state('');
  let savingTemplate = $state(false);

  const templateConfigSnapshot = $derived(
    JSON.stringify({
      modules: $form.modules,
      moduleSettings: $form.moduleSettings,
      // Only carry the feedback form when bilan is actually on: a form id with no
      // bilan module resolves to nothing, so snapshotting it would store dead data.
      feedbackFormId: moduleActive('bilan') ? $form.feedbackFormId : '',
      // Same gate, for the same reason: the export lives on the Inscrits page, so
      // a certificate without that section would be dead data in the preset.
      diplomaTemplateId: moduleActive('inscrits')
        ? $form.diplomaTemplateId
        : '',
      publicName: $form.publicName,
      cohortNoun: $form.cohortNoun,
      startTime: $form.startTime,
    }),
  );

  // A name that already names a template means "edit it"; surfaced as a hint.
  const overwritesExisting = $derived(
    workingTemplates.some(
      (t) => t.name.toLowerCase() === templateName.trim().toLowerCase(),
    ),
  );

  function openSaveTemplate() {
    // Propose the public name the user just set in the form (live value), not the
    // event's stale snapshot or its full SF title.
    templateName = editing
      ? `${$form.publicName || editing.titre}`.slice(0, 80)
      : '';
    templateDescription = '';
    saveTemplateOpen = true;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-2xl"
    onOpenAutoFocus={(e) => e.preventDefault()}
  >
    <Dialog.Header class="border-b px-4 py-4 text-start sm:px-6">
      <Dialog.Title class="flex items-center gap-2">
        <CalendarCog class="h-5 w-5 text-epi-tomorrow" />
        Configurer l'événement
      </Dialog.Title>
      {#if editing}
        <Dialog.Description>
          {editing.campusName} · {editing.dateLabel}
        </Dialog.Description>
      {/if}
      <!-- The stepper IS the navigation: clicking a step moves there, so step 2
           carries no separate back button. Step 1 stays reachable even once the
           config is filled, to re-pick a template. -->
      <nav
        aria-label="Étapes de configuration"
        class="mt-2 flex items-center gap-2 epi-overline"
      >
        <button
          type="button"
          onclick={() => (step = 1)}
          aria-current={step === 1 ? 'step' : undefined}
          class="transition-colors {step === 1
            ? 'cursor-default text-epi-tomorrow'
            : 'cursor-pointer text-muted-foreground hover:text-foreground'}"
        >
          1 · Initialisation
        </button>
        <span class="text-muted-foreground/40">›</span>
        <button
          type="button"
          onclick={() => (step = 2)}
          aria-current={step === 2 ? 'step' : undefined}
          class="transition-colors {step === 2
            ? 'cursor-default text-epi-tomorrow'
            : 'cursor-pointer text-muted-foreground hover:text-foreground'}"
        >
          2 · Configuration
        </button>
      </nav>
      {#if step === 2 && selectedTemplateId}
        {@const t = workingTemplates.find((x) => x.id === selectedTemplateId)}
        {#if t}
          <p class="mt-1.5 text-xs text-muted-foreground">
            Prérempli depuis <strong class="font-semibold text-foreground"
              >{t.name}</strong
            >
          </p>
        {/if}
      {/if}
    </Dialog.Header>

    {#if step === 1}
      <!-- ── Step 1: inherit from a template (or skip) ── -->
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        <p class="text-sm text-muted-foreground">
          Partez d'un modèle pour préremplir la configuration, ou configurez
          sans modèle. Tout reste modifiable à l'étape suivante.
        </p>

        {#snippet templateCard(t: TemplateVM)}
          <div class="flex items-stretch rounded-sm border transition-colors">
            <button
              type="button"
              onclick={() => applyTemplate(t)}
              class="flex flex-1 cursor-pointer items-start gap-3 rounded-l-sm p-3 text-start transition-colors hover:bg-epi-tomorrow/5"
            >
              <span
                class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border bg-muted/40 text-muted-foreground"
              >
                <LayoutTemplate class="size-4" />
              </span>
              <div class="min-w-0 flex-1 space-y-1">
                <span class="text-sm font-bold">{t.name}</span>
                {#if t.description}
                  <p class="line-clamp-1 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                {/if}
                <div class="flex items-center gap-1.5 pt-0.5">
                  {#each t.modules as key (key)}
                    <span
                      class="flex size-5 items-center justify-center rounded-sm bg-secondary text-secondary-foreground"
                      title={EVENT_MODULE_DEFS[key]?.label ?? key}
                    >
                      <EventModuleIcon module={key} class="size-3" />
                    </span>
                  {/each}
                </div>
              </div>
            </button>
            <div class="flex shrink-0 items-center gap-1 pr-2">
              {#if confirmingDeleteId === t.id}
                <span class="text-xs text-muted-foreground">Supprimer ?</span>
                <form
                  method="POST"
                  action="?/deleteTemplate"
                  use:kitEnhance={() => {
                    const removed = t;
                    workingTemplates = workingTemplates.filter(
                      (x) => x.id !== removed.id,
                    );
                    confirmingDeleteId = null;
                    return async ({ result }) => {
                      if (result.type === 'failure') {
                        workingTemplates = [...workingTemplates, removed];
                        toast.error(
                          (result.data?.templateError as string | undefined) ??
                            'Erreur lors de la suppression.',
                        );
                      } else {
                        toast.success('Modèle supprimé.');
                      }
                    };
                  }}
                  class="contents"
                >
                  <input type="hidden" name="id" value={t.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    class="size-7 text-destructive"
                    aria-label="Confirmer la suppression"
                  >
                    <Check class="size-4" />
                  </Button>
                </form>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  aria-label="Annuler"
                  onclick={() => (confirmingDeleteId = null)}
                >
                  <X class="size-4" />
                </Button>
              {:else}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-destructive"
                  aria-label="Supprimer le modèle"
                  onclick={() => (confirmingDeleteId = t.id)}
                >
                  <Trash2 class="size-4" />
                </Button>
              {/if}
            </div>
          </div>
        {/snippet}

        {#if workingTemplates.length === 0}
          <div
            class="rounded-sm border border-dashed bg-muted/10 p-6 text-center text-xs text-muted-foreground"
          >
            Aucun modèle pour l'instant. Configurez l'événement, puis «
            Enregistrer comme modèle » pour le réutiliser plus tard.
          </div>
        {:else}
          <div class="space-y-2">
            {#each sortedTemplates as t (t.id)}
              {@render templateCard(t)}
            {/each}
          </div>
        {/if}
      </div>
      <Dialog.Footer class="gap-2 border-t px-4 py-4 sm:px-6">
        <Button type="button" variant="outline" onclick={() => (open = false)}>
          Annuler
        </Button>
        <Button
          type="button"
          onclick={skipTemplate}
          variant={workingTemplates.length === 0 ? 'default' : 'outline'}
        >
          Configurer sans modèle
        </Button>
      </Dialog.Footer>
    {:else}
      <!-- ── Step 2: the real configuration ── -->
      <form
        method="POST"
        action="?/update"
        use:enhance
        class="flex min-h-0 flex-1 flex-col"
      >
        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
          {#if editing && editing.participations > 100 && !dismissHighCount}
            <div
              class="flex items-start gap-3 rounded-sm border border-warning/40 bg-warning/5 p-3 text-warning"
            >
              <TriangleAlert class="mt-0.5 size-4 shrink-0" />
              <div class="flex-1 space-y-1">
                <p class="text-xs font-medium">
                  Nombre de participants inhabituellement élevé ({editing.participations}).
                </p>
                <p class="text-xs text-warning/80">
                  Vérifiez que la campagne Salesforce est bien celle de
                  l'événement.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 text-warning hover:text-warning"
                onclick={() => (dismissHighCount = true)}
                aria-label="Ignorer l'avertissement"
              >
                <X class="size-4" />
              </button>
            </div>
          {/if}

          <div class="space-y-4">
            <div class="space-y-2">
              <Label for="publicName" class="flex items-center gap-1.5">
                Nom public
                <InfoTooltip
                  text="Ce nom est vu par le staff et par les jeunes, à la place du nom importé de Salesforce. Laissé vide, c'est le nom Salesforce qui s'affiche."
                />
              </Label>
              <Input
                id="publicName"
                bind:value={$form.publicName}
                placeholder={editing?.titre ??
                  'Ex : Stage de seconde - Février'}
              />
              {#if $errors.publicName}<span class="text-xs text-destructive"
                  >{$errors.publicName}</span
                >{/if}
            </div>

            <div class="space-y-2">
              <Label for="cohortNoun" class="flex items-center gap-1.5">
                Comment nommer les inscrits ?
                <InfoTooltip
                  text="Le mot employé partout dans l'espace dev pour désigner un inscrit, au singulier (liste, émargement, entretiens, feedback). Indépendant du type Salesforce : à vous de le choisir, même si le type a été mal renseigné."
                />
              </Label>
              <Input
                id="cohortNoun"
                bind:value={$form.cohortNoun}
                placeholder="participant, stagiaire, collégien…"
                maxlength={40}
                autocomplete="off"
              />
              {#if $errors.cohortNoun}<span class="text-xs text-destructive"
                  >{$errors.cohortNoun}</span
                >{/if}
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <div class="flex h-6 items-center gap-2">
                  <Label for="startTime" class="flex items-center gap-1.5">
                    Heure d'arrivée des jeunes
                    <InfoTooltip
                      text={`Tant qu'elle n'est pas renseignée, les jeunes ne voient que la date, sans heure. Le staff voit l'horaire par défaut${defaultStartTime ? ` (${defaultStartTime})` : ''} en attendant.`}
                    />
                  </Label>
                  {#if !$form.startTime}
                    <Badge
                      variant="outline"
                      class="border-warning/50 text-xs leading-none font-normal text-warning"
                    >
                      À confirmer
                    </Badge>
                  {/if}
                </div>
                <TimePicker id="startTime" bind:value={$form.startTime} />
                {#if $errors.startTime}<span class="text-xs text-destructive"
                    >{$errors.startTime}</span
                  >{/if}
              </div>
              <div class="space-y-2">
                <div class="flex h-6 items-center">
                  <Label for="endDate" class="flex items-center gap-1.5">
                    Date de fin
                    <InfoTooltip
                      text="L'import Salesforce ne donne que la date de début. Laissez vide pour la durée par défaut (≈ 2 semaines pour un stage, 1 jour pour les autres)."
                    />
                  </Label>
                </div>
                <DatePicker
                  id="endDate"
                  min={editing?.startDateKey}
                  placeholder="Durée par défaut"
                  bind:value={$form.endDate}
                />
                {#if $errors.endDate}<span class="text-xs text-destructive"
                    >{$errors.endDate}</span
                  >{/if}
              </div>
            </div>
          </div>

          <fieldset class="space-y-3">
            <legend
              class="flex items-center gap-1.5 text-sm font-bold uppercase"
            >
              Modules de l'événement
              <InfoTooltip
                text="Les sections que le staff verra pour cet événement. N'activez que celles qui vous servent. Le planning n'est pas dans la liste : il apparaît tout seul dès qu'un emploi du temps est défini."
              />
            </legend>
            <div class="divide-y rounded-sm border">
              {#each EVENT_MODULE_KEYS as key (key)}
                {@const def = EVENT_MODULE_DEFS[key]}
                {@const checked = moduleActive(key)}
                <div>
                  <label
                    for="module-{key}"
                    class="flex cursor-pointer items-start gap-3 p-3 transition-colors select-none hover:bg-muted/40"
                  >
                    <span
                      class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border bg-muted/40 text-muted-foreground"
                    >
                      <EventModuleIcon module={key} class="size-4" />
                    </span>
                    <div class="flex-1 space-y-1">
                      <span class="flex items-center gap-1.5 text-sm font-bold">
                        {def.label}
                        <InfoTooltip text={def.description} />
                      </span>
                    </div>
                    <Switch
                      id="module-{key}"
                      {checked}
                      onCheckedChange={(v) => toggleModule(key, v === true)}
                      class="mt-0.5"
                    />
                  </label>

                  <!-- Sub-options: only shown for the active module they belong
                       to, so the dialog stays light until you opt in. -->
                  {#if checked && key === 'inscrits'}
                    <div class="space-y-3 border-t bg-muted/20 px-3 py-3 pl-14">
                      <label
                        for="inscrits-statut"
                        class="flex cursor-pointer items-center justify-between gap-3 select-none"
                      >
                        <span
                          class="flex items-center gap-1.5 text-xs font-medium"
                        >
                          Colonne « statut » du dossier
                          <InfoTooltip
                            text="Affiche la colonne de suivi du dossier (connexion, règlement, droit à l'image) sur la page Inscrits. Désactivez-la pour les campus qui n'onboardent pas (la page reste utile pour les entretiens et le feedback)."
                          />
                        </span>
                        <Switch
                          id="inscrits-statut"
                          checked={getModuleSetting(
                            'inscrits',
                            'showStatutColumn',
                            false,
                          )}
                          onCheckedChange={(v) =>
                            setModuleSetting(
                              'inscrits',
                              'showStatutColumn',
                              v === true,
                            )}
                        />
                      </label>
                      <div class="space-y-2">
                        <span
                          class="flex items-center gap-1.5 text-xs font-medium"
                        >
                          Certificat délivré
                          <InfoTooltip
                            text="Le document généré depuis la page Inscrits, une page par inscrit. « Aucun certificat » masque le bouton pour un événement qui ne délivre rien."
                          />
                        </span>
                        <Select.Root
                          type="single"
                          value={$form.diplomaTemplateId || NO_CERTIFICATE}
                          onValueChange={(v) =>
                            ($form.diplomaTemplateId =
                              v === NO_CERTIFICATE ? '' : v)}
                        >
                          <Select.Trigger class="w-full">
                            {certificateTriggerLabel}
                          </Select.Trigger>
                          <Select.Content>
                            <Select.Item value={NO_CERTIFICATE}>
                              {NO_CERTIFICATE_LABEL}
                            </Select.Item>
                            {#each certificates as opt (opt.value)}
                              <Select.Item value={opt.value}>
                                {opt.label}
                              </Select.Item>
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </div>
                    </div>
                  {/if}

                  {#if checked && key === 'bilan'}
                    <div class="space-y-2 border-t bg-muted/20 px-3 py-3 pl-14">
                      <span
                        class="flex items-center gap-1.5 text-xs font-medium"
                      >
                        Formulaire de feedback
                        <InfoTooltip
                          text="Le formulaire que les jeunes remplissent pour cet événement. Sans formulaire, la page Feedback n'apparaît pas dans l'espace dev."
                        />
                      </span>
                      <Select.Root
                        type="single"
                        value={$form.feedbackFormId || NO_FORM}
                        onValueChange={(v) =>
                          ($form.feedbackFormId = v === NO_FORM ? '' : v)}
                      >
                        <Select.Trigger class="w-full">
                          {feedbackTriggerLabel}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value={NO_FORM}>
                            {NO_FORM_LABEL}
                          </Select.Item>
                          {#each workingForms as opt (opt.value)}
                            <Select.Item value={opt.value}>
                              {opt.label}
                            </Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                      <!-- The dropdown selection IS the choice. This preview
                           shows what the resolved form asks; the actions below
                           only ADAPT a form, they don't select one (that was
                           the confusing part). -->
                      {#if effectiveFormId}
                        <div class="rounded-sm border bg-background/60">
                          <div class="border-b px-3 py-1.5">
                            <span class="epi-overline text-muted-foreground">
                              Ce que les jeunes rempliront
                            </span>
                          </div>
                          <div class="px-3 py-2">
                            {#if effectivePreview.length === 0}
                              <p class="text-xs text-muted-foreground">
                                Ce formulaire n'a pas encore de questions.
                              </p>
                            {:else}
                              <ol class="space-y-1">
                                {#each effectivePreview.slice(0, PREVIEW_LIMIT) as prompt, i (i)}
                                  <li class="flex gap-2 text-xs leading-snug">
                                    <span
                                      class="shrink-0 text-muted-foreground/50"
                                    >
                                      {i + 1}.
                                    </span>
                                    <span class="text-foreground">{prompt}</span
                                    >
                                  </li>
                                {/each}
                              </ol>
                              {#if effectivePreview.length > PREVIEW_LIMIT}
                                <p
                                  class="mt-1.5 pl-5 text-xs text-muted-foreground/70"
                                >
                                  + {effectivePreview.length - PREVIEW_LIMIT} autre{effectivePreview.length -
                                    PREVIEW_LIMIT >
                                  1
                                    ? 's'
                                    : ''} question{effectivePreview.length -
                                    PREVIEW_LIMIT >
                                  1
                                    ? 's'
                                    : ''}
                                </p>
                              {/if}
                            {/if}
                          </div>
                        </div>

                        <div class="space-y-1.5">
                          <p class="text-xs text-muted-foreground">
                            Ce formulaire vous convient ? Sinon, adaptez-le :
                          </p>
                          <div class="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={duplicatingForm}
                              onclick={duplicateSelectedForm}
                              class="rounded-sm"
                            >
                              <Copy class="mr-1.5 h-3.5 w-3.5" />
                              Dupliquer et personnaliser
                            </Button>
                            <Button
                              href={`/staff/admin/feedback-forms/${effectiveFormId}`}
                              target="_blank"
                              rel="noopener"
                              variant="ghost"
                              size="sm"
                              class="rounded-sm"
                            >
                              <Pencil class="mr-1.5 h-3.5 w-3.5" />
                              Modifier
                            </Button>
                            <Button
                              href="/staff/admin/feedback-forms?create=1"
                              target="_blank"
                              rel="noopener"
                              variant="ghost"
                              size="sm"
                              class="rounded-sm text-muted-foreground"
                            >
                              <Plus class="mr-1.5 h-3.5 w-3.5" />
                              Créer un nouveau formulaire
                            </Button>
                          </div>
                          <p class="text-xs text-muted-foreground/70">
                            « Modifier » agit sur le formulaire partagé ; «
                            Dupliquer » en crée une copie propre à cet
                            événement.
                          </p>
                        </div>
                      {:else}
                        <p
                          class="flex items-start gap-1.5 text-xs leading-snug text-warning"
                        >
                          <TriangleAlert class="mt-px size-3 shrink-0" />
                          Aucun formulaire publié n'est associé : tant qu'il n'y en
                          a pas, la page Feedback n'apparaîtra pas dans l'espace dev.
                          Choisissez-en un ci-dessus, ou créez-en un puis publiez-le.
                        </p>
                        <Button
                          href="/staff/admin/feedback-forms?create=1"
                          target="_blank"
                          rel="noopener"
                          variant="outline"
                          size="sm"
                          class="rounded-sm"
                        >
                          <Plus class="mr-1.5 h-3.5 w-3.5" />
                          Créer un nouveau formulaire
                        </Button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </fieldset>

          <section class="space-y-2">
            <h3 class="text-sm font-bold uppercase">Visibilité</h3>
            <label
              for="devActivated"
              class="flex items-start gap-3 rounded-sm border p-3 transition-colors select-none {canActivate
                ? 'cursor-pointer'
                : 'cursor-not-allowed'} {effectivelyVisible
                ? 'border-epi-tomorrow/40 bg-epi-tomorrow/5'
                : canActivate
                  ? 'hover:bg-muted/40'
                  : 'border-warning/40 bg-warning/5'}"
            >
              <div class="flex-1 space-y-1">
                <span class="flex items-center gap-1.5 text-sm font-bold">
                  Visible dans l'espace dev
                  <InfoTooltip
                    text="Tant que c'est désactivé, l'équipe dev ne voit pas cet événement, même configuré. Activez-le quand il est prêt."
                  />
                </span>
                {#if canActivate}
                  <span class="text-xs text-muted-foreground">
                    {$form.modules.length} section{$form.modules.length > 1
                      ? 's'
                      : ''} active{$form.modules.length > 1 ? 's' : ''} pour cet événement.
                  </span>
                {:else}
                  <span
                    class="flex flex-col items-start gap-1 text-xs font-medium text-warning"
                  >
                    <span class="flex items-center gap-1.5">
                      <TriangleAlert class="size-3.5 shrink-0" />
                      Pour rendre l'événement visible, il faut :
                    </span>
                    <ul class="list-disc pl-5">
                      {#if $form.modules.length === 0}
                        <li>Activer au moins une section</li>
                      {/if}
                      {#if $form.publicName.trim().length === 0}
                        <li>Renseigner un nom public</li>
                      {/if}
                      {#if $form.endDate === ''}
                        <li>Renseigner une date de fin</li>
                      {/if}
                    </ul>
                  </span>
                {/if}
              </div>
              <Switch
                id="devActivated"
                checked={effectivelyVisible}
                disabled={!canActivate}
                onCheckedChange={(v) => ($form.devActivated = v === true)}
                class="mt-0.5"
              />
            </label>
          </section>
        </div>

        <Dialog.Footer
          class="flex-col gap-2 border-t px-4 py-4 sm:flex-row sm:items-center sm:px-6"
        >
          <div class="flex flex-wrap items-center gap-2 sm:mr-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={openSaveTemplate}
            >
              <Bookmark class="mr-1.5 h-4 w-4" />
              Enregistrer comme modèle…
            </Button>
            {#if editing}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onclick={() => (inspectorOpen = true)}
                title="Inspecter tous les membres Salesforce et leurs statuts"
              >
                <Database class="mr-1.5 h-4 w-4 text-epi-blue" />
                Membres Salesforce…
              </Button>
            {/if}
          </div>
          <Button
            type="button"
            variant="outline"
            onclick={() => (open = false)}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={$delayed}>
            {$delayed ? 'Sauvegarde…' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>

{#if editing}
  <AdminSfStatusInspectorDialog
    bind:open={inspectorOpen}
    eventId={editing.id}
    eventTitle={editing.publicName || editing.titre}
  />
{/if}

<!-- Save-as-template sub-dialog (separate so its form isn't nested in the config
     form). Snapshots the current modules + sub-options + default feedback form;
     an existing name updates that template. No page invalidation - the list is
     updated optimistically so the in-progress config is never reset. -->
<Dialog.Root bind:open={saveTemplateOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Bookmark class="h-5 w-5 text-epi-tomorrow" />
        Enregistrer comme modèle
      </Dialog.Title>
      <Dialog.Description>
        La configuration actuelle (modules, sous-options, formulaire) devient un
        modèle réutilisable. Un nom déjà utilisé met à jour ce modèle.
      </Dialog.Description>
    </Dialog.Header>
    <form
      method="POST"
      action="?/saveAsTemplate"
      use:kitEnhance={() => {
        savingTemplate = true;
        return async ({ result }) => {
          savingTemplate = false;
          if (result.type === 'success') {
            const id = result.data?.templateId as string;
            const updated = result.data?.templateUpdated === true;
            const vm: TemplateVM = {
              id,
              name: templateName.trim(),
              description: templateDescription.trim() || null,
              publicName: $form.publicName.trim() || null,
              cohortNoun: $form.cohortNoun.trim() || null,
              startTime: $form.startTime,
              // Mirror the snapshot's bilan gate, so the optimistic row matches
              // what the server actually stored.
              feedbackFormId: moduleActive('bilan')
                ? $form.feedbackFormId || null
                : null,
              diplomaTemplateId: moduleActive('inscrits')
                ? $form.diplomaTemplateId || null
                : null,
              modules: [...$form.modules] as EventModuleKey[],
              moduleSettings: { ...$form.moduleSettings },
            };
            const idx = workingTemplates.findIndex(
              (t) => t.id === id || t.name === vm.name,
            );
            workingTemplates =
              idx >= 0
                ? workingTemplates.map((t, i) => (i === idx ? vm : t))
                : [...workingTemplates, vm];
            toast.success(
              updated
                ? `Modèle « ${vm.name} » mis à jour.`
                : `Modèle « ${vm.name} » enregistré.`,
            );
            saveTemplateOpen = false;
          } else if (result.type === 'failure') {
            toast.error(
              (result.data?.templateError as string | undefined) ??
                "Erreur lors de l'enregistrement du modèle.",
            );
          }
        };
      }}
      class="space-y-4"
    >
      <input type="hidden" name="config" value={templateConfigSnapshot} />
      <div class="space-y-2">
        <Label for="new-template-name">Nom du modèle</Label>
        <Input
          id="new-template-name"
          name="name"
          bind:value={templateName}
          maxlength={80}
          placeholder="Ex : Coding Club Paris"
          required
        />
        {#if overwritesExisting}
          <p class="text-xs text-warning">
            Un modèle porte déjà ce nom : il sera mis à jour.
          </p>
        {/if}
      </div>
      <div class="space-y-2">
        <Label for="new-template-description">Description</Label>
        <Textarea
          id="new-template-description"
          name="description"
          bind:value={templateDescription}
          rows={2}
          maxlength={280}
          placeholder="Optionnel"
        />
      </div>
      <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check class="h-3.5 w-3.5 text-epi-tech-ink" />
        {$form.modules.length} module{$form.modules.length > 1 ? 's' : ''} dans ce
        modèle
      </div>
      <Dialog.Footer>
        <Button
          type="button"
          variant="outline"
          onclick={() => (saveTemplateOpen = false)}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={savingTemplate}>
          {savingTemplate ? 'Enregistrement…' : 'Enregistrer le modèle'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
