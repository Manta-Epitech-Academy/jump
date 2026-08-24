<script lang="ts">
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
  import SchoolYearMenu from '$lib/components/dev/SchoolYearMenu.svelte';
  import {
    landingSurface,
    reachableSurfaces,
    surfaceFromPath,
    surfaceSegment,
    surfaceLabel,
    type EventSurfaceKey,
  } from '$lib/domain/eventModules';
  import {
    defaultEventOfYear,
    eventsOfSchoolYear,
    navigableSchoolYears,
    type DevWorkspaceEvent,
  } from '$lib/domain/devWorkspace';
  import { eventDisplayName } from '$lib/domain/event';
  import { schoolYearOf } from '$lib/domain/schoolYear';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

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

  /** The years you can actually go to. Empty on a campus with no event, which
      leaves the menu as the readout `selectedSchoolYear` already falls back to. */
  const schoolYears = $derived(navigableSchoolYears(workspace.events));

  /** The active year's events: the switcher's whole list, and what decides
      whether there is anything to switch between. */
  const yearEvents = $derived(
    eventsOfSchoolYear(workspace.events, selectedSchoolYear),
  );

  /** The surface in view, so a context change keeps you on it. Derived once
      here rather than in each control, for the same reason as the year. */
  const openSurface = $derived(surfaceFromPath(page.url.pathname));

  /**
   * Both context controls resolve to one navigation: open `e`, keeping the
   * surface in view when the target event exposes it. `openSurface` is null off
   * an event route (a talent fiche), which lands on the first reachable one.
   */
  function openEvent(e: DevWorkspaceEvent) {
    if (e.id === currentEvent?.id) return;
    const surface = landingSurface(e, openSurface);
    if (!surface) return;
    goto(resolve(`/staff/dev/events/${e.id}/${surfaceSegment(surface)}`));
  }

  /**
   * Changing the year is a context jump: land on the event that year defaults
   * to, the same rule a bare `/staff/dev` lands on. `navigableSchoolYears` and
   * `defaultEventOfYear` share a reachability filter, so the null below is a
   * type guard, not a year that quietly does nothing when picked.
   */
  function changeSchoolYear(year: string) {
    if (year === selectedSchoolYear) return;
    const target = defaultEventOfYear(workspace.events, year);
    if (target) openEvent(target);
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
    ${active ? 'bg-epi-blue text-white' : 'text-chrome-foreground-muted hover:bg-chrome-hover hover:text-chrome-foreground'}
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
    <span class="font-heading text-display-s">
      Jump<TitleCursor />
    </span>
  </a>
{/snippet}

{#snippet navMenu()}
  {#if currentEvent}
    {@const ev = currentEvent}
    <!-- The event in view is the section heading (underscore motif). The switcher
         sits inline to its right, demoted: the event name stays the label.

         Anton, and a display size rather than the label size: this is the
         workspace you are in, not a group label like the admin sidebar's, and it
         has to out-rank the 14px entries under it. -->
    <div
      class="mt-4 mb-2 flex items-center gap-1.5 font-heading text-display-s text-chrome-foreground"
    >
      <span class="flex min-w-0 flex-1 items-baseline">
        <span class="truncate">{eventDisplayName(ev)}</span>
        <TitleCursor />
      </span>
      {#if yearEvents.length > 1}
        <EventWorkspaceSwitcher
          events={yearEvents}
          currentId={ev.id}
          schoolYear={selectedSchoolYear}
          onpick={openEvent}
        />
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

{#snippet campusBadge()}
  {#if data.staffProfile?.campus?.name}
    <div
      class="flex min-w-0 items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase select-none"
    >
      <School class="h-4 w-4 shrink-0 text-epi-blue" />
      <span class="truncate font-bold text-epi-blue">
        {data.staffProfile.campus.name}
      </span>
    </div>
  {:else}
    <div></div>
  {/if}
{/snippet}

{#snippet sidebarFooter()}
  <div class="border-t border-chrome-border text-chrome-foreground">
    <div class="flex items-center justify-between gap-2 p-3">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-sm p-1 transition-colors hover:bg-chrome-hover"
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
              class="epi-overline leading-tight text-chrome-foreground-muted"
            >
              {displayedGreeting}<TitleCursor blink />
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
    class="app-sidebar on-dark hidden w-68 flex-col border-r border-chrome-border bg-chrome text-chrome-foreground md:flex"
  >
    <div class="border-b border-chrome-border">
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
      {@render campusBadge()}

      <!-- Context Selectors -->
      <div class="flex items-center gap-3">
        <!-- Academic Year: the workspace's global context, changed here and
             nowhere else. Mirrored in the mobile header below. -->
        <SchoolYearMenu
          years={schoolYears}
          active={selectedSchoolYear}
          onselect={changeSchoolYear}
        />

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
              <Avatar.Fallback class="bg-transparent epi-chip">
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
      <!-- Campus on the left, school year on the right: the same two context
           readouts as the desktop header, so both breakpoints say the same
           thing. The brand used to sit here and no longer fits beside the year
           control (a 360px bar cannot hold the burger, the full mark and a
           control at once), which is no loss: the drawer this burger opens
           renders the same mark at its top, exactly as the sidebar does on
           desktop. The year lives in the bar rather than inside the drawer so it
           stays readable while you work, émargement included, and so it needs no
           second skin for the navy rail. -->
      <div class="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          class="relative h-10 w-10 shrink-0"
          onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
        >
          <Menu
            class="absolute h-6! w-6! transition-ui duration-300 {mobileMenuOpen
              ? 'scale-0 opacity-0'
              : 'scale-100 opacity-100'}"
          />
          <X
            class="absolute h-6! w-6! transition-ui duration-300 {mobileMenuOpen
              ? 'scale-100 rotate-0 opacity-100'
              : 'scale-0 -rotate-90 opacity-0'}"
          />
          <span class="sr-only">Toggle menu</span>
        </Button>
        {@render campusBadge()}
      </div>
      <SchoolYearMenu
        years={schoolYears}
        active={selectedSchoolYear}
        onselect={changeSchoolYear}
      />
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
        class="on-dark absolute inset-y-0 left-0 z-40 flex w-3/4 max-w-75 flex-col border-r border-chrome-border bg-chrome text-chrome-foreground shadow-overlay md:hidden"
        transition:fly={{ x: -300, duration: 300 }}
      >
        <div class="border-b border-chrome-border">
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
