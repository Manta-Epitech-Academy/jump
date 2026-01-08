<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { AlertCircle } from 'lucide-svelte';

	let { data } = $props();
	const { form, errors, message, enhance } = superForm(data.form);
</script>

<div class="mx-auto max-w-md space-y-6">
	<h1 class="text-2xl font-bold">Créer un compte</h1>

	{#if $message}
		<Alert variant="default">
			<AlertCircle class="h-4 w-4" />
			<AlertTitle>Info</AlertTitle>
			<AlertDescription>{$message}</AlertDescription>
		</Alert>
	{/if}

	<form method="POST" use:enhance class="space-y-4">
		<div class="space-y-2">
			<Label for="username">Username</Label>
			<Input id="username" name="username" bind:value={$form.username} />
			{#if $errors.username}
				<p class="text-sm text-destructive">{$errors.username}</p>
			{/if}
		</div>

		<div class="space-y-2">
			<Label for="email">Email</Label>
			<Input id="email" name="email" type="email" bind:value={$form.email} />
			{#if $errors.email}
				<p class="text-sm text-destructive">{$errors.email}</p>
			{/if}
		</div>

		<div class="space-y-2">
			<Label for="password">Mot de passe</Label>
			<Input id="password" name="password" type="password" bind:value={$form.password} />
			{#if $errors.password}
				<p class="text-sm text-destructive">{$errors.password}</p>
			{/if}
		</div>

		<div class="space-y-2">
			<Label for="passwordConfirm">Confirmation</Label>
			<Input
				id="passwordConfirm"
				name="passwordConfirm"
				type="password"
				bind:value={$form.passwordConfirm}
			/>
			{#if $errors.passwordConfirm}
				<p class="text-sm text-destructive">{$errors.passwordConfirm}</p>
			{/if}
		</div>

		<Button type="submit" class="w-full">Créer un compte</Button>
	</form>
</div>
