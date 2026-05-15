<script lang="ts">
  import LogOut from '@lucide/svelte/icons/log-out';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import BookOpenText from '@lucide/svelte/icons/book-open-text';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import FileText from '@lucide/svelte/icons/file-text';
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import GlobalCommand from '$lib/components/GlobalCommand.svelte';
  import { fly, fade } from 'svelte/transition';
  import { resolve } from '$app/paths';
  import {
    getStaffRoleLabel,
    getStaffRoleCampusSuffix,
  } from '$lib/domain/staff';
  import type { FlagKey } from '$lib/domain/featureFlags';
  import TicketsLauncher from '$lib/components/tickets/TicketsLauncher.svelte';
  import { track } from '$lib/analytics';

  let { children, data } = $props();
  let user = $derived(data.user as any);
  let featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );
  let hasCodingClub = $derived(featureFlags.has('coding_club'));

  let mobileMenuOpen = $state(false);
  let commandOpen = $state(false);

  $effect(() => {
    if (page.url.pathname) {
      mobileMenuOpen = false;
    }
  });

  function isActive(path: string) {
    const basePath = resolve('/').replace(/\/$/, '');
    const fullPath = `${basePath}${path}`;
    if (path === '/staff/pedago')
      return (
        page.url.pathname === fullPath || page.url.pathname === `${fullPath}/`
      );
    return page.url.pathname.startsWith(fullPath);
  }

  const navLinkClass = (active: boolean) => `
    flex items-center gap-3 px-3 py-2 text-sm font-bold transition-colors rounded-sm cursor-pointer
    ${active ? 'bg-primary/10 text-epi-blue dark:text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
  `;

  function getInitials(user: any) {
    if (user?.name) {
      const parts = user.name.trim().split(' ').filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return user.name.substring(0, 2).toUpperCase();
    }
    return user?.username?.substring(0, 2).toUpperCase() ?? 'PD';
  }
</script>

{#snippet navMenu()}
  {#if data.staffProfile?.staffRole === 'manta'}
    <div class="sidebar-section-title">
      Terrain<span class="text-foreground">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/pedago')}
        class={navLinkClass(isActive('/staff/pedago'))}
      >
        <LayoutDashboard class="h-5 w-5" />
        <span>Aujourd'hui</span>
      </a>
    </nav>
  {:else}
    <div class="sidebar-section-title">
      Opérations<span class="text-foreground">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/pedago')}
        class={navLinkClass(isActive('/staff/pedago'))}
      >
        <LayoutDashboard class="h-5 w-5" />
        <span>Dashboard Live</span>
      </a>
    </nav>
  {/if}

  {#if data.activeStage}
    <div class="sidebar-section-title">
      Stage de Seconde<span class="text-epi-teal">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve(`/staff/pedago/events/${data.activeStage.id}/planning`)}
        class={navLinkClass(
          isActive(`/staff/pedago/events/${data.activeStage.id}/planning`),
        )}
      >
        <CalendarDays class="h-5 w-5" />
        <span>Planning</span>
      </a>
      <a
        href={resolve(`/staff/pedago/events/${data.activeStage.id}/presences`)}
        class={navLinkClass(
          isActive(`/staff/pedago/events/${data.activeStage.id}/presences`),
        )}
      >
        <UserCheck class="h-5 w-5" />
        <span>Présences</span>
      </a>
      <a
        href={resolve('/staff/pedago/contenu/welcome')}
        class={navLinkClass(isActive('/staff/pedago/contenu/welcome'))}
      >
        <FileText class="h-5 w-5" />
        <span>Page d'accueil</span>
      </a>
    </nav>
  {/if}

  {#if hasCodingClub}
    <div class="sidebar-section-title">
      Ressources<span class="text-foreground">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/pedago/catalogue')}
        class={navLinkClass(isActive('/staff/pedago/catalogue'))}
      >
        <BookOpenText class="h-5 w-5" />
        <span>Sujets & Corrections</span>
      </a>
    </nav>
  {/if}

  {#if data.ticketsEnabled}
    <div class="sidebar-section-title">
      Support<span class="text-epi-pink">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/pedago/tickets')}
        class={navLinkClass(isActive('/staff/pedago/tickets'))}
      >
        <LifeBuoy class="h-5 w-5" />
        <span class="flex flex-1 items-center justify-between">
          <span>Tickets</span>
          {#if data.ticketsUnread > 0}
            <span
              class="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-epi-pink px-1.5 text-[10px] font-bold text-white"
            >
              {data.ticketsUnread}
            </span>
          {/if}
        </span>
      </a>
    </nav>
  {/if}
{/snippet}

<div class="flex h-screen w-full flex-col overflow-hidden bg-background">
  <header
    class="app-header z-50 flex h-15 w-full shrink-0 items-center justify-between border-b border-border bg-header px-4 text-header-foreground shadow-md md:px-6"
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
          <span class="sr-only">Toggle menu</span>
        </Button>
        <a href={resolve('/staff/pedago')} class="flex items-center gap-2">
          <span class="text-lg font-bold uppercase">Jump</span>
          <span
            class="text-xs font-bold tracking-wider text-epi-teal uppercase"
          >
            {getStaffRoleLabel(
              data.staffProfile?.staffRole,
            )}{#if getStaffRoleCampusSuffix(data.staffProfile?.staffRole, data.staffProfile?.campus?.name)}<span
                class="hidden md:inline"
              >
                {getStaffRoleCampusSuffix(
                  data.staffProfile?.staffRole,
                  data.staffProfile?.campus?.name,
                )}</span
              >{/if}
          </span>
        </a>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <ModeToggle />

      <div class="ml-2 flex items-center gap-4">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex cursor-pointer items-center gap-3 transition-opacity outline-none hover:opacity-80"
          >
            <div class="hidden flex-col items-end md:flex">
              <span class="text-sm leading-none font-bold"
                >{user?.name || user?.username}</span
              >
            </div>
            <div class="flex items-center gap-2">
              <Avatar.Root
                class="h-9 w-9 rounded-full border-2 border-epi-blue bg-header-foreground/20 md:h-11 md:w-11"
              >
                <Avatar.Image
                  src={user?.image ?? undefined}
                  alt={user?.name ?? user?.username ?? ''}
                  class="object-cover"
                />
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
            <DropdownMenu.Label>Mon Profil Pédago</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <form
              action={resolve('/logout')}
              method="POST"
              onsubmit={() => track('logout', { kind: 'pedago' })}
            >
              <button type="submit" class="w-full cursor-pointer">
                <DropdownMenu.Item class="cursor-pointer text-destructive"
                  ><LogOut class="mr-2 h-4 w-4" /> Déconnexion</DropdownMenu.Item
                >
              </button>
            </form>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  </header>

  <div class="relative flex flex-1 overflow-hidden">
    <aside
      class="app-sidebar hidden w-62.5 flex-col border-r border-border bg-sidebar md:flex"
    >
      <div class="flex-1 overflow-y-auto p-4">
        {@render navMenu()}
      </div>
    </aside>

    {#if mobileMenuOpen}
      <div
        class="absolute inset-0 z-40 bg-black/50 md:hidden"
        transition:fade={{ duration: 200 }}
        onclick={() => (mobileMenuOpen = false)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Escape' && (mobileMenuOpen = false)}
      ></div>
      <aside
        class="absolute inset-y-0 left-0 z-40 flex w-3/4 max-w-75 flex-col border-r border-border bg-sidebar shadow-2xl md:hidden"
        transition:fly={{ x: -300, duration: 300 }}
      >
        <div class="flex-1 overflow-y-auto p-4">
          {@render navMenu()}
        </div>
      </aside>
    {/if}

    <main class="app-main flex-1 overflow-y-auto bg-background p-4 md:p-8">
      {#if data.viewMode === 'readonly'}
        <div
          class="mb-4 rounded-sm border border-epi-blue/30 bg-epi-blue/10 px-4 py-3 text-sm font-medium text-epi-blue"
        >
          Lecture seule — édition réservée à la péda.
        </div>
      {/if}
      {@render children()}
    </main>
  </div>
</div>

{#if hasCodingClub}
  <GlobalCommand bind:open={commandOpen} basePath="/staff/pedago" />
{/if}

{#if data.ticketsEnabled}
  <TicketsLauncher basePath="/staff/pedago" unreadCount={data.ticketsUnread} />
{/if}
