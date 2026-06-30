<!--
  The talent app bar. Every in-app talent page renders this at the very top, so
  the chrome is pixel-identical wherever it appears: the Epitech logo (home)
  flush to the left and the account controls (theme, settings, logout) flush to
  the right. The header is transparent (no background or border) and sits in
  normal flow, never sticky or fixed: on a flowing page it scrolls with the body,
  and on a full-height (`h-dvh`) page it stays put because an inner pane scrolls
  under it, not the header itself. Its content is centered at the talent content
  width (max-w-5xl) so the logo and controls line up with the page body. It is
  structurally the same on every page, so navigating from one page to another
  never moves it an inch.

  Two optional, page-specific extras layer ON the fixed bar without shifting it:
    - lead   a greeting in the first row, between the logo and the controls. The
             dashboard's "Salut, {prenom}" is the one thing unique to home; it
             wraps to its own line on mobile so a long name never truncates.
    - title  a page title in a second row, preceded by a back button. `subtitle`,
             `icon` and `actions` decorate that row. Omit `title` and there is no
             second row at all (the dashboard, which carries a `lead` instead).

  Whatever those extras are, the first row (logo + controls) keeps the same
  position and height on every page — that is the part that must not move.

  Props:
    title     page title; when set, renders the back + title second row.
    subtitle  secondary line under the title.
    icon      icon shown left of the title.
    backHref  back-button target (default the dashboard, '/').
    backLabel accessible label for the back button (default 'Retour').
    actions   page controls on the right of the second row (week nav, portfolio…).
    lead      home greeting shown in the first row.
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
    backHref = resolve('/'),
    backLabel = 'Retour',
    actions,
    lead,
    class: className,
  }: {
    title?: string;
    subtitle?: string;
    icon?: Component<{ class?: string }>;
    backHref?: string;
    backLabel?: string;
    actions?: Snippet;
    lead?: Snippet;
    class?: string;
  } = $props();
</script>

<header class={cn('shrink-0', className)}>
  <!-- Transparent header: content centered at the talent width so the logo and
       controls line up with the page body and sit in the same spot everywhere. -->
  <div class="mx-auto w-full max-w-5xl px-4 py-4 md:px-8">
    <!-- Row 1: brand + greeting + account controls. Fixed on every page. -->
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-3 sm:flex-nowrap sm:gap-x-4"
    >
      <a href={resolve('/')} aria-label="Accueil" class="shrink-0">
        <EpitechLogo class="h-8 w-auto" />
      </a>

      {#if lead}
        <div
          class="hidden h-8 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-800"
          aria-hidden="true"
        ></div>
        <div class="order-last w-full min-w-0 sm:order-none sm:w-auto">
          {@render lead()}
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

    <!-- Row 2: back + page title, with page actions on the right. Only when the
       page carries a title; the dashboard and the game page have none. -->
    {#if title}
      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        <div class="flex min-w-0 items-center gap-2 sm:gap-3">
          <a
            href={backHref}
            aria-label={backLabel}
            class="-ml-1 inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-epi-blue focus-visible:ring-2 focus-visible:ring-epi-blue/40 focus-visible:outline-none dark:hover:bg-slate-800"
          >
            <ArrowLeft class="h-5 w-5" />
          </a>
          <div class="flex min-w-0 items-center gap-2.5">
            {#if Icon}
              <Icon class="h-6 w-6 shrink-0 text-epi-blue" />
            {/if}
            <div class="min-w-0">
              <!-- `truncate` is overflow-hidden, and the condensed uppercase
                   heading carries its accents (É) above the cap line, so a tight
                   line box slices their tops. py/-my grows the clip box
                   symmetrically while leaving the box's outer size and its
                   vertical centring against the icon unchanged. -->
              <h1
                class="-my-1.5 truncate py-1.5 font-heading text-xl tracking-tight text-slate-900 uppercase sm:text-2xl dark:text-white"
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
        </div>
        {#if actions}
          <div class="flex shrink-0 items-center gap-2">
            {@render actions()}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</header>
