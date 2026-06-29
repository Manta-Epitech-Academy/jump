<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { onMount, onDestroy } from 'svelte';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import Users from '@lucide/svelte/icons/users';
  import UsersRound from '@lucide/svelte/icons/users-round';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
  import FileCog from '@lucide/svelte/icons/file-cog';
  import ClipboardList from '@lucide/svelte/icons/clipboard-list';
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import Send from '@lucide/svelte/icons/send';
  import Mails from '@lucide/svelte/icons/mails';
  import MailCog from '@lucide/svelte/icons/mail-warning';
  import History from '@lucide/svelte/icons/history';
  import DoorOpen from '@lucide/svelte/icons/door-open';
  import Map from '@lucide/svelte/icons/map';
  import NotebookPen from '@lucide/svelte/icons/notebook-pen';
  import UserX from '@lucide/svelte/icons/user-x';
  import FileText from '@lucide/svelte/icons/file-text';
  import Tags from '@lucide/svelte/icons/tags';
  import Heart from '@lucide/svelte/icons/heart';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import type { Icon as IconType } from '@lucide/svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';

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

  type NavItem = {
    label: string;
    href: string;
    icon: typeof IconType;
    keywords: string[];
  };

  // Page navigation grouped by category, mirroring the sidebar structure.
  type NavSection = { label: string; items: NavItem[] };

  const NAV_SECTIONS: NavSection[] = [
    {
      label: 'Systeme',
      items: [
        {
          label: 'Dashboard',
          href: resolve('/staff/admin'),
          icon: LayoutDashboard,
          keywords: ['dashboard', 'accueil', 'overview', 'vue ensemble'],
        },
        {
          label: 'Erreurs de Sync',
          href: resolve('/staff/admin/sync-errors'),
          icon: TriangleAlert,
          keywords: ['synchro', 'salesforce', 'erreur'],
        },
        {
          label: 'Divergences SF',
          href: resolve('/staff/admin/sf-conflicts'),
          icon: GitCompareArrows,
          keywords: ['sf', 'conflit', 'salesforce', 'reconciliation'],
        },
        {
          label: 'PDF Onboarding',
          href: resolve('/staff/admin/onboarding-pdfs'),
          icon: FileCog,
          keywords: ['pdf', 'documents', 'signes', 'export'],
        },
        {
          label: 'PDF Entretiens',
          href: resolve('/staff/admin/interview-pdfs'),
          icon: ClipboardList,
          keywords: ['pdf', 'entretien', 'synthese', 'motivation', 'export'],
        },
        {
          label: 'Tickets',
          href: resolve('/staff/admin/tickets'),
          icon: LifeBuoy,
          keywords: ['support', 'bug', 'suggestion'],
        },
        {
          label: '[DEV] S3 Test',
          href: resolve('/staff/admin/files'),
          icon: FolderOpen,
          keywords: ['s3', 'fichiers', 'partage'],
        },
      ],
    },
    {
      label: 'Communication',
      items: [
        {
          label: "Vue d'ensemble",
          href: resolve('/staff/admin/communication'),
          icon: Megaphone,
          keywords: ['comm'],
        },
        {
          label: 'Envoi en masse',
          href: resolve('/staff/admin/broadcasts'),
          icon: Send,
          keywords: ['broadcast', 'campagne', 'email', 'sms'],
        },
        {
          label: 'Templates',
          href: resolve('/staff/admin/broadcasts/templates'),
          icon: Mails,
          keywords: ['modele', 'broadcast'],
        },
        {
          label: 'Mails transactionnels',
          href: resolve('/staff/admin/email-actions'),
          icon: MailCog,
          keywords: ['email', 'action', 'mapping'],
        },
        {
          label: 'Relances',
          href: resolve('/staff/admin/communication/relances'),
          icon: History,
          keywords: ['relance', 'rappel'],
        },
        {
          label: "Pages d'accueil",
          href: resolve('/staff/admin/welcome-pages'),
          icon: DoorOpen,
          keywords: ['welcome', 'cms'],
        },
      ],
    },
    {
      label: 'Organisation',
      items: [
        {
          label: 'Reseau Campus',
          href: resolve('/staff/admin/campuses'),
          icon: Map,
          keywords: ['campus', 'feature', 'flag'],
        },
        {
          label: 'Membres & invitations',
          href: resolve('/staff/admin/users'),
          icon: Users,
          keywords: ['staff', 'utilisateur', 'invitation', 'role'],
        },
        {
          label: 'Talents',
          href: resolve('/staff/admin/talents'),
          icon: GraduationCap,
          keywords: ['eleve', 'etudiant', 'annuaire'],
        },
        {
          label: 'Notes',
          href: resolve('/staff/admin/notes'),
          icon: NotebookPen,
          keywords: ['note'],
        },
        {
          label: 'Suppressions',
          href: resolve('/staff/admin/account-deletions'),
          icon: UserX,
          keywords: ['rgpd', 'suppression', 'anonymisation'],
        },
      ],
    },
    {
      label: 'Pedagogie',
      items: [
        {
          label: 'Templates',
          href: resolve('/staff/admin/templates'),
          icon: FileText,
          keywords: ['activite', 'officiel'],
        },
        {
          label: 'Themes',
          href: resolve('/staff/admin/themes'),
          icon: Tags,
          keywords: ['theme', 'tag'],
        },
        {
          label: "Centres d'interet",
          href: resolve('/staff/admin/interests'),
          icon: Heart,
          keywords: ['interet', 'centre'],
        },
        {
          label: 'Modeles de Planning',
          href: resolve('/staff/admin/planning-templates'),
          icon: CalendarDays,
          keywords: ['planning', 'modele'],
        },
        {
          label: 'Mini-jeux',
          href: resolve('/staff/admin/minigames'),
          icon: Gamepad2,
          keywords: ['jeu', 'game', 'rotation'],
        },
      ],
    },
  ];

  const ALL_PAGES = NAV_SECTIONS.flatMap((s) => s.items);

  const RECENT_KEY = 'admin-recent-pages';
  const MAX_RECENT = 4;

  let recentHrefs = $state<string[]>([]);

  function loadRecent(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveRecent(href: string) {
    const updated = [href, ...recentHrefs.filter((h) => h !== href)].slice(
      0,
      MAX_RECENT,
    );
    recentHrefs = updated;
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  }

  const recentPages = $derived(
    recentHrefs
      .map((href) => ALL_PAGES.find((p) => p.href === href))
      .filter((p): p is NavItem => p != null),
  );

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

  // Pages filtered client-side on label + keywords; the full list shows on an
  // empty query so the palette opens as a menu. People stay server-filtered.
  const query = $derived(norm(inputValue.trim()));

  // When searching, filter across all pages. When empty, show grouped sections.
  const matchedSections = $derived.by(() => {
    if (!query) return NAV_SECTIONS;
    return NAV_SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter(
        (p) =>
          norm(p.label).includes(query) ||
          p.keywords.some((k) => k.includes(query)),
      ),
    })).filter((s) => s.items.length > 0);
  });

  const hasPageResults = $derived(
    matchedSections.some((s) => s.items.length > 0),
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      open = !open;
    }
  }
  onMount(() => document.addEventListener('keydown', handleKeydown));

  // Load recent pages from localStorage each time the palette opens.
  $effect(() => {
    if (open) recentHrefs = loadRecent();
  });
  onDestroy(() => {
    if (typeof document !== 'undefined')
      document.removeEventListener('keydown', handleKeydown);
  });

  // Track page visits automatically (not just via Ctrl+K navigation).
  // Only writes to localStorage (no state update) to avoid re-renders.
  // The state is loaded fresh when the palette opens.
  if (typeof window !== 'undefined') {
    $effect(() => {
      const href = page.url?.pathname;
      if (!href) return;
      const match = ALL_PAGES.find((p) => p.href === href);
      if (!match) return;
      try {
        const stored: string[] = JSON.parse(
          localStorage.getItem(RECENT_KEY) ?? '[]',
        );
        const updated = [
          match.href,
          ...stored.filter((h) => h !== match.href),
        ].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch {}
    });
  }

  function go(url: string) {
    open = false;
    inputValue = '';
    saveRecent(url);
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
    placeholder="Rechercher une page, un talent, un parent..."
    bind:value={inputValue}
  />
  <Command.List class="max-h-[400px] overflow-y-auto">
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
          Aucun resultat.
        </p>
      {:else}
        <p class="text-center text-sm text-muted-foreground">
          Tapez au moins 2 caracteres pour chercher une personne.
        </p>
      {/if}
    </Command.Empty>

    <!-- Recently visited pages (only when no search query) -->
    {#if !query && recentPages.length > 0}
      <Command.Group heading="Récemment visité">
        {#each recentPages as p (p.href)}
          {@const Icon = p.icon}
          <Command.Item onSelect={() => go(p.href)} class="gap-2.5 px-3 py-1.5">
            <Icon class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-xs font-medium">{p.label}</span>
            <ArrowRight
              class="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-20"
            />
          </Command.Item>
        {/each}
      </Command.Group>
    {/if}

    <!-- Navigation pages grouped by category -->
    {#each matchedSections as section (section.label)}
      <Command.Group heading={section.label}>
        {#each section.items as p (p.href)}
          {@const Icon = p.icon}
          <Command.Item onSelect={() => go(p.href)} class="gap-2.5 px-3 py-1.5">
            <Icon class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-xs font-medium">{p.label}</span>
            <ArrowRight
              class="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-20"
            />
          </Command.Item>
        {/each}
      </Command.Group>
    {/each}

    <!-- People results (server-side search) -->
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
