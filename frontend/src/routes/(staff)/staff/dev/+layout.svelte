<script lang="ts">
  import LogOut from '@lucide/svelte/icons/log-out';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import Users from '@lucide/svelte/icons/users';
  import Plus from '@lucide/svelte/icons/plus';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Menu from '@lucide/svelte/icons/menu';
  import History from '@lucide/svelte/icons/history';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import UserCog from '@lucide/svelte/icons/user-cog';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import FileText from '@lucide/svelte/icons/file-text';
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import GlobalCommand from '$lib/components/GlobalCommand.svelte';
  import { track } from '$lib/analytics';
  import { fly, fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { getStaffRoleLabel } from '$lib/domain/staff';
  import type { FlagKey } from '$lib/domain/featureFlags';
  import TicketsLauncher from '$lib/components/tickets/TicketsLauncher.svelte';

  let { children, data } = $props();
  let user = $derived(data.user as any);
  let featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );
  let hasCodingClub = $derived(featureFlags.has('coding_club'));
  // Peda visiting a single interviews route gets a stripped shell — no
  // sidebar, no command-K, no impersonation, no tickets. Just header + main.
  let isInterviewOnly = $derived(data.devLayoutScope === 'interview-only');
  let showFullChrome = $derived(!isInterviewOnly);

  let commandOpen = $state(false);
  let mobileMenuOpen = $state(false);

  const hour = new Date().getHours();
  let baseGreeting = 'Bonjour';
  if (hour >= 18) baseGreeting = 'Bonsoir';
  if (hour < 5) baseGreeting = 'Bonne nuit';

  let displayedGreeting = $state('');

  onMount(() => {
    let i = 0;
    const speed = 75;
    function typeWriter() {
      if (i < baseGreeting.length) {
        displayedGreeting += baseGreeting.charAt(i);
        i++;
        setTimeout(typeWriter, speed);
      }
    }
    setTimeout(typeWriter, 500);
  });

  $effect(() => {
    if (page.url.pathname) {
      mobileMenuOpen = false;
    }
  });

  function isActive(path: string, exact = false) {
    const basePath = resolve('/').replace(/\/$/, '');
    const fullPath = `${basePath}${path}`;
    if (exact || path === '/staff/dev')
      return (
        page.url.pathname === fullPath || page.url.pathname === `${fullPath}/`
      );
    return page.url.pathname.startsWith(fullPath);
  }

  const navLinkClass = (active: boolean) => `
    flex items-center gap-3 px-3 py-2 text-sm font-bold transition-colors rounded-sm cursor-pointer
    ${active ? 'bg-epi-blue text-white' : 'text-sidebar-foreground-muted hover:bg-sidebar-hover hover:text-sidebar-foreground'}
  `;

  function getInitials(user: any) {
    if (user?.name) {
      const parts = user.name.trim().split(' ').filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return user.name.substring(0, 2).toUpperCase();
    }
    return user?.username?.substring(0, 2).toUpperCase() ?? 'AD';
  }
</script>

{#snippet sidebarBrand()}
  <a
    href={resolve('/staff/dev')}
    class="flex flex-col gap-0.5 px-4 py-4 text-sidebar-foreground"
  >
    <span class="font-heading text-2xl leading-none">Jump</span>
    <span
      class="truncate text-xs font-bold tracking-wider text-epi-teal uppercase"
    >
      {getStaffRoleLabel(data.staffProfile?.staffRole)}
    </span>
    {#if data.staffProfile?.campus?.name}
      <span
        class="truncate font-mono text-[10px] tracking-widest text-sidebar-foreground-muted uppercase"
      >
        Campus {data.staffProfile.campus.name}
      </span>
    {/if}
  </a>
{/snippet}

{#snippet sidebarSearch()}
  {#if hasCodingClub && showFullChrome}
    <div class="px-3 pb-2">
      <button
        class="flex h-9 w-full items-center justify-between rounded-sm border border-sidebar-border bg-sidebar-hover px-3 text-sm text-sidebar-foreground-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
        onclick={() => (commandOpen = true)}
      >
        <span class="flex items-center gap-2">
          <Search class="h-4 w-4" />
          <span class="text-xs font-medium">Rechercher un talent...</span>
        </span>
        <kbd
          class="pointer-events-none flex h-5 items-center gap-1 rounded border border-sidebar-border bg-white/10 px-1.5 font-mono text-[10px] font-medium select-none"
        >
          <span class="text-xs">⌘</span>K
        </kbd>
      </button>
    </div>
  {/if}
{/snippet}

{#snippet navMenu()}
  {#if hasCodingClub}
    <div class="sidebar-section-title">
      Overview<span class="text-epi-orange">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/dev')}
        class={navLinkClass(isActive('/staff/dev'))}
      >
        <LayoutDashboard class="h-5 w-5" />
        <span>Dashboard</span>
      </a>
      <a
        href={resolve('/staff/dev/students')}
        class={navLinkClass(isActive('/staff/dev/students'))}
      >
        <Users class="h-5 w-5" />
        <span>Talents</span>
      </a>
      <a
        href={resolve('/staff/dev/events/history')}
        class={navLinkClass(isActive('/staff/dev/events/history'))}
      >
        <History class="h-5 w-5" />
        <span>Événements passés</span>
      </a>
    </nav>
  {/if}

  {#if data.activeStage}
    <div class="sidebar-section-title">
      Stage de Seconde<span class="text-epi-teal">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve(`/staff/dev/events/${data.activeStage.id}`)}
        class={navLinkClass(
          isActive(`/staff/dev/events/${data.activeStage.id}`, true),
        )}
      >
        <LayoutDashboard class="h-5 w-5" />
        <span>Vue d'ensemble</span>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.activeStage.id}/planning`)}
        class={navLinkClass(
          isActive(`/staff/dev/events/${data.activeStage.id}/planning`),
        )}
      >
        <CalendarDays class="h-5 w-5" />
        <span>Planning</span>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.activeStage.id}/inscrits`)}
        class={navLinkClass(
          isActive(`/staff/dev/events/${data.activeStage.id}/inscrits`),
        )}
      >
        <Users class="h-5 w-5" />
        <span>Inscrits</span>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.activeStage.id}/onboarding`)}
        class={navLinkClass(
          isActive(`/staff/dev/events/${data.activeStage.id}/onboarding`),
        )}
      >
        <ClipboardCheck class="h-5 w-5" />
        <span>Onboarding</span>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.activeStage.id}/interviews`)}
        class={navLinkClass(
          isActive(`/staff/dev/events/${data.activeStage.id}/interviews`),
        )}
      >
        <MessageSquare class="h-5 w-5" />
        <span>Entretiens</span>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.activeStage.id}/team`)}
        class={navLinkClass(
          isActive(`/staff/dev/events/${data.activeStage.id}/team`),
        )}
      >
        <GraduationCap class="h-5 w-5" />
        <span>Intervenants</span>
      </a>
      <a
        href={resolve('/staff/dev/contenu/welcome')}
        class={navLinkClass(isActive('/staff/dev/contenu/welcome'))}
      >
        <FileText class="h-5 w-5" />
        <span>Page d'accueil</span>
      </a>
    </nav>
  {/if}

  {#if hasCodingClub}
    <div class="sidebar-section-title">
      Ressources<span class="text-epi-pink">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/dev/catalogue')}
        class={navLinkClass(isActive('/staff/dev/catalogue'))}
      >
        <BookOpen class="h-5 w-5" />
        <span>Catalogue Epitech</span>
      </a>
    </nav>
  {/if}

  <Gated group="devMember" mode="hide">
    <div class="sidebar-section-title">
      Gestion<span class="text-epi-orange">_</span>
    </div>
    <nav class="space-y-1">
      <Gated group="devLead" mode="hide">
        <a
          href={resolve('/staff/dev/team')}
          class={navLinkClass(isActive('/staff/dev/team'))}
        >
          <UserCog class="h-5 w-5" />
          <span>Staff du campus</span>
        </a>
      </Gated>
      <a
        href={resolve('/staff/dev/sync-errors')}
        class={navLinkClass(isActive('/staff/dev/sync-errors'))}
      >
        <TriangleAlert class="h-5 w-5 shrink-0" />
        <span class="flex flex-1 items-center justify-between gap-2">
          <span class="truncate whitespace-nowrap">Doublons Salesforce</span>
          {#if data.syncErrorCounts.urgent > 0}
            <span
              class="inline-flex h-5 shrink-0 items-center justify-center gap-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold whitespace-nowrap text-white"
            >
              <TriangleAlert class="h-3 w-3" />
              {data.syncErrorCounts.total}
            </span>
          {:else if data.syncErrorCounts.total > 0}
            <span
              class="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-bold whitespace-nowrap text-sidebar-foreground-muted"
            >
              {data.syncErrorCounts.total}
            </span>
          {/if}
        </span>
      </a>
    </nav>
  </Gated>

  {#if data.ticketsEnabled}
    <div class="sidebar-section-title">
      Support<span class="text-epi-pink">_</span>
    </div>
    <nav class="space-y-1">
      <a
        href={resolve('/staff/dev/tickets')}
        class={navLinkClass(isActive('/staff/dev/tickets'))}
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

{#snippet sidebarFooter()}
  <div class="border-t border-sidebar-border text-sidebar-foreground">
    <div class="flex items-center justify-between gap-2 p-3">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-sm p-1 transition-colors outline-none hover:bg-sidebar-hover"
        >
          <Avatar.Root class="h-9 w-9 shrink-0 rounded-full bg-white/10">
            <Avatar.Image
              src={user?.image ?? undefined}
              alt={user?.name ?? user?.username ?? ''}
              class="object-cover"
            />
            <Avatar.Fallback class="bg-transparent text-xs font-bold uppercase">
              {getInitials(data.user)}
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="flex min-w-0 flex-1 flex-col items-start text-left">
            <span class="truncate text-sm leading-tight font-bold">
              {user?.name || user?.username}
            </span>
            <span
              class="font-mono text-[10px] leading-tight font-bold text-sidebar-foreground-muted uppercase"
            >
              {displayedGreeting}<span class="animate-pulse">_</span>
            </span>
          </div>
          <ChevronDown class="h-4 w-4 shrink-0 opacity-50" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" side="top" class="w-48 rounded-sm">
          <DropdownMenu.Label>Mon Profil ADM</DropdownMenu.Label>
          <DropdownMenu.Separator />
          <form
            action={resolve('/logout')}
            method="POST"
            onsubmit={() => track('logout', { kind: 'dev' })}
          >
            <button type="submit" class="w-full cursor-pointer">
              <DropdownMenu.Item class="cursor-pointer text-destructive"
                ><LogOut class="mr-2 h-4 w-4" /> Déconnexion</DropdownMenu.Item
              >
            </button>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <ModeToggle />
    </div>
  </div>
{/snippet}

<div
  class="flex h-[calc(100dvh-var(--impersonation-banner-h,0px))] w-full overflow-hidden bg-background"
>
  {#if showFullChrome}
    <aside
      class="app-sidebar hidden w-68 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
    >
      <div class="border-b border-sidebar-border">
        {@render sidebarBrand()}
      </div>
      {@render sidebarSearch()}
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
        {@render navMenu()}
      </div>
      <Gated group="devLead" mode="hide">
        {#if hasCodingClub}
          <div class="border-t border-sidebar-border p-3">
            <Button
              variant="outline"
              class="w-full justify-start border-dashed border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
              href={resolve('/staff/dev/events/import')}
            >
              <Plus class="mr-2 h-4 w-4" />
              Importer un événement
            </Button>
          </div>
        {/if}
      </Gated>
      {@render sidebarFooter()}
    </aside>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    {#if showFullChrome}
      <header
        class="z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4 md:hidden"
      >
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            class="relative h-10 w-10"
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
          <a href={resolve('/staff/dev')} class="flex items-center gap-2">
            <span class="font-heading text-xl leading-none">Jump</span>
            <span
              class="text-[10px] font-bold tracking-wider text-epi-teal-solid uppercase dark:text-epi-teal"
            >
              {getStaffRoleLabel(data.staffProfile?.staffRole)}
            </span>
          </a>
        </div>
        {#if hasCodingClub}
          <Button
            variant="ghost"
            size="icon"
            onclick={() => (commandOpen = true)}
          >
            <Search class="h-5 w-5" />
          </Button>
        {/if}
      </header>
    {/if}

    {#if mobileMenuOpen && showFullChrome}
      <div
        class="absolute inset-0 z-40 bg-black/50 md:hidden"
        transition:fade={{ duration: 200 }}
        onclick={() => (mobileMenuOpen = false)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Escape' && (mobileMenuOpen = false)}
      ></div>
      <aside
        class="absolute inset-y-0 left-0 z-40 flex w-3/4 max-w-75 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl md:hidden"
        transition:fly={{ x: -300, duration: 300 }}
      >
        <div class="border-b border-sidebar-border">
          {@render sidebarBrand()}
        </div>
        {@render sidebarSearch()}
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
          {@render navMenu()}
        </div>
        {#if hasCodingClub}
          <Gated group="devLead" mode="hide">
            <div class="border-t border-sidebar-border p-3">
              <Button
                variant="outline"
                class="w-full justify-center border-dashed border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
                href={resolve('/staff/dev/events/import')}
              >
                <Plus class="mr-2 h-4 w-4" /> Importer un événement
              </Button>
            </div>
          </Gated>
        {/if}
        {@render sidebarFooter()}
      </aside>
    {/if}

    <main class="flex-1 overflow-y-auto bg-background p-4 md:p-8">
      {@render children()}
    </main>
  </div>
</div>

{#if hasCodingClub && showFullChrome}
  <GlobalCommand bind:open={commandOpen} basePath="/staff/dev" />
{/if}

{#if data.ticketsEnabled && showFullChrome}
  <TicketsLauncher basePath="/staff/dev" unreadCount={data.ticketsUnread} />
{/if}
