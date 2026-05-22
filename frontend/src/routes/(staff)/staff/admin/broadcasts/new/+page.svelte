<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Dialog from '$lib/components/ui/dialog';
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

  let { data, form: actionForm } = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(data.form, {
    dataType: 'json',
    // Without this, a successful test-send action wipes the user's form
    // because superforms resets to the load-time state.
    resetForm: false,
    // Don't surface load-time errors (empty required fields) until the
    // user actually tries to submit.
    validationMethod: 'onsubmit',
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
      name: $form.name || 'preview',
      templateId: $form.templateId,
      campusId: $form.campusId,
      audience: $form.audience,
      eventId: $form.eventId ?? '',
      sourceBroadcastId: $form.sourceBroadcastId ?? '',
      sourceFilter: $form.sourceFilter,
      filters: $form.filters ?? {},
    };
    if (!payload.templateId || !payload.campusId) {
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
</script>

<header class="space-y-2">
  <h1 class="text-2xl font-bold tracking-tight">Nouvel envoi</h1>
  <p class="text-sm text-muted-foreground">
    Choisis un template, une audience et un campus, puis prévisualise les
    destinataires avant de lancer.
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
      <Label for="name">Nom de l'envoi</Label>
      <Input
        id="name"
        name="name"
        bind:value={$form.name}
        placeholder="Mail invitation Coding Club avril"
      />
      {#if $errors.name}
        <p class="text-xs text-destructive">{$errors.name}</p>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label for="templateId">Template</Label>
      <select
        id="templateId"
        name="templateId"
        bind:value={$form.templateId}
        class="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">— Sélectionner —</option>
        {#each data.templates as t}
          <option value={t.id}>
            [{BROADCAST_CHANNEL_LABELS[t.channel]}] {t.name}
          </option>
        {/each}
      </select>
      {#if $errors.templateId}
        <p class="text-xs text-destructive">{$errors.templateId}</p>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label for="campusId">Campus</Label>
      <select
        id="campusId"
        name="campusId"
        bind:value={$form.campusId}
        class="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">— Sélectionner —</option>
        {#each data.campuses as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      {#if $errors.campusId}
        <p class="text-xs text-destructive">{$errors.campusId}</p>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label for="eventId">Event (optionnel — vide = tous)</Label>
      <select
        id="eventId"
        name="eventId"
        bind:value={$form.eventId}
        class="h-9 rounded-md border border-input bg-background px-3 text-sm"
        disabled={!$form.campusId}
      >
        <option value="">Tous les events du campus</option>
        {#each filteredEvents as e}
          <option value={e.id}>
            {dateFormatter.format(e.date)} — {e.titre}
          </option>
        {/each}
      </select>
    </div>

    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Audience</legend>
      <div class="grid grid-cols-3 gap-2">
        {#each BROADCAST_AUDIENCES as a}
          <label
            class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <input
              type="radio"
              name="audience"
              value={a}
              bind:group={$form.audience}
            />
            {BROADCAST_AUDIENCE_LABELS[a]}
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="rounded-md border">
      <button
        type="button"
        onclick={() => (showRetarget = !showRetarget)}
        class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <span>Repartir d'un envoi passé (retargeting)</span>
        <span class="text-xs text-muted-foreground"
          >{showRetarget ? '−' : '+'}</span
        >
      </button>
      {#if showRetarget}
        <div class="space-y-3 border-t p-3">
          <div class="grid gap-2">
            <Label for="sourceBroadcastId">Envoi source</Label>
            <select
              id="sourceBroadcastId"
              name="sourceBroadcastId"
              bind:value={$form.sourceBroadcastId}
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Aucun</option>
              {#each filteredSources as b}
                <option value={b.id}>
                  {dateFormatter.format(b.createdAt)} — {b.name}
                </option>
              {/each}
            </select>
          </div>
          {#if $form.sourceBroadcastId}
            <div class="grid gap-2">
              <Label>Filtrer les destinataires sources</Label>
              <div class="flex gap-2 text-sm">
                <label class="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name="sourceFilter"
                    value="all"
                    bind:group={$form.sourceFilter}
                  /> Tous
                </label>
                <label class="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name="sourceFilter"
                    value="opened"
                    bind:group={$form.sourceFilter}
                  /> Ouverts
                </label>
                <label class="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name="sourceFilter"
                    value="not_opened"
                    bind:group={$form.sourceFilter}
                  /> Non ouverts
                </label>
              </div>
              {#if $errors.sourceFilter}
                <p class="text-xs text-destructive">{$errors.sourceFilter}</p>
              {/if}
              <p class="text-xs text-muted-foreground">
                « Ouvert » = a cliqué sur ≥ 1 lien tracké de l'envoi source.
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="rounded-md border">
      <button
        type="button"
        onclick={() => (showFilters = !showFilters)}
        class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <span>Filtres avancés</span>
        <span class="text-xs text-muted-foreground"
          >{showFilters ? '−' : '+'}</span
        >
      </button>
      {#if showFilters}
        <div class="space-y-3 border-t p-3 text-sm">
          {#if $form.audience === 'talent' || $form.audience === 'parent'}
            <div class="grid gap-2">
              <Label>Niveau scolaire</Label>
              <div class="flex flex-wrap gap-2">
                {#each NIVEAUX as n}
                  <label class="flex cursor-pointer items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={$form.filters?.niveau?.includes(n) ?? false}
                      onchange={(e) => {
                        const cur = new Set($form.filters?.niveau ?? []);
                        if (e.currentTarget.checked) cur.add(n);
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
              <div class="flex gap-2">
                {#each JUMP_LEVELS as lvl}
                  <label class="flex cursor-pointer items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={$form.filters?.jumpLevel?.includes(lvl) ?? false}
                      onchange={(e) => {
                        const cur = new Set($form.filters?.jumpLevel ?? []);
                        if (e.currentTarget.checked) cur.add(lvl);
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
                <div class="flex gap-2">
                  {#each tristateValues as v (v)}
                    <label
                      class="flex cursor-pointer items-center gap-1 text-xs"
                    >
                      <input
                        type="radio"
                        name={k}
                        value={v}
                        checked={($form.filters?.[k] ?? 'any') === v}
                        onchange={() => {
                          $form.filters = {
                            ...($form.filters ?? {}),
                            [k]: v === 'any' ? undefined : v,
                          };
                        }}
                      />
                      {v === 'any'
                        ? 'Indifférent'
                        : v === 'yes'
                          ? 'Oui'
                          : 'Non'}
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
          {:else}
            <p class="text-xs text-muted-foreground">
              Pas de filtres avancés pour cette audience.
            </p>
          {/if}
        </div>
      {/if}
    </div>

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
        disabled={$submitting || channel === 'sms' || !selectedTemplate}
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
          Sélectionne un template et un campus pour voir les destinataires.
        </p>
      {/if}

      {#if actionForm && 'message' in actionForm && actionForm.message}
        <p
          class="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700"
        >
          {actionForm.message}
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
      <Dialog.Title>S'envoyer un test</Dialog.Title>
      <Dialog.Description class="text-xs">
        Envoie un email de test avec les variables remplies par des valeurs
        fictives.
      </Dialog.Description>
    </Dialog.Header>
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
        disabled={$submitting || !testEmail}
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
