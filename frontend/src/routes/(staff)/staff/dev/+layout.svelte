<script lang="ts">
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Users from '@lucide/svelte/icons/users';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
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
  import { schoolYearOf } from '$lib/domain/schoolYear';

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

  // The academic year shown in the header: a context readout of the event in
  // view, falling back to the live school year only when the campus has no
  // events. Single-sourced through `schoolYearOf` so the label format matches
  // the events' own `schoolYear.label`.
  const selectedSchoolYear = $derived(
    currentEvent?.schoolYear.label ??
      schoolYearOf(new Date(), data.timezone).label,
  );

  const schoolYears = $derived.by(() => {
    const seen = new Set<string>();
    for (const e of workspace.events) {
      seen.add(e.schoolYear.label);
    }
    if (seen.size === 0) {
      seen.add(schoolYearOf(new Date(), data.timezone).label);
    }
    return [...seen].sort((a, b) => b.localeCompare(a));
  });

  // Picking a year is a context jump: land on that year's first event (its first
  // reachable surface). A year with no reachable event leaves you where you are.
  function changeSchoolYear(year: string) {
    if (currentEvent?.schoolYear.label === year) return;
    const target = workspace.events
      .filter((e) => e.schoolYear.label === year && reachableSurfaces(e).length)
      .sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )[0];
    if (!target) return;
    const seg = surfaceSegment(reachableSurfaces(target)[0]);
    goto(resolve(`/staff/dev/events/${target.id}/${seg}`));
  }

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
    class="flex items-center gap-2.5 px-4 py-4.5 text-white transition-opacity hover:opacity-95"
  >
    <EpitechLogo tone="dark" class="h-7 w-auto shrink-0" />
    <span class="font-heading text-lg leading-none">
      Jump<span class="text-epi-teal">_</span>
    </span>
  </a>
{/snippet}

{#snippet navMenu()}
  {#if currentEvent}
    {@const ev = currentEvent}
    <!-- The event in view is the section heading (underscore motif). The switcher
         sits inline to its right, demoted: the event name stays the label. -->
    <div class="sidebar-section-title flex items-center gap-1.5">
      <span class="flex min-w-0 flex-1 items-baseline">
        <span class="truncate">{eventDisplayName(ev)}</span>
        <span class="text-epi-teal">_</span>
      </span>
      {#if workspace.events.length > 1}
        <EventWorkspaceSwitcher events={workspace.events} currentId={ev.id} />
      {/if}
    </div>
    <nav class="space-y-1">
      {#each reachableSurfaces(ev) as key (key)}
        {@const seg = surfaceSegment(key)}
        {@const Icon = SURFACE_ICONS[key]}
        <a
          href={resolve(`/staff/dev/events/${ev.id}/${seg}`)}
          class={navLinkClass(isActive(`/staff/dev/events/${ev.id}/${seg}`))}
        >
          <Icon class="h-5 w-5" />
          <span>{surfaceLabel(key)}</span>
        </a>
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
          <DropdownMenu.Label>Mon profil</DropdownMenu.Label>
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
      <!-- Left Context (Campus) -->
      {#if data.staffProfile?.campus?.name}
        <div
          class="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase select-none"
        >
          <School class="h-4 w-4 text-epi-blue" />
          <span class="font-bold text-epi-blue">
            {data.staffProfile.campus.name}
          </span>
        </div>
      {:else}
        <div></div>
      {/if}

      <!-- Context Selectors -->
      <div class="flex items-center gap-3">
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
            <DropdownMenu.Label>Année scolaire</DropdownMenu.Label>
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
            <DropdownMenu.Label>Mon profil</DropdownMenu.Label>
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
