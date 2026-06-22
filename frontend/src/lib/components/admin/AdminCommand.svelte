<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, onDestroy } from 'svelte';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import Users from '@lucide/svelte/icons/users';
  import UsersRound from '@lucide/svelte/icons/users-round';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import type { Icon as IconType } from '@lucide/svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { ADMIN_NAV } from '$lib/components/admin/adminNav';

  // Admin-only command palette (Cmd/Ctrl+K), two surfaces in one list:
  //  - Navigation: jump to any admin page, filtered client-side (instant, no
  //    round-trip), so ⌘K doubles as a page menu.
  //  - People: talents + parents + staff, searched globally server-side, each
  //    jumping to the relevant admin list pre-filtered via `?q=`.
  // Deliberately separate from the dev/pedago GlobalCommand: that one is
  // campus-scoped, talent-only and navigates to /students/[id] cockpits — none
  // of which fit the admin space. Reuses the same ui/command kit.
  let { open = $bindable(false) }: { open?: boolean } = $props();

  type PersonResult = {
    type: 'talent' | 'parent' | 'staff';
    id: string;
    name: string;
    email: string | null;
    sub: string | null;
    navQ: string;
  };

  let inputValue = $state('');
  let results = $state<PersonResult[]>([]);
  let searching = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout>;

  // Lowercase + strip diacritics so "themes" matches "Thèmes", "genapdf" the
  // "Génération…" page, etc.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

  // Navigation is the same `ADMIN_NAV` the sidebar renders, grouped by section
  // so the short labels stay unambiguous (a section heading supplies the
  // context the palette used to bake into longer labels). Filtered client-side
  // on label + keywords; the full tree shows on an empty query so the palette
  // opens as a menu. People stay server-filtered. Sidebar badge counts are
  // deliberately omitted here.
  const matchedSections = $derived.by(() => {
    const q = norm(inputValue.trim());
    if (!q) return ADMIN_NAV;
    return ADMIN_NAV.map((section) => ({
      title: section.title,
      items: section.items.filter(
        (p) =>
          norm(p.label).includes(q) ||
          (p.keywords ?? []).some((k) => k.includes(q)),
      ),
    })).filter((section) => section.items.length > 0);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      open = !open;
    }
  }
  onMount(() => document.addEventListener('keydown', handleKeydown));
  onDestroy(() => {
    if (typeof document !== 'undefined')
      document.removeEventListener('keydown', handleKeydown);
  });

  function go(url: string) {
    open = false;
    inputValue = '';
    goto(url);
  }

  function navigateTo(r: PersonResult) {
    const q = encodeURIComponent(r.navQ);
    if (r.type === 'staff') {
      // The members roster sits below the invitations queue, so jump straight to
      // it via the #members anchor — the section reads the ?q and filters to this
      // person, in view immediately instead of buried below the invitations.
      go(`${resolve('/staff/admin/users')}?q=${q}#members`);
    } else {
      // Talents and parents both resolve to the talents directory (a parent
      // points at their child); it's a single table, so no anchor needed.
      go(`${resolve('/staff/admin/talents')}?q=${q}`);
    }
  }

  $effect(() => {
    const q = inputValue.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    searching = true;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `${resolve('/api/admin/people')}?q=${encodeURIComponent(q)}`,
        );
        if (res.ok) results = await res.json();
      } finally {
        searching = false;
      }
    }, 250);
  });

  const talents = $derived(results.filter((r) => r.type === 'talent'));
  const parents = $derived(results.filter((r) => r.type === 'parent'));
  const staff = $derived(results.filter((r) => r.type === 'staff'));
</script>

{#snippet personItem(r: PersonResult, Icon: typeof IconType)}
  <Command.Item onSelect={() => navigateTo(r)} class="gap-3 px-3 py-2.5">
    <Icon class="h-4 w-4 text-muted-foreground" />
    <div class="flex min-w-0 flex-col">
      <span class="truncate text-sm font-bold">{r.name}</span>
      <span class="truncate text-xs text-muted-foreground">
        {r.email ?? ''}{r.sub ? `${r.email ? ' · ' : ''}${r.sub}` : ''}
      </span>
    </div>
    <ArrowRight
      class="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-30"
    />
  </Command.Item>
{/snippet}

<!-- shouldFilter={false}: pages are filtered above, people server-side. -->
<Command.Dialog bind:open shouldFilter={false}>
  <Command.Input
    placeholder="Aller à une page, ou chercher un talent, un parent, un membre…"
    bind:value={inputValue}
  />
  <Command.List class="max-h-[350px] overflow-y-auto">
    <Command.Empty class="py-10">
      {#if searching}
        <div class="space-y-4 p-4">
          {#each Array(3) as _}
            <div class="flex items-center gap-3">
              <Skeleton class="h-8 w-8 rounded-full" />
              <div class="space-y-2">
                <Skeleton class="h-3.5 w-40" />
                <Skeleton class="h-3 w-24" />
              </div>
            </div>
          {/each}
        </div>
      {:else if inputValue.trim().length >= 2}
        <p class="text-center text-sm text-muted-foreground italic">
          Aucun résultat.
        </p>
      {:else}
        <p class="text-center text-sm text-muted-foreground">
          Tapez au moins 2 caractères pour chercher une personne.
        </p>
      {/if}
    </Command.Empty>

    {#each matchedSections as section (section.title)}
      <Command.Group heading={section.title}>
        {#each section.items as p (p.href)}
          {@const Icon = p.icon}
          <Command.Item onSelect={() => go(p.href)} class="gap-3 px-3 py-2.5">
            <Icon class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium">{p.label}</span>
            <ArrowRight
              class="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-30"
            />
          </Command.Item>
        {/each}
      </Command.Group>
    {/each}

    {#if talents.length > 0}
      <Command.Group heading="Talents">
        {#each talents as r (r.id)}
          {@render personItem(r, GraduationCap)}
        {/each}
      </Command.Group>
    {/if}

    {#if parents.length > 0}
      <Command.Group heading="Parents">
        {#each parents as r (r.id)}
          {@render personItem(r, UsersRound)}
        {/each}
      </Command.Group>
    {/if}

    {#if staff.length > 0}
      <Command.Group heading="Staff">
        {#each staff as r (r.id)}
          {@render personItem(r, Users)}
        {/each}
      </Command.Group>
    {/if}
  </Command.List>
</Command.Dialog>
