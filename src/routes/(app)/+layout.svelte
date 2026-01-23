<script lang="ts">
	import {
		LogOut,
		LayoutDashboard,
		Users,
		Cuboid,
		Plus,
		ChevronDown,
		Menu,
		History
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ModeToggle from '$lib/components/ModeToggle.svelte';

	let { children, data } = $props();

	function isActive(path: string) {
		if (path === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(path);
	}

	const navLinkClass = (active: boolean) => `
		flex items-center gap-3 px-3 py-2 text-sm font-bold transition-colors rounded-sm cursor-pointer
		${
			active
				? 'bg-primary/10 text-epi-blue dark:text-primary'
				: 'text-muted-foreground hover:bg-muted hover:text-foreground'
		}
	`;
</script>

<div class="flex h-screen w-full flex-col overflow-hidden bg-background">
	<!-- HEADER (FULL WIDTH) -->
	<header
		class="z-20 flex h-15 w-full shrink-0 items-center justify-between border-b border-border bg-header px-6 text-header-foreground shadow-md"
	>
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="icon" class="text-inherit md:hidden">
				<Menu class="h-6 w-6" />
			</Button>
			<a href="/" class="flex items-center gap-2">
				<span class="text-lg font-bold uppercase">CodeCamp Manager</span>
			</a>
		</div>

		<div class="flex items-center gap-2">
			<!-- Theme Toggle -->
			<ModeToggle />

			<div class="ml-2 flex items-center gap-4">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex cursor-pointer items-center gap-3 transition-opacity outline-none hover:opacity-80"
					>
						<div class="flex items-center gap-2">
							<Avatar.Root class="h-8 w-8 rounded-sm bg-header-foreground/20">
								<Avatar.Fallback
									class="bg-transparent text-xs font-bold text-header-foreground uppercase"
								>
									{data.user?.username?.substring(0, 2) ?? 'AD'}
								</Avatar.Fallback>
							</Avatar.Root>
							<span class="hidden text-sm font-bold md:block">{data.user?.username}</span>
							<ChevronDown class="h-4 w-4 opacity-50" />
						</div>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-48 rounded-sm">
						<DropdownMenu.Label>Mon Profil</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<form action="/logout" method="POST">
							<button type="submit" class="w-full cursor-pointer">
								<DropdownMenu.Item class="cursor-pointer text-destructive">
									<LogOut class="mr-2 h-4 w-4" />
									Déconnexion
								</DropdownMenu.Item>
							</button>
						</form>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</header>

	<div class="flex flex-1 overflow-hidden">
		<!-- SIDEBAR -->
		<aside class="hidden w-62.5 flex-col border-r border-border bg-sidebar md:flex">
			<div class="flex-1 overflow-y-auto p-4">
				<!-- OVERVIEW -->
				<div class="sidebar-section-title">
					Overview<span class="text-epi-orange">_</span>
				</div>
				<nav class="space-y-1">
					<a href="/" class={navLinkClass(isActive('/'))}>
						<LayoutDashboard class="h-5 w-5" />
						<span>Dashboard</span>
					</a>
					<a href="/events/history" class={navLinkClass(isActive('/events/history'))}>
						<History class="h-5 w-5" />
						<span>Historique</span>
					</a>
				</nav>

				<!-- MANAGEMENT -->
				<div class="sidebar-section-title">
					Management<span class="text-epi-teal">_</span>
				</div>
				<nav class="space-y-1">
					<a href="/students" class={navLinkClass(isActive('/students'))}>
						<Users class="h-5 w-5" />
						<span>Élèves</span>
					</a>
					<a href="/subjects" class={navLinkClass(isActive('/subjects'))}>
						<Cuboid class="h-5 w-5" />
						<span>Sujets</span>
					</a>
				</nav>
			</div>

			<div class="border-t border-border p-4">
				<Button variant="outline" class="w-full justify-start border-dashed" href="/events/new">
					<Plus class="mr-2 h-4 w-4" />
					Nouvel Événement
				</Button>
			</div>
		</aside>

		<!-- PAGE CONTENT -->
		<main class="flex-1 overflow-y-auto bg-background p-6 md:p-8">
			{@render children()}
		</main>
	</div>
</div>
