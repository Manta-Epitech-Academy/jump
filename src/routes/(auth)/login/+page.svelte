<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { CircleAlert } from 'lucide-svelte';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance } = superForm(data.form);
</script>

<div class="mx-auto max-w-md space-y-6">
	<h1 class="text-2xl font-bold">Connexion</h1>

	{#if $message}
		<Alert variant="destructive">
			<CircleAlert class="h-4 w-4" />
			<AlertTitle>Erreur</AlertTitle>
			<AlertDescription>{$message}</AlertDescription>
		</Alert>
	{/if}

	<form method="POST" use:enhance class="space-y-4">
		<div class="space-y-2">
			<Label for="identity">Email ou username</Label>
			<Input id="identity" name="identity" bind:value={$form.identity} />
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
