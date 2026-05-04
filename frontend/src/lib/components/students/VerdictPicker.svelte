<script lang="ts">
  import { enhance } from '$app/forms';
  import { tick } from 'svelte';
  import { LoaderCircle, TriangleAlert } from '@lucide/svelte';
  import {
    VERDICT_VALUES,
    CONTEXT_TAG_VALUES,
    VERDICT_LABELS,
    VERDICT_EMOJIS,
    CONTEXT_TAG_LABELS,
    CONTEXT_TAG_EMOJIS,
  } from '$lib/domain/verdict';
  import type {
    ParticipationVerdict,
    ParticipationContextTag,
  } from '@prisma/client';
  import { cn } from '$lib/utils';

  let {
    id,
    verdict = null,
    contextTag = null,
  }: {
    id: string;
    verdict?: ParticipationVerdict | null;
    contextTag?: ParticipationContextTag | null;
  } = $props();

  let status = $state<'idle' | 'loading' | 'error'>('idle');
  let formElement: HTMLFormElement;
  let pendingVerdict = $state<ParticipationVerdict | null>(null);
  let pendingContextTag = $state<ParticipationContextTag | null>(null);
  let xpFloater = $state<{ x: number; y: number; n: number } | null>(null);
  let xpCounter = 0;
  let lastClickPos: { x: number; y: number } | null = null;

  const VERDICT_CHIP_CLASS: Record<ParticipationVerdict, string> = {
    comfortable:
      'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 data-[selected=true]:border-emerald-500 data-[selected=true]:bg-emerald-500 data-[selected=true]:text-white dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40',
    progressing:
      'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 data-[selected=true]:border-blue-500 data-[selected=true]:bg-blue-500 data-[selected=true]:text-white dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-900/40',
    struggling:
      'border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 data-[selected=true]:border-orange-500 data-[selected=true]:bg-orange-500 data-[selected=true]:text-white dark:border-orange-800/50 dark:bg-orange-950/30 dark:text-orange-200 dark:hover:bg-orange-900/40',
  };

  function captureAnchor(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    const formRect = formElement.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    lastClickPos = {
      x: r.left - formRect.left + r.width / 2,
      y: r.top - formRect.top,
    };
  }

  async function submitWith(
    nextVerdict: ParticipationVerdict | null,
    nextContextTag: ParticipationContextTag | null,
  ) {
    pendingVerdict = nextVerdict;
    pendingContextTag = nextContextTag;
    await tick();
    formElement.requestSubmit();
  }

  function pickVerdict(e: MouseEvent, v: ParticipationVerdict) {
    captureAnchor(e);
    submitWith(verdict === v ? null : v, contextTag);
  }

  function pickContextTag(e: MouseEvent, t: ParticipationContextTag) {
    captureAnchor(e);
    submitWith(verdict, contextTag === t ? null : t);
  }
</script>

<form
  method="POST"
  action="?/updateVerdict"
  bind:this={formElement}
  class="relative space-y-3"
  use:enhance={() => {
    status = 'loading';
    return async ({ result }) => {
      if (result.type === 'success') {
        const verdictNewlySet = verdict === null && pendingVerdict !== null;
        const contextTagNewlySet =
          contextTag === null && pendingContextTag !== null;
        const isFirstSet = verdictNewlySet || contextTagNewlySet;
        verdict = pendingVerdict;
        contextTag = pendingContextTag;
        status = 'idle';
        if (isFirstSet && lastClickPos) {
          xpCounter += 1;
          const tag = xpCounter;
          xpFloater = { ...lastClickPos, n: tag };
          setTimeout(() => {
            if (xpFloater?.n === tag) xpFloater = null;
          }, 800);
        }
      } else {
        status = 'error';
      }
    };
  }}
>
  <input type="hidden" name="id" value={id} />
  <input type="hidden" name="verdict" value={pendingVerdict ?? ''} />
  <input type="hidden" name="contextTag" value={pendingContextTag ?? ''} />

  {#if xpFloater}
    <div
      class="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full font-heading text-2xl font-black text-epi-orange drop-shadow-md"
      style="left: {xpFloater.x}px; top: {xpFloater.y}px; animation: xp-float 0.8s ease-out forwards;"
    >
      +10 XP
    </div>
  {/if}

  <div class="flex items-center justify-between gap-2">
    <div class="flex flex-wrap gap-2">
      {#each VERDICT_VALUES as v (v)}
        {@const selected = verdict === v}
        <button
          type="button"
          data-selected={selected}
          aria-pressed={selected}
          disabled={status === 'loading'}
          onclick={(e) => pickVerdict(e, v)}
          class={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60',
            VERDICT_CHIP_CLASS[v],
          )}
        >
          <span aria-hidden="true">{VERDICT_EMOJIS[v]}</span>
          <span>{VERDICT_LABELS[v]}</span>
        </button>
      {/each}
    </div>
    <div class="text-muted-foreground" aria-live="polite">
      {#if status === 'loading'}
        <LoaderCircle class="h-3.5 w-3.5 animate-spin text-epi-blue" />
      {:else if status === 'error'}
        <TriangleAlert class="h-3.5 w-3.5 text-destructive" />
      {/if}
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2 pl-1">
    <span
      class="text-[9px] font-semibold tracking-widest text-muted-foreground/70 uppercase"
    >
      Contexte :
    </span>
    {#each CONTEXT_TAG_VALUES as t (t)}
      {@const selected = contextTag === t}
      <button
        type="button"
        data-selected={selected}
        aria-pressed={selected}
        disabled={status === 'loading'}
        onclick={(e) => pickContextTag(e, t)}
        class={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          'border-border bg-transparent text-muted-foreground hover:border-solid hover:bg-muted',
          selected &&
            'border-solid border-foreground/40 bg-foreground/10 text-foreground hover:bg-foreground/15',
        )}
      >
        <span aria-hidden="true">{CONTEXT_TAG_EMOJIS[t]}</span>
        <span>{CONTEXT_TAG_LABELS[t]}</span>
      </button>
    {/each}
  </div>
</form>
