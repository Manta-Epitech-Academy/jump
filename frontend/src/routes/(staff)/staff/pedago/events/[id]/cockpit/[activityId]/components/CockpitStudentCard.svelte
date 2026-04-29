<script lang="ts">
  import { enhance } from '$app/forms';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import {
    UserCheck,
    Clock,
    LifeBuoy,
    X,
    LockOpen,
    MessageSquareQuote,
    Award,
    Check,
    CircleCheck,
    MessageCircleReply,
    LoaderCircle,
    BrainCircuit,
    Gauge,
    Zap,
    Ellipsis,
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { tick } from 'svelte';
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

  let isNewStudent = $derived(
    (participation.talent?.eventsCount || 0) -
      (participation.isPresent ? 1 : 0) ===
      0,
  );

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

  const delays = [5, 10, 15, 30, 45, 60];

  let menuOpen = $state(false);
  let delayForm = $state<HTMLFormElement | undefined>();
  let pendingDelay = $state('');

  async function pickDelay(m: number) {
    pendingDelay = m.toString();
    menuOpen = false;
    await tick();
    delayForm?.requestSubmit();
  }

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
        isUrgent = diff > 300;
      }, 1000);
      return () => clearInterval(interval);
    } else {
      timerDisplay = '00:00';
      isUrgent = false;
    }
  });

  let showXpAnimation = $state(false);
  function triggerXp() {
    showXpAnimation = true;
    setTimeout(() => {
      showXpAnimation = false;
    }, 1500);
  }

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
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (!isScrolling && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      isSwiping = false;
      isScrolling = true;
      swipeOffset = 0;
      return;
    }
    if (isSwiping && !isScrolling) {
      swipeOffset = dx;
      if (swipeOffset > 100) swipeOffset = 100 + (swipeOffset - 100) * 0.2;
      if (swipeOffset < -100) swipeOffset = -100 + (swipeOffset + 100) * 0.2;
    }
  }

  function handleTouchEnd() {
    if (!isSwiping) return;
    isSwiping = false;
    if (swipeOffset > 75 && !participation.isPresent)
      presenceForm?.requestSubmit();
    else if (swipeOffset < -75 && participation.isPresent)
      presenceForm?.requestSubmit();
    swipeOffset = 0;
  }
</script>

<div
  class="relative touch-pan-y overflow-hidden rounded-sm bg-muted shadow-sm"
  style="animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards; animation-delay: {Math.min(
    index * 50,
    500,
  )}ms"
>
  <div
    class="absolute inset-0 z-0 flex items-center justify-between px-6 text-lg font-bold"
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

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={cn(
      'relative z-10 flex h-full w-full flex-col border-y border-r border-y-border border-r-border bg-card transition-transform',
      needsHelpProgress
        ? isUrgent
          ? 'border-l-4 border-l-red-500'
          : 'border-l-4 border-l-epi-orange'
        : participation.isPresent
          ? 'border-l-4 border-l-epi-blue'
          : 'border-l-4 border-l-transparent opacity-75',
      !isSwiping && 'duration-200 ease-out',
    )}
    style="transform: translateX({swipeOffset}px);"
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
  >
    {#if showXpAnimation}
      <div
        class="pointer-events-none absolute top-1/2 right-12 z-50 flex animate-[xp-float_1.5s_ease-out] items-center justify-center font-heading text-2xl font-black text-epi-orange drop-shadow-md"
      >
        +10 XP
      </div>
    {/if}

    {#if needsHelpProgress && helpStep}
      <div
        class={cn(
          'flex items-center justify-between px-5 py-2 text-white',
          isUrgent ? 'bg-red-500' : 'bg-epi-orange',
        )}
      >
        <div class="flex items-center gap-3">
          <LifeBuoy
            class={cn('h-4 w-4', isUrgent ? 'animate-ping' : 'animate-bounce')}
          />
          <span class="text-xs font-bold tracking-widest uppercase"
            >Alerte : {helpStep.title}</span
          >
        </div>
        <div class="flex items-center gap-3">
          <span class="font-mono text-xs font-bold">{timerDisplay}</span>
          <div class="flex gap-1">
            <form action="?/dismissAlert" method="POST" use:enhance>
              <input
                type="hidden"
                name="progressId"
                value={needsHelpProgress.id}
              /><Button
                type="submit"
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-white hover:bg-white/20"
                ><X class="h-3 w-3" /></Button
              >
            </form>
            <form
              action="?/unlockStep"
              method="POST"
              use:enhance={() => {
                isUnlocking = true;
                return async ({ result, update }) => {
                  isUnlocking = false;
                  if (result.type === 'success') triggerXp();
                  await update();
                };
              }}
            >
              <input
                type="hidden"
                name="progressId"
                value={needsHelpProgress.id}
              /><Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={isUnlocking}
                class="h-6 rounded-sm px-2 text-[10px] font-bold text-epi-orange hover:bg-white/90"
                >{#if isUnlocking}<LoaderCircle
                    class="mr-1 h-3 w-3 animate-spin"
                  />{:else}<LockOpen class="mr-1 h-3 w-3" />{/if} Débloquer</Button
              >
            </form>
          </div>
        </div>
      </div>
    {/if}

    <div
      class={cn(
        'flex items-center justify-between gap-4',
        focusMode ? 'p-6' : 'p-5',
      )}
    >
      <div class="flex flex-1 items-center gap-5">
        <a
          href={resolve(`/staff/pedago/students/${participation.talent?.id}`)}
          class="relative block transition-transform hover:scale-105"
        >
          <span
            class="block rounded-full"
            style:view-transition-name={participation.talent?.id
              ? `student-avatar-${participation.talent.id}`
              : undefined}
          >
            <Avatar.Root
              class={cn(
                'border-2',
                focusMode ? 'h-14 w-14' : 'h-12 w-12',
                needsHelpProgress
                  ? 'border-epi-orange'
                  : participation.isPresent
                    ? participation.delay > 0
                      ? 'border-orange-400'
                      : 'border-epi-blue'
                    : 'border-muted',
              )}
            >
              <Avatar.Fallback class="bg-muted font-bold text-muted-foreground"
                >{(participation.talent?.nom?.[0] ?? '').toUpperCase()}{(
                  participation.talent?.prenom?.[0] ?? ''
                ).toUpperCase()}</Avatar.Fallback
              >
            </Avatar.Root>
          </span>
          {#if participation.isPresent}
            <div
              class={cn(
                'absolute -right-1 -bottom-1 rounded-full p-0.5 ring-2 ring-card',
                needsHelpProgress
                  ? 'bg-epi-orange text-white'
                  : participation.delay > 0
                    ? 'bg-orange-400 text-white'
                    : 'bg-epi-blue text-white',
              )}
            >
              {#if needsHelpProgress}<LifeBuoy
                  class="h-3 w-3 animate-[spin-slow_3s_linear_infinite]"
                />{:else if participation.delay > 0}<Clock
                  class="h-3 w-3"
                />{:else}<CircleCheck class="h-3 w-3" />{/if}
            </div>
          {/if}
        </a>

        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <a
              href={resolve(
                `/staff/pedago/students/${participation.talent?.id}`,
              )}
              class="text-base leading-none font-bold tracking-tight uppercase hover:text-epi-blue"
            >
              <span>{participation.talent?.nom}</span>
              <span class="capitalize"
                >{formatFirstName(participation.talent?.prenom)}</span
              >
            </a>
            {#if isNewStudent}<Badge
                variant="secondary"
                class="px-1.5 py-0 text-[9px] tracking-widest text-muted-foreground uppercase"
                >Nouveau</Badge
              >{/if}
          </div>
          <div class="mt-1.5 flex items-center gap-3">
            <span
              class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
              >{participation.talent?.niveau}</span
            >
            <form
              method="POST"
              action="?/toggleBringPc"
              use:enhance={optimisticToggle(participation.id, 'bringPc')}
              class="inline"
            >
              <input type="hidden" name="id" value={participation.id} /><input
                type="hidden"
                name="state"
                value={participation.bringPc.toString()}
              /><BringPcBadge bringPc={participation.bringPc} />
            </form>
            {#if participation.delay > 0}<span
                class="flex items-center gap-1 text-[10px] font-bold text-orange-500 uppercase"
                ><Clock class="h-3 w-3" /> +{participation.delay >= 60
                  ? '60'
                  : participation.delay}m</span
              >{/if}
          </div>
        </div>
      </div>

      <form
        bind:this={delayForm}
        action="?/updateDelay"
        method="POST"
        use:enhance
        class="hidden"
      >
        <input type="hidden" name="id" value={participation.id} />
        <input type="hidden" name="delay" value={pendingDelay} />
      </form>

      <div class="flex items-center gap-3">
        <form
          bind:this={presenceForm}
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
              'w-32 gap-2 transition-all active:scale-95',
              focusMode ? 'h-12' : 'h-10',
              participation.isPresent &&
                'bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90',
            )}
          >
            <UserCheck class={focusMode ? 'h-5 w-5' : 'h-4 w-4'} />
            <span class="font-bold"
              >{participation.isPresent ? 'Présent' : 'Absent'}</span
            >
          </Button>
        </form>

        <DropdownMenu.Root bind:open={menuOpen}>
          <DropdownMenu.Trigger
            class={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'border border-border/50 text-muted-foreground hover:bg-muted/50',
              focusMode ? 'h-12 w-12' : 'h-10 w-10',
            )}
          >
            <Ellipsis class="h-5 w-5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-48 rounded-sm">
            {#if participation.isPresent}
              <DropdownMenu.Item
                onclick={handleDownloadClick}
                class="cursor-pointer rounded-sm font-medium"
              >
                <Award class="mr-2 h-4 w-4 text-epi-blue" /> Générer Diplôme
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Label
                class="text-[10px] tracking-widest text-muted-foreground uppercase"
                >Signaler un retard</DropdownMenu.Label
              >
              <div class="grid grid-cols-3 gap-1 p-1">
                {#each delays as m}
                  <DropdownMenu.Item
                    onclick={() => pickDelay(m)}
                    class={cn(
                      'flex cursor-pointer justify-center rounded-sm px-0 text-xs font-bold',
                      participation.delay === m &&
                        'bg-orange-500 text-white focus:bg-orange-500 focus:text-white',
                    )}
                  >
                    {m}m
                  </DropdownMenu.Item>
                {/each}
              </div>
              <DropdownMenu.Item
                onclick={() => pickDelay(0)}
                class={cn(
                  'flex cursor-pointer justify-center gap-2 rounded-sm text-xs font-bold',
                  participation.delay === 0
                    ? 'bg-green-100 text-green-700 focus:bg-green-100 focus:text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'text-green-600 focus:bg-green-50 dark:focus:bg-green-950',
                )}
              >
                <Check class="h-3 w-3" /> Ponctuel
              </DropdownMenu.Item>
            {:else}
              <DropdownMenu.Item disabled class="text-xs text-muted-foreground"
                >Talent absent.</DropdownMenu.Item
              >
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>

    {#if participation.isPresent}
      <div class="border-t border-border bg-muted/10 px-5 py-4">
        {#if participation.camperRating}
          <div
            class="mb-4 flex items-start gap-3 rounded-sm border border-border/50 bg-card p-3 shadow-sm"
          >
            <MessageCircleReply
              class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50"
            />
            <div>
              <div class="flex items-center gap-2 text-xs font-bold">
                <span class="text-muted-foreground">Retour Camper :</span>
                {#if participation.camperRating === 1}<span
                    class="flex items-center gap-1 text-red-500"
                    ><BrainCircuit class="h-3.5 w-3.5" /> Difficile</span
                  >
                {:else if participation.camperRating === 2}<span
                    class="flex items-center gap-1 text-blue-500"
                    ><Gauge class="h-3.5 w-3.5" /> Moyen</span
                  >
                {:else if participation.camperRating === 3}<span
                    class="flex items-center gap-1 text-epi-teal-solid"
                    ><Zap class="h-3.5 w-3.5" /> Facile</span
                  >{/if}
              </div>
              {#if participation.camperFeedback}<p
                  class="mt-1 text-xs text-muted-foreground italic"
                >
                  "{participation.camperFeedback}"
                </p>{/if}
            </div>
          </div>
        {/if}

        <div class="flex items-start gap-3">
          <MessageSquareQuote
            class="mt-2 h-5 w-5 shrink-0 text-muted-foreground/40"
          />
          <div class="flex-1 space-y-2">
            <NoteInput
              id={participation.id}
              value={participation.note}
              onSave={triggerXp}
              placeholder="Observation pédagogique..."
              class="h-10 rounded-sm border-transparent bg-card text-sm focus:border-epi-blue"
            />
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700 transition-colors hover:bg-green-100 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
                onclick={() => {
                  const i = document.querySelector(
                    `#note-form-${participation.id} input[name="note"]`,
                  ) as HTMLInputElement;
                  if (i) {
                    i.value = i.value
                      ? `${i.value} [✨ Très à l'aise]`
                      : `[✨ Très à l'aise]`;
                    i.dispatchEvent(new Event('input'));
                  }
                }}>✨ Très à l'aise</button
              >
              <button
                type="button"
                class="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                onclick={() => {
                  const i = document.querySelector(
                    `#note-form-${participation.id} input[name="note"]`,
                  ) as HTMLInputElement;
                  if (i) {
                    i.value = i.value
                      ? `${i.value}[⏳ Besoin de temps]`
                      : `[⏳ Besoin de temps]`;
                    i.dispatchEvent(new Event('input'));
                  }
                }}>⏳ Besoin de temps</button
              >
              <button
                type="button"
                class="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 transition-colors hover:bg-orange-100 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40"
                onclick={() => {
                  const i = document.querySelector(
                    `#note-form-${participation.id} input[name="note"]`,
                  ) as HTMLInputElement;
                  if (i) {
                    i.value = i.value
                      ? `${i.value} [🔧 Pb Setup]`
                      : `[🔧 Pb Setup]`;
                    i.dispatchEvent(new Event('input'));
                  }
                }}>🔧 Pb Setup</button
              >
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes -global-slideUpFade {
    from {
      opacity: 0;
      transform: translateY(15px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes -global-xp-float {
    0% {
      opacity: 0;
      transform: translateY(0) scale(0.9);
    }
    20% {
      opacity: 1;
      transform: translateY(-10px) scale(1.1);
    }
    80% {
      opacity: 1;
      transform: translateY(-30px) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-40px) scale(0.9);
    }
  }
  @keyframes -global-spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
