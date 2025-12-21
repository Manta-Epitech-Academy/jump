<script lang="ts">
	import './layout.css';

	import Button from '$lib/components/ui/button/button.svelte';
	import { LogOut, Mountain, Plus } from '@lucide/svelte';
	import { redirect } from '@sveltejs/kit';

	let { children, data } = $props();
	let isOpen = $state(false);

	// Force le redirect si pas connecté
	$effect(() => {
		if (!data.user) {
			throw redirect(302, '/login');
		}
	});
</script>

<svelte:head>
	<title>CodeCamp Manager</title>
</svelte:head>

<!-- Navigation Shadcn -->
<nav
	class="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
>
	<div class="container mx-auto flex h-14 max-w-screen-2xl items-center px-4">
		<a class="mr-4 hidden md:flex" href="/">
			<Mountain class="h-6 w-6" />
			<span class="font-bold">CodeCamp Manager</span>
		</a>
		<div class="flex flex-1 items-center justify-between space-x-2 md:justify-end">
			<div class="w-full flex-1 md:w-auto md:flex-none">
				<!-- Ici viendra la recherche plus tard -->
			</div>
			<a href="/sessions/new" class="mr-2 hidden md:block">
				<Button variant="outline" size="sm">
					<Plus class="mr-1 h-4 w-4" />
					Nouvelle Session
				</Button>
			</a>
			<Button size="sm" href="/logout" variant="ghost">
				<LogOut class="mr-1 h-4 w-4" />
				Déconnexion
			</Button>
		</div>
	</div>
</nav>

<!-- Contenu principal -->
<main class="container mx-auto max-w-screen-2xl px-4 py-8">
	{@render children()}
</main>

<!-- Mobile menu (à implémenter plus tard) -->
