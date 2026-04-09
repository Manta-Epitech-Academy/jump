<script lang="ts">
  import {
    LogOut,
    LayoutDashboard,
    Users,
    Cuboid,
    Plus,
    ChevronDown,
    Menu,
    History,
    Search,
    X,
    MapPin,
    Languages,
  } from '@lucide/svelte';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import GlobalCommand from '$lib/components/GlobalCommand.svelte';
  import { fly, fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { m } from '$lib/paraglide/messages.js';
  import { i18nHref } from '$lib/utils';
  import { getLocale, setLocale } from '$lib/paraglide/runtime';
  let { children, data } = $props();
  let user = $derived(data.user as any);

  let commandOpen = $state(false);
  let mobileMenuOpen = $state(false);

  // Time-based greeting logic
  const hour = new Date().getHours();
  let baseGreeting = m.greeting_morning();
  if (hour >= 18) baseGreeting = m.greeting_evening();
  if (hour < 5) baseGreeting = m.greeting_night();

  let displayedGreeting = $state('');

  onMount(() => {
    let i = 0;
    const speed = 75; // Typing speed in ms

    function typeWriter() {
      if (i < baseGreeting.length) {
        displayedGreeting += baseGreeting.charAt(i);
        i++;
        setTimeout(typeWriter, speed);
      }
    }

    // Initial delay before typing starts
    setTimeout(typeWriter, 500);
  });

  // Close mobile menu on navigation
  $effect(() => {
    if (page.url.pathname) {
      mobileMenuOpen = false;
    }
  });

  // resolve('/') gives the base-prefixed root (e.g. '/tekcamp/')
  // Strip trailing slash to avoid double-slashes when concatenating with path
  function isActive(path: string) {
    const basePath = resolve('/').replace(/\/$/, '');
    const fullPath = path === '/' ? basePath || '/' : `${basePath}${path}`;
    if (path === '/')
      return (
        page.url.pathname === fullPath || page.url.pathname === `${fullPath}/`
      );
    return page.url.pathname.startsWith(fullPath);
  }

  const navLinkClass = (active: boolean) => `
		flex items-center gap-3 px-3 py-2 text-sm font-bold transition-colors rounded-sm cursor-pointer
		${
      active
        ? 'bg-primary/10 text-epi-blue dark:text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }
	`;

  function getInitials(user: any) {
    if (user?.name) {
      const parts = user.name.trim().split(' ').filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return user.name.substring(0, 2).toUpperCase();
    }
    return user?.username?.substring(0, 2).toUpperCase() ?? 'AD';
  }

  function getAvatarUrl(user: any) {
    // TODO: implement S3 file storage
    return undefined;
  }
</script>

{#snippet navMenu()}
  <div class="sidebar-section-title">
    {m.nav_overview()}<span class="text-epi-orange">_</span>
  </div>
  <nav class="space-y-1">
    <a href={i18nHref('/')} class={navLinkClass(isActive('/'))}>
      <LayoutDashboard class="h-5 w-5" />
      <span>{m.nav_dashboard()}</span>
    </a>
    <a
      href={i18nHref('/events/history')}
      class={navLinkClass(isActive('/events/history'))}
    >
      <History class="h-5 w-5" />
      <span>{m.nav_history()}</span>
    </a>
  </nav>

  <div class="sidebar-section-title">
    {m.nav_management()}<span class="text-epi-teal">_</span>
  </div>
  <nav class="space-y-1">
    <a href={i18nHref('/students')} class={navLinkClass(isActive('/students'))}>
      <Users class="h-5 w-5" />
      <span>{m.nav_students()}</span>
    </a>
    <a href={i18nHref('/subjects')} class={navLinkClass(isActive('/subjects'))}>
      <Cuboid class="h-5 w-5" />
      <span>{m.nav_subjects()}</span>
    </a>
  </nav>
{/snippet}

<div class="flex h-screen w-full flex-col overflow-hidden bg-background">
  <!-- HEADER (FULL WIDTH) -->
  <header
    class="z-50 flex h-15 w-full shrink-0 items-center justify-between border-b border-border bg-header px-4 text-header-foreground shadow-md md:px-6"
  >
    <div class="flex items-center gap-4 md:gap-8">
      <div class="flex items-center gap-2 md:gap-4">
        <Button
          variant="ghost"
          size="icon"
          class="relative h-12 w-12 text-inherit md:hidden"
          onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
        >
          <Menu
            class="absolute h-6! w-6! transition-all duration-300 {mobileMenuOpen
              ? 'scale-0 opacity-0'
              : 'scale-100 opacity-100'}"
          />
          <X
            class="absolute h-6! w-6! transition-all duration-300 {mobileMenuOpen
              ? 'scale-100 rotate-0 opacity-100'
              : 'scale-0 -rotate-90 opacity-0'}"
          />
          <span class="sr-only">{m.nav_toggle_menu()}</span>
        </Button>
        <a href={i18nHref('/')} class="flex items-center gap-2">
          <span class="text-lg font-bold uppercase">TekCamp</span>
          {#if data.staffProfile?.campus?.name}
            <span
              class="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-header-foreground/90 uppercase md:inline-block"
            >
              {data.staffProfile.campus.name}
            </span>
          {/if}
        </a>
      </div>

      <!-- VISUAL SEARCH TRIGGER -->
      <button
        class="hidden h-9 w-64 items-center justify-between rounded-sm border border-header-foreground/20 bg-header-foreground/10 px-3 text-sm text-header-foreground/70 transition-colors hover:bg-header-foreground/20 md:flex"
        onclick={() => (commandOpen = true)}
      >
        <span class="flex items-center gap-2">
          <Search class="h-4 w-4" />
          <span class="text-xs font-medium">{m.nav_search_placeholder()}</span>
        </span>
        <kbd
          class="pointer-events-none flex h-5 items-center gap-1 rounded border border-header-foreground/20 bg-header-foreground/10 px-1.5 font-mono text-[10px] font-medium opacity-100 select-none"
        >
          <span class="text-xs">⌘</span>K
        </kbd>
      </button>
    </div>

    <div class="flex items-center gap-2">
      <!-- Mobile Search Icon Only -->
      <Button
        variant="ghost"
        size="icon"
        class="text-inherit hover:bg-white/20 hover:text-inherit md:hidden"
        onclick={() => (commandOpen = true)}
      >
        <Search class="h-5 w-5" />
      </Button>

      <!-- Theme Toggle -->
      <ModeToggle />

      <div class="ml-2 flex items-center gap-4">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex cursor-pointer items-center gap-3 transition-opacity outline-none hover:opacity-80"
          >
            <!-- Greeting & Name Stack -->
            <div class="hidden flex-col items-end md:flex">
              <span
                class="font-mono text-[10px] font-bold text-header-foreground/80 uppercase"
              >
                {displayedGreeting}<span class="animate-pulse">_</span>
              </span>
              <span class="text-sm leading-none font-bold"
                >{user?.name || user?.username}</span
              >
            </div>

            <div class="flex items-center gap-2">
              <Avatar.Root
                class="h-9 w-9 rounded-full bg-header-foreground/20 md:h-11 md:w-11"
              >
                {#if user?.avatar}
                  <Avatar.Image
                    src={getAvatarUrl(user)}
                    alt={user.name ?? user.username}
                    class="object-cover"
                  />
                {/if}
                <Avatar.Fallback
                  class="bg-transparent text-xs font-bold text-header-foreground uppercase"
                >
                  {getInitials(data.user)}
                </Avatar.Fallback>
              </Avatar.Root>

              <ChevronDown class="hidden h-4 w-4 opacity-50 md:block" />
            </div>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-48 rounded-sm">
            <DropdownMenu.Label>{m.nav_my_profile()}</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <a href={`${i18nHref('/onboarding')}?change=true`}>
              <DropdownMenu.Item class="cursor-pointer">
                <MapPin class="mr-2 h-4 w-4" />
                {m.nav_change_campus()}
              </DropdownMenu.Item>
            </a>
            <DropdownMenu.Separator />
            <DropdownMenu.Label class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              <Languages class="mr-1 inline h-3 w-3" />
              {m.nav_language()}
            </DropdownMenu.Label>
            <DropdownMenu.Item class="cursor-pointer {getLocale() === 'fr' ? 'font-bold text-epi-blue' : ''}" onclick={() => setLocale('fr')}>
              Français
            </DropdownMenu.Item>
            <DropdownMenu.Item class="cursor-pointer {getLocale() === 'en' ? 'font-bold text-epi-blue' : ''}" onclick={() => setLocale('en')}>
              English
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <form action={resolve('/logout')} method="POST">
              <button type="submit" class="w-full cursor-pointer">
                <DropdownMenu.Item class="cursor-pointer text-destructive">
                  <LogOut class="mr-2 h-4 w-4" />
                  {m.nav_logout()}
                </DropdownMenu.Item>
              </button>
            </form>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  </header>

  <div class="relative flex flex-1 overflow-hidden">
    <!-- DESKTOP SIDEBAR -->
    <aside
      class="hidden w-62.5 flex-col border-r border-border bg-sidebar md:flex"
    >
      <div class="flex-1 overflow-y-auto p-4">
        {@render navMenu()}
      </div>

      <div class="border-t border-border p-4">
        <Button
          variant="outline"
          class="w-full justify-start border-dashed"
          href={i18nHref('/events/new')}
        >
          <Plus class="mr-2 h-4 w-4" />
          {m.nav_new_event()}
        </Button>
      </div>
    </aside>

    <!-- MOBILE SIDEBAR OVERLAY -->
    {#if mobileMenuOpen}
      <!-- Backdrop -->
      <div
        class="absolute inset-0 z-40 bg-black/50 md:hidden"
        transition:fade={{ duration: 200 }}
        onclick={() => (mobileMenuOpen = false)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Escape' && (mobileMenuOpen = false)}
      ></div>

      <!-- Drawer -->
      <aside
        class="absolute inset-y-0 left-0 z-40 flex w-3/4 max-w-75 flex-col border-r border-border bg-sidebar shadow-2xl md:hidden"
        transition:fly={{ x: -300, duration: 300 }}
      >
        <div class="flex-1 overflow-y-auto p-4">
          {@render navMenu()}
        </div>
        <div class="border-t border-border p-4">
          <Button
            variant="outline"
            class="w-full justify-center border-dashed"
            href={i18nHref('/events/new')}
          >
            <Plus class="mr-2 h-4 w-4" />
            {m.nav_new_event()}
          </Button>
        </div>
      </aside>
    {/if}

    <!-- PAGE CONTENT -->
    <main class="flex-1 overflow-y-auto bg-background p-4 md:p-8">
      {@render children()}
    </main>
  </div>
</div>

<GlobalCommand bind:open={commandOpen} />
