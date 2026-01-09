<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { LogOut, Mountain, Plus, Users, Cuboid, LayoutDashboard } from 'lucide-svelte';
	import { page } from '$app/state';

	let { children } = $props();

	function isActive(path: string) {
		if (path === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(path);
	}
</script>

<nav
	class="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60"
>
	<div class="container mx-auto flex h-14 max-w-screen-2xl items-center px-4">
		<!-- Logo -->
		<a class="mr-6 flex items-center space-x-2" href="/">
			<Mountain class="h-6 w-6" />
			<span class="hidden font-bold sm:inline-block">CodeCamp Manager</span>
		</a>

		<!-- Main Navigation -->
		<div class="mr-4 hidden md:flex">
			<nav class="flex items-center gap-6 text-sm font-medium">
				<a
					href="/"
					class={isActive('/')
						? 'text-foreground'
						: 'text-foreground/60 transition-colors hover:text-foreground/80'}
				>
					<span class="flex items-center gap-2">
						<LayoutDashboard class="h-4 w-4" />
						Dashboard
					</span>
				</a>
				<a
					href="/students"
					class={isActive('/students')
						? 'text-foreground'
						: 'text-foreground/60 transition-colors hover:text-foreground/80'}
				>
					<span class="flex items-center gap-2">
						<Users class="h-4 w-4" />
						Élèves
					</span>
				</a>
				<a
					href="/activities"
					class={isActive('/activities')
						? 'text-foreground'
						: 'text-foreground/60 transition-colors hover:text-foreground/80'}
				>
					<span class="flex items-center gap-2">
						<Cuboid class="h-4 w-4" />
						Activités
					</span>
				</a>
			</nav>
		</div>

		<!-- Right Side Actions -->
		<div class="flex flex-1 items-center justify-between space-x-2 md:justify-end">
			<div class="w-full flex-1 md:w-auto md:flex-none">
				<!-- Search placeholder removed for cleaner nav right now -->
			</div>

			<a href="/sessions/new" class="mr-2 hidden md:block">
				<Button variant="default" size="sm">
					<Plus class="mr-1 h-4 w-4" />
					Nouvelle Session
				</Button>
			</a>

			<form action="/logout" method="POST">
				<Button size="sm" type="submit" variant="ghost">
					<LogOut class="mr-1 h-4 w-4" />
					<span class="sr-only sm:not-sr-only sm:ml-2">Déconnexion</span>
				</Button>
			</form>
		</div>
	</div>
</nav>

<main class="container mx-auto max-w-screen-2xl px-4 py-8">
	{@render children()}
</main>
