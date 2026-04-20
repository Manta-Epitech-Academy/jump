<script lang="ts">
  import { enhance } from '$app/forms';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Popover from '$lib/components/ui/popover';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import {
    UserCheck,
    Clock,
    LifeBuoy,
    X,
    LockOpen,
    MessageSquareQuote,
    Award,
    Sprout,
    Check,
    CircleCheck,
    MessageCircleReply,
    LoaderCircle,
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import NoteInput from '$lib/components/NoteInput.svelte';
  import BringPcBadge from '$lib/components/events/BringPcBadge.svelte';
  import { resolve } from '$app/paths';

  let {
    participation,
    progress = [],
    optimisticToggle,
    onDownload,
    focusMode = false,
    index = 0,
  }: {
    participation: any;
    progress?: any[];
    optimisticToggle: (
      id: string,
      field: 'isPresent' | 'bringPc',
    ) => () => Promise<any> | any;
    onDownload?: (participationId: string) => void;
    focusMode?: boolean;
    index?: number;
  } = $props();

  let isNewStudent = $derived.by(() => {
    const count = participation.talent?.eventsCount || 0;
    const isPresent = participation.isPresent ? 1 : 0;
    return count - isPresent === 0;
  });

  function handleDownloadClick() {
    if (!participation.isPresent) {
      toast.error('Le Talent doit être présent pour recevoir un diplôme.');
      return;
    }
    onDownload?.(participation.id);
  }

  function formatFirstName(name: string | undefined) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  let delayOpen = $state(false);
  const delays = [5, 10, 15, 30, 45, 60];

  let needsHelpProgress = $derived(
    progress.find((p: any) => p.status === 'needs_help'),
  );

  let helpStep = $derived(
    needsHelpProgress
      ? needsHelpProgress.activity?.contentStructure?.steps?.find(
          (s: any) => s.id === needsHelpProgress.currentStepId,
        )
      : null,
  );

  // --- 🦇 The Bat-Signal Timer ---
  let timerDisplay = $state('00:00');
  let isUrgent = $state(false);
  let isUnlocking = $state(false);

  $effect(() => {
    if (needsHelpProgress?.updatedAt) {
      const start = new Date(needsHelpProgress.updatedAt).getTime();
      const interval = setInterval(() => {
        const diff = Math.floor((Date.now() - start) / 1000);
        const m = Math.floor(diff / 60)
          .toString()
          .padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        timerDisplay = `${m}:${s}`;
        // Alert escalates to urgent after 5 minutes.
        isUrgent = diff > 300;
      }, 1000);
      return () => clearInterval(interval);
    } else {
      timerDisplay = '00:00';
      isUrgent = false;
    }
  });

  // --- ✨ The XP Popover Animation ---
  let showXpAnimation = $state(false);
  function triggerXp() {
    showXpAnimation = true;
    setTimeout(() => {
      showXpAnimation = false;
    }, 1500);
  }

  // --- 📱 Touch Swipe-to-Action ---
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = $state(false);
  let isScrolling = $state(false);
  let swipeOffset = $state(0);
  let presenceForm = $state<HTMLFormElement | undefined>();

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = true;
    isScrolling = false;
    swipeOffset = 0;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartX;
    const dy = currentY - touchStartY;

    // Detect if the user is trying to scroll vertically instead of swiping
    if (!isScrolling && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      isSwiping = false;
      isScrolling = true;
      swipeOffset = 0;
      return;
    }

    if (isSwiping && !isScrolling) {
      swipeOffset = dx;
      // Add rubber band resistance
      if (swipeOffset > 100) swipeOffset = 100 + (swipeOffset - 100) * 0.2;
      if (swipeOffset < -100) swipeOffset = -100 + (swipeOffset + 100) * 0.2;
    }
  }

  function handleTouchEnd() {
    if (!isSwiping) return;
    isSwiping = false;

    // Trigger action if swiped far enough
    if (swipeOffset > 75 && !participation.isPresent) {
      presenceForm?.requestSubmit();
    } else if (swipeOffset < -75 && participation.isPresent) {
      presenceForm?.requestSubmit();
    }
    swipeOffset = 0;
  }
</script>

<div
  class="card-entry relative touch-pan-y overflow-hidden rounded-xl"
  style="animation-delay: {Math.min(index * 50, 500)}ms"
>
  <!-- Swipe Action Backgrounds -->
  <div
    class="absolute inset-0 z-0 flex items-center justify-between rounded-xl bg-slate-100 px-6 text-lg font-bold dark:bg-slate-900"
  >
    <div
      class="flex items-center gap-2 text-epi-blue transition-opacity duration-200"
      style="opacity: {swipeOffset > 30 ? 1 : 0}"
    >
      <UserCheck /> Présent
    </div>
    <div
      class="flex items-center gap-2 text-muted-foreground transition-opacity duration-200"
      style="opacity: {swipeOffset < -30 ? 1 : 0}"
    >
      Absent <X />
    </div>
  </div>

  <!-- The Actual Card -->
  <div
    class={cn(
      'relative z-10 h-full w-full border bg-card shadow-sm dark:shadow-none',
      focusMode ? 'p-6 text-[1.05rem]' : 'p-4',
      needsHelpProgress
        ? isUrgent
          ? 'border-red-500 ring-2 ring-red-500/30'
          : 'border-epi-orange ring-2 ring-epi-orange/20'
        : participation.isPresent
          ? 'border-epi-blue dark:border-epi-blue/70'
          : 'border-border opacity-75',
      isSwiping ? '' : 'transition-transform duration-200 ease-out',
    )}
    style="transform: translateX({swipeOffset}px);"
    role="button"
    tabindex="-1"
    aria-label="Balayer pour basculer la présence"
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
  >
    <!-- XP Popover Animation -->
    {#if showXpAnimation}
      <div
        class="animate-xp-float pointer-events-none absolute top-1/2 right-12 z-50 flex items-center justify-center font-heading text-2xl font-black text-epi-orange drop-shadow-md"
      >
        +10 XP
      </div>
    {/if}

    {#if needsHelpProgress && helpStep}
      <div
        class={cn(
          'mb-4 flex animate-in flex-col items-center justify-between gap-3 rounded-lg px-4 py-3 text-white shadow-sm fade-in slide-in-from-top-2 sm:flex-row dark:shadow-none',
          isUrgent
            ? 'bg-red-500 ring-4 shadow-red-500/20 ring-red-500/30'
            : 'bg-epi-orange',
        )}
      >
        <div class="flex items-center gap-3">
          <LifeBuoy
            class={cn('h-6 w-6', isUrgent ? 'animate-ping' : 'animate-bounce')}
          />
          <div class="flex flex-col">
            <span class="text-sm font-black tracking-wider uppercase"
              >Bloqué !</span
            >
            <span class="text-xs opacity-90"
              >Étape : <strong>{helpStep.title}</strong></span
            >
          </div>
        </div>
        <div
          class="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end"
        >
          <!-- Bat-Signal Timer -->
          <span
            class="rounded-sm bg-black/20 px-2 py-1 font-mono text-xs font-bold tracking-widest"
          >
            {timerDisplay}
          </span>

          <div class="flex gap-2">
            <form action="?/dismissAlert" method="POST" use:enhance>
              <input
                type="hidden"
                name="progressId"
                value={needsHelpProgress.id}
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-white hover:bg-white/20"
                ><X class="h-4 w-4" /></Button
              >
            </form>
            <form
              action="?/unlockStep"
              method="POST"
              use:enhance={() => {
                isUnlocking = true;
                return async ({ result, update }) => {
                  isUnlocking = false;
                  if (result.type === 'success') {
                    triggerXp();
                  }
                  await update();
                };
              }}
            >
              <input
                type="hidden"
                name="progressId"
                value={needsHelpProgress.id}
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={isUnlocking}
                class={cn(
                  'font-bold hover:bg-white/90',
                  isUrgent ? 'text-red-600' : 'text-epi-orange',
                )}
              >
                {#if isUnlocking}
                  <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
                {:else}
                  <LockOpen class="mr-1.5 h-4 w-4" />
                {/if}
                Débloquer
              </Button>
            </form>
          </div>
        </div>
      </div>
    {/if}

    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-1 items-center gap-4">
        <a
          href={resolve(`/staff/pedago/students/${participation.talent?.id}`)}
          class="relative block transition-transform hover:scale-105"
        >
          <Avatar.Root
            class={cn(
              'border-2',
              focusMode ? 'h-14 w-14' : 'h-12 w-12',
              needsHelpProgress
                ? 'border-epi-orange'
                : participation.isPresent
                  ? participation.delay > 0
                    ? 'border-orange-300'
                    : 'border-epi-blue dark:border-epi-blue/70'
                  : 'border-muted',
            )}
          >
            <Avatar.Fallback class="bg-muted font-bold text-muted-foreground">
              {(participation.talent?.nom?.[0] ?? '').toUpperCase()}{(
                participation.talent?.prenom?.[0] ?? ''
              ).toUpperCase()}
            </Avatar.Fallback>
          </Avatar.Root>
          {#if participation.isPresent}
            <div
              class={cn(
                'absolute -right-1 -bottom-1 rounded-full p-0.5 ring-2 ring-card',
                needsHelpProgress
                  ? 'bg-epi-orange text-white'
                  : participation.delay > 0
                    ? 'bg-orange-200 text-orange-800'
                    : 'bg-epi-blue text-white',
              )}
            >
              {#if needsHelpProgress}
                <LifeBuoy
                  class={cn(
                    'animate-spin-slow',
                    focusMode ? 'h-4 w-4' : 'h-3 w-3',
                  )}
                />
              {:else if participation.delay > 0}
                <Clock class={focusMode ? 'h-4 w-4' : 'h-3 w-3'} />
              {:else}
                <CircleCheck class={focusMode ? 'h-4 w-4' : 'h-3 w-3'} />
              {/if}
            </div>
          {/if}
        </a>

        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <a
              href={resolve(
                `/staff/pedago/students/${participation.talent?.id}`,
              )}
            >
              <span
                class="text-base leading-none font-bold tracking-tight uppercase transition-colors hover:text-epi-blue"
              >
                <span>{participation.talent?.nom}</span>
                <span class="capitalize"
                  >{formatFirstName(participation.talent?.prenom)}</span
                >
              </span>
            </a>
            {#if isNewStudent}
              <Badge
                variant="outline"
                class="gap-1 border-green-200 bg-green-50 px-1.5 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
              >
                <Sprout class="h-2.5 w-2.5" /> Nouveau
              </Badge>
            {/if}
          </div>
          <div class="mt-1 flex items-center gap-2">
            <span
              class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >{participation.talent?.niveau}</span
            >
            <form
              method="POST"
              action="?/toggleBringPc"
              use:enhance={optimisticToggle(participation.id, 'bringPc')}
              class="inline"
            >
              <input type="hidden" name="id" value={participation.id} />
              <input
                type="hidden"
                name="state"
                value={participation.bringPc.toString()}
              />
              <BringPcBadge bringPc={participation.bringPc} />
            </form>
            {#if participation.delay > 0}
              <span
                class="flex items-center gap-1 text-xs font-bold text-orange-500"
                ><Clock class="h-3 w-3" />
                +{participation.delay >= 60 ? '60' : participation.delay}m</span
              >
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if participation.isPresent}
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size="icon"
                    class={cn(
                      'border-epi-blue/30 bg-epi-blue/10 text-epi-blue hover:bg-epi-blue hover:text-white',
                      focusMode ? 'h-14 w-14' : 'h-12 w-12',
                    )}
                    onclick={handleDownloadClick}
                  >
                    <Award class={focusMode ? 'h-6 w-6' : 'h-5 w-5'} />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p>Télécharger le diplôme</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        {/if}

        <Popover.Root bind:open={delayOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="icon"
                class={cn(
                  focusMode ? 'h-14 w-14' : 'h-12 w-12',
                  participation.delay > 0
                    ? 'border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-900/50 dark:bg-orange-900/30 dark:text-orange-400'
                    : '',
                )}
              >
                <Clock class={focusMode ? 'h-6 w-6' : 'h-5 w-5'} />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content class="w-56 p-3">
            <p class="mb-3 text-xs font-black text-muted-foreground uppercase">
              Signaler un retard
            </p>
            <div class="grid grid-cols-3 gap-2">
              {#each delays as m}
                <form
                  action="?/updateDelay"
                  method="POST"
                  use:enhance={() => {
                    return async ({ update }) => {
                      delayOpen = false;
                      await update();
                    };
                  }}
                >
                  <input type="hidden" name="id" value={participation.id} />
                  <input type="hidden" name="delay" value={m} />
                  <button
                    class={cn(
                      'h-9 w-full rounded-md border text-xs font-bold transition-transform hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 active:scale-95',
                      participation.delay === m
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : '',
                    )}
                  >
                    {m === 60 ? '+' : ''}{m}m
                  </button>
                </form>
              {/each}
            </div>
            <form
              action="?/updateDelay"
              method="POST"
              class="mt-2"
              use:enhance={() => {
                return async ({ update }) => {
                  delayOpen = false;
                  await update();
                };
              }}
            >
              <input type="hidden" name="id" value={participation.id} />
              <input type="hidden" name="delay" value="0" />
              <button
                type="submit"
                class={cn(
                  'flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent text-xs font-bold transition-all hover:scale-102 active:scale-95',
                  participation.delay === 0
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-700',
                )}
              >
                <Check class="h-3.5 w-3.5" />
                Pas de retard
              </button>
            </form>
          </Popover.Content>
        </Popover.Root>

        <form
          bind:this={presenceForm}
          id="presence-form-{participation.id}"
          method="POST"
          action="?/togglePresent"
          use:enhance={optimisticToggle(participation.id, 'isPresent')}
        >
          <input type="hidden" name="id" value={participation.id} />
          <input
            type="hidden"
            name="state"
            value={participation.isPresent.toString()}
          />
          <Button
            type="submit"
            variant={participation.isPresent ? 'default' : 'outline'}
            class={cn(
              'gap-2 transition-all active:scale-95',
              focusMode ? 'h-14 px-5 text-base' : 'h-12 px-4',
              participation.isPresent
                ? 'bg-epi-blue text-white shadow-md hover:bg-epi-blue/90 dark:shadow-none'
                : '',
            )}
          >
            <UserCheck class={focusMode ? 'h-6 w-6' : 'h-5 w-5'} />
            <span class="hidden font-bold sm:inline"
              >{participation.isPresent ? 'Présent' : 'Absent'}</span
            >
          </Button>
        </form>
      </div>
    </div>

    {#if participation.isPresent}
      {#if participation.camperRating}
        <div
          class="mt-4 flex items-start gap-2 rounded-sm bg-slate-50 p-2 dark:bg-slate-900/50"
        >
          <MessageCircleReply
            class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
          />
          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-1.5 text-xs font-bold">
              <span class="text-[9px] text-slate-500 uppercase"
                >Retour campeur :</span
              >
              {#if participation.camperRating === 1}
                <span class="text-red-600 dark:text-red-400">🤯 Difficile</span>
              {:else if participation.camperRating === 2}
                <span class="text-blue-600 dark:text-blue-400">💪 Moyen</span>
              {:else if participation.camperRating === 3}
                <span class="text-teal-600 dark:text-teal-400">🚀 Facile</span>
              {/if}
            </div>
            {#if participation.camperFeedback}
              <p class="text-xs text-slate-600 italic dark:text-slate-400">
                "{participation.camperFeedback}"
              </p>
            {/if}
          </div>
        </div>
      {/if}
      <div class="mt-4 flex items-start gap-3 border-t border-border/50 pt-3">
        <MessageSquareQuote
          class="mt-2 h-5 w-5 shrink-0 text-muted-foreground opacity-50"
        />
        <div class="flex-1 space-y-2">
          <NoteInput
            id={participation.id}
            value={participation.note}
            onSave={triggerXp}
            placeholder="Rédiger une observation pédagogique (ex: Très à l'aise sur les boucles...)"
            class="h-9 border-transparent bg-muted/30 text-sm transition-colors hover:border-border focus:border-epi-blue"
          />
          <!-- Quick Tags for Pedago notes -->
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700 transition-colors hover:bg-green-100 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
              onclick={() => {
                const form = document.querySelector(
                  `#note-form-${participation.id}`,
                ) as HTMLFormElement;
                const input = form?.querySelector(
                  'input[name="note"]',
                ) as HTMLInputElement;
                if (input) {
                  input.value = input.value
                    ? `${input.value} [🚀 Très à l'aise]`
                    : `[🚀 Très à l'aise]`;
                  input.dispatchEvent(new Event('input'));
                }
              }}>🚀 Très à l'aise</button
            >
            <button
              type="button"
              class="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
              onclick={() => {
                const form = document.querySelector(
                  `#note-form-${participation.id}`,
                ) as HTMLFormElement;
                const input = form?.querySelector(
                  'input[name="note"]',
                ) as HTMLInputElement;
                if (input) {
                  input.value = input.value
                    ? `${input.value} [🐢 Besoin de temps]`
                    : `[🐢 Besoin de temps]`;
                  input.dispatchEvent(new Event('input'));
                }
              }}>🐢 Besoin de temps</button
            >
            <button
              type="button"
              class="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 transition-colors hover:bg-orange-100 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40"
              onclick={() => {
                const form = document.querySelector(
                  `#note-form-${participation.id}`,
                ) as HTMLFormElement;
                const input = form?.querySelector(
                  'input[name="note"]',
                ) as HTMLInputElement;
                if (input) {
                  input.value = input.value
                    ? `${input.value}[💻 Pb Setup]`
                    : `[💻 Pb Setup]`;
                  input.dispatchEvent(new Event('input'));
                }
              }}>💻 Pb Setup</button
            >
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes slideUpFade {
    from {
      opacity: 0;
      transform: translateY(15px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .card-entry {
    animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  }
  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  :global(.animate-spin-slow) {
    animation: spin-slow 3s linear infinite;
  }
</style>
