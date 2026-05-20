<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import {
    BROADCAST_AUDIENCES,
    BROADCAST_AUDIENCE_LABELS,
    AUDIENCES_REQUIRING_EVENT,
    BROADCAST_CHANNEL_LABELS,
    NIVEAUX,
    JUMP_LEVELS,
  } from '$lib/domain/broadcasts';

  let { data, form: actionForm } = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(data.form, {
    dataType: 'json',
    // Without this, a successful preview / test-send action wipes the
    // user's form because superforms resets to the load-time state.
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

  const needsEvent = $derived(
    AUDIENCES_REQUIRING_EVENT.includes($form.audience),
  );

  let showFilters = $state(false);
  let showRetarget = $state(false);
  let confirmEnqueueOpen = $state(false);

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

    {#if needsEvent}
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
    {/if}

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
                    {n}
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
        type="submit"
        formaction="?/preview"
        variant="outline"
        disabled={$submitting}
      >
        Aperçu destinataires
      </Button>
      <Button
        type="submit"
        formaction="?/testSend"
        variant="outline"
        disabled={$submitting || channel === 'sms'}
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
      <h3
        class="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
      >
        Aperçu
      </h3>
      {#if actionForm && 'preview' in actionForm && actionForm.preview}
        <p class="text-2xl font-bold">{actionForm.preview.total}</p>
        <p class="mb-3 text-xs text-muted-foreground">destinataire(s)</p>
        {#if actionForm.preview.excluded.length > 0}
          <ul class="mb-3 space-y-0.5 text-xs text-amber-700">
            {#each actionForm.preview.excluded as ex}
              <li>
                {ex.count} exclu(s) :
                {ex.reason === 'no_email' ? "pas d'email" : 'pas de téléphone'}
              </li>
            {/each}
          </ul>
        {/if}
        {#if actionForm.preview.sample.length > 0}
          <p class="mb-1 text-xs font-medium">Échantillon :</p>
          <ul class="space-y-0.5 text-xs text-muted-foreground">
            {#each actionForm.preview.sample as r}
              <li class="truncate">
                {r.name} <span class="text-[10px]">({r.email ?? r.phone})</span>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <p class="text-xs text-muted-foreground">
          Remplis les champs puis clique sur « Aperçu destinataires ».
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

<AlertDialog.Root bind:open={confirmEnqueueOpen}>
  <AlertDialog.Content class="rounded-sm">
    <AlertDialog.Header>
      <AlertDialog.Title
        class="text-lg font-bold tracking-tight text-destructive uppercase"
      >
        Démarrer les envois ?
      </AlertDialog.Title>
      <AlertDialog.Description class="text-sm font-medium">
        {#if actionForm && 'preview' in actionForm && actionForm.preview}
          {actionForm.preview.total} message(s) vont être envoyés immédiatement aux
          destinataires sélectionnés. Cette action est
          <strong>irréversible</strong>.
        {:else}
          Les messages vont être envoyés immédiatement aux destinataires
          sélectionnés. Cette action est <strong>irréversible</strong>. Lance
          d'abord un « Aperçu destinataires » si tu veux voir le nombre exact.
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
