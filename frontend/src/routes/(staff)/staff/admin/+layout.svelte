<script lang="ts">
  import { page } from '$app/state';
  import { scrollTopOnNavigate } from '$lib/actions/scrollTopOnNavigate';
  import { resolve } from '$app/paths';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Settings from '@lucide/svelte/icons/settings';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import Search from '@lucide/svelte/icons/search';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Avatar from '$lib/components/ui/avatar';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import StaffSettingsDialog from '$lib/components/layout/StaffSettingsDialog.svelte';
  import StaffApiTokensDialog from '$lib/components/layout/StaffApiTokensDialog.svelte';
  import AdminCommand from '$lib/components/admin/AdminCommand.svelte';
  import {
    ADMIN_NAV,
    type AdminNavItem,
    type AdminBadgeKey,
  } from '$lib/components/admin/adminNav';
  import { fly, fade } from 'svelte/transition';
  import { track, secondsBetween } from '$lib/analytics';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  let { children, data } = $props();

  let mobileMenuOpen = $state(false);
  let settingsOpen = $state(false);
  let apiTokensOpen = $state(false);
  let commandOpen = $state(false);

  // Close the mobile menu on page navigation
  $effect(() => {
    if (page.url.pathname) {
      mobileMenuOpen = false;
    }
  });

  const ADMIN_HOME = resolve('/staff/admin');

  // Entries carry already-resolved hrefs, so highlight by comparing them
  // directly against the current pathname.
  function isActive(href: string, activeExclude?: string) {
    const path = page.url.pathname;
    if (href === ADMIN_HOME) {
      // The dashboard href is a prefix of every admin route, so it must match
      // exactly rather than by prefix.
      return path === href || path === `${href}/`;
    }
    // Avoid double-highlight when a child route has its own sidebar entry
    // (e.g. `/broadcasts/templates` shouldn't keep `/broadcasts` active).
    if (activeExclude && path.startsWith(activeExclude)) {
      return false;
    }
    return path.startsWith(href);
  }

  // The sidebar owns badge counts (it has the load data); the config only names
  // the slot. `danger` picks the red treatment reserved for conflicts.
  function badgeFor(key: AdminBadgeKey): {
    count: number;
    danger: boolean;
    title?: string;
  } {
    switch (key) {
      case 'authConflicts':
        return {
          count: data.authConflictsPending,
          danger: true,
          title: `${data.authConflictsPending} conflit(s) d'identité de connexion à résoudre`,
        };
      case 'deletions':
        return { count: data.deletionRequestsPending, danger: false };
    }
  }

  const navLinkClass = (active: boolean) => `
		flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-ui rounded-r-md cursor-pointer
		${
      active
        ? 'bg-accent-space/10 text-accent-space-ink border-l-4 border-accent-space'
        : 'text-chrome-foreground-muted hover:bg-chrome-hover hover:text-chrome-foreground border-l-4 border-transparent'
    }
	`;
</script>

{#snippet navLink(item: AdminNavItem)}
  {@const Icon = item.icon}
  <a
    href={item.href}
    class={navLinkClass(isActive(item.href, item.activeExclude))}
  >
    <Icon class="h-4 w-4" />
    {#if item.badge}
      {@const badge = badgeFor(item.badge)}
      <span class="flex flex-1 items-center justify-between">
        <span>{item.label}</span>
        {#if badge.count > 0}
          <span
            class="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold {badge.danger
              ? 'bg-destructive text-status-foreground'
              : 'bg-accent-space text-epi-dark'}"
            title={badge.title}
          >
            {badge.count}
          </span>
        {/if}
      </span>
    {:else}
      <span>{item.label}</span>
    {/if}
  </a>
{/snippet}

{#snippet navMenu()}
  {#each ADMIN_NAV as section, i (section.title)}
    <div class="mb-2 px-6 epi-overline text-chrome-foreground-muted">
      {section.title}<TitleCursor />
    </div>
    <nav class="space-y-1 {i < ADMIN_NAV.length - 1 ? 'mb-8' : ''}">
      {#each section.items as item (item.href)}
        {@render navLink(item)}
      {/each}
    </nav>
  {/each}
{/snippet}

<div
  class="admin-space flex h-screen w-full flex-col overflow-hidden bg-background"
>
  <!-- Admin Header -->
  <header
    class="on-dark z-50 flex h-15 w-full shrink-0 items-center justify-between border-b border-chrome-border bg-chrome px-4 md:px-6"
  >
    <div class="flex items-center gap-4">
      <Button
        variant="ghost"
        size="icon"
        class="relative h-10 w-10 text-chrome-foreground-muted hover:bg-chrome-hover hover:text-chrome-foreground md:hidden"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
      >
        <Menu
          class="absolute h-6 w-6 transition-ui duration-300 {mobileMenuOpen
            ? 'scale-0 opacity-0'
            : 'scale-100 opacity-100'}"
        />
        <X
          class="absolute h-6 w-6 transition-ui duration-300 {mobileMenuOpen
            ? 'scale-100 rotate-0 opacity-100'
            : 'scale-0 -rotate-90 opacity-0'}"
        />
        <span class="sr-only">Toggle menu</span>
      </Button>

      <BrandMark
        href={resolve('/staff/admin')}
        sublabel="Admin"
        accent="pink"
        orientation="inline"
      />
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-9 gap-2 rounded-sm text-chrome-foreground-muted hover:bg-chrome-hover hover:text-chrome-foreground"
        onclick={() => (commandOpen = true)}
        aria-label="Rechercher une personne"
      >
        <Search class="h-4 w-4" />
        <span class="hidden text-xs sm:inline">Rechercher</span>
        <kbd
          class="hidden rounded border border-chrome-border bg-epi-dark px-1.5 text-xs text-chrome-foreground-muted sm:inline"
          >⌘K</kbd
        >
      </Button>

      <ModeToggle />

      <div class="ml-2 flex items-center gap-4">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex cursor-pointer items-center gap-3 transition-opacity hover:opacity-80"
          >
            <div class="hidden flex-col items-end md:flex">
              <span class="epi-overline font-bold text-chrome-foreground-muted">
                Superuser
              </span>
              <span class="text-sm font-bold text-chrome-foreground-muted"
                >{data.user?.email}</span
              >
            </div>
            <Avatar.Root
              class="h-9 w-9 rounded-sm border border-chrome-border bg-epi-dark"
            >
              <Avatar.Image
                src={data.user?.image ?? undefined}
                alt={data.user?.name ?? data.user?.email ?? 'Admin'}
                class="object-cover"
              />
              <Avatar.Fallback
                class="rounded-sm bg-epi-dark text-accent-space-ink"
              >
                <ShieldAlert class="h-4 w-4" />
              </Avatar.Fallback>
            </Avatar.Root>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-48 rounded-sm">
            <DropdownMenu.Label class="text-xs text-muted-foreground uppercase"
              >Session Globale</DropdownMenu.Label
            >
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              class="cursor-pointer"
              onSelect={() => (settingsOpen = true)}
            >
              <Settings class="mr-2 h-4 w-4" />
              Paramètres
            </DropdownMenu.Item>
            <DropdownMenu.Item
              class="cursor-pointer"
              onSelect={() => (apiTokensOpen = true)}
            >
              <KeyRound class="mr-2 h-4 w-4" />
              Accès API
            </DropdownMenu.Item>
            <form
              action="{resolve('/logout')}?type=admin"
              method="POST"
              onsubmit={() =>
                track('logout', {
                  kind: 'admin',
                  sessionDurationSec: secondsBetween(
                    page.data.session?.createdAt as Date | string | undefined,
                  ),
                })}
            >
              <button type="submit" class="w-full cursor-pointer">
                <DropdownMenu.Item
                  class="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut class="mr-2 h-4 w-4" />
                  Fermer la session
                </DropdownMenu.Item>
              </button>
            </form>
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <StaffSettingsDialog
          bind:open={settingsOpen}
          form={data.settingsForm}
          outboundTrapped={data.outboundTrapped}
          canArmRealSends={data.canArmRealSends}
          armedRealSends={data.armedRealSends}
          armedRealSendsUntil={data.armedRealSendsUntil}
          devRedirectPin={data.devRedirectPin}
          devRedirectPinTo={data.devRedirectPinTo}
        />

        <StaffApiTokensDialog
          bind:open={apiTokensOpen}
          form={data.apiTokenForm}
          tokens={data.apiTokens}
          currentUserId={data.user.id}
          dailyQuota={data.apiTokenDailyQuota}
          writeQuota={data.apiTokenWriteQuota}
        />
      </div>
    </div>
  </header>

  <div class="relative flex flex-1 overflow-hidden">
    <!-- Desktop Admin Sidebar -->
    <aside
      class="on-dark hidden w-64 flex-col border-r border-chrome-border bg-chrome md:flex"
    >
      <div class="flex-1 overflow-y-auto py-6 pr-4">
        {@render navMenu()}
      </div>
    </aside>

    <!-- Mobile Admin Sidebar Overlay -->
    {#if mobileMenuOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute inset-0 z-40 bg-black/80 md:hidden"
        transition:fade={{ duration: 200 }}
        onclick={() => (mobileMenuOpen = false)}
      ></div>

      <aside
        class="on-dark absolute inset-y-0 left-0 z-40 flex w-3/4 max-w-xs flex-col border-r border-chrome-border bg-chrome shadow-overlay md:hidden"
        transition:fly={{ x: -300, duration: 300 }}
      >
        <div class="flex-1 overflow-y-auto py-6 pr-2">
          {@render navMenu()}
        </div>
      </aside>
    {/if}

    <main
      class="flex-1 overflow-y-auto bg-background p-4 md:p-8"
      use:scrollTopOnNavigate
    >
      {@render children()}
    </main>
  </div>

  <AdminCommand bind:open={commandOpen} />
</div>
