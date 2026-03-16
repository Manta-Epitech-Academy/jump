<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Rocket, Lock, ArrowLeft, CircleAlert, Sparkles } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { untrack } from 'svelte';

	let { data } = $props();

	let step = $state(1);

	const {
		form: emailForm,
		errors: emailErrors,
		enhance: emailEnhance,
		delayed: emailDelayed,
		message: emailMessage
	} = superForm(untrack(() => data.emailForm), {
		resetForm: false,
		onUpdated: ({ form }) => {
			if (form.valid && form.message?.type === 'success') {
				$otpForm.otpId = form.message.otpId;
				$otpForm.email = $emailForm.email.toLowerCase().trim();
				step = 2;
			}
		}
	});

	const {
		form: otpForm,
		errors: otpErrors,
		enhance: otpEnhance,
		delayed: otpDelayed,
		message: otpMessage
	} = superForm(untrack(() => data.otpForm), {
		resetForm: false
	});

	function goBack() {
		step = 1;
		$otpForm.password = '';
		$otpMessage = undefined;
	}

	// Robust autofocus for Svelte 5
	$effect(() => {
		if (step === 2) {
			// Timeout ensures DOM is ready after transition
			setTimeout(() => {
				document.getElementById('password')?.focus();
			}, 100);
		}
	});
</script>

<div
	class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
	<div
		class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
	></div>
	<div
		class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
	></div>

	<div
		class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
	></div>

	<div class="z-10 w-full max-w-md">
		<Card.Root
			class="relative w-full overflow-hidden rounded-2xl border-none bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
		>
			<div class="h-1.5 w-full bg-linear-to-r from-epi-blue to-epi-teal"></div>

			<Card.Header class="space-y-4 pt-8 pb-4 text-center">
				<div
					class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
				>
					<Rocket class="h-7 w-7" />
				</div>

				<div class="space-y-1">
					<Card.Title class="font-heading text-3xl tracking-tight text-epi-blue uppercase">
						TekCamp
					</Card.Title>
					<Card.Description class="text-sm font-bold tracking-tight text-slate-500 uppercase">
						{#if step === 1}
							Prêt pour l'aventure ?
						{:else}
							Dernière étape !
						{/if}
					</Card.Description>
				</div>
			</Card.Header>

			<Card.Content class="pb-10">
				{#if step === 1}
					<div in:fade={{ duration: 200 }}>
						{#if $emailMessage && $emailMessage.type === 'error'}
							<Alert
								variant="destructive"
								class="mb-6 rounded-xl border-red-100 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
							>
								<CircleAlert class="h-4 w-4" />
								<AlertDescription class="text-xs font-medium">{$emailMessage.text}</AlertDescription
								>
							</Alert>
						{/if}

						<form method="POST" action="?/requestOtp" use:emailEnhance class="space-y-5">
							<div class="space-y-2">
								<Label for="email" class="pl-1 text-xs font-black text-slate-500 uppercase"
									>Ton email Epitech</Label
								>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder="nom.prenom@epitech.eu"
									bind:value={$emailForm.email}
									class="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-base focus-visible:ring-epi-blue dark:border-slate-800 dark:bg-slate-950/50"
								/>
								{#if $emailErrors.email}<span class="pl-1 text-xs font-bold text-red-500"
										>{$emailErrors.email}</span
									>{/if}
							</div>

							<Button
								type="submit"
								disabled={$emailDelayed}
								class="h-12 w-full rounded-xl bg-epi-blue text-base font-bold text-white shadow-md transition-all hover:bg-epi-blue/90 active:scale-[0.98]"
							>
								{#if $emailDelayed}
									<Sparkles class="mr-2 h-4 w-4 animate-spin" />
									Vérification...
								{:else}
									Recevoir mon code
								{/if}
							</Button>
						</form>
					</div>
				{:else}
					<div in:fly={{ x: 20, duration: 300 }}>
						{#if $otpMessage}
							<Alert
								variant="destructive"
								class="mb-6 rounded-xl border-red-100 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
							>
								<CircleAlert class="h-4 w-4" />
								<AlertDescription class="text-xs font-medium">{$otpMessage.text}</AlertDescription>
							</Alert>
						{/if}

						<div class="mb-6 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-950">
							<p class="text-xs font-bold text-slate-500 uppercase">Code envoyé à</p>
							<p class="font-bold text-epi-blue">{$otpForm.email}</p>
						</div>

						<form method="POST" action="?/verifyOtp" use:otpEnhance class="space-y-6">
							<input type="hidden" name="otpId" bind:value={$otpForm.otpId} />
							<input type="hidden" name="email" bind:value={$otpForm.email} />

							<div class="space-y-2">
								<Label for="password" class="sr-only">Code à 6 chiffres</Label>
								<Input
									id="password"
									name="password"
									type="text"
									inputmode="numeric"
									autocomplete="one-time-code"
									maxlength={6}
									placeholder="000000"
									bind:value={$otpForm.password}
									class="h-16 rounded-xl border-2 border-slate-100 bg-white text-center font-mono text-3xl font-black tracking-[0.3em] text-slate-900 focus-visible:border-epi-blue focus-visible:ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
								/>
								{#if $otpErrors.password}<span
										class="block text-center text-xs font-bold text-red-500"
										>{$otpErrors.password}</span
									>{/if}
							</div>

							<div class="space-y-3">
								<Button
									type="submit"
									disabled={$otpDelayed || $otpForm.password.length !== 6}
									class="h-12 w-full rounded-xl bg-epi-teal text-base font-bold text-slate-950 shadow-md transition-all hover:bg-epi-teal/90 active:scale-[0.98] disabled:opacity-50"
								>
									{#if $otpDelayed}
										Lancement...
									{:else}
										<Lock class="mr-2 h-4 w-4" />
										Entrer dans le Cockpit
									{/if}
								</Button>

								<Button
									type="button"
									variant="ghost"
									class="h-10 w-full rounded-xl text-xs font-bold text-slate-400 uppercase hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
									onclick={goBack}
									disabled={$otpDelayed}
								>
									<ArrowLeft class="mr-1.5 h-3.5 w-3.5" />
									Changer d'email
								</Button>
							</div>
						</form>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<p class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase">
			Propulsé par Epitech Academy
		</p>
	</div>
</div>

<style>
	/* Subtle background pulse animation */
	@keyframes pulse-slow {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.5;
		}
		50% {
			transform: scale(1.1);
			opacity: 0.7;
		}
	}

	.absolute.rounded-full {
		animation: pulse-slow 15s ease-in-out infinite;
	}
</style>
