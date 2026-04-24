<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import {
    ShieldAlert,
    Map,
    Users,
    Tags,
    LogOut,
    Menu,
    X,
    LayoutDashboard,
    FingerprintPattern,
    FileText,
    CalendarDays,
    TriangleAlert,
    FolderOpen,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import { fly, fade } from 'svelte/transition';

  let { children, data } = $props();

  let mobileMenuOpen = $state(false);

  // Close the mobile menu on page navigation
  $effect(() => {
    if (page.url.pathname) {
      mobileMenuOpen = false;
    }
  });

  function isActive(path: string) {
    const basePath = resolve('/').replace(/\/$/, '');
    const fullPath = `${basePath}${path}`;
    if (path === '/staff/admin') {
      return (
        page.url.pathname === fullPath || page.url.pathname === `${fullPath}/`
      );
    }
    return page.url.pathname.startsWith(fullPath);
  }

  const navLinkClass = (active: boolean) => `
		flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-all rounded-r-md cursor-pointer
		${
      active
        ? 'bg-epi-pink/10 text-epi-pink border-l-4 border-epi-pink'
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border-l-4 border-transparent'
    }
	`;
</script>

{#snippet navMenu()}
  <div
    class="mb-2 px-6 text-[10px] font-black tracking-widest text-slate-500 uppercase"
  >
    Système<span class="text-epi-pink">_</span>
  </div>
  <nav class="mb-8 space-y-1">
    <a
      href={resolve('/staff/admin')}
      class={navLinkClass(isActive('/staff/admin'))}
    >
      <LayoutDashboard class="h-4 w-4" />
      <span>Vue d'ensemble</span>
    </a>
    <a
      href={resolve('/staff/admin/sync-errors')}
      class={navLinkClass(isActive('/staff/admin/sync-errors'))}
    >
      <TriangleAlert class="h-4 w-4" />
      <span>Erreurs de Sync</span>
    </a>
    <a
      href={resolve('/staff/admin/files')}
      class={navLinkClass(isActive('/staff/admin/files'))}
    >
      <FolderOpen class="h-4 w-4" />
      <span>[DEV] S3 Test</span>
    </a>
  </nav>

  <div
    class="mb-2 px-6 text-[10px] font-black tracking-widest text-slate-500 uppercase"
  >
    Organisation<span class="text-epi-pink">_</span>
  </div>
  <nav class="mb-8 space-y-1">
    <a
      href={resolve('/staff/admin/campuses')}
      class={navLinkClass(isActive('/staff/admin/campuses'))}
    >
      <Map class="h-4 w-4" />
      <span>Réseau Campus</span>
    </a>
    <a
      href={resolve('/staff/admin/users')}
      class={navLinkClass(isActive('/staff/admin/users'))}
    >
      <Users class="h-4 w-4" />
      <span>Membres & invitations</span>
    </a>
  </nav>

  <div
    class="mb-2 px-6 text-[10px] font-black tracking-widest text-slate-500 uppercase"
  >
    Pédagogie<span class="text-epi-pink">_</span>
  </div>
  <nav class="space-y-1">
    <a
      href={resolve('/staff/admin/templates')}
      class={navLinkClass(isActive('/staff/admin/templates'))}
    >
      <FileText class="h-4 w-4" />
      <span>Templates Officiels</span>
    </a>
    <a
      href={resolve('/staff/admin/themes')}
      class={navLinkClass(isActive('/staff/admin/themes'))}
    >
      <Tags class="h-4 w-4" />
      <span>Thèmes Officiels</span>
    </a>
    <a
      href={resolve('/staff/admin/planning-templates')}
      class={navLinkClass(isActive('/staff/admin/planning-templates'))}
    >
      <CalendarDays class="h-4 w-4" />
      <span>Modèles de Planning</span>
    </a>
  </nav>
{/snippet}

<div class="flex h-screen w-full flex-col overflow-hidden bg-background">
  <!-- Admin Header -->
  <header
    class="z-50 flex h-15 w-full shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 shadow-md md:px-6"
  >
    <div class="flex items-center gap-4">
      <Button
        variant="ghost"
        size="icon"
        class="relative h-10 w-10 text-slate-300 hover:bg-slate-800 hover:text-white md:hidden"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
      >
        <Menu
          class="absolute h-6 w-6 transition-all duration-300 {mobileMenuOpen
            ? 'scale-0 opacity-0'
            : 'scale-100 opacity-100'}"
        />
        <X
          class="absolute h-6 w-6 transition-all duration-300 {mobileMenuOpen
            ? 'scale-100 rotate-0 opacity-100'
            : 'scale-0 -rotate-90 opacity-0'}"
        />
        <span class="sr-only">Toggle menu</span>
      </Button>

      <a href={resolve('/staff/admin')} class="flex items-center gap-3">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-sm bg-epi-pink text-white shadow-[0_0_10px_rgba(255,30,247,0.4)]"
        >
          <FingerprintPattern class="h-5 w-5" />
        </div>
        <span
          class="hidden text-lg font-black tracking-widest text-slate-100 uppercase md:block"
        >
          Jump <span class="text-epi-pink">Admin</span>
        </span>
      </a>
    </div>

    <div class="flex items-center gap-2">
      <ModeToggle />

      <div class="ml-2 flex items-center gap-4">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex items-center gap-3 transition-opacity outline-none hover:opacity-80"
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
            <div
              class="flex h-9 w-9 items-center justify-center rounded-sm border border-slate-700 bg-slate-900 text-epi-pink"
            >
              <ShieldAlert class="h-4 w-4" />
            </div>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-48 rounded-sm">
            <DropdownMenu.Label class="text-xs text-muted-foreground uppercase"
              >Session Globale</DropdownMenu.Label
            >
            <DropdownMenu.Separator />
            <form action="{resolve('/logout')}?type=admin" method="POST">
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
      </div>
    </div>
  </header>

  <div class="relative flex flex-1 overflow-hidden">
    <!-- Desktop Admin Sidebar -->
    <aside
      class="hidden w-64 flex-col border-r border-slate-800 bg-slate-950 md:flex"
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
        class="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
        transition:fade={{ duration: 200 }}
        onclick={() => (mobileMenuOpen = false)}
      ></div>

      <aside
        class="absolute inset-y-0 left-0 z-40 flex w-3/4 max-w-xs flex-col border-r border-slate-800 bg-slate-950 shadow-2xl md:hidden"
        transition:fly={{ x: -300, duration: 300 }}
      >
        <div class="flex-1 overflow-y-auto py-6 pr-2">
          {@render navMenu()}
        </div>
      </aside>
    {/if}

    <main class="flex-1 overflow-y-auto bg-background p-4 md:p-8">
      {@render children()}
    </main>
  </div>
</div>
