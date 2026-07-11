<script lang="ts">
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Users from '@lucide/svelte/icons/users';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import School from '@lucide/svelte/icons/school';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import { track, secondsBetween } from '$lib/analytics';
  import { fly, fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import ImpersonationCard from '$lib/components/ImpersonationCard.svelte';
  import EventWorkspaceSwitcher from '$lib/components/dev/EventWorkspaceSwitcher.svelte';
  import {
    reachableSurfaces,
    surfaceSegment,
    surfaceLabel,
    type EventSurfaceKey,
  } from '$lib/domain/eventModules';
  import { eventDisplayName } from '$lib/domain/event';

  // Icons live with the component (Svelte components can't sit in the domain
  // layer); order/label/reachability are single-sourced in `eventModules`.
  const SURFACE_ICONS: Record<EventSurfaceKey, typeof Users> = {
    inscrits: Users,
    emargement: UserCheck,
    planning: CalendarDays,
    bilan: MessageSquareText,
    entretiens: MessageSquare,
  };

  let { children, data } = $props();
  let user = $derived(data.user as any);

  let workspace = $derived(data.workspace);
  let lastEventId = $state<string | null>(null);
  $effect(() => {
    const id = page.params.id;
    if (id && workspace.events.some((e) => e.id === id)) lastEventId = id;
  });
  let currentEvent = $derived(
    workspace.events.find((e) => e.id === page.params.id) ??
      workspace.events.find(
        (e) => e.id === page.url.searchParams.get('event'),
      ) ??
      workspace.events.find((e) => e.id === lastEventId) ??
      workspace.current,
  );

  let selectedSchoolYear = $state('');

  // Sync state with URL search param or current event's year
  $effect(() => {
    const param = page.url.searchParams.get('year');
    if (param) {
      selectedSchoolYear = param;
    } else if (currentEvent) {
      selectedSchoolYear = currentEvent.schoolYear.label;
    } else {
      // Calculate current actual school year as fallback
      const now = new Date();
      const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
      selectedSchoolYear = `${y}/${y + 1}`;
    }
  });

  const schoolYears = $derived.by(() => {
    const seen = new Set<string>();
    for (const e of workspace.events) {
      seen.add(e.schoolYear.label);
    }
    if (seen.size === 0) {
      const now = new Date();
      const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
      seen.add(`${y}/${y + 1}`);
    }
    return [...seen].sort((a, b) => b.localeCompare(a));
  });

  function changeSchoolYear(year: string) {
    const url = new URL(page.url);
    url.searchParams.set('year', year);
    // If we are currently viewing an event, and that event doesn't belong to the chosen year, we redirect back to stats
    if (currentEvent && currentEvent.schoolYear.label !== year) {
      goto(resolve(`/staff/dev/stats?year=${year}`));
    } else {
      goto(url.pathname + url.search);
    }
  }

  let eventSearchQuery = $state('');

  let filteredYearEvents = $derived(
    workspace.events.filter((e) => {
      // Filter by selected school year
      if (e.schoolYear.label !== selectedSchoolYear) return false;
      // Filter by search query
      const query = eventSearchQuery.toLowerCase();
      return (
        e.titre.toLowerCase().includes(query) ||
        (e.publicName && e.publicName.toLowerCase().includes(query))
      );
    }),
  );

  const monthYearSidebarFmt = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  let groupedYearEvents = $derived.by(() => {
    const map = new Map<
      string,
      { label: string; events: typeof workspace.events }
    >();
    for (const e of filteredYearEvents) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = monthYearSidebarFmt.format(d);
      const entry = map.get(key) ?? { label: monthLabel, events: [] };
      entry.events.push(e);
      map.set(key, entry);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([_, entry]) => entry);
  });

  const isActiveEvent = $derived(
    Boolean(page.params.id) ||
      (page.url.pathname.includes('/events/') &&
        !page.url.pathname.endsWith('/events')),
  );

  let mobileMenuOpen = $state(false);

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  });

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

  const SURFACE_LABELS: Record<string, string> = {
    inscrits: 'Inscrits',
    emargement: 'Présences',
    planning: 'Planning',
    bilan: 'Bilan',
    entretiens: 'Entretiens',
  };

  const activeSurfaceLabel = $derived.by(() => {
    const pathname = page.url.pathname;
    const parts = pathname.split('/');
    const last = parts[parts.length - 1];
    return SURFACE_LABELS[last] || null;
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
  <BrandMark
    href={resolve('/staff/dev')}
    tagline="Gestion des stages et du coding club"
  />
{/snippet}

{#snippet navMenu()}
  <div class="sidebar-section-title">
    Vue Globale<span class="text-epi-blue">_</span>
  </div>
  <nav class="mb-4 space-y-1">
    <a
      href={resolve(`/staff/dev/stats?year=${selectedSchoolYear}`)}
      class={navLinkClass(isActive('/staff/dev/stats'))}
    >
      <LayoutDashboard class="h-4 w-4" />
      <span>Tableau de bord</span>
    </a>
    <a
      href={resolve(`/staff/dev/calendar?year=${selectedSchoolYear}`)}
      class={navLinkClass(isActive('/staff/dev/calendar'))}
    >
      <CalendarRange class="h-4 w-4" />
      <span>Planning annuel</span>
    </a>
  </nav>

  {#if isActiveEvent && currentEvent}
    <div class="sidebar-section-title flex items-center justify-between">
      <span>Événement Actif</span>
      <span class="text-epi-teal">_</span>
    </div>
    <div
      class="mb-3 rounded-sm border border-sidebar-border bg-sidebar-hover/20 p-3 text-xs"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-1 flex-col">
          <span
            class="truncate font-semibold text-sidebar-foreground"
            title={eventDisplayName(currentEvent)}
          >
            {eventDisplayName(currentEvent)}
          </span>
          <span class="mt-0.5 text-[10px] text-sidebar-foreground-muted">
            {dateFmt.format(new Date(currentEvent.date))}
          </span>
        </div>
        {#if workspace.events.filter((e) => e.schoolYear.label === selectedSchoolYear).length > 1}
          <EventWorkspaceSwitcher
            events={workspace.events}
            currentId={currentEvent.id}
          />
        {/if}
      </div>
    </div>
    <nav class="ml-2 space-y-1 border-l border-sidebar-border/30 pl-2">
      {#each reachableSurfaces(currentEvent) as key (key)}
        {@const seg = surfaceSegment(key)}
        {@const Icon = SURFACE_ICONS[key]}
        <a
          href={resolve(`/staff/dev/events/${currentEvent.id}/${seg}`)}
          class={navLinkClass(
            isActive(`/staff/dev/events/${currentEvent.id}/${seg}`),
          )}
        >
          <Icon class="h-4 w-4" />
          <span>{surfaceLabel(key)}</span>
        </a>
      {/each}
    </nav>
  {:else}
    <div class="sidebar-section-title flex items-center justify-between">
      <span>Événements</span>
      <span
        class="rounded-full bg-sidebar-border px-1.5 py-0.5 font-mono text-[9px] text-sidebar-foreground"
      >
        {filteredYearEvents.length}
      </span>
    </div>

    {#if workspace.events.filter((e) => e.schoolYear.label === selectedSchoolYear).length > 5}
      <div class="px-3 pb-2">
        <input
          type="text"
          placeholder="Rechercher..."
          bind:value={eventSearchQuery}
          class="w-full rounded-sm border border-sidebar-border/60 bg-sidebar-hover/30 px-2 py-1.5 text-xs text-sidebar-foreground transition-colors outline-none placeholder:text-sidebar-foreground-muted/60 focus:border-sidebar-border"
        />
      </div>
    {/if}

    <nav class="mb-6 max-h-[340px] space-y-3 overflow-y-auto pr-1">
      {#each groupedYearEvents as group}
        <div class="space-y-1">
          <div
            class="px-3 text-[9px] font-bold tracking-wider text-sidebar-foreground-muted/50 capitalize uppercase select-none"
          >
            {group.label}
          </div>
          {#each group.events as e (e.id)}
            <a
              href={resolve(
                `/staff/dev/events/${e.id}/${surfaceSegment(reachableSurfaces(e)[0])}`,
              )}
              class="group flex items-center gap-3 rounded-sm px-3 py-2 text-xs font-bold text-sidebar-foreground-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
            >
              <div class="flex min-w-0 flex-1 flex-col">
                <span
                  class="truncate font-semibold text-sidebar-foreground group-hover:text-sidebar-foreground"
                  >{eventDisplayName(e)}</span
                >
                <span class="mt-0.5 text-[9px] text-muted-foreground"
                  >{dateFmt.format(new Date(e.date))}</span
                >
              </div>
              <ChevronRight
                class="h-3.5 w-3.5 shrink-0 text-sidebar-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-sidebar-foreground"
              />
            </a>
          {/each}
        </div>
      {:else}
        <div class="px-3 py-6 text-center text-xs text-muted-foreground">
          {#if workspace.events.filter((e) => e.schoolYear.label === selectedSchoolYear).length === 0}
            Aucun événement cette année.
          {:else}
            Aucun résultat pour "{eventSearchQuery}".
          {/if}
        </div>
      {/each}
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
            onsubmit={() =>
              track('logout', {
                kind: 'dev',
                sessionDurationSec: secondsBetween(
                  page.data.session?.createdAt as Date | string | undefined,
                ),
              })}
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

<div class="flex h-dvh w-full overflow-hidden bg-background">
  <aside
    class="app-sidebar hidden w-68 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
  >
    <div class="border-b border-sidebar-border">
      {@render sidebarBrand()}
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
      {@render navMenu()}
    </div>
    <ImpersonationCard />
  </aside>

  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <!-- Desktop Header -->
    <header
      class="hidden h-14 w-full shrink-0 items-center justify-between border-b border-border bg-card px-8 md:flex"
    >
      <!-- Breadcrumbs -->
      <div
        class="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
      >
        <span class="text-epi-blue">Espace dev</span>
        <span class="text-muted-foreground/40">/</span>
        {#if isActiveEvent && currentEvent}
          <a
            href={resolve(
              `/staff/dev/events/${currentEvent.id}/${surfaceSegment(reachableSurfaces(currentEvent)[0])}`,
            )}
            class="max-w-[200px] truncate text-muted-foreground transition-colors hover:text-epi-blue hover:underline"
          >
            {eventDisplayName(currentEvent)}
          </a>
          {#if activeSurfaceLabel}
            <span class="text-muted-foreground/40">/</span>
            <span class="text-epi-teal">{activeSurfaceLabel}</span>
          {/if}
        {:else}
          <span class="text-epi-teal">Vue Globale</span>
        {/if}
      </div>

      <!-- Context Selectors -->
      <div class="flex items-center gap-3">
        <!-- Campus Badge -->
        <div
          class="flex h-9 items-center gap-2 rounded-sm border border-border bg-background px-3 text-xs font-bold text-foreground select-none"
        >
          <School class="h-4 w-4 text-muted-foreground" />
          <span>{data.staffProfile?.campus?.name || 'Marseille'}</span>
        </div>

        <!-- Academic Year Dropdown -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted/50"
          >
            <CalendarDays class="h-4 w-4 text-muted-foreground" />
            <span>{selectedSchoolYear}</span>
            <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-48 rounded-sm">
            <DropdownMenu.Label>Année Scolaire</DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#each schoolYears as year}
              <DropdownMenu.Item
                class="cursor-pointer text-xs {selectedSchoolYear === year
                  ? 'bg-accent font-bold'
                  : ''}"
                onclick={() => changeSchoolYear(year)}
              >
                {year}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <!-- User Profile Dropdown -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-border bg-background pr-3 pl-2 text-xs font-bold text-foreground hover:bg-muted/50"
          >
            <Avatar.Root class="h-6 w-6 rounded-full bg-muted">
              <Avatar.Image
                src={user?.image ?? undefined}
                alt={user?.name ?? ''}
                class="object-cover"
              />
              <Avatar.Fallback
                class="bg-transparent text-[10px] font-bold uppercase"
              >
                {getInitials(data.user)}
              </Avatar.Fallback>
            </Avatar.Root>
            <span class="max-w-[120px] truncate"
              >{user?.name || user?.username}</span
            >
            <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-48 rounded-sm">
            <DropdownMenu.Label>Mon Profil ADM</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <form
              action={resolve('/logout')}
              method="POST"
              onsubmit={() =>
                track('logout', {
                  kind: 'dev',
                  sessionDurationSec: secondsBetween(
                    page.data.session?.createdAt as Date | string | undefined,
                  ),
                })}
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
    </header>

    <!-- Mobile Header -->
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
        <BrandMark
          href={resolve('/staff/dev')}
          tone="auto"
          orientation="inline"
          campus={data.staffProfile?.campus?.name}
        />
      </div>
    </header>

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
        class="absolute inset-y-0 left-0 z-40 flex w-3/4 max-w-75 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl md:hidden"
        transition:fly={{ x: -300, duration: 300 }}
      >
        <div class="border-b border-sidebar-border">
          {@render sidebarBrand()}
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
          {@render navMenu()}
        </div>
        <ImpersonationCard />
        {@render sidebarFooter()}
      </aside>
    {/if}

    <main class="flex-1 overflow-y-auto bg-background p-4 md:p-8">
      {@render children()}
    </main>
  </div>
</div>
