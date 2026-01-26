<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { CircleAlert } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import { Separator } from '$lib/components/ui/separator';

	let { data } = $props();
	const { form, errors, message, enhance } = superForm(untrack(() => data.form));
</script>

<div class="mx-auto max-w-md space-y-6">
	<div class="space-y-2 text-center">
		<h1 class="text-2xl font-bold tracking-wide text-epi-blue uppercase">Connexion</h1>
		<p class="text-sm text-muted-foreground">Accédez au gestionnaire CodeCamp</p>
	</div>

	{#if $message || data.errorMessage}
		<Alert variant="destructive">
			<CircleAlert class="h-4 w-4" />
			<AlertTitle>Erreur</AlertTitle>
			<AlertDescription>{$message || data.errorMessage}</AlertDescription>
		</Alert>
	{/if}

	<!-- OAUTH SECTION -->
	<form action="?/oauth2" method="POST" class="w-full">
		<Button type="submit" variant="outline" class="relative w-full py-5 font-bold">
			<svg class="mr-2 h-5 w-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg"
				><path fill="#f3f3f3" d="M0 0h23v23H0z" /><path fill="#f35325" d="M1 1h10v10H1z" /><path
					fill="#81bc06"
					d="M12 1h10v10H12z"
				/><path fill="#05a6f0" d="M1 12h10v10H1z" /><path
					fill="#ffba08"
					d="M12 12h10v10H12z"
				/></svg
			>
			Connexion avec Office 365
		</Button>
	</form>

	<div class="relative flex items-center py-2">
		<Separator class="flex-1" />
		<span class="px-2 text-xs font-bold text-muted-foreground uppercase">OU</span>
		<Separator class="flex-1" />
	</div>

	<!-- TRADITIONAL LOGIN -->
	<!-- Note: action="?/login" is now required because we have multiple actions -->
	<form method="POST" action="?/login" use:enhance class="space-y-4">
		<div class="space-y-2">
			<Label for="identity">Email ou username</Label>
			<Input id="identity" name="identity" bind:value={$form.identity} placeholder="admin" />
			{#if $errors.identity}
				<p class="text-sm text-destructive">{$errors.identity}</p>
			{/if}
		</div>

		<div class="space-y-2">
			<Label for="password">Mot de passe</Label>
			<Input id="password" name="password" type="password" bind:value={$form.password} />
			{#if $errors.password}
				<p class="text-sm text-destructive">{$errors.password}</p>
			{/if}
		</div>

		<Button type="submit" class="w-full">Se connecter</Button>
	</form>
</div>
