<!--
  The talent app bar. Every in-app talent page renders this at the very top, so
  the chrome is pixel-identical wherever it appears: the Epitech logo and the
  JUMP_ wordmark (home) flush to the left, as the 2027 mockup draws them, and
  the account controls (sleep, theme, settings, logout) flush to the right,
  each named by a tooltip since an icon alone does not say what it does. The header is transparent (no background or border) and sits in
  normal flow, never sticky or fixed: on a flowing page it scrolls with the body,
  and on a full-height (`h-dvh`) page it stays put because an inner pane scrolls
  under it, not the header itself. Its content is centered at the talent content
  width (max-w-5xl) so the logo and controls line up with the page body. It is
  structurally the same on every page, so navigating from one page to another
  never moves it an inch.

  One optional, page-specific extra layers ON the fixed bar without shifting it:
  a page title in a second row, preceded by a back button. `subtitle`, `icon`
  and `actions` decorate that row. Omit `title` and there is no second row at
  all (the dashboard).

  The first row is the same on every page, content included: that is the part
  that must not move. The dashboard once put « Salut, {prenom} » in it; the
  mockup gave that greeting to the duck, who stops to say it when the talent
  arrives, and a row that changed width from page to page moved his water too.

  The talent's EpiDuck (#539) swims in the first row's free space, between the
  wordmark and the controls, with his sleep button beside the theme switch.
  He takes that space without adding height: he rises into the top padding.

  Props:
    title     page title; when set, renders the back + title second row.
    subtitle  secondary line under the title.
    icon      icon shown left of the title.
    backHref  back-button target (default the dashboard, '/').
    backLabel accessible label for the back button (default 'Retour').
    actions   page controls on the right of the second row (week nav, etc.).
-->
<script lang="ts">
  import type { Snippet, Component } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { cn } from '#lib/utils.ts';
  import { track, secondsBetween } from '#lib/analytics.ts';
  import EpitechLogo from '#lib/components/layout/EpitechLogo.svelte';
  import ModeToggle from '#lib/components/ModeToggle.svelte';
  import { Button } from '#lib/components/ui/button/index.ts';
  import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Settings from '@lucide/svelte/icons/settings';
  import LogOut from '@lucide/svelte/icons/log-out';
  import TitleCursor from '#lib/components/layout/TitleCursor.svelte';
  import MascotLane from '#lib/components/mascot/MascotLane.svelte';
  import MascotSleepButton from '#lib/components/mascot/MascotSleepButton.svelte';

  let {
    title,
    subtitle,
    icon: Icon,
    backHref = resolve(''),
    backLabel = 'Retour',
    actions,
    class: className,
  }: {
    title?: string;
    subtitle?: string;
    icon?: Component<{ class?: string }>;
    backHref?: string;
    backLabel?: string;
    actions?: Snippet;
    class?: string;
  } = $props();
</script>

<header class={cn('shrink-0', className)}>
  <!-- Transparent header: content centered at the talent width so the logo and
       controls line up with the page body and sit in the same spot everywhere. -->
  <div class="mx-auto w-full max-w-5xl px-4 py-4 md:px-8">
    <!-- Row 1: brand + duck + account controls. Identical on every page. On
         a phone the wordmark gives its room to the duck: the logo already
         says where you are. -->
    <div class="flex items-center gap-x-3 sm:gap-x-4">
      <a
        href={resolve('')}
        aria-label="Accueil"
        class="flex shrink-0 items-center gap-3 sm:gap-4"
      >
        <EpitechLogo class="h-8 w-auto" />
        <span class="hidden h-8 w-px bg-muted sm:block" aria-hidden="true"
        ></span>
        <span
          class="hidden font-heading text-display-m leading-none text-foreground sm:block"
          aria-hidden="true">JUMP<TitleCursor /></span
        >
      </a>

      <MascotLane />

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <MascotSleepButton />
        <ModeToggle />
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                href={resolve('settings')}
                class="h-8 w-8 text-muted-foreground hover:text-foreground-secondary"
              >
                <Settings class="h-4 w-4" />
                <span class="sr-only">Paramètres</span>
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom"><p>Paramètres</p></Tooltip.Content>
        </Tooltip.Root>
        <form
          action="{resolve('logout')}?type=student"
          method="POST"
          onsubmit={() =>
            track('logout', {
              kind: 'talent',
              sessionDurationSec: secondsBetween(
                page.data.session?.createdAt as Date | string | undefined,
              ),
            })}
        >
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  type="submit"
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <LogOut class="h-4 w-4" />
                  <span class="sr-only">Déconnexion</span>
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom"><p>Déconnexion</p></Tooltip.Content>
          </Tooltip.Root>
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
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <a
                  {...props}
                  href={backHref}
                  aria-label={backLabel}
                  class="-ml-1 inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-epi-blue"
                >
                  <ArrowLeft class="h-5 w-5" />
                </a>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom"><p>{backLabel}</p></Tooltip.Content>
          </Tooltip.Root>
          <div class="flex min-w-0 items-center gap-2.5">
            {#if Icon}
              <Icon class="h-6 w-6 shrink-0 text-epi-blue" />
            {/if}
            <div class="min-w-0">
              <h1
                class="display-truncate font-heading text-display-s text-foreground sm:text-display-m"
              >
                {title}<TitleCursor />
              </h1>
              {#if subtitle}
                <p class="truncate text-xs font-medium text-muted-foreground">
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
