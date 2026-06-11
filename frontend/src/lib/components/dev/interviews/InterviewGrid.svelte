<script lang="ts" module>
  export type InterviewAction =
    | 'start'
    | 'autosave'
    | 'close'
    | 'reopen'
    | 'abandon';
  export type InterviewSaveState = 'idle' | 'saving' | 'saved';
  // Surfaced to the fiche so it can render the lifecycle controls + autosave
  // indicator in the right rail instead of a sticky bar glued under the grid.
  export type InterviewActionState = {
    busy: boolean;
    lastAction: InterviewAction;
    saveState: InterviewSaveState;
  };
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import Star from '@lucide/svelte/icons/star';
  import Check from '@lucide/svelte/icons/check';
  import Lock from '@lucide/svelte/icons/lock';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { InterviewStatus } from '@prisma/client';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
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
    status = $bindable(),
    progress = $bindable(),
    actionState = $bindable(),
  }: {
    form: SuperValidated<InterviewConductForm>;
    talentName: string;
    // Lifecycle: null = "à faire" (not started), in_progress = "en cours"
    // (started, autosaving), done = "finalisé" (closed, read-only until
    // reopened). Bound up to the fiche so toggling the interview view off and on
    // never resurfaces "Démarrer" for an already-started interview.
    status: InterviewStatus | null;
    // ★-questions progress, surfaced up so the fiche can render the title +
    // progress bar in its right rail next to the guide.
    progress?: { done: number; total: number };
    // Autosave + in-flight state, surfaced so the fiche renders the lifecycle
    // controls (clôturer / abandonner / rouvrir) and save indicator in its right
    // rail. The actions themselves are driven through the exported methods below.
    actionState?: InterviewActionState;
  } = $props();

  const started = $derived(status === 'in_progress');
  // Fields are interactive only while the interview is in progress.
  const interactive = $derived(started);

  let lastAction = $state<InterviewAction>('autosave');
  let saveState = $state<InterviewSaveState>('idle');

  let formEl: HTMLFormElement;
  let startBtn: HTMLButtonElement;
  let closeBtn: HTMLButtonElement;
  let abandonBtn: HTMLButtonElement;
  let reopenBtn: HTMLButtonElement;

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
            status = 'in_progress';
            toast.success('Entretien démarré.');
          } else if (lastAction === 'close') {
            status = 'done';
            saveState = 'idle';
            toast.success('Entretien clôturé.');
          } else if (lastAction === 'reopen') {
            status = 'in_progress';
            toast.success('Entretien rouvert.');
          } else if (lastAction === 'abandon') {
            status = null;
            saveState = 'idle';
            // Clear the grid so a later "Démarrer" starts from a blank slate
            // rather than recreating the abandoned answers.
            reset({ data: { participationId: $form.participationId } });
            toast.success('Entretien abandonné.');
          }
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message ?? 'Une erreur est survenue.');
        }
      },
    },
  );

  // ── Debounced autosave (only while in progress) ──
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleAutosave() {
    if (status !== 'in_progress') return;
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
  function beginAction(a: InterviewAction) {
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

  // No leave guard: an open interview stays in_progress until explicitly
  // clôturé. Staff can navigate away freely (the answers autosave), so there is
  // nothing to confirm on the way out — the lifecycle is decoupled from the view.

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

  function doReopen() {
    beginAction('reopen');
    formEl.requestSubmit(reopenBtn);
  }

  // Public lifecycle controls, driven from the fiche's right rail (the grid
  // itself holds only the questions).
  export function start() {
    beginAction('start');
    formEl.requestSubmit(startBtn);
  }
  export function close() {
    attemptClose();
  }
  export function abandon() {
    abandonConfirmOpen = true;
  }
  export function reopen() {
    doReopen();
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
  const missingEssential = $derived(essentialTotal - essentialDone);

  // Surface the live ★-progress to the fiche so its right rail can render the
  // grille title + progress bar next to the guide while the questions stay here.
  $effect(() => {
    progress = { done: essentialDone, total: essentialTotal };
  });
  // Surface autosave + in-flight state so the rail's controls can spin/disable
  // and show the save indicator without a sticky bar under the grid.
  $effect(() => {
    actionState = { busy: $delayed, lastAction, saveState };
  });
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

<!-- The grille title + ★-progress live in the fiche's right rail (see
     InterviewProgressCard); here the panel holds only the questions. -->
<section class="rounded-sm border bg-card px-5 pt-5 pb-5 dark:shadow-none">
  <form bind:this={formEl} method="POST" action="?/saveInterview" use:enhance>
    <!-- Hidden submitters: every lifecycle transition is driven from the fiche's
         right rail through requestSubmit on one of these. -->
    <button
      bind:this={startBtn}
      type="submit"
      formaction="?/startInterview"
      class="hidden"
      aria-hidden="true"
      tabindex={-1}
    ></button>
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
    <button
      bind:this={reopenBtn}
      type="submit"
      formaction="?/reopenInterview"
      class="hidden"
      aria-hidden="true"
      tabindex={-1}
    ></button>

    <div
      class={cn(
        'space-y-7',
        !interactive && 'pointer-events-none',
        status === null && 'opacity-55',
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
              class="shrink-0 font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase"
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
  </form>
</section>

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
