<!--
  The universal talent header. Every talent page renders this so the chrome is
  identical everywhere: the Epitech logo (home) on the left and the three account
  controls (theme · settings · logout) on the right form a top "app bar" that is
  the same on the dashboard and on every page below it.

  The identity slot sits right of the logo — the dashboard greeting (`lead`) or
  the page title — in the same position on every page, and wraps below the
  controls on mobile just like the dashboard greeting.

  Three variants:
    - 'home': dashboard only. The identity slot carries the greeting (`lead`);
      there is no second row and no back link (you are already home).
    - 'flow' (default): transparent app bar plus a context row (back link + page
      actions) at the top of a centered content column (history, settings,
      minigame, leaderboard).
    - 'bar': same two rows, but the app bar gets a bordered full-width shell for
      full-height `h-dvh` pages whose body scrolls under it (calendar, activity).

  `lead`    — home greeting shown in the identity slot.
  `actions` — page-specific controls (week nav, portfolio…), shown on the context
              row, kept separate from the universal account controls.

  The back target is always the dashboard: this is the canonical "back home"
  header. Only the label is configurable.
-->
<script lang="ts">
  import type { Snippet, Component } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { cn } from '$lib/utils';
  import { track, secondsBetween } from '$lib/analytics';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import { Button } from '$lib/components/ui/button';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Settings from '@lucide/svelte/icons/settings';
  import LogOut from '@lucide/svelte/icons/log-out';

  let {
    title,
    subtitle,
    icon: Icon,
    backLabel = 'Tableau de bord',
    variant = 'flow',
    actions,
    lead,
    class: className,
  }: {
    title?: string;
    subtitle?: string;
    icon?: Component<{ class?: string }>;
    backLabel?: string;
    variant?: 'home' | 'flow' | 'bar';
    actions?: Snippet;
    lead?: Snippet;
    class?: string;
  } = $props();

  const isHome = $derived(variant === 'home');
  const isBar = $derived(variant === 'bar');
</script>

<header
  class={cn(
    isBar
      ? 'shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-8 dark:border-slate-800 dark:bg-slate-900'
      : isHome
        ? 'mb-6'
        : 'mb-8',
    className,
  )}
>
  <!-- App bar: brand + page identity + account controls. The identity slot wraps
       below the controls on mobile, exactly like the dashboard greeting. -->
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-3 sm:flex-nowrap sm:gap-x-4"
  >
    <a href={resolve('/')} aria-label="Accueil" class="shrink-0">
      <EpitechLogo class="h-8 w-auto" />
    </a>

    {#if lead || title}
      <div
        class="hidden h-8 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-800"
        aria-hidden="true"
      ></div>
      <div class="order-last w-full min-w-0 sm:order-none sm:w-auto">
        {#if lead}
          {@render lead()}
        {:else if title}
          <div class="flex items-center gap-2.5">
            {#if Icon}
              <Icon class="h-6 w-6 shrink-0 text-epi-blue sm:h-7 sm:w-7" />
            {/if}
            <div class="min-w-0">
              <h1
                class={cn(
                  'truncate font-heading tracking-tight text-slate-900 uppercase dark:text-white',
                  isBar ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl',
                )}
              >
                {title}<span class="text-epi-teal">_</span>
              </h1>
              {#if subtitle}
                <p class="truncate text-xs font-medium text-slate-500">
                  {subtitle}
                </p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-1">
      <ModeToggle />
      <Button
        variant="ghost"
        size="icon"
        href={resolve('/settings')}
        class="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <Settings class="h-4 w-4" />
        <span class="sr-only">Paramètres</span>
      </Button>
      <form
        action="{resolve('/logout')}?type=student"
        method="POST"
        onsubmit={() =>
          track('logout', {
            kind: 'talent',
            sessionDurationSec: secondsBetween(
              page.data.session?.createdAt as Date | string | undefined,
            ),
          })}
      >
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-slate-400 hover:text-destructive"
        >
          <LogOut class="h-4 w-4" />
          <span class="sr-only">Déconnexion</span>
        </Button>
      </form>
    </div>
  </div>

  <!-- Context row: explicit way back + page-specific actions. -->
  {#if !isHome}
    <div
      class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <a
        href={resolve('/')}
        class="-ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold tracking-wide text-slate-500 uppercase transition-colors hover:text-epi-blue focus-visible:ring-2 focus-visible:ring-epi-blue/40 focus-visible:outline-none"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
        {backLabel}
      </a>
      {#if actions}
        <div class="flex shrink-0 items-center gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  {/if}
</header>
