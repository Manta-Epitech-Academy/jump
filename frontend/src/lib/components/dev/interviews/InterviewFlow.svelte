<script lang="ts" module>
  export type InterviewAction =
    | 'start'
    | 'autosave'
    | 'close'
    | 'reopen'
    | 'abandon';
  export type InterviewSaveState = 'idle' | 'saving' | 'saved';
  // Surfaced to the fiche so it can keep the lifecycle status in sync with the
  // toggle and show the in-flight state if it needs to.
  export type InterviewActionState = {
    busy: boolean;
    lastAction: InterviewAction;
    saveState: InterviewSaveState;
  };
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { TransitionConfig } from 'svelte/transition';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import Star from '@lucide/svelte/icons/star';
  import Check from '@lucide/svelte/icons/check';
  import Play from '@lucide/svelte/icons/play';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  // Domain-identity glyphs for the tech-domain chips (techProjection). Keyed by
  // the catalogue's ChoiceIconToken via CHIP_ICONS.
  import Code from '@lucide/svelte/icons/code';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Palette from '@lucide/svelte/icons/palette';
  import Brain from '@lucide/svelte/icons/brain';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Network from '@lucide/svelte/icons/network';
  import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
  import Compass from '@lucide/svelte/icons/compass';
  // Faces for the verdict scale (frown → laugh), keyed by RecommendationIconToken.
  import Frown from '@lucide/svelte/icons/frown';
  import Meh from '@lucide/svelte/icons/meh';
  import Smile from '@lucide/svelte/icons/smile';
  import Laugh from '@lucide/svelte/icons/laugh';
  import type { InterviewStatus } from '@prisma/client';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import {
    INTERVIEW_SECTIONS,
    INTERVIEWER_SECTION,
    INTERVIEW_RECOMMENDATIONS,
    INTERVIEW_RECOMMENDATION_DISPLAY_ORDER,
    isRevealActive,
    type ChoiceOption,
    type ChoiceTone,
    type ChoiceIconToken,
    type Reveal,
    type RecommendationToneToken,
    type RecommendationIconToken,
    type InterviewQuestion,
    type InterviewSection,
  } from '$lib/domain/interview';
  import type { InterviewConductForm } from '$lib/validation/interviews';

  let {
    form: data,
    talentName,
    status = $bindable(),
    step = $bindable(0),
    conductedLabel = null,
    conductedBy = null,
    actionState = $bindable(),
  }: {
    form: SuperValidated<InterviewConductForm>;
    talentName: string;
    // Lifecycle: null = "à faire" (not started), in_progress = "en cours"
    // (started, autosaving), done = "finalisé" (synthesis, read-only until
    // reopened). Bound up to the fiche so toggling the interview view off and on
    // never resurfaces "Démarrer" for an already-started interview.
    status: InterviewStatus | null;
    // Step cursor, bindable so the fiche's section-nav card can jump around.
    // Pure LOCAL state (the answers autosave, so it needs no DB column).
    step?: number;
    // "Mené le … par …" line for the synthesis. Null when the interview was
    // closed this session (the load isn't refetched); the synthesis degrades.
    conductedLabel?: string | null;
    conductedBy?: string | null;
    // Autosave + in-flight state, surfaced so the fiche can mirror it if needed.
    actionState?: InterviewActionState;
  } = $props();

  // Fields are interactive only while the interview is in progress.
  const interactive = $derived(status === 'in_progress');

  // ── Step machine ──
  // Step 0 = intro (guide + Démarrer), 1..N = the question sections, last =
  // verdict. Only drives the conduct view: a finalised interview renders the
  // synthesis instead of steps.
  const lastStep = INTERVIEW_SECTIONS.length + 1; // intro is 0, verdict is last
  const isIntro = $derived(step === 0);
  const isVerdict = $derived(step === lastStep);
  const currentSection = $derived(
    step >= 1 && step <= INTERVIEW_SECTIONS.length
      ? INTERVIEW_SECTIONS[step - 1]
      : null,
  );
  // Progress fill: intro = 0, verdict = 100.
  const progressPct = $derived(Math.round((step / lastStep) * 100));

  function goNext() {
    if (step < lastStep) step += 1;
  }
  function goPrev() {
    if (step > 0) step -= 1;
  }

  // "Reprendre" should drop the interviewer back where work remains, not on
  // section 1. `step` is local-only, so a page reload (status still in_progress,
  // step reset to 0) is the case that matters — and the answers come from the DB,
  // so they tell us how far the interview got. Target = the first section with no
  // answer yet; if every section has been started, the verdict (the place left to
  // finish). A section counts as "touched" on any single answer, since the
  // questionnaire has no required questions — keying off full completion would
  // pull resume back to section 1 over one skipped optional choice.
  function sectionTouched(section: InterviewSection): boolean {
    return section.questions.some((q) => answerText(q) !== null);
  }
  function resumeStep(): number {
    for (let i = 0; i < INTERVIEW_SECTIONS.length; i++) {
      if (!sectionTouched(INTERVIEW_SECTIONS[i])) return i + 1;
    }
    return lastStep;
  }
  function resume() {
    step = resumeStep();
  }

  // Onboarding's step transition: the outgoing card slides left + fades while
  // the incoming one flies in from the right. Local copy (8 lines) rather than a
  // cross-route import; the parent is position:relative so the absolute exit
  // overlaps cleanly.
  function exitSlide(
    _node: Element,
    { duration = 180 }: { duration?: number } = {},
  ): TransitionConfig {
    return {
      duration,
      css: (t: number, u: number) =>
        `position: absolute; top: 0; left: 0; right: 0; opacity: ${t}; transform: translateX(${-30 * u}px);`,
    };
  }

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
            // Front the student-facing questions the moment the interview opens.
            step = 1;
            toast.success('Entretien démarré.');
          } else if (lastAction === 'close') {
            status = 'done';
            saveState = 'idle';
            toast.success('Entretien clôturé.');
          } else if (lastAction === 'reopen') {
            status = 'in_progress';
            // Land on the first section, not the cover: a reopen is a correction.
            step = 1;
            toast.success('Entretien rouvert.');
          } else if (lastAction === 'abandon') {
            status = null;
            saveState = 'idle';
            // Back to the cover, and clear the grid so a later "Démarrer" starts
            // from a blank slate rather than recreating the abandoned answers.
            step = 0;
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
  function setRecommendation(value: string) {
    if (!interactive) return;
    $form = {
      ...$form,
      recommendation: ($form.recommendation === value
        ? null
        : value) as InterviewConductForm['recommendation'],
    };
    scheduleAutosave();
  }

  // No leave guard: an open interview stays in_progress until explicitly
  // clôturé. Staff can navigate away freely (the answers autosave), so there is
  // nothing to confirm on the way out — the lifecycle is decoupled from the view.

  // Clôture is the explicit end of the verdict step, so a lightweight confirm
  // is enough to catch a misclick. Reopen-able, so nothing is lost.
  let closeConfirmOpen = $state(false);
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

  // Public lifecycle controls (driven from the steps' own CTAs; also exported so
  // the fiche could drive them if needed).
  export function start() {
    beginAction('start');
    formEl.requestSubmit(startBtn);
  }
  export function close() {
    closeConfirmOpen = true;
  }
  export function abandon() {
    abandonConfirmOpen = true;
  }
  export function reopen() {
    doReopen();
  }

  // Surface autosave + in-flight state so the fiche can mirror it if it wants.
  $effect(() => {
    actionState = { busy: $delayed, lastAction, saveState };
  });

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

  // The label of a question's current answer, for the synthesis: option labels
  // for choices (joined for multi), the rating as "n/5", trimmed free text, plus
  // any live reveal precisions in parentheses ("Oui (Mme Dupont, Maths)").
  // Null = unanswered. Reads $form via fv, so it stays reactive in the template.
  function answerText(q: InterviewQuestion): string | null {
    const v = fv(q.field);
    if (q.kind === 'rating') {
      return $form.satisfactionStars
        ? `${$form.satisfactionStars}/${q.max}`
        : null;
    }
    if (q.kind === 'text') {
      const s = typeof v === 'string' ? v.trim() : '';
      return s || null;
    }
    let base: string | null;
    if (q.kind === 'single') {
      base = q.options.find((o) => o.value === v)?.label ?? null;
    } else {
      const arr = (v as string[] | undefined) ?? [];
      const labels = q.options
        .filter((o) => arr.includes(o.value))
        .map((o) => o.label);
      base = labels.length ? labels.join(', ') : null;
    }
    if (base && q.reveal && isRevealActive(q.reveal, v)) {
      const extras = q.reveal.fields
        .map((rf) => (fv(rf.field) as string | undefined)?.trim())
        .filter(Boolean);
      if (extras.length) base += ` (${extras.join(', ')})`;
    }
    return base;
  }

  const chipBase =
    'cursor-pointer rounded-sm border px-3.5 py-2 text-sm font-medium transition select-none active:scale-95 disabled:cursor-default disabled:active:scale-100';
  const chipIdle =
    'border-border bg-background text-foreground hover:border-epi-blue/40 hover:bg-epi-blue/5';
  // Active = tinted, not solid: a /10 wash + ring keeps the selection legible
  // without shouting over the conversation (a solid epi-blue fill pulled the eye
  // off the question). Same language as the verdict's TONE_ACTIVE.
  const chipActive =
    'border-epi-blue bg-epi-blue/10 text-epi-blue ring-1 ring-epi-blue';

  // Sentiment palette for ordinal answers (oui / un peu / pas du tout), colour
  // carrying the valence: green = positive, amber = neutral, red = negative.
  // Idle keeps a faint tint so the valence reads even unselected; active is the
  // same tinted-ring treatment as the categorical blue.
  const CHIP_TONE_IDLE: Record<ChoiceTone, string> = {
    positive:
      'border-epi-teal-solid/30 bg-epi-teal-solid/5 text-epi-teal-solid hover:border-epi-teal-solid hover:bg-epi-teal-solid/10',
    neutral:
      'border-amber-500/30 bg-amber-500/5 text-amber-600 hover:border-amber-500 hover:bg-amber-500/10',
    negative:
      'border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive hover:bg-destructive/10',
  };
  const CHIP_TONE_ACTIVE: Record<ChoiceTone, string> = {
    positive:
      'border-epi-teal-solid bg-epi-teal-solid/10 text-epi-teal-solid ring-1 ring-epi-teal-solid',
    neutral:
      'border-amber-500 bg-amber-500/10 text-amber-600 ring-1 ring-amber-500',
    negative:
      'border-destructive bg-destructive/10 text-destructive ring-1 ring-destructive',
  };

  // Catalogue's ChoiceIconToken → Lucide component (token kept in the domain
  // module, the component wiring stays here).
  const CHIP_ICONS: Record<ChoiceIconToken, typeof Code> = {
    dev: Code,
    cyber: ShieldCheck,
    design: Palette,
    ia: Brain,
    jeux_video: Gamepad2,
    reseaux: Network,
    pas_idee: CircleQuestionMark,
    hors_tech: Compass,
  };

  // A chip's colour: tone palette when the option carries a sentiment, else the
  // neutral categorical blue (a channel, a specialty — no valence to imply).
  function chipClass(opt: ChoiceOption, active: boolean): string {
    if (opt.tone) {
      return active ? CHIP_TONE_ACTIVE[opt.tone] : CHIP_TONE_IDLE[opt.tone];
    }
    return active ? chipActive : chipIdle;
  }

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

  // RecommendationIconToken → Lucide face. The order is fixed in the catalogue's
  // display-order array, so the row reads as a rising scale left→right.
  const RECO_ICONS: Record<RecommendationIconToken, typeof Frown> = {
    frown: Frown,
    meh: Meh,
    smile: Smile,
    laugh: Laugh,
  };
</script>

{#snippet singleChips(field: string, options: readonly ChoiceOption[])}
  <div class="flex flex-wrap gap-2">
    {#each options as opt (opt.value)}
      {@const active = fv(field) === opt.value}
      {@const Icon = opt.icon ? CHIP_ICONS[opt.icon] : null}
      <button
        type="button"
        aria-pressed={active}
        disabled={!interactive}
        onclick={() => setSingle(field, opt.value)}
        class={cn(
          chipBase,
          'inline-flex items-center gap-1.5',
          chipClass(opt, active),
        )}
      >
        {#if Icon}<Icon class="h-3.5 w-3.5" />{/if}
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
          chipClass(opt, active),
        )}
      >
        <!-- Reserve the tick's slot so selecting fades it in rather than widening
             the chip — a width jump here re-wraps the whole flex row and shifts
             every other chip. -->
        <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <Check
            class={cn(
              'h-3.5 w-3.5 transition-opacity',
              active ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
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

<!-- One question: the prompt is the prominent element (it's what the dev reads
     aloud), the answers sit quieter below. No box around it — the step is the
     unit, not the question. -->
{#snippet questionBlock(q: InterviewQuestion)}
  <div class="space-y-4">
    <div class="space-y-1.5">
      <p class="text-2xl leading-snug font-semibold text-foreground">
        {q.label}
      </p>
      {#if q.hint}
        <p class="text-sm text-muted-foreground italic">{q.hint}</p>
      {/if}
    </div>

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
            class="cursor-pointer rounded-sm p-0.5 transition-transform hover:scale-110 active:scale-95 disabled:cursor-default disabled:hover:scale-100 disabled:active:scale-100"
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
{/snippet}

<!-- Small autosave indicator, shown in the step footer while in progress. -->
{#snippet saveIndicator()}
  <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
    {#if saveState === 'saving'}
      <Loader2 class="h-3.5 w-3.5 animate-spin" /> Enregistrement…
    {:else if saveState === 'saved'}
      <Check class="h-3.5 w-3.5 text-epi-teal-solid" /> Enregistré
    {:else}
      Enregistrement automatique
    {/if}
  </p>
{/snippet}

<!-- One synthesis line: the question, then its answer (or a muted dash). -->
{#snippet synthesisRow(q: InterviewQuestion)}
  {@const text = answerText(q)}
  <div class="grid gap-0.5 py-2 sm:grid-cols-[2fr_3fr] sm:gap-4">
    <p class="text-xs text-muted-foreground sm:pt-0.5">{q.label}</p>
    {#if q.kind === 'rating' && $form.satisfactionStars}
      <div class="flex items-center gap-0.5">
        {#each Array.from({ length: q.max }) as _, idx (idx)}
          <Star
            class={cn(
              'h-3.5 w-3.5',
              ($form.satisfactionStars ?? 0) > idx
                ? 'fill-epi-orange text-epi-orange'
                : 'text-muted-foreground/30',
            )}
          />
        {/each}
        <span class="ml-1.5 text-sm font-semibold text-foreground">
          {$form.satisfactionStars}/{q.max}
        </span>
      </div>
    {:else if text}
      <p class="text-sm font-semibold text-foreground">{text}</p>
    {:else}
      <p class="text-sm text-muted-foreground/60">—</p>
    {/if}
  </div>
{/snippet}

<section class="rounded-sm border bg-card dark:shadow-none">
  <!-- Progress fill: a thin no-number bar so paging never feels like a numbered
       checklist. Conduct-only — the synthesis has nothing to pace. -->
  {#if status === 'in_progress'}
    <div class="h-1 w-full overflow-hidden rounded-t-sm bg-muted">
      <div
        class="h-full bg-epi-blue transition-all duration-300"
        style={`width:${progressPct}%`}
      ></div>
    </div>
  {/if}

  <form bind:this={formEl} method="POST" action="?/saveInterview" use:enhance>
    <!-- Hidden submitters: every lifecycle transition is driven through
         requestSubmit on one of these. -->
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

    {#if status === 'done'}
      <!-- ═══ Synthesis: the finalised interview at a glance. The default view
           when coming back to a done interview — reopening is the secondary
           action, reading is the primary one. ═══ -->
      <div class="px-5 py-6">
        <div class="mx-auto w-full max-w-2xl space-y-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                class="font-heading text-2xl tracking-wide text-foreground uppercase"
              >
                Synthèse de l'entretien<span class="text-epi-teal">_</span>
              </h3>
              <p class="text-xs text-muted-foreground">
                {#if conductedLabel && conductedBy}
                  Mené le {conductedLabel} par {conductedBy}.
                {:else if conductedBy}
                  Mené par {conductedBy}.
                {:else if conductedLabel}
                  Mené le {conductedLabel}.
                {:else}
                  Entretien finalisé.
                {/if}
              </p>
            </div>
            <Tooltip.Provider delayDuration={150}>
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="outline"
                      size="sm"
                      disabled={$delayed}
                      onclick={reopen}
                    >
                      {#if $delayed && lastAction === 'reopen'}
                        <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
                      {:else}
                        <LockOpen class="mr-1.5 h-4 w-4" />
                      {/if}
                      Rouvrir
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <p>
                    Repasser l'entretien en «&nbsp;en cours&nbsp;» pour corriger
                    les réponses, puis le clôturer à nouveau.
                  </p>
                </Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>

          <!-- The verdict first: it's the one thing staff come back for. -->
          <div
            class="space-y-3 rounded-md border border-epi-blue/40 bg-epi-blue/5 p-4"
          >
            <p
              class="text-xs font-semibold tracking-[0.2em] text-epi-blue uppercase"
            >
              {INTERVIEWER_SECTION.title}
            </p>
            {#if $form.recommendation}
              {@const desc = INTERVIEW_RECOMMENDATIONS[$form.recommendation]}
              {@const Face = RECO_ICONS[desc.icon]}
              <span
                class={cn(
                  'inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm font-bold',
                  TONE_ACTIVE[desc.tone],
                )}
              >
                <Face class="h-5 w-5" />
                {desc.label}
              </span>
            {:else}
              <p class="text-sm text-muted-foreground/60">
                Aucun avis renseigné.
              </p>
            {/if}
            {#if $form.interviewerNote.trim()}
              <p class="text-sm text-foreground italic">
                « {$form.interviewerNote.trim()} »
              </p>
            {/if}
          </div>

          {#each INTERVIEW_SECTIONS as section (section.key)}
            <div class="space-y-1">
              <p
                class="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase"
              >
                {section.title}
              </p>
              <div class="divide-y divide-border/60">
                {#each section.questions as q (q.field)}
                  {@render synthesisRow(q)}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <!-- ═══ Conduct: one step visible at a time. Content centered at a
           reading width so the panel never feels like a stretched form. ═══ -->
      <div class="px-5 py-6">
        <!-- Relative + min-height so the absolute exit transition overlaps the
             entering step without collapsing the panel. -->
        <div class="relative mx-auto min-h-140 w-full max-w-2xl">
          {#key step}
            <!-- Each step centers vertically in the panel's min-height, so a
                 short step sits balanced instead of clumped at the top. -->
            <div
              class="flex min-h-140 w-full flex-col justify-center"
              in:fly|local={{ x: 30, duration: 250, delay: 180 }}
              out:exitSlide|local={{ duration: 180 }}
            >
              {#if isIntro}
                <!-- ── Cover: guide + the lifecycle CTA for the current status ── -->
                <div class="space-y-5">
                  <div class="space-y-1.5">
                    <h3
                      class="font-heading text-2xl tracking-wide text-foreground uppercase"
                    >
                      Entretien d'orientation<span class="text-epi-teal">_</span
                      >
                    </h3>
                    <p class="text-sm text-muted-foreground">
                      Un point d'orientation avec {talentName}, pas un
                      interrogatoire.
                    </p>
                  </div>

                  <div
                    class="space-y-3.5 rounded-md border bg-muted/20 p-4 text-xs leading-relaxed"
                  >
                    <div class="flex gap-3">
                      <Clock class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
                      <p class="text-muted-foreground">
                        <span class="font-semibold text-foreground"
                          >Une dizaine de minutes, rythme tranquille.</span
                        >
                        Vous saisissez en mots-clés et cases cochées, peu de rédaction.
                      </p>
                    </div>
                    <div class="flex gap-3">
                      <MessageCircle
                        class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue"
                      />
                      <p class="text-muted-foreground">
                        <span class="font-semibold text-foreground"
                          >Ton bienveillant, tutoiement.</span
                        >
                        Accroche : « On prend 10 min ensemble pour faire le point
                        sur ton orientation et avoir ton retour sur la semaine. »
                      </p>
                    </div>
                  </div>

                  {#if status === null}
                    <div class="flex justify-center pt-2">
                      <Button class="px-10" disabled={$delayed} onclick={start}>
                        {#if $delayed && lastAction === 'start'}
                          <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
                        {:else}
                          <Play class="mr-1.5 h-4 w-4" />
                        {/if}
                        Démarrer l'entretien
                      </Button>
                    </div>
                  {:else}
                    <div class="flex flex-col items-center gap-2 pt-2">
                      <Button class="px-10" onclick={resume}>
                        Reprendre l'entretien
                        <ArrowRight class="ml-1.5 h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="text-muted-foreground hover:text-destructive"
                        disabled={$delayed}
                        onclick={abandon}
                      >
                        <Trash2 class="mr-1.5 h-3.5 w-3.5" />
                        Abandonner l'entretien
                      </Button>
                    </div>
                  {/if}
                </div>
              {:else if currentSection}
                <!-- ── A question section ── -->
                <div class="space-y-6">
                  <p
                    class="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase"
                  >
                    {currentSection.title}
                  </p>
                  <div class="space-y-14">
                    {#each currentSection.questions as q (q.field)}
                      {@render questionBlock(q)}
                    {/each}
                  </div>
                </div>
              {:else}
                <!-- ── Verdict: interviewer-only, filled at the end ── -->
                <div class="space-y-6">
                  <div class="space-y-0.5">
                    <p
                      class="text-xs font-semibold tracking-[0.2em] text-epi-blue uppercase"
                    >
                      {INTERVIEWER_SECTION.title}
                    </p>
                    <p class="text-[11px] text-muted-foreground">
                      {INTERVIEWER_SECTION.subtitle}
                    </p>
                  </div>

                  <div class="space-y-3">
                    <p
                      class="text-2xl leading-snug font-semibold text-foreground"
                    >
                      Compatibilité du profil
                    </p>
                    <!-- A rising scale: faces climb frown → laugh, left (pas
                         intéressé) to right (compatible). -->
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {#each INTERVIEW_RECOMMENDATION_DISPLAY_ORDER as value (value)}
                        {@const desc = INTERVIEW_RECOMMENDATIONS[value]}
                        {@const active = $form.recommendation === value}
                        {@const Face = RECO_ICONS[desc.icon]}
                        <button
                          type="button"
                          aria-pressed={active}
                          disabled={!interactive}
                          onclick={() => setRecommendation(value)}
                          class={cn(
                            'flex cursor-pointer flex-col items-center gap-1.5 rounded-sm border px-2 py-3 text-center transition-all active:scale-[0.98] disabled:cursor-default disabled:active:scale-100',
                            active
                              ? TONE_ACTIVE[desc.tone]
                              : TONE_IDLE[desc.tone],
                          )}
                        >
                          <Face class="h-7 w-7" />
                          <span class="text-xs leading-tight font-bold">
                            {desc.label}
                          </span>
                        </button>
                      {/each}
                    </div>
                  </div>

                  <div class="space-y-3">
                    <p
                      class="text-2xl leading-snug font-semibold text-foreground"
                    >
                      {INTERVIEWER_SECTION.noteLabel}
                    </p>
                    <Textarea
                      value={$form.interviewerNote}
                      oninput={(e) =>
                        setText('interviewerNote', e.currentTarget.value)}
                      placeholder={INTERVIEWER_SECTION.notePlaceholder}
                      maxlength={INTERVIEWER_SECTION.noteMaxLength}
                      disabled={!interactive}
                      class="min-h-20 bg-background"
                    />
                  </div>
                </div>
              {/if}
            </div>
          {/key}
        </div>
      </div>

      <!-- Step nav: Précédent / autosave / Suivant — or Clôturer on the verdict.
           Hidden on the cover, whose CTAs drive the lifecycle. -->
      {#if !isIntro}
        <div class="border-t px-5 py-3.5">
          <div
            class="mx-auto flex w-full max-w-2xl items-center justify-between gap-3"
          >
            <Button variant="ghost" onclick={goPrev}>
              <ArrowLeft class="mr-1.5 h-4 w-4" />
              Précédent
            </Button>

            {#if interactive}
              {@render saveIndicator()}
            {/if}

            {#if isVerdict}
              <Button
                class="bg-epi-teal-solid text-white hover:bg-epi-teal-solid/90"
                disabled={$delayed}
                onclick={close}
              >
                {#if $delayed && lastAction === 'close'}
                  <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
                {:else}
                  <Lock class="mr-1.5 h-4 w-4" />
                {/if}
                Clôturer l'entretien
              </Button>
            {:else}
              <Button onclick={goNext}>
                Suivant
                <ArrowRight class="ml-1.5 h-4 w-4" />
              </Button>
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  </form>
</section>

<AlertDialog.Root bind:open={closeConfirmOpen}>
  <AlertDialog.Content class="rounded-sm">
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <Lock class="h-5 w-5 text-epi-teal-solid" />
        Clôturer l'entretien&nbsp;?
      </AlertDialog.Title>
      <AlertDialog.Description>
        L'entretien passera en «&nbsp;finalisé&nbsp;» et la synthèse remplacera
        la grille. Vous pourrez le rouvrir pour corriger les réponses.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
      <Button onclick={doClose}>
        <Lock class="mr-1.5 h-4 w-4" />
        Clôturer
      </Button>
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
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
      <Button variant="destructive" onclick={doAbandon}>
        <Trash2 class="mr-1.5 h-4 w-4" />
        Abandonner l'entretien
      </Button>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
