<script lang="ts" module>
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  export type ClosingAction = 'start' | 'autosave' | 'close';
  export type ClosingSaveState = 'idle' | 'saving' | 'saved';
  // Surfaced to the page so it can mirror the lifecycle status and the
  // in-flight state if it needs to.
  export type ClosingActionState = {
    busy: boolean;
    lastAction: ClosingAction;
    saveState: ClosingSaveState;
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
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import CheckCheck from '@lucide/svelte/icons/check-check';
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
  // Faces for the verdict scale, keyed by RecommendationIconToken.
  import Frown from '@lucide/svelte/icons/frown';
  import Meh from '@lucide/svelte/icons/meh';
  import Smile from '@lucide/svelte/icons/smile';
  import Laugh from '@lucide/svelte/icons/laugh';
  import type { ClosingStatus } from '@prisma/client';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Avatar from '$lib/components/ui/avatar';
  import PullQuote from '$lib/components/staff/PullQuote.svelte';
  import { getInitials } from '$lib/avatar';
  import { cn } from '$lib/utils';
  import {
    VERDICT_SECTION,
    CLOSING_RECOMMENDATIONS,
    CLOSING_RECOMMENDATION_DISPLAY_ORDER,
    isClosingRecommendation,
    type ChoiceIconToken,
    type ChoiceTone,
    type ClosingGrid,
    type ClosingOption,
    type ClosingQuestion,
    type ClosingSection,
    type RecommendationIconToken,
    type RecommendationToneToken,
  } from '$lib/domain/closing';
  import type {
    ClosingAnswerForm,
    ClosingConductForm,
  } from '$lib/validation/closings';

  let {
    form: data,
    grid,
    synthesisSections,
    retiredAnswers = {},
    talentName,
    status = $bindable(),
    step = $bindable(0),
    conductedLabel = null,
    conductedBy = null,
    conductedByImage = null,
    actionState = $bindable(),
  }: {
    form: SuperValidated<ClosingConductForm>;
    /** The grid this closing was started with, resolved server-side. Every
     *  question, option and prompt below comes from it: the questionnaire is
     *  data, so this component knows nothing about which questions exist. */
    grid: ClosingGrid;
    /** What the synthesis reads back. Not `grid.synthesisSections`: it carries
     *  one more section when this record answers a question the composition has
     *  since dropped, and those answers must stay readable. */
    synthesisSections: ClosingSection[];
    /** Answers to those dropped questions, keyed by bank question id. Kept out
     *  of the form on purpose - the grid does not ask them, so the action would
     *  refuse them and every autosave would fail - and read only here. */
    retiredAnswers?: ClosingConductForm['answers'];
    talentName: string;
    // Lifecycle: null = "à faire" (not started), in_progress = "en cours"
    // (started, autosaving), done = "finalisé" (synthesis, read-only and
    // final).
    status: ClosingStatus | null;
    // Step cursor, bindable so the page's section-nav card can jump around.
    // Pure LOCAL state (the answers autosave, so it needs no DB column).
    step?: number;
    // "Mené le … par …" provenance for the synthesis header (with the staff
    // avatar). All null when the closing was finalised this session (the load
    // isn't refetched); the just-finalised banner covers that moment instead.
    conductedLabel?: string | null;
    conductedBy?: string | null;
    conductedByImage?: string | null;
    // Autosave + in-flight state, surfaced so the page can mirror it if needed.
    actionState?: ClosingActionState;
  } = $props();

  // Fields are interactive only while the closing is in progress.
  const interactive = $derived(status === 'in_progress');

  // ── Step machine ──
  // Step 0 = intro (guide + Démarrer), 1..N = the grid's sections, last =
  // verdict. Only drives the conduct view: a finalised closing renders the
  // synthesis instead of steps. N comes from the grid, so a four-question grid
  // is a two-step flow and the stage's is a five-step one, with no branch here.
  const sections = $derived(grid.sections);
  const lastStep = $derived(sections.length + 1); // intro is 0, verdict is last
  const isIntro = $derived(step === 0);
  const isVerdict = $derived(step === lastStep);
  const currentSection = $derived(
    step >= 1 && step <= sections.length ? sections[step - 1] : null,
  );
  // Progress fill: intro = 0, verdict = 100.
  const progressPct = $derived(Math.round((step / lastStep) * 100));

  function goNext() {
    if (step < lastStep) step += 1;
  }
  function goPrev() {
    if (step > 0) step -= 1;
  }

  // "Reprendre" should drop the staff member back where work remains, not on
  // section 1. `step` is local-only, so a page reload (status still in_progress,
  // step reset to 0) is the case that matters, and the answers come from the DB,
  // so they tell us how far the closing got. Target = the first section with no
  // answer yet; if every section has been started, the verdict (the place left to
  // finish). A section counts as "touched" on any single answer, since the
  // questionnaire has no required questions, keying off full completion would
  // pull resume back to section 1 over one skipped optional choice.
  function sectionTouched(section: ClosingSection): boolean {
    return section.questions.some(
      (q) => answerLabel(q) !== null || noteText(q) !== null,
    );
  }
  function resumeStep(): number {
    for (let i = 0; i < sections.length; i++) {
      if (!sectionTouched(sections[i])) return i + 1;
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

  let lastAction = $state<ClosingAction>('autosave');
  let saveState = $state<ClosingSaveState>('idle');
  // True only after THIS session's clôture (not when the page loaded an
  // already-done closing). Gates the one-time "finalisé" banner so it reassures
  // at the moment clôture lands, which tested as ambiguous, without polluting
  // later visits to the finished record.
  let justFinalised = $state(false);

  let formEl: HTMLFormElement;
  let startBtn: HTMLButtonElement;
  let closeBtn: HTMLButtonElement;

  const { form, enhance, delayed } = superForm(
    untrack(() => data),
    {
      dataType: 'json',
      resetForm: false,
      invalidateAll: false,
      // Only one submit may be in flight. A lifecycle action (start / close)
      // fired while a debounced autosave is mid-request ABORTS that autosave
      // rather than being dropped: superForm's 'prevent' default would silently
      // drop the lifecycle submit, then the stale autosave result would be read
      // under the new `lastAction` and the close branch below would run: UI
      // flips to "Finalisé" while the row is still in_progress in the DB. Abort
      // also stops a fast second autosave from being lost behind a slow first
      // one. `beginAction` clears the *scheduled* autosave; this covers the one
      // already on the wire.
      multipleSubmits: 'abort',
      onResult: ({ result, cancel }) => {
        // Autosave: keep the client form authoritative (don't let the echoed
        // server data clobber keystrokes made during the round-trip), and stay
        // quiet, just flip the inline indicator.
        if (lastAction === 'autosave') {
          saveState = result.type === 'success' ? 'saved' : 'idle';
          if (result.type !== 'success') {
            toast.error("Échec de l'enregistrement automatique.");
          }
          cancel();
          return;
        }
        // Start stays silent: cover → questions is an obvious transition. Close
        // gets an explicit success toast, and the synthèse leads with a
        // "finalisé" banner, because the silent conduct → synthèse swap tested
        // as ambiguous: staff couldn't tell the closing had actually finished
        // and read the recap as a form still awaiting a confirm. Failures, which
        // leave no visible trace, toast below.
        if (result.type === 'success') {
          if (lastAction === 'start') {
            status = 'in_progress';
            // Front the student-facing questions the moment the closing opens.
            step = 1;
          } else if (lastAction === 'close') {
            status = 'done';
            saveState = 'idle';
            justFinalised = true;
            toast.success('Closing finalisé.');
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
  function beginAction(a: ClosingAction) {
    clearTimeout(saveTimer);
    lastAction = a;
  }

  // ── Answer accessors ──
  //
  // Answers live in a map keyed by the bank question's id, which is what an
  // answer row references. The old shape was one flat object keyed by column
  // name, reached through a `Record<string, unknown>` cast; that cast is what
  // made a renamed column render "Non renseigné" everywhere instead of failing.
  const EMPTY: ClosingAnswerForm = {
    selectedIds: [],
    ratingValue: null,
    freeText: '',
    note: '',
  };
  // Reads the form first, then the read-only answers to questions the grid no
  // longer asks. One accessor for both, so `synthesisRow` renders a retired
  // answer through exactly the same path as a current one instead of growing a
  // second, parallel rendering of the same thing. A retired question never
  // appears in a conduct step, so `patch` can never reach one.
  const answerOf = (id: string): ClosingAnswerForm =>
    $form.answers[id] ?? retiredAnswers[id] ?? EMPTY;

  function patch(id: string, change: Partial<ClosingAnswerForm>) {
    if (!interactive) return;
    $form = {
      ...$form,
      answers: { ...$form.answers, [id]: { ...answerOf(id), ...change } },
    };
    scheduleAutosave();
  }
  function setSingle(id: string, optionId: string) {
    const picked = answerOf(id).selectedIds;
    patch(id, {
      selectedIds: picked.includes(optionId) ? [] : [optionId],
    });
  }
  function toggleMulti(id: string, optionId: string) {
    const picked = answerOf(id).selectedIds;
    patch(id, {
      selectedIds: picked.includes(optionId)
        ? picked.filter((v) => v !== optionId)
        : [...picked, optionId],
    });
  }
  function setStars(id: string, n: number) {
    patch(id, { ratingValue: answerOf(id).ratingValue === n ? null : n });
  }
  function setFreeText(id: string, value: string) {
    patch(id, { freeText: value });
  }
  function setNote(id: string, value: string) {
    patch(id, { note: value });
  }
  function setVerdictNote(value: string) {
    if (!interactive) return;
    $form = { ...$form, verdictNote: value };
    scheduleAutosave();
  }
  function setRecommendation(value: string) {
    if (!interactive) return;
    $form = {
      ...$form,
      recommendation: $form.recommendation === value ? null : value,
    };
    scheduleAutosave();
  }

  // No leave guard: an open closing stays in_progress until explicitly clôturé.
  // Staff can navigate away freely (the answers autosave), so there is nothing
  // to confirm on the way out, the lifecycle is decoupled from the view.

  // The one confirm worth keeping: clôture crosses a one-way door. Finalising is
  // terminal, a done closing is locked for good (the server refuses any later
  // mutation), so the confirm guards that irreversible step.
  let closeConfirmOpen = $state(false);
  function doClose() {
    closeConfirmOpen = false;
    beginAction('close');
    formEl.requestSubmit(closeBtn);
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

  // Surface autosave + in-flight state so the fiche can mirror it if it wants.
  $effect(() => {
    actionState = { busy: $delayed, lastAction, saveState };
  });

  // The trimmed per-question note, or null. Shared by the synthesis (rendered on
  // its own line so its newlines survive) and resume (a note alone marks the
  // question touched).
  //
  // Read off the ANSWER, never gated on `q.note`: that field says whether this
  // grid offers a note input (which is what `noteInput` below is gated on), not
  // whether one was written. Gating the display on it meant a grid dropping a
  // `withNote` hid prose the team had already written - on screen only, since
  // the PDF has always printed whatever the row holds.
  function noteText(q: ClosingQuestion): string | null {
    return answerOf(q.id).note.trim() || null;
  }

  // The structured answer of a question, for the synthesis: option labels for
  // choices (joined for multi), the rating as "n/5", or the trimmed text answer.
  // Excludes the free-text note, which the synthesis renders separately (as prose
  // with preserved newlines) so a multi-line annotation never gets crushed into a
  // parenthetical. Null = no structured answer. Reads $form via fv, stays reactive.
  function answerLabel(q: ClosingQuestion): string | null {
    const a = answerOf(q.id);
    if (q.kind === 'text') return a.freeText.trim() || null;
    if (q.kind === 'rating') {
      return a.ratingValue ? `${a.ratingValue}/${q.max}` : null;
    }
    const labels = q.options
      .filter((o) => a.selectedIds.includes(o.id))
      .map((o) => o.label);
    return labels.length ? labels.join(', ') : null;
  }

  // The selected labels of a multi-choice question, as a list. Rendered as
  // discrete chips in the synthesis rather than joined: option labels can
  // themselves contain commas and slashes ("IA / Data"), so a "a, b" join reads
  // ambiguously as more answers than there are. One chip = one answer.
  function answerChips(q: ClosingQuestion): string[] {
    if (q.kind !== 'multi') return [];
    const picked = answerOf(q.id).selectedIds;
    return q.options.filter((o) => picked.includes(o.id)).map((o) => o.label);
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
      'border-epi-tech-ink/30 bg-epi-tech-ink/5 text-epi-tech-ink hover:border-epi-tech-ink hover:bg-epi-tech-ink/10',
    neutral:
      'border-warning/30 bg-warning/5 text-warning hover:border-warning hover:bg-warning/10',
    negative:
      'border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive hover:bg-destructive/10',
  };
  const CHIP_TONE_ACTIVE: Record<ChoiceTone, string> = {
    positive:
      'border-epi-tech-ink bg-epi-tech-ink/10 text-epi-tech-ink ring-1 ring-epi-tech-ink',
    neutral: 'border-warning bg-warning/10 text-warning ring-1 ring-warning',
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
  // neutral categorical blue (a channel, a specialty, no valence to imply).
  function chipClass(opt: ClosingOption, active: boolean): string {
    if (opt.tone) {
      return active ? CHIP_TONE_ACTIVE[opt.tone] : CHIP_TONE_IDLE[opt.tone];
    }
    return active ? chipActive : chipIdle;
  }

  const TONE_IDLE: Record<RecommendationToneToken, string> = {
    'epi-tech':
      'border-epi-tech-ink/30 bg-epi-tech-ink/5 text-epi-tech-ink hover:border-epi-tech-ink',
    'epi-blue':
      'border-epi-blue/30 bg-epi-blue/5 text-epi-blue hover:border-epi-blue',
    'epi-tomorrow':
      'border-epi-tomorrow/30 bg-epi-tomorrow/5 text-epi-tomorrow hover:border-epi-tomorrow',
    'epi-drift':
      'border-border bg-muted/40 text-muted-foreground hover:border-foreground/40',
  };
  const TONE_ACTIVE: Record<RecommendationToneToken, string> = {
    'epi-tech':
      'border-epi-tech-ink bg-epi-tech-ink/15 ring-1 ring-epi-tech-ink',
    'epi-blue': 'border-epi-blue bg-epi-blue/10 ring-1 ring-epi-blue',
    'epi-tomorrow':
      'border-epi-tomorrow bg-epi-tomorrow/10 ring-1 ring-epi-tomorrow',
    'epi-drift': 'border-foreground/40 bg-muted ring-1 ring-foreground/30',
  };

  // RecommendationIconToken → Lucide face. The display-order array leads with the
  // most compatible profile, so the row runs laugh → frown left→right.
  const RECO_ICONS: Record<RecommendationIconToken, typeof Frown> = {
    frown: Frown,
    meh: Meh,
    smile: Smile,
    laugh: Laugh,
  };
</script>

<!-- One chip group for both single- and multi-choice. `multi` only swaps the
     active test (membership vs equality) and the handler (toggle vs set); the
     chrome is identical, so the two kinds never drift apart. Selection reads
     through the active ring + tint alone, no per-chip tick, which (rendering
     only when active) would widen the chip on select and re-wrap the row. The
     one-vs-many cue lives once under the prompt instead (see questionBlock). -->
{#snippet choiceChips(
  questionId: string,
  options: readonly ClosingOption[],
  multi: boolean,
)}
  {@const picked = answerOf(questionId).selectedIds}
  <div class="flex flex-wrap gap-2">
    {#each options as opt (opt.id)}
      {@const active = picked.includes(opt.id)}
      {@const Icon = opt.icon ? CHIP_ICONS[opt.icon] : null}
      <button
        type="button"
        aria-pressed={active}
        disabled={!interactive}
        onclick={() =>
          multi
            ? toggleMulti(questionId, opt.id)
            : setSingle(questionId, opt.id)}
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

<!-- The always-on free-text note under a question: anything the chips don't
     capture, including the precision behind an "Autre" pick. Multi-line (a
     Textarea, like the testimony and verdict boxes) to invite a real note, not a
     one-word clarification. The placeholder is tailored to the question. -->
{#snippet noteInput(q: ClosingQuestion)}
  <Textarea
    value={answerOf(q.id).note}
    oninput={(e) => setNote(q.id, e.currentTarget.value)}
    placeholder={q.note?.placeholder}
    maxlength={q.note?.maxLength}
    disabled={!interactive}
    class="min-h-16 resize-none bg-background"
  />
{/snippet}

<!-- One question: the prompt is the prominent element (it's what the dev reads
     aloud), the answers sit quieter below. No box around it: the step is the
     unit, not the question. -->
{#snippet questionBlock(q: ClosingQuestion)}
  <div class="space-y-4">
    <div class="space-y-1.5">
      <p class="text-2xl leading-snug font-semibold text-foreground">
        {q.label}
      </p>
      {#if q.hint}
        <p class="text-sm text-muted-foreground italic">{q.hint}</p>
      {/if}
      <!-- Single-choice is the default expectation, so only the multi questions
           carry a cue. One quiet muted line under the prompt, enough to resolve
           the one-vs-many ambiguity without putting an affordance on every chip. -->
      {#if q.kind === 'multi'}
        <p
          class="flex items-center gap-1 text-xs font-medium text-muted-foreground/70"
        >
          <CheckCheck class="h-3 w-3" />
          Plusieurs réponses possibles
        </p>
      {/if}
    </div>

    {#if q.kind === 'single' || q.kind === 'multi'}
      {@render choiceChips(q.id, q.options, q.kind === 'multi')}
    {:else if q.kind === 'rating'}
      {@const given = answerOf(q.id).ratingValue}
      <div class="flex items-center gap-1.5">
        {#each Array.from({ length: q.max ?? 0 }) as _, idx (idx)}
          {@const filled = (given ?? 0) > idx}
          <button
            type="button"
            disabled={!interactive}
            onclick={() => setStars(q.id, idx + 1)}
            aria-label={`${idx + 1} sur ${q.max}`}
            class="cursor-pointer rounded-sm p-0.5 transition-transform hover:scale-110 active:scale-95 disabled:cursor-default disabled:hover:scale-100 disabled:active:scale-100"
          >
            <Star
              class={cn(
                'h-7 w-7 transition-colors',
                filled
                  ? 'fill-epi-together text-epi-together'
                  : 'text-muted-foreground/40',
              )}
            />
          </button>
        {/each}
        {#if given}
          <span class="ml-1 text-sm font-bold text-foreground">
            {given}/{q.max}
          </span>
        {/if}
      </div>
    {:else if q.kind === 'text'}
      <Textarea
        value={answerOf(q.id).freeText}
        oninput={(e) => setFreeText(q.id, e.currentTarget.value)}
        placeholder={q.placeholder}
        maxlength={q.maxLength}
        disabled={!interactive}
        class="min-h-16 resize-none bg-background"
      />
    {/if}

    <!-- The note under a question, where THIS grid invites one. A two-week stage
         wants eleven of them; a three-hour afternoon wants none, so the grid
         decides rather than the question. The one place to jot anything
         off-script, including an "Autre" precision. -->
    {#if q.note}
      {@render noteInput(q)}
    {/if}
  </div>
{/snippet}

<!-- Small autosave indicator, shown in the step footer while in progress. -->
{#snippet saveIndicator()}
  <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
    {#if saveState === 'saving'}
      <Loader2 class="h-3.5 w-3.5 animate-spin" /> Enregistrement…
    {:else if saveState === 'saved'}
      <Check class="h-3.5 w-3.5 text-epi-tech-ink" /> Enregistré
    {:else}
      <!-- A hint, not a status: it says what the form will do, and it is the
           longest of the three labels. On a phone the two controls either side
           are what the footer is for, so the hint steps aside there while the
           real statuses ("Enregistrement…", "Enregistré") always show. -->
      <span class="hidden sm:inline">Enregistrement automatique</span>
    {/if}
  </p>
{/snippet}

<!-- What the TEAM wrote: a per-question note, or the verdict note. Its own block,
     newlines preserved (whitespace-pre-wrap on the inner <p>, kept inline so the
     markup's own indentation never leaks in), behind the neutral rail
     `TalentNoteCard` draws for exactly this.

     The rail is what tells the two voices apart on this page, and this is the
     only screen where they sit three lines from each other: the student's
     sentence goes through `PullQuote` (teal rail, italic, guillemets), staff
     prose stays plain. Rendering both the same way, which is what this snippet
     used to do, meant nobody could tell who had spoken. -->
{#snippet prose(t: string)}
  <div class="border-l-2 border-muted-foreground/25 pl-3">
    <p
      class="text-sm leading-relaxed whitespace-pre-wrap text-foreground-secondary"
    >
      {t}
    </p>
  </div>
{/snippet}

{#snippet dash()}
  <p class="text-sm text-muted-foreground/60">—</p>
{/snippet}

<!-- One synthesis entry: the question and its structured answer (chips or stars)
     share a line; free text drops to its own full-width line below, in the
     grammar of whoever wrote it. Nothing at all shows a muted dash next to the
     question.

     The label column is fixed rather than proportional (it was `2fr_3fr`, so a
     two-line prompt pushed its own answer down and no two answers started at the
     same x). One axis to read down, and long prompts wrap inside their column
     instead of moving anything. -->
{#snippet synthesisRow(q: ClosingQuestion)}
  {@const note = noteText(q)}
  {@const value = answerLabel(q)}
  <div class="space-y-2 py-2.5">
    <div class="grid gap-1 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
      <p class="text-xs leading-relaxed text-muted-foreground">{q.label}</p>
      <div>
        {#if q.kind === 'rating'}
          {@const given = answerOf(q.id).ratingValue}
          {#if given}
            <div class="flex items-center gap-0.5">
              {#each Array.from({ length: q.max ?? 0 }) as _, idx (idx)}
                <Star
                  class={cn(
                    'h-3.5 w-3.5',
                    given > idx
                      ? 'fill-epi-together text-epi-together'
                      : 'text-muted-foreground/30',
                  )}
                />
              {/each}
              <span class="ml-1.5 text-sm font-semibold text-foreground">
                {given}/{q.max}
              </span>
            </div>
          {:else if !note}
            {@render dash()}
          {/if}
        {:else if q.kind === 'text'}
          <!-- The testimony is free text: it renders full-width below. -->
          {#if !value && !note}{@render dash()}{/if}
        {:else if q.kind === 'multi'}
          {@const chips = answerChips(q)}
          {#if chips.length}
            <div class="flex flex-wrap gap-1.5">
              {#each chips as c (c)}
                <span
                  class="inline-flex items-center rounded-sm border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  {c}
                </span>
              {/each}
            </div>
          {:else if !note}
            {@render dash()}
          {/if}
        {:else if value}
          <p class="text-sm font-semibold text-foreground">{value}</p>
        {:else if !note}
          {@render dash()}
        {/if}
      </div>
    </div>
    <!-- The student's own sentence, in the one grammar this product reserves for
         it. `PullQuote` rather than a fourth hand-rolled blockquote, and
         unclamped: a synthesis is read in full. -->
    {#if q.kind === 'text' && value}
      <PullQuote text={value} size="inline" />
    {/if}
    {#if note}{@render prose(note)}{/if}
  </div>
{/snippet}

<section class="rounded-sm border bg-card">
  <!-- Progress fill: a thin no-number bar so paging never feels like a numbered
       checklist. Conduct-only: the synthesis has nothing to pace. -->
  {#if status === 'in_progress'}
    <div class="h-1 w-full overflow-hidden rounded-t-sm bg-muted">
      <div
        class="h-full bg-epi-blue transition-ui duration-300"
        style={`width:${progressPct}%`}
      ></div>
    </div>
  {/if}

  <form bind:this={formEl} method="POST" action="?/save" use:enhance>
    <!-- Hidden submitters: every lifecycle transition is driven through
         requestSubmit on one of these. -->
    <button
      bind:this={startBtn}
      type="submit"
      formaction="?/start"
      class="hidden"
      aria-hidden="true"
      tabindex={-1}
    ></button>
    <button
      bind:this={closeBtn}
      type="submit"
      formaction="?/close"
      class="hidden"
      aria-hidden="true"
      tabindex={-1}
    ></button>

    {#if status === 'done'}
      <!-- ═══ Synthesis: the finalised closing at a glance. Read-only and
           final, clôture is a one-way door, so there is nothing to do here but
           read it. ═══ -->
      <div class="px-5 py-6">
        <div class="mx-auto w-full max-w-2xl space-y-6">
          {#if justFinalised}
            <!-- One-time finalised banner: shown only right after THIS session's
                 clôture, the moment that tested as ambiguous (staff couldn't tell
                 the closing had finished and read the recap as a form to confirm).
                 It never renders on later visits to an already-done closing, so
                 the record stays uncluttered. Teal = gate cleared, the "done"
                 status-chip language. -->
            <div
              class="flex items-center gap-3 rounded-md border border-epi-tech-ink/30 bg-epi-tech-ink/10 p-4"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-epi-tech-ink/15"
              >
                <CheckCheck class="h-5 w-5 text-epi-tech-ink" />
              </span>
              <p class="text-sm font-medium text-foreground">
                <span class="font-bold">Closing finalisé.</span> Il est clôturé et
                n'est plus modifiable.
              </p>
            </div>
          {/if}

          <!-- No title of its own: the page header above already names the
               person and what this page is, and a second display-face heading
               saying "Synthèse du closing" under "Closing · Stage de Seconde"
               was the page announcing itself twice. The document opens on its
               provenance instead.

               The grid's name is not printed here either, and that is the same
               rule applied once more: a grid is named after the format it
               serves ("Closing d'orientation - stage de seconde"), so under a
               header reading "Closing · Stage de Seconde" it repeated both
               words a second time. Which questions were asked is what the
               sections below ARE, and the record pins its `templateId`
               whatever this page prints. -->
          {#if conductedBy || conductedLabel}
            <div class="flex items-center gap-2.5">
              {#if conductedBy}
                <Avatar.Root class="h-7 w-7 shrink-0">
                  <Avatar.Image
                    src={conductedByImage ?? undefined}
                    alt={conductedBy}
                    class="object-cover"
                  />
                  <Avatar.Fallback
                    class="bg-epi-blue/10 text-xs font-bold text-epi-blue"
                  >
                    {getInitials(conductedBy)}
                  </Avatar.Fallback>
                </Avatar.Root>
              {/if}
              <p class="text-sm text-muted-foreground">
                {#if conductedLabel && conductedBy}
                  Mené le <span class="font-medium text-foreground"
                    >{conductedLabel}</span
                  >
                  par
                  <span class="font-semibold text-foreground"
                    >{conductedBy}</span
                  >
                {:else if conductedBy}
                  Mené par <span class="font-semibold text-foreground"
                    >{conductedBy}</span
                  >
                {:else if conductedLabel}
                  Mené le <span class="font-medium text-foreground"
                    >{conductedLabel}</span
                  >
                {/if}
              </p>
            </div>
          {/if}

          <!-- The verdict first: it's the one thing staff come back for.

               Neutral panel, deliberately. It used to be blue-tinted, which put
               a blue frame and a blue overline around a chip that carries its
               own tone colour, and left the verdict note's rail invisible
               against its own background. The chip is the only colour in the
               box now, which is the point of a verdict. -->
          <div class="space-y-3 rounded-md border bg-muted/20 p-4">
            <p class="epi-overline text-muted-foreground">
              {VERDICT_SECTION.title}
            </p>
            {#if $form.recommendation && isClosingRecommendation($form.recommendation)}
              {@const desc = CLOSING_RECOMMENDATIONS[$form.recommendation]}
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
            {#if $form.verdictNote.trim()}
              {@render prose($form.verdictNote.trim())}
            {/if}
          </div>

          <!-- A section boundary has to outweigh the rules between questions,
               so the heading takes the product's own region label (mono, via
               `epi-overline`) and the gap above it is wider than the one inside.
               Hand-rolled in the body face, they read as one more grey label and
               the `divide-y` between two questions won the eye. -->
          {#each synthesisSections as section (section.id)}
            <div class="space-y-2 pt-2">
              <p class="epi-overline text-muted-foreground">{section.title}</p>
              <div class="divide-y divide-border/60">
                {#each section.questions as q (q.id)}
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
                    <h3 class="font-heading text-display-m text-foreground">
                      {grid.label}<TitleCursor />
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
                        Démarrer le closing
                      </Button>
                    </div>
                  {:else}
                    <div class="flex justify-center pt-2">
                      <Button class="px-10" onclick={resume}>
                        Reprendre le closing
                        <ArrowRight class="ml-1.5 h-4 w-4" />
                      </Button>
                    </div>
                  {/if}
                </div>
              {:else if currentSection}
                <!-- ── A question section ── -->
                <div class="space-y-6">
                  <p class="epi-overline text-muted-foreground">
                    {currentSection.title}
                  </p>
                  <div class="space-y-14">
                    {#each currentSection.questions as q (q.id)}
                      {@render questionBlock(q)}
                    {/each}
                  </div>
                </div>
              {:else}
                <!-- ── Verdict: staff-only, filled at the end ── -->
                <div class="space-y-6">
                  <div class="space-y-0.5">
                    <p class="epi-overline text-epi-blue">
                      {VERDICT_SECTION.title}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {VERDICT_SECTION.subtitle}
                    </p>
                  </div>

                  <div class="space-y-3">
                    <p
                      class="text-2xl leading-snug font-semibold text-foreground"
                    >
                      Compatibilité du profil
                    </p>
                    <!-- Ordered by compatibility: faces run laugh → frown, left
                         (100 % compatible) to right (pas intéressé). -->
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {#each CLOSING_RECOMMENDATION_DISPLAY_ORDER as value (value)}
                        {@const desc = CLOSING_RECOMMENDATIONS[value]}
                        {@const active = $form.recommendation === value}
                        {@const Face = RECO_ICONS[desc.icon]}
                        <button
                          type="button"
                          aria-pressed={active}
                          disabled={!interactive}
                          onclick={() => setRecommendation(value)}
                          class={cn(
                            'flex cursor-pointer flex-col items-center gap-1.5 rounded-sm border px-2 py-3 text-center transition-ui active:scale-[0.98] disabled:cursor-default disabled:active:scale-100',
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
                      {VERDICT_SECTION.noteLabel}
                    </p>
                    <Textarea
                      value={$form.verdictNote}
                      oninput={(e) => setVerdictNote(e.currentTarget.value)}
                      placeholder={VERDICT_SECTION.notePlaceholder}
                      maxlength={VERDICT_SECTION.noteMaxLength}
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

      <!-- Step nav: Précédent / autosave / Suivant, or Clôturer on the verdict.
           Hidden on the cover, whose CTAs drive the lifecycle. -->
      {#if !isIntro}
        <div class="border-t px-5 py-3.5">
          <div
            class="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3"
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
                class="bg-success text-status-foreground hover:bg-success/90"
                disabled={$delayed}
                onclick={close}
              >
                {#if $delayed && lastAction === 'close'}
                  <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
                {:else}
                  <Lock class="mr-1.5 h-4 w-4" />
                {/if}
                Clôturer le closing
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
        <Lock class="h-5 w-5 text-epi-tech-ink" />
        Clôturer le closing&nbsp;?
      </AlertDialog.Title>
      <AlertDialog.Description>
        Le closing passera en «&nbsp;finalisé&nbsp;». Cette action est
        définitive&nbsp;: vous ne pourrez plus le modifier. Vérifiez les
        réponses avant de clôturer.
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
