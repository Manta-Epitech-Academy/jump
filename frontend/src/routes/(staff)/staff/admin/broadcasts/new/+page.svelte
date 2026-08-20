<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { superForm } from 'sveltekit-superforms';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PhoneInput from '$lib/components/ui/phone-input/PhoneInput.svelte';
  import { Label } from '$lib/components/ui/label';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import Plus from '@lucide/svelte/icons/plus';
  import Send from '@lucide/svelte/icons/send';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';
  import MessageBodyEditor from '$lib/components/admin/broadcasts/MessageBodyEditor.svelte';
  import MessagePreview from '$lib/components/admin/broadcasts/MessagePreview.svelte';
  import BroadcastFilters from '$lib/components/admin/broadcasts/BroadcastFilters.svelte';
  import RecipientsPanel from '$lib/components/admin/broadcasts/RecipientsPanel.svelte';
  import {
    BROADCAST_AUDIENCES,
    BROADCAST_AUDIENCE_LABELS,
    BROADCAST_CHANNEL_LABELS,
    EVENT_SCOPED_AUDIENCES,
    countActiveBroadcastFilters,
    type IncludedRecipient,
    type ExcludedRecipient,
  } from '$lib/domain/broadcasts';
  import { cn } from '$lib/utils';

  let { data } = $props();

  const DRAFT_KEY = 'broadcast-new-draft-v2';

  // svelte-ignore state_referenced_locally
  const {
    form,
    errors,
    enhance,
    submitting,
    message: formMessage,
  } = superForm(data.form, {
    dataType: 'json',
    resetForm: false,
    validationMethod: 'onsubmit',
    // Flag the in-flight action HERE, not in the buttons' onclick. Disabling a
    // submit button synchronously inside its own click handler cancels the
    // native form submission: Svelte flushes the `disabled` attribute before
    // the browser runs the submit's default action, so it sees a disabled
    // button and never fires `submit` (the button froze on "Envoi..." with no
    // request sent). By the time onSubmit runs, enhance has already intercepted
    // the submit, so toggling disabled here is safe.
    onSubmit: ({ action }) => {
      if (action.search === '?/testSend') testSending = true;
      else if (action.search === '?/enqueue') enqueueSending = true;
    },
    onResult: ({ result }) => {
      testSending = false;
      enqueueSending = false;
      if (browser && result.type === 'redirect') {
        localStorage.removeItem(DRAFT_KEY);
      }
    },
    onError: () => {
      // A thrown action calls onError, not onResult, so reset here too: the
      // button can't stay stuck on "Envoi..." after a server error.
      testSending = false;
      enqueueSending = false;
    },
  });

  // ── Channel-first selection ─────────────────────────────────────────────
  // The channel is chosen up front and filters the template picker; the actual
  // send channel is still the picked template's (they always agree). With no
  // template yet, the chosen channel drives the editor + SMS meter.
  let channelChoice = $state<'mail' | 'sms'>('mail');
  const channelOptions = [
    { value: 'mail', label: BROADCAST_CHANNEL_LABELS.mail },
    { value: 'sms', label: BROADCAST_CHANNEL_LABELS.sms },
  ];
  const selectedTemplate = $derived(
    data.templates.find((t) => t.id === $form.templateId),
  );
  const channel = $derived(selectedTemplate?.channel ?? channelChoice);
  const templatesForChannel = $derived(
    data.templates.filter((t) => t.channel === channelChoice),
  );

  function onChannelChange(v: string) {
    const next = v as 'mail' | 'sms';
    if (next === channelChoice) return;
    channelChoice = next;
    // Dropping a template from the other channel: clear it and its seeded
    // content so the editor starts clean for the new channel.
    if (selectedTemplate && selectedTemplate.channel !== next) {
      $form.templateId = '';
      $form.subject = '';
      $form.body = '';
      seededFor = '';
    }
  }

  // ── Seed editable content from the picked template ──────────────────────
  // Choosing a template fills the (editable) subject/body once. Editing them
  // afterwards never touches the template — the send snapshots this content.
  let seededFor = $state('');
  $effect(() => {
    const tid = $form.templateId;
    if (tid && tid !== seededFor) {
      const t = data.templates.find((x) => x.id === tid);
      if (t) {
        $form.subject = t.subject ?? '';
        $form.body = t.body;
        seededFor = tid;
        channelChoice = t.channel;
      }
    }
  });

  // Switching campus invalidates any event/source picked under the old one, so
  // drop them here (mirrors `onAudienceChange`). Doing it in the change handler
  // rather than an effect on `$form.campusId` is deliberate: a programmatic
  // draft restore assigns `campusId` directly and must keep its restored
  // event/source instead of having them wiped by a reaction.
  function onCampusChange(next: string) {
    if (next === $form.campusId) return;
    $form.campusId = next;
    $form.eventId = '';
    $form.sourceBroadcastId = '';
    $form.sourceFilter = undefined;
  }

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
  const selectedSource = $derived(
    data.sourceBroadcasts.find((b) => b.id === $form.sourceBroadcastId) ?? null,
  );
  // SMS sends don't track link clicks (a visible tracking suffix reads as
  // phishing on a handset), so an SMS source has no "ouverts" data. The opened /
  // not-opened retargeting filters can't mean anything for it: disable them and
  // coerce any stale selection back to "tous".
  const sourceLacksOpens = $derived(selectedSource?.channel === 'sms');
  $effect(() => {
    if (
      sourceLacksOpens &&
      ($form.sourceFilter === 'opened' || $form.sourceFilter === 'not_opened')
    ) {
      $form.sourceFilter = 'all';
    }
  });
  // Only talent/parent are narrowed by an event; for the staff audiences the
  // event does nothing, so we hide the picker entirely.
  const eventScoped = $derived(
    $form.audience ? EVENT_SCOPED_AUDIENCES.includes($form.audience) : false,
  );

  function onAudienceChange(v: string) {
    const next = v as (typeof BROADCAST_AUDIENCES)[number];
    $form.audience = next;
    // Drop a now-meaningless event when switching to an audience the event
    // can't scope, so a stale id can't ride along in the draft / preview.
    if (!EVENT_SCOPED_AUDIENCES.includes(next)) $form.eventId = '';
  }

  let showFilters = $state(false);
  let showRetarget = $state(false);
  let confirmEnqueueOpen = $state(false);
  // Track test-send separately so it doesn't disable the enqueue button (and
  // vice-versa). `$submitting` covers both actions because superforms owns it;
  // these flags layer on top so each button only greys out for its own action.
  let testSending = $state(false);
  let enqueueSending = $state(false);
  // svelte-ignore state_referenced_locally
  let testEmail = $state(data.userEmail ?? '');
  let testPhone = $state('');

  // ── Draft auto-save (localStorage) ──────────────────────────────────────
  onMount(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as Partial<typeof $form>;
      const urlTemplate = page.url.searchParams.get('template');
      // Validate restored IDs against current data to avoid phantom references
      // (e.g. a template deleted since the draft was saved).
      const campusValid = data.campuses.some((c) => c.id === draft.campusId);
      $form.campusId = campusValid ? (draft.campusId ?? '') : '';
      const eventValid =
        campusValid && data.events.some((e) => e.id === draft.eventId);
      $form.eventId = eventValid ? (draft.eventId ?? '') : '';
      $form.audience = draft.audience;
      if (!urlTemplate) {
        const tplValid = data.templates.some((t) => t.id === draft.templateId);
        $form.templateId = tplValid ? (draft.templateId ?? '') : '';
      }
      const sourceValid = data.sourceBroadcasts.some(
        (b) => b.id === draft.sourceBroadcastId,
      );
      $form.sourceBroadcastId = sourceValid
        ? (draft.sourceBroadcastId ?? '')
        : '';
      $form.sourceFilter = sourceValid ? draft.sourceFilter : undefined;
      $form.filters = draft.filters ?? {};
      $form.subject = draft.subject ?? '';
      $form.body = draft.body ?? '';
      // Mark the (possibly edited) draft content as already seeded so the
      // template-seed effect doesn't clobber it.
      seededFor = $form.templateId ?? '';
      const t = data.templates.find((x) => x.id === $form.templateId);
      if (t) channelChoice = t.channel;
      toast.info('Brouillon restauré');
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  });

  $effect(() => {
    if (!browser) return;
    const snapshot = {
      campusId: $form.campusId,
      eventId: $form.eventId,
      audience: $form.audience,
      templateId: $form.templateId,
      sourceBroadcastId: $form.sourceBroadcastId,
      sourceFilter: $form.sourceFilter,
      filters: $form.filters,
      subject: $form.subject,
      body: $form.body,
    };
    const isEmpty =
      !snapshot.campusId &&
      !snapshot.audience &&
      !snapshot.templateId &&
      !snapshot.sourceBroadcastId &&
      !snapshot.body;
    const timer = setTimeout(() => {
      if (isEmpty) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
    }, 500);
    return () => clearTimeout(timer);
  });

  // ── Live recipient preview (full, exact roster) ─────────────────────────
  type PreviewState = {
    total: number;
    included: IncludedRecipient[];
    excluded: ExcludedRecipient[];
    incomplete?: boolean;
  };
  let preview = $state<PreviewState | null>(null);
  let previewLoading = $state(false);
  let previewError = $state<string | null>(null);

  $effect(() => {
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
    // Keep the previous preview visible while loading (no flicker).
    // Only clear it on error or when targeting becomes incomplete.
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

  const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
  });

  const templateOptions: SelectOption[] = $derived(
    templatesForChannel.map((t) => ({ value: t.id, label: t.name })),
  );
  const campusOptions: SelectOption[] = $derived(
    data.campuses.map((c) => ({ value: c.id, label: c.name })),
  );
  const eventOptions: SelectOption[] = $derived(
    filteredEvents.map((e) => ({
      value: e.id,
      label: `${dateFormatter.format(e.date)} · ${e.titre}`,
    })),
  );
  const sourceOptions: SelectOption[] = $derived(
    filteredSources.map((b) => ({
      value: b.id,
      label: `${dateFormatter.format(b.createdAt)} · ${b.name}`,
    })),
  );

  const activeFilterCount = $derived(
    countActiveBroadcastFilters($form.filters),
  );

  // CSV export of the exact roster for the current targeting. Mirrors the live
  // preview params; `filters` is JSON-encoded into a single query arg.
  const csvHref = $derived.by(() => {
    const p = new URLSearchParams();
    if ($form.campusId) p.set('campusId', $form.campusId);
    if ($form.audience) p.set('audience', $form.audience);
    if ($form.templateId) p.set('templateId', $form.templateId);
    if ($form.eventId) p.set('eventId', $form.eventId);
    if ($form.sourceBroadcastId)
      p.set('sourceBroadcastId', $form.sourceBroadcastId);
    if ($form.sourceFilter) p.set('sourceFilter', $form.sourceFilter);
    if ($form.filters && Object.keys($form.filters).length > 0)
      p.set('filters', JSON.stringify($form.filters));
    return `/staff/admin/broadcasts/new/export?${p.toString()}`;
  });

  // Enough to enable the send button (the server re-validates everything).
  // Also requires a resolved preview with at least one recipient so the admin
  // can't fire off an empty broadcast.
  const canSend = $derived(
    Boolean(
      $form.templateId &&
      $form.campusId &&
      $form.audience &&
      ($form.body ?? '').trim() &&
      (channel === 'sms' || ($form.subject ?? '').trim()) &&
      preview &&
      !preview.incomplete &&
      preview.total > 0,
    ),
  );
</script>

{#snippet sectionLabel(n: number, title: string)}
  <div class="flex items-center gap-2">
    <span
      class="flex h-5 w-5 items-center justify-center rounded-sm bg-epi-tomorrow/10 font-mono text-xs font-bold text-epi-tomorrow"
      >{n}</span
    >
    <h2 class="epi-overline text-muted-foreground">
      {title}
    </h2>
  </div>
{/snippet}

<PageHeader
  title="Nouvel"
  accent="envoi"
  subtitle="Choisis le canal, rédige le message, cible l'audience — l'aperçu est à droite"
/>

<form
  id="broadcast-form"
  method="POST"
  use:enhance
  class="mt-6 grid gap-6 lg:grid-cols-[1fr_390px]"
>
  <div class="space-y-6">
    <!-- 1 · Canal & modèle -->
    <section class="space-y-3 rounded-sm border bg-card p-4">
      {@render sectionLabel(1, 'Canal & modèle')}
      <SegmentedFilter
        options={channelOptions}
        value={channelChoice}
        onChange={onChannelChange}
        ariaLabel="Canal de l'envoi"
      />
      <div class="grid gap-2">
        <Label>Partir d'un modèle</Label>
        <div class="flex items-center gap-2">
          <SearchableSelect
            clearable={false}
            options={templateOptions}
            value={$form.templateId}
            onChange={(v) => ($form.templateId = v ?? '')}
            placeholder="— Sélectionner un modèle —"
            searchPlaceholder="Rechercher un modèle…"
            emptyLabel={`Aucun modèle ${BROADCAST_CHANNEL_LABELS[channelChoice]}.`}
            triggerClass="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            href="/staff/admin/broadcasts/templates/new"
            target="_blank"
            rel="noopener"
            aria-label="Créer un modèle (nouvel onglet)"
            title="Créer un modèle (nouvel onglet)"
          >
            <Plus class="h-4 w-4" />
          </Button>
        </div>
        {#if $errors.templateId}
          <p class="text-xs text-destructive">{$errors.templateId}</p>
        {/if}
      </div>
    </section>

    <!-- 2 · Message -->
    <section class="space-y-3 rounded-sm border bg-card p-4">
      {@render sectionLabel(2, 'Message')}
      {#if !$form.templateId}
        <p class="text-sm text-muted-foreground">
          Choisis un modèle ci-dessus pour pré-remplir le message — tu pourras
          l'ajuster ici pour cet envoi sans modifier le modèle.
        </p>
      {:else}
        <p class="text-xs text-muted-foreground">
          Modifications appliquées à <strong>cet envoi uniquement</strong> ; le
          modèle « {selectedTemplate?.name} » n'est pas touché.
        </p>
        {#if channel === 'mail'}
          <div class="grid gap-2">
            <Label for="subject">Sujet</Label>
            <Input
              id="subject"
              bind:value={$form.subject}
              placeholder="Ex : Invitation Coding Club n°{'{{event_name}}'}"
            />
            {#if $errors.subject}
              <p class="text-xs text-destructive">{$errors.subject}</p>
            {/if}
          </div>
        {/if}
        <MessageBodyEditor bind:value={$form.body} {channel} />
        {#if $errors.body}
          <p class="text-xs text-destructive">{$errors.body}</p>
        {/if}
      {/if}
    </section>

    <!-- 3 · Audience & ciblage -->
    <section class="space-y-4 rounded-sm border bg-card p-4">
      {@render sectionLabel(3, 'Audience & ciblage')}

      <div class="grid gap-2">
        <Label>Campus</Label>
        <SearchableSelect
          clearable={false}
          options={campusOptions}
          value={$form.campusId}
          onChange={(v) => onCampusChange(v ?? '')}
          placeholder="— Sélectionner —"
          searchPlaceholder="Rechercher un campus…"
          emptyLabel="Aucun campus."
          triggerClass="w-full"
        />
        {#if $errors.campusId}
          <p class="text-xs text-destructive">{$errors.campusId}</p>
        {/if}
      </div>

      <fieldset class="space-y-2">
        <legend class="text-sm font-medium">Audience</legend>
        <RadioGroup.Root
          value={$form.audience ?? ''}
          onValueChange={onAudienceChange}
          class="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {#each BROADCAST_AUDIENCES as a (a)}
            <Label
              class="cursor-pointer rounded-sm border px-3 py-2 font-normal hover:bg-accent"
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

      {#if eventScoped}
        <div class="grid gap-2">
          <Label>Event (optionnel — vide = tous)</Label>
          <SearchableSelect
            options={eventOptions}
            value={$form.eventId || 'all'}
            onChange={(v) => ($form.eventId = v === 'all' ? '' : (v ?? ''))}
            disabled={!$form.campusId}
            allLabel="Tous les events du campus"
            placeholder="Tous les events du campus"
            searchPlaceholder="Rechercher un event…"
            emptyLabel="Aucun event."
            triggerClass="w-full"
          />
        </div>
      {/if}

      <!-- Advanced filters -->
      <Collapsible.Root
        open={showFilters}
        onOpenChange={(o) => (showFilters = o)}
        class="rounded-sm border"
      >
        <Collapsible.Trigger
          class="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
        >
          <span class="flex items-center gap-2">
            Filtres avancés
            {#if activeFilterCount > 0}
              <span
                class="rounded-sm bg-epi-blue/10 px-1.5 py-0.5 font-mono text-xs font-bold text-epi-blue"
                >{activeFilterCount}</span
              >
            {/if}
          </span>
          <ChevronDown
            class={cn(
              'h-4 w-4 transition-transform',
              showFilters && 'rotate-180',
            )}
          />
        </Collapsible.Trigger>
        <Collapsible.Content class="border-t p-3">
          <BroadcastFilters
            bind:filters={$form.filters}
            audience={$form.audience}
          />
        </Collapsible.Content>
      </Collapsible.Root>

      <!-- Retargeting -->
      <Collapsible.Root
        open={showRetarget}
        onOpenChange={(o) => (showRetarget = o)}
        class="rounded-sm border"
      >
        <Collapsible.Trigger
          class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
        >
          <span>Repartir d'un envoi passé (retargeting)</span>
          <ChevronDown
            class={cn(
              'h-4 w-4 transition-transform',
              showRetarget && 'rotate-180',
            )}
          />
        </Collapsible.Trigger>
        <Collapsible.Content class="space-y-3 border-t p-3">
          <div class="grid gap-2">
            <Label>Envoi source</Label>
            <SearchableSelect
              options={sourceOptions}
              value={$form.sourceBroadcastId || 'all'}
              onChange={(v) =>
                ($form.sourceBroadcastId = v === 'all' ? '' : (v ?? ''))}
              allLabel="Aucun"
              placeholder="Aucun"
              searchPlaceholder="Rechercher un envoi…"
              emptyLabel="Aucun envoi."
              triggerClass="w-full"
            />
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
                <Label
                  class={cn(
                    'cursor-pointer gap-1.5 font-normal',
                    sourceLacksOpens && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <RadioGroup.Item value="opened" disabled={sourceLacksOpens} /> Ouverts
                </Label>
                <Label
                  class={cn(
                    'cursor-pointer gap-1.5 font-normal',
                    sourceLacksOpens && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <RadioGroup.Item
                    value="not_opened"
                    disabled={sourceLacksOpens}
                  />
                  Non ouverts
                </Label>
              </RadioGroup.Root>
              {#if $errors.sourceFilter}
                <p class="text-xs text-destructive">{$errors.sourceFilter}</p>
              {/if}
              {#if sourceLacksOpens}
                <p class="text-xs text-muted-foreground">
                  Cet envoi SMS ne suit pas les clics : « ouverts / non ouverts
                  » ne sont pas disponibles, seul « tous » est possible.
                </p>
              {:else}
                <p class="text-xs text-muted-foreground">
                  « Ouvert » = a cliqué sur ≥ 1 lien tracké de l'envoi source.
                </p>
              {/if}
            </div>
          {/if}
        </Collapsible.Content>
      </Collapsible.Root>
    </section>
  </div>

  <!-- Right panel: recipients + preview + send -->
  <aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
    <!-- Recipients (full, exact roster + CSV) -->
    <RecipientsPanel
      total={preview?.total ?? 0}
      included={preview?.included ?? []}
      excluded={preview?.excluded ?? []}
      loading={previewLoading}
      error={previewError}
      incomplete={!preview || preview.incomplete === true}
      {csvHref}
    />

    <!-- Message preview -->
    <div class="rounded-sm border bg-card p-4">
      <h3 class="mb-3 epi-overline text-muted-foreground">Aperçu du message</h3>
      {#if $form.templateId}
        <MessagePreview
          {channel}
          subject={$form.subject}
          body={$form.body ?? ''}
          eventName={data.events.find((e) => e.id === $form.eventId)?.titre ??
            null}
        />
      {:else}
        <p class="text-xs text-muted-foreground">
          Sélectionne un modèle pour prévisualiser le message.
        </p>
      {/if}
    </div>

    <!-- Test send (inline) -->
    <div class="space-y-2 rounded-sm border bg-muted/20 p-4">
      <Label class="text-sm font-medium">S'envoyer un test</Label>
      <p class="text-xs text-muted-foreground">
        Atteint l'adresse / le numéro saisi (hors redirection dev).
      </p>
      <div class="flex flex-wrap items-center gap-2">
        {#if channel === 'sms'}
          <div class="flex-1">
            <PhoneInput
              name="testPhone"
              form="broadcast-form"
              bind:value={testPhone}
              placeholder="06 12 34 56 78"
              disabled={!data.smsEnabled}
            />
          </div>
        {:else}
          <Input
            name="testEmail"
            form="broadcast-form"
            type="email"
            bind:value={testEmail}
            placeholder="prenom.nom@epitech.eu"
            class="flex-1"
          />
        {/if}
        <Button
          type="submit"
          variant="outline"
          form="broadcast-form"
          formaction="?/testSend"
          disabled={testSending ||
            !$form.templateId ||
            !($form.body ?? '').trim() ||
            (channel === 'sms' ? !testPhone || !data.smsEnabled : !testEmail)}
        >
          <Send class="mr-1 h-3.5 w-3.5" />
          {testSending ? 'Envoi...' : 'Tester'}
        </Button>
      </div>
      {#if channel === 'sms' && !data.smsEnabled}
        <p class="text-xs text-destructive">
          SMS non configuré (<code>SMS_PROVIDER</code>) — test indisponible.
        </p>
      {/if}
    </div>

    <!-- Send -->
    <Button
      type="button"
      class="w-full"
      disabled={enqueueSending || !canSend}
      onclick={() => (confirmEnqueueOpen = true)}
    >
      <Send class="mr-1 h-4 w-4" /> Démarrer les envois
    </Button>

    {#if $formMessage}
      <p
        class={cn(
          'rounded-sm border px-2 py-1 text-xs',
          $formMessage.type === 'error'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
        )}
      >
        {$formMessage.text}
      </p>
    {/if}
  </aside>
</form>

<AlertDialog.Root bind:open={confirmEnqueueOpen}>
  <AlertDialog.Content class="rounded-sm">
    <AlertDialog.Header>
      <AlertDialog.Title class="text-destructive">
        Démarrer les envois ?
      </AlertDialog.Title>
      <AlertDialog.Description class="text-sm font-medium">
        {#if preview && !preview.incomplete}
          {preview.total} message{preview.total > 1 ? 's' : ''} vont partir immédiatement
          aux destinataires sélectionnés. Cette action est
          <strong>irréversible</strong>.
        {:else}
          Les messages vont partir immédiatement aux destinataires sélectionnés.
          Cette action est <strong>irréversible</strong>.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel class="rounded-sm">Annuler</AlertDialog.Cancel>
      <AlertDialog.Action
        type="submit"
        form="broadcast-form"
        formaction="?/enqueue"
        disabled={enqueueSending}
        class={buttonVariants({ variant: 'destructive', class: 'rounded-sm' })}
      >
        {enqueueSending ? 'Envoi en cours...' : 'Oui, démarrer les envois'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
