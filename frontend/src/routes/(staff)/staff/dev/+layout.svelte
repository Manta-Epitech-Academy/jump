<script lang="ts">
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Users from '@lucide/svelte/icons/users';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import UserCog from '@lucide/svelte/icons/user-cog';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import FileText from '@lucide/svelte/icons/file-text';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import { track, secondsBetween } from '$lib/analytics';
  import { fly, fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { can } from '$lib/domain/permissions';
  import type { FlagKey } from '$lib/domain/featureFlags';
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
  let featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );
  let hasCampusTeam = $derived(featureFlags.has('staff_campus_team'));
  let hasWelcomePage = $derived(featureFlags.has('staff_welcome_page'));
  let isLead = $derived(can('devLead', data.staffProfile?.staffRole));

  // The cohort workspace: the events this campus configured (those with ≥1
  // module). The "current" event is the one in the URL when it is one of them,
  // else the resolved default. Its module set drives which surfaces the sidebar
  // shows; switching events re-renders the nav for the picked event.
  let workspace = $derived(data.workspace);
  // Remember the last event actually browsed. A talent fiche is campus-scoped, so
  // its URL carries a talent id, not an event id; without this the sidebar would
  // snap from the event you were in back to the resolved default the instant you
  // open a profile. Resolution order: the event in the path, an explicit `?event=`
  // (the entretiens fiche link sets it, so a reload or deep-link stays put), the
  // last event browsed this session, then the resolved default.
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
  // The "Gestion" section shows when it has at least one entry: the lead-only
  // "Staff du campus" (behind its flag). Event module config moved to the admin
  // space, so there is no per-event config entry here.
  let showManagement = $derived(isLead && hasCampusTeam);
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
  <BrandMark
    href={resolve('/staff/dev')}
    tagline="Gestion des stages et du coding club"
    campus={data.staffProfile?.campus?.name}
  />
{/snippet}

{#snippet navMenu()}
  {#if currentEvent}
    {@const ev = currentEvent}
    <!-- The event in view is the section heading (underscore motif). With more
         than one workspace event, a small "go to" button beside it opens the
         picker - the title stays the prominent label, the switcher is demoted. -->
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
      <!-- Surfaces are per event, not campus flags, so two events on one campus
           can expose different pages. The reachable set folds the module rows
           with the data gates (planning needs a schedule, bilan needs a live
           form) in one place (`reachableSurfaces`), so this nav, the event
           switcher and the dev landing all agree on what a dev can open. Labels
           stay event-type-agnostic, so the dev space shows coding clubs too. -->
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
      {#if hasWelcomePage}
        <a
          href={resolve('/staff/dev/contenu/welcome')}
          class={navLinkClass(isActive('/staff/dev/contenu/welcome'))}
        >
          <FileText class="h-5 w-5" />
          <span>Page d'accueil</span>
        </a>
      {/if}
    </nav>
  {/if}

  {#if showManagement}
    <div class="sidebar-section-title">
      Gestion<span class="text-epi-orange">_</span>
    </div>
    <nav class="space-y-1">
      {#if hasCampusTeam}
        <Gated group="devLead" mode="hide">
          <a
            href={resolve('/staff/dev/team')}
            class={navLinkClass(isActive('/staff/dev/team'))}
          >
            <UserCog class="h-5 w-5" />
            <span>Staff du campus</span>
          </a>
        </Gated>
      {/if}
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
    {@render sidebarFooter()}
  </aside>

  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
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
