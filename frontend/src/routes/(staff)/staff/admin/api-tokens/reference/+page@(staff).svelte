<script lang="ts">
  /**
   * The admin API's HTTP reference, rendered by Scalar.
   *
   * It stands alone, outside the admin shell (`@(staff)` skips the admin
   * layout): Scalar brings its own navigation, a sidebar listing every
   * operation, and nested in the admin one it was a second sidebar beside the
   * first, both squeezed into a scrolling `<main>`. What the shell did besides
   * is restated here at its smallest: the gate in `+page.server.ts`, the
   * `admin-space` skin, a way back and the theme switch.
   *
   * Scalar is a Vue application, so it is imported on mount rather than at the
   * top: the chunk is only fetched on this page, and nothing of it runs during
   * server rendering. It is bundled, never loaded from a CDN, because
   * `script-src` allows this origin alone.
   *
   * Everything Scalar would send elsewhere is switched off here rather than left
   * to the CSP to block, so nothing on the page is a button that silently fails:
   * its hosted client, its proxy, its AI chat and MCP generator, its telemetry,
   * its web fonts. Its "try it" requests go to this origin, with the session
   * cookie, so a read answers without a token and a write answers the guard's
   * own refusal until a token is pasted.
   */
  import { resolve } from '$app/paths';
  import { mode } from 'mode-watcher';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import type { createApiReference } from '@scalar/api-reference';

  let { data } = $props();

  type ApiReferenceInstance = ReturnType<typeof createApiReference>;

  let container: HTMLDivElement;

  /**
   * Scalar's palette, pointed at Jump's tokens so the page wears the admin
   * skin and follows the theme without a value of its own. Declared on
   * `.scalar-app` rather than on the body, where Scalar puts its theme: a
   * custom property resolves where it is declared, and only inside
   * `.admin-space` does `--accent-space-ink` mean magenta. The header height
   * is the bar's `h-15`, which is what keeps Scalar's sticky sidebar below it.
   */
  const JUMP_SKIN = `
    .scalar-app {
      --scalar-custom-header-height: calc(var(--spacing) * 15);
      --scalar-font: var(--font-sans);
      --scalar-font-code: var(--font-mono);
      --scalar-radius: var(--radius);
      --scalar-radius-lg: var(--radius-surface);
      --scalar-radius-xl: var(--radius-surface);
      --scalar-background-1: var(--background);
      --scalar-background-2: var(--muted);
      --scalar-background-3: var(--border);
      --scalar-background-card: var(--card);
      --scalar-background-accent: var(--muted);
      --scalar-color-1: var(--foreground);
      --scalar-color-2: var(--muted-foreground);
      --scalar-color-3: var(--muted-foreground);
      --scalar-color-accent: var(--accent-space-ink);
      --scalar-border-color: var(--border);
      --scalar-color-blue: var(--primary);
      --scalar-color-green: var(--success);
      --scalar-color-red: var(--destructive);
      --scalar-color-orange: var(--warning);
      --scalar-color-yellow: var(--warning);
      --scalar-button-1: var(--foreground);
      --scalar-button-1-hover: var(--foreground-secondary);
      --scalar-button-1-color: var(--background);
    }
  `;

  const colorMode = () => (mode.current === 'dark' ? 'dark' : 'light');

  // Both halves of Scalar arrive on demand, and its stylesheet as text rather
  // than as an imported `.css`: it carries rules on `body` in a cascade layer
  // declared after Tailwind's, and a stylesheet SvelteKit links is never
  // unlinked, so those rules would go on painting every page visited after
  // this one. As a `<style>` this page owns, it leaves with the page.
  const loadScalar = () =>
    Promise.all([
      import('@scalar/api-reference'),
      import('@scalar/api-reference/style.css?inline'),
    ]);

  // Scalar reads its colour mode once, when it mounts, and ignores it on a
  // configuration update. So a theme switch mounts it again, which is rare
  // enough on a reference page that keeping the scroll is not worth a second
  // mechanism.
  $effect(() => {
    const forceDarkModeState = colorMode();
    const content = data.document;
    let reference: ApiReferenceInstance | null = null;
    let style: HTMLStyleElement | null = null;
    let cancelled = false;

    loadScalar().then(([scalar, stylesheet]) => {
      if (cancelled) return;
      style = document.createElement('style');
      style.textContent = stylesheet.default;
      document.head.append(style);
      reference = scalar.createApiReference(container, {
        content,
        customCss: JUMP_SKIN,
        theme: 'default',
        withDefaultFonts: false,
        forceDarkModeState,
        hideDarkModeToggle: true,
        hideClientButton: true,
        showDeveloperTools: 'never',
        telemetry: false,
        agent: { disabled: true },
        mcp: { disabled: true },
        // A token pasted into "try it" lives as long as the tab, never in
        // localStorage, where anything else on this origin could read it.
        persistAuth: false,
        authentication: { preferredSecurityScheme: 'bearer' },
        documentDownloadType: 'json',
      });
    });

    return () => {
      cancelled = true;
      reference?.destroy();
      style?.remove();
      // Scalar marks the body with its colour mode and leaves it there.
      document.body.classList.remove('light-mode', 'dark-mode');
    };
  });
</script>

<svelte:head><title>Référence de l'API · Admin</title></svelte:head>

<div class="admin-space min-h-screen bg-background">
  <header
    class="on-dark sticky top-0 z-50 flex h-15 items-center justify-between gap-4 border-b border-chrome-border bg-chrome px-4 md:px-6"
  >
    <BrandMark
      href={resolve('/staff/admin')}
      sublabel="Admin"
      accent="pink"
      orientation="inline"
    />

    <div class="flex items-center gap-2 text-chrome-foreground-muted">
      <a
        href={resolve('/staff/admin/api-tokens')}
        class="inline-flex cursor-pointer items-center gap-1.5 text-sm hover:text-chrome-foreground"
      >
        <ArrowLeft class="h-4 w-4" /> Accès API
      </a>
      <ModeToggle />
    </div>
  </header>

  <div bind:this={container}></div>
</div>
