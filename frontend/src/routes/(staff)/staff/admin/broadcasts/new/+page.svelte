<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { superForm } from 'sveltekit-superforms';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Select from '$lib/components/ui/select';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import Plus from '@lucide/svelte/icons/plus';
  import {
    BROADCAST_AUDIENCES,
    BROADCAST_AUDIENCE_LABELS,
    BROADCAST_CHANNEL_LABELS,
    JUMP_LEVELS,
  } from '$lib/domain/broadcasts';
  import { NIVEAUX, niveauLabel } from '$lib/domain/niveau';
  import {
    substituteVariables,
    buildDemoContext,
  } from '$lib/domain/broadcastVariables';
  import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
  import { cn } from '$lib/utils';

  let { data } = $props();

  const DRAFT_KEY = 'broadcast-new-draft-v1';

  // svelte-ignore state_referenced_locally
  const {
    form,
    errors,
    enhance,
    submitting,
    message: formMessage,
  } = superForm(data.form, {
    dataType: 'json',
    // Without this, a successful test-send action wipes the user's form
    // because superforms resets to the load-time state.
    resetForm: false,
    // Don't surface load-time errors (empty required fields) until the
    // user actually tries to submit.
    validationMethod: 'onsubmit',
    onResult: ({ result }) => {
      // Enqueue is the only action that redirects — that's our success
      // signal to drop the draft. testSend stays put with a flash message.
      if (browser && result.type === 'redirect') {
        localStorage.removeItem(DRAFT_KEY);
      }
    },
  });

  const selectedTemplate = $derived(
    data.templates.find((t) => t.id === $form.templateId),
  );
  const channel = $derived(selectedTemplate?.channel ?? 'mail');

  const filteredEvents = $derived(
    data.events.filter((e) =>
      $form.campusId ? e.campusId === $form.campusId : true,
    ),
  );

  const filteredSources = $derived(
    data.sourceBroadcasts.filter((b) =>
      $form.campusId ? b.campusId === $form.campusId : true,
    ),
  );

  let showFilters = $state(false);
  let showRetarget = $state(false);
  let confirmEnqueueOpen = $state(false);
  let mailPreviewOpen = $state(false);
  let testSendOpen = $state(false);
  // svelte-ignore state_referenced_locally
  let testEmail = $state(data.userEmail ?? '');
  let testPhone = $state('');

  // ── Draft auto-save ────────────────────────────────────────────────
  // localStorage-backed so a half-filled form survives a page reload or
  // accidental tab close. Cleared on successful enqueue (see onResult
  // above). URL `?template=` always wins over a saved templateId since
  // it represents fresh explicit intent.
  onMount(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as Partial<typeof $form>;
      const urlTemplate = page.url.searchParams.get('template');
      $form.campusId = draft.campusId ?? '';
      $form.eventId = draft.eventId ?? '';
      $form.audience = draft.audience;
      if (!urlTemplate) $form.templateId = draft.templateId ?? '';
      $form.sourceBroadcastId = draft.sourceBroadcastId ?? '';
      $form.sourceFilter = draft.sourceFilter;
      $form.filters = draft.filters ?? {};
      toast.info('Brouillon restauré');
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  });

  $effect(() => {
    if (!browser) return;
    // Read fields outside the timeout so the effect re-runs on change.
    const snapshot = {
      campusId: $form.campusId,
      eventId: $form.eventId,
      audience: $form.audience,
      templateId: $form.templateId,
      sourceBroadcastId: $form.sourceBroadcastId,
      sourceFilter: $form.sourceFilter,
      filters: $form.filters,
    };
    const isEmpty =
      !snapshot.campusId &&
      !snapshot.eventId &&
      !snapshot.audience &&
      !snapshot.templateId &&
      !snapshot.sourceBroadcastId;
    const timer = setTimeout(() => {
      if (isEmpty) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
      }
    }, 500);
    return () => clearTimeout(timer);
  });

  // ── Live recipient preview ──────────────────────────────────────────
  // POSTs the form to /preview as JSON, debounced. The endpoint short-
  // circuits when the form is too incomplete to resolve, so we can fire
  // freely without filling the panel with errors mid-typing.
  type PreviewState = {
    total: number;
    excluded: { reason: 'no_email' | 'no_phone'; count: number }[];
    sample: { name: string; email: string | null; phone: string | null }[];
    incomplete?: boolean;
  };
  let preview = $state<PreviewState | null>(null);
  let previewLoading = $state(false);
  let previewError = $state<string | null>(null);

  $effect(() => {
    // Track the fields that actually change the recipient set.
    const payload = {
      templateId: $form.templateId,
      campusId: $form.campusId,
      audience: $form.audience,
      eventId: $form.eventId ?? '',
      sourceBroadcastId: $form.sourceBroadcastId ?? '',
      sourceFilter: $form.sourceFilter,
      filters: $form.filters ?? {},
    };
    if (!payload.campusId || !payload.audience) {
      preview = null;
      previewError = null;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      previewLoading = true;
      previewError = null;
      try {
        const res = await fetch('/staff/admin/broadcasts/new/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        preview = (await res.json()) as PreviewState;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        previewError = (err as Error).message;
        preview = null;
      } finally {
        previewLoading = false;
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  // ── Mail preview (modal) ────────────────────────────────────────────
  const previewMailHtml = $derived.by(() => {
    if (!selectedTemplate || selectedTemplate.channel !== 'mail') return '';
    const event = $form.eventId
      ? data.events.find((e) => e.id === $form.eventId)
      : null;
    const ctx = buildDemoContext(event?.titre ?? null);
    const body = substituteVariables(selectedTemplate.body, ctx);
    return renderBroadcastMail(body);
  });
  const previewMailSubject = $derived.by(() => {
    if (!selectedTemplate?.subject) return '';
    const event = $form.eventId
      ? data.events.find((e) => e.id === $form.eventId)
      : null;
    return substituteVariables(
      selectedTemplate.subject,
      buildDemoContext(event?.titre ?? null),
    );
  });
  const previewSmsBody = $derived.by(() => {
    if (!selectedTemplate || selectedTemplate.channel !== 'sms') return '';
    const event = $form.eventId
      ? data.events.find((e) => e.id === $form.eventId)
      : null;
    return substituteVariables(
      selectedTemplate.body,
      buildDemoContext(event?.titre ?? null),
    );
  });

  const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
  });

  type TristateKey =
    | 'charterSigned'
    | 'imageRightsSigned'
    | 'hasPastEvent'
    | 'hasFutureEvent';
  const tristateFilters: Array<[TristateKey, string]> = [
    ['charterSigned', 'Charte signée'],
    ['imageRightsSigned', "Droit à l'image"],
    ['hasPastEvent', 'A déjà participé'],
    ['hasFutureEvent', 'Event à venir'],
  ];
  const tristateValues = ['any', 'yes', 'no'] as const;

  // shadcn Select can't carry an empty-string item value, so the "all events"
  // / "no source" options use a sentinel that maps back to '' on the form.
  const NONE = '__none__';
</script>

<header class="space-y-2">
  <h1 class="text-2xl font-bold tracking-tight">Nouvel envoi</h1>
  <p class="text-sm text-muted-foreground">
    Renseigne campus, event, audience et template — les destinataires
    s'affichent en direct à droite.
  </p>
</header>

<form
  id="broadcast-form"
  method="POST"
  use:enhance
  class="grid gap-6 lg:grid-cols-[1fr_320px]"
>
  <div class="space-y-5">
    <div class="grid gap-2">
      <Label for="campusId">Campus</Label>
      <Select.Root
        type="single"
        value={$form.campusId}
        onValueChange={(v) => ($form.campusId = v ?? '')}
      >
        <Select.Trigger id="campusId" class="w-full">
          {data.campuses.find((c) => c.id === $form.campusId)?.name ??
            '— Sélectionner —'}
        </Select.Trigger>
        <Select.Content>
          {#each data.campuses as c (c.id)}
            <Select.Item value={c.id}>{c.name}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      {#if $errors.campusId}
        <p class="text-xs text-destructive">{$errors.campusId}</p>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label for="eventId">Event (optionnel — vide = tous)</Label>
      <Select.Root
        type="single"
        value={$form.eventId || NONE}
        onValueChange={(v) => ($form.eventId = v === NONE ? '' : (v ?? ''))}
        disabled={!$form.campusId}
      >
        <Select.Trigger id="eventId" class="w-full">
          <span class="truncate">
            {#if $form.eventId}
              {@const e = filteredEvents.find((ev) => ev.id === $form.eventId)}
              {e
                ? `${dateFormatter.format(e.date)} — ${e.titre}`
                : 'Tous les events du campus'}
            {:else}
              Tous les events du campus
            {/if}
          </span>
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={NONE}>Tous les events du campus</Select.Item>
          {#each filteredEvents as e (e.id)}
            <Select.Item value={e.id}>
              {dateFormatter.format(e.date)} — {e.titre}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Audience</legend>
      <RadioGroup.Root
        value={$form.audience ?? ''}
        onValueChange={(v) =>
          ($form.audience = v as (typeof BROADCAST_AUDIENCES)[number])}
        class="grid grid-cols-3 gap-2"
      >
        {#each BROADCAST_AUDIENCES as a (a)}
          <Label
            class="cursor-pointer rounded-md border px-3 py-2 font-normal hover:bg-accent"
          >
            <RadioGroup.Item value={a} />
            {BROADCAST_AUDIENCE_LABELS[a]}
          </Label>
        {/each}
      </RadioGroup.Root>
      {#if $errors.audience}
        <p class="text-xs text-destructive">{$errors.audience}</p>
      {/if}
    </fieldset>

    <div class="grid gap-2">
      <Label for="templateId">Template</Label>
      <div class="flex items-center gap-2">
        <Select.Root
          type="single"
          value={$form.templateId}
          onValueChange={(v) => ($form.templateId = v ?? '')}
        >
          <Select.Trigger id="templateId" class="flex-1">
            <span class="truncate">
              {#if selectedTemplate}
                [{BROADCAST_CHANNEL_LABELS[selectedTemplate.channel]}]
                {selectedTemplate.name}
              {:else}
                — Sélectionner —
              {/if}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each data.templates as t (t.id)}
              <Select.Item value={t.id}>
                [{BROADCAST_CHANNEL_LABELS[t.channel]}] {t.name}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  size="icon"
                  href="/staff/admin/broadcasts/templates/new"
                  target="_blank"
                  rel="noopener"
                  aria-label="Créer un template"
                >
                  <Plus class="h-4 w-4" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Créer un template (nouvel onglet)</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
      {#if $errors.templateId}
        <p class="text-xs text-destructive">{$errors.templateId}</p>
      {/if}
    </div>

    <Collapsible.Root
      open={showRetarget}
      onOpenChange={(o) => (showRetarget = o)}
      class="rounded-md border"
    >
      <Collapsible.Trigger
        class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <span>Repartir d'un envoi passé (retargeting)</span>
        <span class="text-xs text-muted-foreground"
          >{showRetarget ? '−' : '+'}</span
        >
      </Collapsible.Trigger>
      <Collapsible.Content class="space-y-3 border-t p-3">
        <div class="grid gap-2">
          <Label for="sourceBroadcastId">Envoi source</Label>
          <Select.Root
            type="single"
            value={$form.sourceBroadcastId || NONE}
            onValueChange={(v) =>
              ($form.sourceBroadcastId = v === NONE ? '' : (v ?? ''))}
          >
            <Select.Trigger id="sourceBroadcastId" class="w-full">
              <span class="truncate">
                {#if $form.sourceBroadcastId}
                  {@const b = filteredSources.find(
                    (s) => s.id === $form.sourceBroadcastId,
                  )}
                  {b
                    ? `${dateFormatter.format(b.createdAt)} — ${b.name}`
                    : 'Aucun'}
                {:else}
                  Aucun
                {/if}
              </span>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={NONE}>Aucun</Select.Item>
              {#each filteredSources as b (b.id)}
                <Select.Item value={b.id}>
                  {dateFormatter.format(b.createdAt)} — {b.name}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if $form.sourceBroadcastId}
          <div class="grid gap-2">
            <Label>Filtrer les destinataires sources</Label>
            <RadioGroup.Root
              value={$form.sourceFilter ?? ''}
              onValueChange={(v) =>
                ($form.sourceFilter = v as typeof $form.sourceFilter)}
              class="flex flex-row gap-3 text-sm"
            >
              <Label class="cursor-pointer gap-1.5 font-normal">
                <RadioGroup.Item value="all" /> Tous
              </Label>
              <Label class="cursor-pointer gap-1.5 font-normal">
                <RadioGroup.Item value="opened" /> Ouverts
              </Label>
              <Label class="cursor-pointer gap-1.5 font-normal">
                <RadioGroup.Item value="not_opened" /> Non ouverts
              </Label>
            </RadioGroup.Root>
            {#if $errors.sourceFilter}
              <p class="text-xs text-destructive">{$errors.sourceFilter}</p>
            {/if}
            <p class="text-xs text-muted-foreground">
              « Ouvert » = a cliqué sur ≥ 1 lien tracké de l'envoi source.
            </p>
          </div>
        {/if}
      </Collapsible.Content>
    </Collapsible.Root>

    <Collapsible.Root
      open={showFilters}
      onOpenChange={(o) => (showFilters = o)}
      class="rounded-md border"
    >
      <Collapsible.Trigger
        class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <span>Filtres avancés</span>
        <span class="text-xs text-muted-foreground"
          >{showFilters ? '−' : '+'}</span
        >
      </Collapsible.Trigger>
      <Collapsible.Content class="space-y-3 border-t p-3 text-sm">
        {#if $form.audience === 'talent' || $form.audience === 'parent'}
          <div class="grid gap-2">
            <Label>Niveau scolaire</Label>
            <div class="flex flex-wrap gap-3">
              {#each NIVEAUX as n}
                <label class="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={$form.filters?.niveau?.includes(n) ?? false}
                    onCheckedChange={(checked) => {
                      const cur = new Set($form.filters?.niveau ?? []);
                      if (checked) cur.add(n);
                      else cur.delete(n);
                      $form.filters = {
                        ...($form.filters ?? {}),
                        niveau: [...cur],
                      };
                    }}
                  />
                  {niveauLabel(n)}
                </label>
              {/each}
            </div>
          </div>

          <div class="grid gap-2">
            <Label>Niveau Jump</Label>
            <div class="flex flex-wrap gap-3">
              {#each JUMP_LEVELS as lvl}
                <label class="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={$form.filters?.jumpLevel?.includes(lvl) ?? false}
                    onCheckedChange={(checked) => {
                      const cur = new Set($form.filters?.jumpLevel ?? []);
                      if (checked) cur.add(lvl);
                      else cur.delete(lvl);
                      $form.filters = {
                        ...($form.filters ?? {}),
                        jumpLevel: [...cur],
                      };
                    }}
                  />
                  {lvl}
                </label>
              {/each}
            </div>
          </div>

          {#each tristateFilters as entry (entry[0])}
            {@const k = entry[0]}
            {@const label = entry[1]}
            <div class="grid gap-1">
              <Label class="text-xs">{label}</Label>
              <RadioGroup.Root
                value={$form.filters?.[k] ?? 'any'}
                onValueChange={(v) => {
                  $form.filters = {
                    ...($form.filters ?? {}),
                    [k]: v === 'any' ? undefined : (v as 'yes' | 'no'),
                  };
                }}
                class="flex flex-row gap-3"
              >
                {#each tristateValues as v (v)}
                  <Label class="cursor-pointer gap-1.5 text-xs font-normal">
                    <RadioGroup.Item value={v} />
                    {v === 'any' ? 'Indifférent' : v === 'yes' ? 'Oui' : 'Non'}
                  </Label>
                {/each}
              </RadioGroup.Root>
            </div>
          {/each}
        {:else}
          <p class="text-xs text-muted-foreground">
            Pas de filtres avancés pour cette audience.
          </p>
        {/if}
      </Collapsible.Content>
    </Collapsible.Root>

    <div class="flex flex-wrap gap-2 pt-2">
      <Button
        type="button"
        variant="outline"
        onclick={() => (mailPreviewOpen = true)}
        disabled={!selectedTemplate}
      >
        Aperçu envoi
      </Button>
      <Button
        type="button"
        variant="outline"
        onclick={() => {
          testEmail = data.userEmail ?? '';
          testSendOpen = true;
        }}
        disabled={$submitting || !selectedTemplate}
      >
        S'envoyer un test
      </Button>
      <Button
        type="button"
        onclick={() => (confirmEnqueueOpen = true)}
        disabled={$submitting}
      >
        Démarrer les envois
      </Button>
    </div>
  </div>

  <aside class="space-y-4">
    <div class="rounded-lg border bg-muted/30 p-4">
      <div class="mb-2 flex items-center justify-between">
        <h3
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Aperçu destinataires
        </h3>
        {#if previewLoading}
          <span class="text-[10px] text-muted-foreground">…</span>
        {/if}
      </div>
      {#if previewError}
        <p class="text-xs text-destructive">Erreur : {previewError}</p>
      {:else if preview && !preview.incomplete}
        <p class="text-2xl font-bold">{preview.total}</p>
        <p class="mb-3 text-xs text-muted-foreground">destinataire(s)</p>
        {#if preview.excluded.length > 0}
          <ul class="mb-3 space-y-0.5 text-xs text-amber-700">
            {#each preview.excluded as ex}
              <li>
                {ex.count} exclu(s) :
                {ex.reason === 'no_email' ? "pas d'email" : 'pas de téléphone'}
              </li>
            {/each}
          </ul>
        {/if}
        {#if preview.sample.length > 0}
          <p class="mb-1 text-xs font-medium">Échantillon :</p>
          <ul class="space-y-0.5 text-xs text-muted-foreground">
            {#each preview.sample as r}
              <li class="truncate">
                {r.name} <span class="text-[10px]">({r.email ?? r.phone})</span>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <p class="text-xs text-muted-foreground">
          Sélectionne un campus et une audience pour voir les destinataires.
        </p>
      {/if}

      {#if $formMessage}
        <p
          class={cn(
            'mt-3 rounded border px-2 py-1 text-xs',
            $formMessage.type === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
          )}
        >
          {$formMessage.text}
        </p>
      {/if}
    </div>
  </aside>
</form>

<Dialog.Root bind:open={mailPreviewOpen}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Aperçu de l'envoi</Dialog.Title>
      <Dialog.Description class="text-xs">
        Rendu avec des données fictives — destinataires réels recevront leurs
        propres variables substituées.
      </Dialog.Description>
    </Dialog.Header>
    {#if !selectedTemplate}
      <p class="text-sm text-muted-foreground">Sélectionne un template.</p>
    {:else if selectedTemplate.channel === 'mail'}
      {#if previewMailSubject}
        <p class="text-xs">
          <span class="font-semibold">Sujet :</span>
          {previewMailSubject}
        </p>
      {/if}
      <div class="overflow-hidden rounded border">
        {@html previewMailHtml}
      </div>
    {:else}
      <pre
        class="rounded border bg-white p-3 text-xs whitespace-pre-wrap text-slate-800 dark:bg-slate-900 dark:text-slate-200">{previewSmsBody}</pre>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={testSendOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>
        {channel === 'sms' ? "S'envoyer un test SMS" : "S'envoyer un test"}
      </Dialog.Title>
      <Dialog.Description class="text-xs">
        {#if channel === 'sms'}
          Envoie un SMS de test avec les variables remplies par des valeurs
          fictives.
        {:else}
          Envoie un email de test avec les variables remplies par des valeurs
          fictives.
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    {#if channel === 'sms'}
      {#if !data.smsEnabled}
        <p
          class="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
        >
          SMS non configuré (<code>SMS_PROVIDER</code>). Renseigne le
          fournisseur Brevo côté serveur pour envoyer un test.
        </p>
      {/if}
      <div class="grid gap-2">
        <Label for="testPhone">Numéro destinataire</Label>
        <Input
          id="testPhone"
          name="testPhone"
          form="broadcast-form"
          type="tel"
          bind:value={testPhone}
          placeholder="ex: +33 6 12 34 56 78"
          disabled={!data.smsEnabled}
        />
      </div>
    {:else}
      <div class="grid gap-2">
        <Label for="testEmail">Email destinataire</Label>
        <Input
          id="testEmail"
          name="testEmail"
          form="broadcast-form"
          type="email"
          bind:value={testEmail}
          placeholder="ex: prenom.nom@epitech.eu"
        />
      </div>
    {/if}
    <Dialog.Footer class="mt-4">
      <Button
        type="button"
        variant="outline"
        onclick={() => (testSendOpen = false)}
      >
        Annuler
      </Button>
      <Button
        type="submit"
        form="broadcast-form"
        formaction="?/testSend"
        disabled={$submitting ||
          (channel === 'sms' ? !testPhone || !data.smsEnabled : !testEmail)}
        onclick={() => (testSendOpen = false)}
      >
        Envoyer le test
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={confirmEnqueueOpen}>
  <AlertDialog.Content class="rounded-sm">
    <AlertDialog.Header>
      <AlertDialog.Title
        class="text-lg font-bold tracking-tight text-destructive uppercase"
      >
        Démarrer les envois ?
      </AlertDialog.Title>
      <AlertDialog.Description class="text-sm font-medium">
        {#if preview && !preview.incomplete}
          {preview.total} message(s) vont être envoyés immédiatement aux destinataires
          sélectionnés. Cette action est <strong>irréversible</strong>.
        {:else}
          Les messages vont être envoyés immédiatement aux destinataires
          sélectionnés. Cette action est <strong>irréversible</strong>.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel class="rounded-sm">Annuler</AlertDialog.Cancel>
      <AlertDialog.Action
        type="submit"
        form="broadcast-form"
        formaction="?/enqueue"
        disabled={$submitting}
        class={buttonVariants({
          variant: 'destructive',
          class: 'rounded-sm',
        })}
      >
        Oui, démarrer les envois
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
