<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Map from '@lucide/svelte/icons/map';
  import Signature from '@lucide/svelte/icons/signature';
  import Users from '@lucide/svelte/icons/users';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import UserX from '@lucide/svelte/icons/user-x';
  import NotebookPen from '@lucide/svelte/icons/notebook-pen';
  import Tags from '@lucide/svelte/icons/tags';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Settings from '@lucide/svelte/icons/settings';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import Search from '@lucide/svelte/icons/search';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import FileText from '@lucide/svelte/icons/file-text';
  import FileCog from '@lucide/svelte/icons/file-cog';
  import ClipboardList from '@lucide/svelte/icons/clipboard-list';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Heart from '@lucide/svelte/icons/heart';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import Send from '@lucide/svelte/icons/send';
  import Mails from '@lucide/svelte/icons/mails';
  import MailCog from '@lucide/svelte/icons/mail-warning';
  import History from '@lucide/svelte/icons/history';
  import DoorOpen from '@lucide/svelte/icons/door-open';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Avatar from '$lib/components/ui/avatar';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import StaffSettingsDialog from '$lib/components/layout/StaffSettingsDialog.svelte';
  import AdminCommand from '$lib/components/admin/AdminCommand.svelte';
  import { fade } from 'svelte/transition';
  import { track, secondsBetween } from '$lib/analytics';
  import type { Component } from 'svelte';

  let { children, data } = $props();

  let mobileMenuOpen = $state(false);
  let settingsOpen = $state(false);
  let commandOpen = $state(false);

  $effect(() => {
    if (page.url.pathname) {
      mobileMenuOpen = false;
    }
  });

  const basePath = $derived(resolve('/').replace(/\/$/, ''));

  function isActive(path: string, excludePrefix?: string) {
    const fullPath = `${basePath}${path}`;
    if (path === '/staff/admin') {
      return (
        page.url.pathname === fullPath || page.url.pathname === `${fullPath}/`
      );
    }
    if (
      excludePrefix &&
      page.url.pathname.startsWith(`${basePath}${excludePrefix}`)
    ) {
      return false;
    }
    return page.url.pathname.startsWith(fullPath);
  }

  type NavLink = {
    label: string;
    href: string;
    icon: Component<{ class?: string }>;
    excludePrefix?: string;
    badgeKey?: 'authConflicts' | 'tickets' | 'deletions';
    badgeDanger?: boolean;
  };

  type NavSection = {
    key: string;
    label: string;
    prefixes: string[];
    links: NavLink[];
  };

  const sections: NavSection[] = [
    {
      key: 'systeme',
      label: 'Systeme',
      prefixes: [
        '/staff/admin/sync',
        '/staff/admin/sf-',
        '/staff/admin/onboarding',
        '/staff/admin/interview',
        '/staff/admin/tickets',
        '/staff/admin/files',
      ],
      links: [
        {
          label: 'Erreurs de Sync',
          href: '/staff/admin/sync-errors',
          icon: TriangleAlert,
        },
        {
          label: 'Divergences SF',
          href: '/staff/admin/sf-conflicts',
          icon: GitCompareArrows,
          badgeKey: 'authConflicts',
          badgeDanger: true,
        },
        {
          label: 'PDF Onboarding',
          href: '/staff/admin/onboarding-pdfs',
          icon: FileCog,
        },
        {
          label: 'PDF Entretiens',
          href: '/staff/admin/interview-pdfs',
          icon: ClipboardList,
        },
        {
          label: 'Tickets',
          href: '/staff/admin/tickets',
          icon: LifeBuoy,
          badgeKey: 'tickets',
        },
        {
          label: '[DEV] S3 Test',
          href: '/staff/admin/files',
          icon: FolderOpen,
        },
      ],
    },
    {
      key: 'communication',
      label: 'Communication',
      prefixes: [
        '/staff/admin/communication',
        '/staff/admin/broadcasts',
        '/staff/admin/email-actions',
        '/staff/admin/welcome-pages',
      ],
      links: [
        {
          label: "Vue d'ensemble",
          href: '/staff/admin/communication',
          icon: Megaphone,
          excludePrefix: '/staff/admin/communication/relances',
        },
        {
          label: 'Envoi en masse',
          href: '/staff/admin/broadcasts',
          icon: Send,
          excludePrefix: '/staff/admin/broadcasts/templates',
        },
        {
          label: 'Templates',
          href: '/staff/admin/broadcasts/templates',
          icon: Mails,
        },
        {
          label: 'Mails transactionnels',
          href: '/staff/admin/email-actions',
          icon: MailCog,
        },
        {
          label: 'Relances',
          href: '/staff/admin/communication/relances',
          icon: History,
        },
        {
          label: "Pages d'accueil",
          href: '/staff/admin/welcome-pages',
          icon: DoorOpen,
        },
      ],
    },
    {
      key: 'organisation',
      label: 'Organisation',
      prefixes: [
        '/staff/admin/campuses',
        '/staff/admin/signatures',
        '/staff/admin/users',
        '/staff/admin/talents',
        '/staff/admin/notes',
        '/staff/admin/account-deletions',
      ],
      links: [
        { label: 'Reseau Campus', href: '/staff/admin/campuses', icon: Map },
        {
          label: 'Signataires',
          href: '/staff/admin/signatures',
          icon: Signature,
        },
        {
          label: 'Membres & invitations',
          href: '/staff/admin/users',
          icon: Users,
        },
        { label: 'Talents', href: '/staff/admin/talents', icon: GraduationCap },
        { label: 'Notes', href: '/staff/admin/notes', icon: NotebookPen },
        {
          label: 'Suppressions',
          href: '/staff/admin/account-deletions',
          icon: UserX,
          badgeKey: 'deletions',
        },
      ],
    },
    {
      key: 'pedagogie',
      label: 'Pedagogie',
      prefixes: [
        '/staff/admin/templates',
        '/staff/admin/themes',
        '/staff/admin/interests',
        '/staff/admin/planning-templates',
        '/staff/admin/minigames',
      ],
      links: [
        { label: 'Templates', href: '/staff/admin/templates', icon: FileText },
        { label: 'Themes', href: '/staff/admin/themes', icon: Tags },
        {
          label: "Centres d'interet",
          href: '/staff/admin/interests',
          icon: Heart,
        },
        {
          label: 'Modeles de Planning',
          href: '/staff/admin/planning-templates',
          icon: CalendarDays,
        },
        { label: 'Mini-jeux', href: '/staff/admin/minigames', icon: Gamepad2 },
      ],
    },
  ];

  function sectionIsActive(s: NavSection): boolean {
    return s.prefixes.some((p) =>
      page.url.pathname.startsWith(`${basePath}${p}`),
    );
  }

  function badgeFor(key: 'authConflicts' | 'tickets' | 'deletions'): number {
    if (key === 'authConflicts') return data.authConflictsPending ?? 0;
    if (key === 'tickets') return data.ticketsUnread ?? 0;
    if (key === 'deletions') return data.deletionRequestsPending ?? 0;
    return 0;
  }

  function sectionBadgeTotal(s: NavSection): number {
    return s.links.reduce(
      (sum, l) => sum + (l.badgeKey ? badgeFor(l.badgeKey) : 0),
      0,
    );
  }
</script>

<div class="flex h-screen w-full flex-col overflow-hidden bg-background">
  <!-- Single header: brand | nav | search + user -->
  <header
    class="z-50 flex h-12 w-full shrink-0 items-center border-b border-slate-800 bg-slate-950 px-4 md:px-6"
  >
    <!-- Left: brand + nav -->
    <div class="flex items-center gap-0">
      <Button
        variant="ghost"
        size="icon"
        class="relative h-8 w-8 text-slate-300 hover:bg-slate-800 hover:text-white md:hidden"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
      >
        <Menu
          class="absolute h-5 w-5 transition-all duration-300 {mobileMenuOpen
            ? 'scale-0 opacity-0'
            : 'scale-100 opacity-100'}"
        />
        <X
          class="absolute h-5 w-5 transition-all duration-300 {mobileMenuOpen
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

      <!-- Separator -->
      <div
        class="mx-3 hidden h-5 w-px bg-slate-700 md:block"
        aria-hidden="true"
      ></div>

      <!-- Desktop nav dropdowns -->
      <nav class="hidden items-center gap-0.5 md:flex">
        <a
          href={resolve('/staff/admin')}
          class="flex items-center rounded-md px-2 py-1 transition-colors {isActive(
            '/staff/admin',
          )
            ? 'text-epi-pink'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}"
        >
          <LayoutDashboard class="h-3.5 w-3.5" />
        </a>

        {#each sections as section (section.key)}
          {@const active = sectionIsActive(section)}
          {@const totalBadge = sectionBadgeTotal(section)}
          <div class="nav-dropdown">
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide uppercase transition-colors {active
                ? 'text-epi-pink'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}"
            >
              {section.label}
              {#if totalBadge > 0}
                <span
                  class="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white"
                >
                  {totalBadge}
                </span>
              {/if}
              <ChevronDown class="h-2.5 w-2.5 opacity-50" />
            </button>
            <div class="nav-dropdown-menu">
              <div
                class="w-56 rounded-lg border border-slate-800 bg-slate-950 p-1 shadow-xl shadow-black/40"
              >
                {#each section.links as link (link.href)}
                  {@const Icon = link.icon}
                  {@const linkActive = isActive(link.href, link.excludePrefix)}
                  {@const badge = link.badgeKey ? badgeFor(link.badgeKey) : 0}
                  <a
                    href={resolve(link.href as any)}
                    class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors {linkActive
                      ? 'bg-epi-pink/10 text-epi-pink'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}"
                  >
                    <Icon class="h-3.5 w-3.5" />
                    <span class="flex-1">{link.label}</span>
                    {#if badge > 0}
                      <span
                        class="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white {link.badgeDanger
                          ? 'bg-red-500'
                          : 'bg-epi-pink'}"
                      >
                        {badge}
                      </span>
                    {/if}
                  </a>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </nav>
    </div>

    <!-- Right: search + mode + user -->
    <div class="ml-auto flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-8 gap-2 rounded-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        onclick={() => (commandOpen = true)}
        aria-label="Rechercher"
      >
        <Search class="h-3.5 w-3.5" />
        <span class="hidden text-xs sm:inline">Rechercher</span>
        <kbd
          class="hidden rounded border border-slate-700 bg-slate-800 px-1.5 text-[10px] text-slate-400 sm:inline"
          >⌘K</kbd
        >
      </Button>

      <ModeToggle />

      <div class="ml-2 flex items-center gap-4">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex cursor-pointer items-center gap-3 transition-opacity outline-none hover:opacity-80"
          >
            <div class="hidden flex-col items-end md:flex">
              <span
                class="text-[10px] font-black tracking-widest text-slate-500 uppercase"
              >
                Superuser
              </span>
              <span class="text-sm font-bold text-slate-200"
                >{data.user?.email}</span
              >
            </div>
            <Avatar.Root
              class="h-8 w-8 rounded-sm border border-slate-700 bg-slate-900"
            >
              <Avatar.Image
                src={data.user?.image ?? undefined}
                alt={data.user?.name ?? data.user?.email ?? 'Admin'}
                class="object-cover"
              />
              <Avatar.Fallback class="rounded-sm bg-slate-900 text-epi-pink">
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
              Parametres
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
      </div>
    </div>
  </header>

  <!-- Mobile menu overlay -->
  {#if mobileMenuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
      transition:fade={{ duration: 200 }}
      onclick={() => (mobileMenuOpen = false)}
    ></div>

    <div
      class="fixed inset-y-0 left-0 z-40 flex w-3/4 max-w-xs flex-col border-r border-slate-800 bg-slate-950 pt-14 shadow-2xl md:hidden"
    >
      <div class="flex-1 overflow-y-auto p-4">
        <a
          href={resolve('/staff/admin')}
          class="mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-bold {isActive(
            '/staff/admin',
          )
            ? 'text-epi-pink'
            : 'text-slate-400'}"
        >
          <LayoutDashboard class="h-4 w-4" />
          Dashboard
        </a>
        {#each sections as section (section.key)}
          <div class="mb-4">
            <div
              class="mb-1 px-3 text-[10px] font-black tracking-widest text-slate-500 uppercase"
            >
              {section.label}<span class="text-epi-pink">_</span>
            </div>
            {#each section.links as link (link.href)}
              {@const Icon = link.icon}
              {@const linkActive = isActive(link.href, link.excludePrefix)}
              {@const badge = link.badgeKey ? badgeFor(link.badgeKey) : 0}
              <a
                href={resolve(link.href as any)}
                class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-semibold {linkActive
                  ? 'text-epi-pink'
                  : 'text-slate-400 hover:text-slate-200'}"
              >
                <Icon class="h-3.5 w-3.5" />
                <span class="flex-1">{link.label}</span>
                {#if badge > 0}
                  <span
                    class="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white {link.badgeDanger
                      ? 'bg-red-500'
                      : 'bg-epi-pink'}"
                  >
                    {badge}
                  </span>
                {/if}
              </a>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Main content: full width -->
  <main class="flex-1 overflow-y-auto bg-background p-4 md:p-8">
    {@render children()}
  </main>
</div>

<AdminCommand bind:open={commandOpen} />

<style>
  /* Hover-triggered dropdown: no JS click needed, closes when mouse leaves */
  .nav-dropdown {
    position: relative;
  }
  .nav-dropdown-menu {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    padding-top: 4px; /* gap so hover doesn't break between trigger and menu */
    z-index: 50;
  }
  .nav-dropdown:hover .nav-dropdown-menu {
    display: block;
  }
</style>
