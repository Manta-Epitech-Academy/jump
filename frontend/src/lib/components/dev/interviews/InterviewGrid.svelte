<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { beforeNavigate, goto } from '$app/navigation';
  import Star from '@lucide/svelte/icons/star';
  import Check from '@lucide/svelte/icons/check';
  import Play from '@lucide/svelte/icons/play';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import CircleCheckBig from '@lucide/svelte/icons/circle-check-big';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { InterviewStatus } from '@prisma/client';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { cn } from '$lib/utils';
  import {
    INTERVIEW_BLOCS,
    INTERVIEWER_SECTION,
    INTERVIEW_RECOMMENDATIONS,
    INTERVIEW_RECOMMENDATION_VALUES,
    isRevealActive,
    type ChoiceOption,
    type Reveal,
    type RecommendationToneToken,
  } from '$lib/domain/interview';
  import type { InterviewConductForm } from '$lib/validation/interviews';

  let {
    form: data,
    talentName,
    status,
    conductedAt,
    timezone,
  }: {
    form: SuperValidated<InterviewConductForm>;
    talentName: string;
    status: InterviewStatus | null;
    conductedAt: Date | string | null;
    timezone: string;
  } = $props();

  // Lifecycle: null = "à faire" (not started), in_progress = "en cours" (started,
  // autosaving, leave-guarded), done = "finalisé" (closed, read-only until reopened).
  // svelte-ignore state_referenced_locally
  let localStatus = $state<InterviewStatus | null>(status);
  const started = $derived(localStatus === 'in_progress');
  const closed = $derived(localStatus === 'done');
  // Fields are interactive only while the interview is in progress.
  const interactive = $derived(started);

  type Action = 'start' | 'autosave' | 'close' | 'reopen' | 'abandon';
  let lastAction = $state<Action>('autosave');
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');

  // Leave-guard state.
  let leaveDialogOpen = $state(false);
  let pendingUrl = $state<string | null>(null);
  let leaveAfterClose = $state(false);
  let bypassGuard = false;

  let formEl: HTMLFormElement;
  let closeBtn: HTMLButtonElement;
  let abandonBtn: HTMLButtonElement;

  const { form, enhance, delayed, reset } = superForm(
    untrack(() => data),
    {
      dataType: 'json',
      resetForm: false,
      invalidateAll: false,
      // Only one submit may be in flight. A lifecycle action (close / abandon /
      // reopen) fired while a debounced autosave is mid-request ABORTS that
      // autosave rather than being dropped: superForm's 'prevent' default would
      // silently drop the lifecycle submit, then the stale autosave result would
      // be read under the new `lastAction` and the close/abandon branch below
      // would run — UI flips to "Finalisé" while the row is still in_progress in
      // the DB. Abort also stops a fast second autosave from being lost behind a
      // slow first one. `beginAction` clears the *scheduled* autosave; this
      // covers the one already on the wire.
      multipleSubmits: 'abort',
      onResult: ({ result, cancel }) => {
        // Autosave: keep the client form authoritative (don't let the echoed
        // server data clobber keystrokes made during the round-trip), and stay
        // quiet — just flip the inline indicator.
        if (lastAction === 'autosave') {
          saveState = result.type === 'success' ? 'saved' : 'idle';
          if (result.type !== 'success') {
            toast.error("Échec de l'enregistrement automatique.");
          }
          cancel();
          return;
        }
        if (result.type === 'success') {
          if (lastAction === 'start') {
            localStatus = 'in_progress';
            toast.success('Entretien démarré.');
          } else if (lastAction === 'close') {
            localStatus = 'done';
            saveState = 'idle';
            toast.success('Entretien clôturé.');
            if (leaveAfterClose && pendingUrl) {
              bypassGuard = true;
              goto(pendingUrl);
            }
          } else if (lastAction === 'reopen') {
            localStatus = 'in_progress';
            toast.success('Entretien rouvert.');
          } else if (lastAction === 'abandon') {
            localStatus = null;
            saveState = 'idle';
            // Clear the grid so a later "Démarrer" starts from a blank slate
            // rather than recreating the abandoned answers.
            reset({ data: { participationId: $form.participationId } });
            toast.success('Entretien abandonné.');
          }
        } else if (result.type === 'failure') {
          leaveAfterClose = false;
          toast.error(result.data?.form?.message ?? 'Une erreur est survenue.');
        }
      },
    },
  );

  // ── Debounced autosave (only while in progress) ──
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleAutosave() {
    if (localStatus !== 'in_progress') return;
    saveState = 'saving';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      lastAction = 'autosave';
      formEl?.requestSubmit();
    }, 900);
  }

  // An explicit lifecycle action cancels the *scheduled* autosave (the debounce
  // timer); an autosave already on the wire is aborted by `multipleSubmits:
  // 'abort'` above. Between the two, the lifecycle submit never races a save.
  function beginAction(a: Action) {
    clearTimeout(saveTimer);
    lastAction = a;
  }

  // ── Field accessors (catalogue-driven loop over a heterogeneous form) ──
  const fv = (k: string) => ($form as Record<string, unknown>)[k];
  function setSingle(field: string, value: string) {
    if (!interactive) return;
    $form = {
      ...$form,
      [field]: fv(field) === value ? null : value,
    } as InterviewConductForm;
    scheduleAutosave();
  }
  function toggleMulti(field: string, value: string) {
    if (!interactive) return;
    const arr = (fv(field) as string[] | undefined) ?? [];
    $form = {
      ...$form,
      [field]: arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value],
    } as InterviewConductForm;
    scheduleAutosave();
  }
  function setStars(n: number) {
    if (!interactive) return;
    $form.satisfactionStars = $form.satisfactionStars === n ? null : n;
    scheduleAutosave();
  }
  function setText(field: string, value: string) {
    $form = { ...$form, [field]: value } as InterviewConductForm;
    scheduleAutosave();
  }

  // ── Leave guards ──
  // In-app navigation away from the fiche while an interview is open: cancel it
  // and ask whether to close the interview first (answers are already saved).
  beforeNavigate((nav) => {
    if (bypassGuard || localStatus !== 'in_progress') return;
    if (nav.willUnload || !nav.to) return; // tab close/refresh → beforeunload
    nav.cancel();
    pendingUrl = nav.to.url.href;
    leaveDialogOpen = true;
  });
  // Tab close / refresh: native browser prompt (text can't be customised).
  $effect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (localStatus === 'in_progress') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  });

  function leaveWithoutClosing() {
    bypassGuard = true;
    leaveDialogOpen = false;
    if (pendingUrl) goto(pendingUrl);
  }
  function closeAndLeave() {
    leaveDialogOpen = false;
    leaveAfterClose = true;
    lastAction = 'close';
    clearTimeout(saveTimer);
    formEl.requestSubmit(closeBtn);
  }
  function cancelLeave() {
    leaveDialogOpen = false;
    pendingUrl = null;
  }

  // Closing with ★ questions still empty is almost always a misclick (an empty
  // finalisé row pollutes the synthesis), but the guide allows skipping when
  // time runs short, so we confirm rather than hard-block.
  let closeConfirmOpen = $state(false);
  function attemptClose() {
    if (essentialDone < essentialTotal) closeConfirmOpen = true;
    else doClose();
  }
  function doClose() {
    closeConfirmOpen = false;
    beginAction('close');
    formEl.requestSubmit(closeBtn);
  }

  // Abandon: the reverse of "Démarrer" for a misclicked start. Always confirmed
  // (it's a delete); the warning adapts to whether anything was typed.
  let abandonConfirmOpen = $state(false);
  function doAbandon() {
    abandonConfirmOpen = false;
    beginAction('abandon');
    formEl.requestSubmit(abandonBtn);
  }

  // ── Essential-progress meter (★ questions + the recommendation) ──
  const essentialQuestions = INTERVIEW_BLOCS.flatMap((b) => b.questions).filter(
    (q) => q.essential,
  );
  const essentialTotal = essentialQuestions.length + 1;
  const essentialDone = $derived.by(() => {
    let n = 0;
    for (const q of essentialQuestions) {
      const v = fv(q.field);
      if (q.kind === 'multi') {
        if (Array.isArray(v) && v.length > 0) n++;
      } else if (v != null && v !== '') {
        n++;
      }
    }
    if ($form.recommendation != null) n++;
    return n;
  });
  const allEssentialDone = $derived(essentialDone === essentialTotal);
  const missingEssential = $derived(essentialTotal - essentialDone);
  const closeWarning = $derived(
    missingEssential > 1
      ? `Il reste ${missingEssential} questions incontournables (★) non remplies.`
      : 'Il reste 1 question incontournable (★) non remplie.',
  );

  // Any answer entered (excluding the participation key) drives the abandon
  // confirmation copy: warn about data loss only when there is data to lose.
  const hasAnswers = $derived.by(() => {
    for (const [k, v] of Object.entries($form)) {
      if (k === 'participationId') continue;
      if (Array.isArray(v)) {
        if (v.length > 0) return true;
      } else if (v != null && v !== '') {
        return true;
      }
    }
    return false;
  });

  const conductedLabel = $derived(
    conductedAt
      ? new Date(conductedAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          timeZone: timezone,
        })
      : null,
  );

  const chipBase =
    'cursor-pointer rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors select-none disabled:cursor-default';
  const chipIdle =
    'border-border bg-background text-foreground hover:border-epi-blue/40 hover:bg-epi-blue/5';
  const chipActive = 'border-epi-blue bg-epi-blue text-white shadow-sm';

  const TONE_IDLE: Record<RecommendationToneToken, string> = {
    'epi-tech':
      'border-epi-teal-solid/30 bg-epi-teal-solid/5 text-epi-teal-solid hover:border-epi-teal-solid',
    'epi-blue':
      'border-epi-blue/30 bg-epi-blue/5 text-epi-blue hover:border-epi-blue',
    'epi-tomorrow':
      'border-epi-pink/30 bg-epi-pink/5 text-epi-pink hover:border-epi-pink',
    'epi-drift':
      'border-border bg-muted/40 text-muted-foreground hover:border-foreground/40',
  };
  const TONE_ACTIVE: Record<RecommendationToneToken, string> = {
    'epi-tech':
      'border-epi-teal-solid bg-epi-teal-solid/15 ring-1 ring-epi-teal-solid',
    'epi-blue': 'border-epi-blue bg-epi-blue/10 ring-1 ring-epi-blue',
    'epi-tomorrow': 'border-epi-pink bg-epi-pink/10 ring-1 ring-epi-pink',
    'epi-drift': 'border-foreground/40 bg-muted ring-1 ring-foreground/30',
  };
</script>

{#snippet star()}
  <span class="text-epi-teal-solid" title="Question incontournable">★</span>
{/snippet}

{#snippet questionLabel(label: string, essential: boolean | undefined)}
  <p class="text-xs font-bold tracking-wide text-epi-blue uppercase">
    {label}
    {#if essential}{@render star()}{/if}
  </p>
{/snippet}

{#snippet singleChips(field: string, options: readonly ChoiceOption[])}
  <div class="flex flex-wrap gap-2">
    {#each options as opt (opt.value)}
      {@const active = fv(field) === opt.value}
      <button
        type="button"
        aria-pressed={active}
        disabled={!interactive}
        onclick={() => setSingle(field, opt.value)}
        class={cn(chipBase, active ? chipActive : chipIdle)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet multiChips(field: string, options: readonly ChoiceOption[])}
  {@const selected = (fv(field) as string[] | undefined) ?? []}
  <div class="flex flex-wrap gap-2">
    {#each options as opt (opt.value)}
      {@const active = selected.includes(opt.value)}
      <button
        type="button"
        aria-pressed={active}
        disabled={!interactive}
        onclick={() => toggleMulti(field, opt.value)}
        class={cn(
          chipBase,
          'inline-flex items-center gap-1.5',
          active ? chipActive : chipIdle,
        )}
      >
        {#if active}<Check class="h-3.5 w-3.5" />{/if}
        {opt.label}
      </button>
    {/each}
  </div>
{/snippet}

<!-- Free-text inputs unlocked by a choice (teacher details, the "Précisez" box
     once "Autre" is picked). One renderer for both single- and multi-choice. -->
{#snippet revealInputs(reveal: Reveal)}
  <div
    class={cn('grid gap-2 pt-1', reveal.fields.length > 1 && 'sm:grid-cols-2')}
  >
    {#each reveal.fields as rf (rf.field)}
      <div class="space-y-1">
        <span class="text-[11px] font-medium text-muted-foreground">
          {rf.label}
        </span>
        <Input
          value={(fv(rf.field) as string) ?? ''}
          oninput={(e) => setText(rf.field, e.currentTarget.value)}
          placeholder={rf.placeholder}
          maxlength={rf.maxLength}
          disabled={!interactive}
          class="bg-background"
        />
      </div>
    {/each}
  </div>
{/snippet}

<EpiSection title="Grille d'entretien" accent="blue">
  {#snippet meta()}
    <div class="flex items-center gap-2">
      {#if closed}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-epi-teal-solid/40 bg-epi-teal-solid/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-epi-teal-solid uppercase"
        >
          <CircleCheckBig class="h-3 w-3" /> Finalisé
        </span>
      {:else if started}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-epi-orange/40 bg-epi-orange/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-epi-orange uppercase"
        >
          En cours
        </span>
      {/if}
      <span
        class={cn(
          'rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase',
          allEssentialDone
            ? 'border-epi-teal-solid/40 bg-epi-teal-solid/10 text-epi-teal-solid'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        {essentialDone}/{essentialTotal} ★
      </span>
    </div>
  {/snippet}

  <form bind:this={formEl} method="POST" action="?/saveInterview" use:enhance>
    <!-- Hidden submitters for the programmatic close / abandon paths. -->
    <button
      bind:this={closeBtn}
      type="submit"
      formaction="?/closeInterview"
      class="hidden"
      aria-hidden="true"
      tabindex={-1}
    ></button>
    <button
      bind:this={abandonBtn}
      type="submit"
      formaction="?/abandonInterview"
      class="hidden"
      aria-hidden="true"
      tabindex={-1}
    ></button>

    {#if localStatus === null}
      <div
        class="mb-6 flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-epi-blue/40 bg-epi-blue/5 p-5 text-center"
      >
        <p class="font-heading text-lg tracking-wide text-foreground uppercase">
          Prêt pour l'entretien&nbsp;?
        </p>
        <p class="max-w-md text-sm text-muted-foreground">
          Démarrez l'entretien avec {talentName} pour saisir les réponses. Tout est
          enregistré au fur et à mesure ; vous le clôturez à la fin.
        </p>
        <Button
          type="submit"
          formaction="?/startInterview"
          size="lg"
          disabled={$delayed}
          onclick={() => beginAction('start')}
        >
          {#if $delayed && lastAction === 'start'}
            <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
          {:else}
            <Play class="mr-1.5 h-4 w-4" />
          {/if}
          Démarrer l'entretien
        </Button>
      </div>
    {/if}

    <div
      class={cn(
        'space-y-7',
        !interactive && 'pointer-events-none',
        localStatus === null && 'opacity-55',
      )}
      aria-disabled={!interactive}
    >
      {#each INTERVIEW_BLOCS as bloc, i (bloc.key)}
        <section class="space-y-4">
          <div
            class="flex items-baseline justify-between gap-3 border-b pb-1.5"
          >
            <h3
              class="font-heading text-lg tracking-wide text-foreground uppercase"
            >
              {i + 1}. {bloc.title}<span class="text-epi-teal">_</span>
            </h3>
            <span
              class="shrink-0 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              {bloc.duration}
            </span>
          </div>

          {#each bloc.questions as q (q.field)}
            <div class="space-y-2 rounded-md border bg-muted/20 p-3">
              {@render questionLabel(q.label, q.essential)}
              {#if q.hint}
                <p class="text-xs text-muted-foreground italic">{q.hint}</p>
              {/if}

              {#if q.kind === 'single'}
                {@render singleChips(q.field, q.options)}
                {#if q.reveal && isRevealActive(q.reveal, fv(q.field))}
                  {@render revealInputs(q.reveal)}
                {/if}
              {:else if q.kind === 'multi'}
                {@render multiChips(q.field, q.options)}
                {#if q.reveal && isRevealActive(q.reveal, fv(q.field))}
                  {@render revealInputs(q.reveal)}
                {/if}
              {:else if q.kind === 'rating'}
                <div class="flex items-center gap-1.5">
                  {#each Array.from({ length: q.max }) as _, idx (idx)}
                    {@const filled = ($form.satisfactionStars ?? 0) > idx}
                    <button
                      type="button"
                      disabled={!interactive}
                      onclick={() => setStars(idx + 1)}
                      aria-label={`${idx + 1} sur ${q.max}`}
                      class="cursor-pointer rounded-sm p-0.5 transition-transform hover:scale-110 disabled:cursor-default disabled:hover:scale-100"
                    >
                      <Star
                        class={cn(
                          'h-7 w-7 transition-colors',
                          filled
                            ? 'fill-epi-orange text-epi-orange'
                            : 'text-muted-foreground/40',
                        )}
                      />
                    </button>
                  {/each}
                  {#if $form.satisfactionStars}
                    <span class="ml-1 text-sm font-bold text-foreground">
                      {$form.satisfactionStars}/5
                    </span>
                  {/if}
                </div>
              {:else if q.kind === 'text'}
                <Textarea
                  value={(fv(q.field) as string) ?? ''}
                  oninput={(e) => setText(q.field, e.currentTarget.value)}
                  placeholder={q.placeholder}
                  maxlength={q.maxLength}
                  disabled={!interactive}
                  class="min-h-16 resize-none bg-background"
                />
              {/if}
            </div>
          {/each}
        </section>
      {/each}

      <!-- Interviewer-only verdict, walled off from the talent-facing questions. -->
      <section
        class="space-y-3 rounded-md border-2 border-epi-blue/60 bg-epi-blue/5 p-4"
      >
        <div>
          <h3
            class="font-heading text-lg tracking-wide text-epi-blue uppercase"
          >
            {INTERVIEWER_SECTION.title}<span class="text-epi-teal">_</span>
          </h3>
          <p class="text-[11px] text-muted-foreground">
            {INTERVIEWER_SECTION.subtitle}
          </p>
        </div>

        <div class="space-y-2">
          {@render questionLabel('Compatibilité du profil', true)}
          <div class="grid gap-2 sm:grid-cols-2">
            {#each INTERVIEW_RECOMMENDATION_VALUES as value (value)}
              {@const desc = INTERVIEW_RECOMMENDATIONS[value]}
              {@const active = $form.recommendation === value}
              <button
                type="button"
                aria-pressed={active}
                disabled={!interactive}
                onclick={() => {
                  $form = {
                    ...$form,
                    recommendation: active ? null : value,
                  };
                  scheduleAutosave();
                }}
                class={cn(
                  'cursor-pointer rounded-sm border px-3 py-2 text-left text-sm font-bold transition-all disabled:cursor-default',
                  active ? TONE_ACTIVE[desc.tone] : TONE_IDLE[desc.tone],
                )}
              >
                {desc.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="space-y-2">
          {@render questionLabel(INTERVIEWER_SECTION.noteLabel, false)}
          <Textarea
            value={$form.interviewerNote}
            oninput={(e) => setText('interviewerNote', e.currentTarget.value)}
            placeholder={INTERVIEWER_SECTION.notePlaceholder}
            maxlength={INTERVIEWER_SECTION.noteMaxLength}
            disabled={!interactive}
            class="min-h-20 bg-background"
          />
        </div>
      </section>
    </div>

    <!-- Sticky action bar: the lifecycle control + autosave state, pinned to the
         viewport so it stays reachable however far the grid is scrolled. -->
    <div
      class="sticky bottom-0 z-10 -mx-5 mt-6 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t bg-card/95 px-5 py-3 backdrop-blur"
    >
      <span class="flex items-center gap-2 text-xs text-muted-foreground">
        {#if started}
          {#if saveState === 'saving'}
            <Loader2 class="h-3.5 w-3.5 animate-spin" /> Enregistrement…
          {:else if saveState === 'saved'}
            <Check class="h-3.5 w-3.5 text-epi-teal-solid" /> Enregistré
          {:else}
            {essentialDone}/{essentialTotal} questions incontournables
          {/if}
        {:else if closed && conductedLabel}
          Entretien mené le {conductedLabel}
        {:else}
          {essentialDone}/{essentialTotal} questions incontournables
        {/if}
      </span>

      <div class="flex items-center gap-2">
        {#if localStatus === null}
          <Button
            type="submit"
            formaction="?/startInterview"
            disabled={$delayed}
            onclick={() => beginAction('start')}
          >
            {#if $delayed && lastAction === 'start'}
              <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
            {:else}
              <Play class="mr-1.5 h-4 w-4" />
            {/if}
            Démarrer l'entretien
          </Button>
        {:else if started}
          <Button
            type="button"
            variant="ghost"
            disabled={$delayed}
            onclick={() => (abandonConfirmOpen = true)}
            class="text-muted-foreground hover:text-destructive"
          >
            <Trash2 class="mr-1.5 h-4 w-4" />
            Abandonner
          </Button>
          <Button type="button" disabled={$delayed} onclick={attemptClose}>
            {#if $delayed && lastAction === 'close'}
              <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
            {:else}
              <Lock class="mr-1.5 h-4 w-4" />
            {/if}
            Clôturer l'entretien
          </Button>
        {:else}
          <Button
            type="submit"
            formaction="?/reopenInterview"
            variant="outline"
            disabled={$delayed}
            onclick={() => beginAction('reopen')}
          >
            {#if $delayed && lastAction === 'reopen'}
              <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
            {:else}
              <LockOpen class="mr-1.5 h-4 w-4" />
            {/if}
            Rouvrir l'entretien
          </Button>
        {/if}
      </div>
    </div>
  </form>
</EpiSection>

<AlertDialog.Root bind:open={leaveDialogOpen}>
  <AlertDialog.Content class="rounded-sm">
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <TriangleAlert class="h-5 w-5 text-epi-orange" />
        Vous quittez la page
      </AlertDialog.Title>
      <AlertDialog.Description>
        L'entretien de {talentName} est en cours. Voulez-vous le clôturer avant de
        partir&nbsp;? Vos réponses sont déjà enregistrées dans tous les cas.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <!-- Stacked full-width: three actions with long French labels don't fit in
         a row at the dialog's width, so a vertical list reads cleanly and never
         overflows. Primary (close) on top, cancel at the bottom. -->
    <AlertDialog.Footer class="flex-col gap-2 sm:flex-col sm:space-x-0">
      <Button class="w-full" onclick={closeAndLeave}>
        <Lock class="mr-1.5 h-4 w-4" />
        Clôturer et quitter
      </Button>
      <Button variant="outline" class="w-full" onclick={leaveWithoutClosing}>
        Quitter sans clôturer
      </Button>
      <AlertDialog.Cancel class="mt-0 w-full" onclick={cancelLeave}>
        Rester
      </AlertDialog.Cancel>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={closeConfirmOpen}>
  <AlertDialog.Content class="rounded-sm">
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <TriangleAlert class="h-5 w-5 text-epi-orange" />
        Entretien incomplet
      </AlertDialog.Title>
      <AlertDialog.Description>
        {closeWarning} Vous pouvez clôturer quand même, mais ces réponses resteront
        vides dans la synthèse.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="flex-col gap-2 sm:flex-col sm:space-x-0">
      <Button class="w-full" onclick={doClose}>
        <Lock class="mr-1.5 h-4 w-4" />
        Clôturer quand même
      </Button>
      <AlertDialog.Cancel class="mt-0 w-full">
        Continuer la saisie
      </AlertDialog.Cancel>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={abandonConfirmOpen}>
  <AlertDialog.Content class="rounded-sm">
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <TriangleAlert class="h-5 w-5 text-destructive" />
        Abandonner l'entretien&nbsp;?
      </AlertDialog.Title>
      <AlertDialog.Description>
        {#if hasAnswers}
          Les réponses déjà saisies pour {talentName} seront définitivement supprimées
          et le stagiaire repassera en «&nbsp;à faire&nbsp;».
        {:else}
          {talentName} repassera en «&nbsp;à faire&nbsp;». Rien n'a encore été saisi.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="flex-col gap-2 sm:flex-col sm:space-x-0">
      <Button variant="destructive" class="w-full" onclick={doAbandon}>
        <Trash2 class="mr-1.5 h-4 w-4" />
        Abandonner l'entretien
      </Button>
      <AlertDialog.Cancel class="mt-0 w-full">Annuler</AlertDialog.Cancel>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
