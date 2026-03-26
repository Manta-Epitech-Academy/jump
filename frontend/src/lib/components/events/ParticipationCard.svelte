<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as Popover from '$lib/components/ui/popover';
	import {
		CircleCheck,
		User,
		Laptop,
		MonitorX,
		ExternalLink,
		BookOpen,
		Award,
		Sprout,
		Clock,
		Check,
		LifeBuoy,
		X,
		LockOpen,
		KeyRound
	} from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import NoteInput from '$lib/components/events/NoteInput.svelte';
	import { cn } from '$lib/utils';
	import { resolve } from '$app/paths';

	let {
		participation = $bindable(),
		event,
		optimisticToggle,
		onDownload,
		index = 0,
		progress = []
	}: {
		participation: any;
		event: any;
		optimisticToggle: (id: string, field: 'is_present' | 'bring_pc') => any;
		onDownload?: () => void;
		index?: number;
		progress?: any[];
	} = $props();

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}

	function handleDownloadClick() {
		if (!participation.is_present) {
			toast.error("L'élève doit être présent pour recevoir un diplôme.");
			return;
		}
		if (onDownload) onDownload();
	}

	let subjects = $derived(participation.expand?.subjects || []);

	let isNewStudent = $derived.by(() => {
		const count = participation.expand?.student?.events_count || 0;
		const isPresent = participation.is_present ? 1 : 0;
		return count - isPresent === 0;
	});

	let delayOpen = $state(false);
	const delays = [5, 10, 15, 30, 45, 60];

	let needsHelpProgress = $derived(progress.find((p: any) => p.status === 'needs_help'));

	let helpSubject = $derived(
		needsHelpProgress
			? participation.expand?.subjects?.find((s: any) => s.id === needsHelpProgress.subject)
			: null
	);
	let helpStep = $derived(
		helpSubject
			? helpSubject.content_structure?.steps?.find(
					(s: any) => s.id === needsHelpProgress.current_step_id
				)
			: null
	);

	// Map subject ID → current step's unlock_code (PIN), if any
	let subjectPinMap = $derived.by(() => {
		const map = new Map<string, string>();
		for (const p of progress) {
			const sub = subjects.find((s: any) => s.id === p.subject);
			if (!sub) continue;
			const step = sub.content_structure?.steps?.find((s: any) => s.id === p.current_step_id);
			if (step?.validation?.unlock_code) {
				map.set(sub.id, step.validation.unlock_code);
			}
		}
		return map;
	});
</script>

<!--
    Hybrid Animation Strategy:
    1. CSS @keyframes (card-entry) handles the initial "Staggered Load".
    2. Svelte `out:fly` handles smooth removal when filtering reduces the list.
-->
<div
	class="card-entry"
	style="animation-delay: {Math.min(index * 50, 500)}ms"
	out:fly={{ y: 20, duration: 200 }}
>
	<Card.Root
		class={cn(
			'overflow-hidden border-2 shadow-sm transition-all duration-300',
			needsHelpProgress
				? 'border-epi-orange bg-orange-50/10 ring-4 ring-epi-orange/20 dark:bg-orange-950/10'
				: participation.is_present
					? 'border-epi-teal bg-card'
					: 'border-transparent opacity-80'
		)}
	>
		<Card.Content class="flex flex-col gap-4 p-4">
			<!-- MANTA ALERT BANNER -->
			{#if needsHelpProgress && helpStep}
				<div
					class="flex animate-in flex-col justify-between gap-3 rounded-lg bg-epi-orange px-4 py-3 text-white shadow-md fade-in slide-in-from-top-2 sm:flex-row sm:items-center"
				>
					<div class="flex items-center gap-3">
						<LifeBuoy class="h-6 w-6 animate-bounce" />
						<div class="flex flex-col">
							<span class="text-sm font-bold tracking-wider uppercase">Demande d'aide</span>
							<span class="text-xs opacity-90">Bloqué sur : <strong>{helpStep.title}</strong></span>
							{#if helpStep.validation?.unlock_code}
								<span class="flex items-center gap-1 text-xs font-bold opacity-90">
									<KeyRound class="h-3 w-3" />
									PIN : {helpStep.validation.unlock_code}
								</span>
							{/if}
						</div>
					</div>
					<div class="flex w-full items-center gap-2 sm:w-auto">
						<form action="?/dismissAlert" method="POST" use:enhance class="flex-1 sm:flex-none">
							<input type="hidden" name="progressId" value={needsHelpProgress.id} />
							<Button
								type="submit"
								variant="ghost"
								size="sm"
								class="w-full text-white hover:bg-white/20 hover:text-white"
							>
								<X class="h-4 w-4" />
							</Button>
						</form>
						<form action="?/unlockStep" method="POST" use:enhance class="flex-1 sm:flex-none">
							<input type="hidden" name="progressId" value={needsHelpProgress.id} />
							<Button
								type="submit"
								variant="secondary"
								size="sm"
								class="w-full font-bold text-epi-orange hover:bg-white/90"
							>
								<LockOpen class="mr-2 h-4 w-4" />
								Débloquer
							</Button>
						</form>
					</div>
				</div>
			{/if}

			<div class="flex w-full items-center justify-between">
				<div class="flex flex-1 items-center gap-4">
					<a href={resolve(`/students/${participation.expand?.student?.id}`)} class="relative block transition-transform hover:scale-105" tabindex="-1" aria-hidden="true">
						<Avatar.Root
							class={cn(
								'h-12 w-12 rounded-full border-2',
								needsHelpProgress
									? 'border-epi-orange'
									: participation.is_present
										? participation.delay > 0
											? 'border-orange-300'
											: 'border-epi-teal'
										: 'border-border'
							)}
						>
							<Avatar.Fallback class="bg-muted font-bold">
								{(participation.expand?.student?.nom?.[0] ?? '').toUpperCase()}
								{(participation.expand?.student?.prenom?.[0] ?? '').toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
						{#if participation.is_present}
							<div
								class={cn(
									'absolute -right-1 -bottom-1 rounded-full p-0.5 ring-2 ring-card',
									needsHelpProgress
										? 'bg-epi-orange text-white'
										: participation.delay > 0
											? 'bg-orange-200 text-orange-800'
											: 'bg-epi-teal text-black'
								)}
							>
								{#if needsHelpProgress}
									<LifeBuoy class="animate-spin-slow h-3 w-3" />
								{:else if participation.delay > 0}
									<Clock class="h-3 w-3" />
								{:else}
									<CircleCheck class="h-3 w-3" />
								{/if}
							</div>
						{/if}
					</a>
					<div class="flex flex-col items-start gap-1">
						<div class="flex items-center gap-2">
							<a href={resolve(`/students/${participation.expand?.student?.id}`)} class="text-base leading-none font-bold transition-colors hover:text-epi-blue">
								<span class="uppercase">{participation.expand?.student?.nom}</span>
								{formatFirstName(participation.expand?.student?.prenom)}
							</a>
							{#if isNewStudent}
								<Badge
									variant="outline"
									class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
								>
									<Sprout class="h-2.5 w-2.5" />
								</Badge>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							<span class="text-xs font-bold tracking-wider text-muted-foreground uppercase">
								{participation.expand?.student?.niveau}
							</span>
							{#if participation.bring_pc}
								<Badge
									variant="outline"
									class="h-4 border-purple-200 bg-purple-50 px-1 py-0 text-[9px] text-purple-700 dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-300"
								>
									<Laptop class="mr-1 h-2 w-2" /> Avec PC
								</Badge>
							{:else}
								<Badge
									variant="outline"
									class="h-4 border-orange-200 bg-orange-50 px-1 py-0 text-[9px] text-orange-700 dark:border-orange-900 dark:bg-orange-900/30 dark:text-orange-300"
								>
									<MonitorX class="mr-1 h-2 w-2" /> Besoin PC
								</Badge>
							{/if}

							{#if participation.delay > 0}
								<Badge
									variant="outline"
									class="h-4 border-orange-200 bg-orange-50 px-1 py-0 text-[9px] text-orange-700 dark:border-orange-900/30 dark:bg-orange-900/20 dark:text-orange-300"
								>
									<Clock class="mr-1 h-2 w-2" />
									{participation.delay >= 60 ? '+60' : participation.delay}m
								</Badge>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Tooltip.Provider delayDuration={300}>
						{#if participation.is_present}
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="outline"
											size="icon"
											class="h-12 w-12 rounded-sm border-epi-blue/30 bg-epi-blue/10 text-epi-blue hover:bg-epi-blue hover:text-white"
											onclick={handleDownloadClick}
										>
											<Award class="h-6 w-6" />
										</Button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>Télécharger le diplôme</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}

						<Popover.Root bind:open={delayOpen}>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon"
										class={cn(
											'h-12 w-12 rounded-sm border-2 transition-all hover:bg-muted',
											participation.delay > 0
												? 'border-orange-200 bg-orange-50/50 text-orange-600 hover:bg-orange-100 hover:text-orange-700 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-400'
												: 'border-orange-200 text-muted-foreground hover:border-orange-300 hover:text-orange-600'
										)}
									>
										<Clock class="h-5 w-5" />
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-56 p-3">
								<div class="grid gap-3">
									<div class="flex items-center justify-between">
										<p class="text-xs font-black text-muted-foreground uppercase">Retard estimé</p>
										{#if participation.delay > 0}
											<span class="text-[10px] font-bold text-orange-600"
												>{participation.delay >= 60 ? '+60' : participation.delay} min</span
											>
										{/if}
									</div>
									<div class="grid grid-cols-3 gap-2">
										{#each delays as m}
											<form
												action="?/updateDelay"
												method="POST"
												use:enhance={() => {
													return async ({ update }) => {
														delayOpen = false;
														await update();
													};
												}}
											>
												<input type="hidden" name="id" value={participation.id} />
												<input type="hidden" name="delay" value={m} />
												<button
													class={cn(
														'flex h-9 w-full cursor-pointer items-center justify-center rounded-md border text-xs font-bold transition-all hover:scale-105 active:scale-95',
														participation.delay === m
															? 'border-orange-500 bg-orange-500 text-white shadow-md'
															: 'border-input bg-background hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700'
													)}
												>
													{m === 60 ? '+' : ''}{m}m
												</button>
											</form>
										{/each}
									</div>
									<form
										action="?/updateDelay"
										method="POST"
										use:enhance={() => {
											return async ({ update }) => {
												delayOpen = false;
												await update();
											};
										}}
									>
										<input type="hidden" name="id" value={participation.id} />
										<input type="hidden" name="delay" value="0" />
										<button
											class={cn(
												'flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent text-xs font-bold transition-all hover:scale-102 active:scale-95',
												participation.delay === 0
													? 'bg-green-100 text-green-700'
													: 'bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-700'
											)}
										>
											<Check class="h-3.5 w-3.5" />
											Pas de retard
										</button>
									</form>
								</div>
							</Popover.Content>
						</Popover.Root>

						<form
							method="POST"
							action="?/togglePresent"
							use:enhance={optimisticToggle(participation.id, 'is_present')}
						>
							<input type="hidden" name="id" value={participation.id} />
							<input type="hidden" name="state" value={participation.is_present.toString()} />
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											type="submit"
											variant={participation.is_present ? 'default' : 'outline'}
											size="icon"
											class="h-12 w-12 rounded-sm transition-all {participation.is_present
												? participation.delay > 0
													? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
													: 'bg-epi-teal text-black hover:bg-epi-teal/90'
												: 'text-muted-foreground hover:text-epi-teal'}"
										>
											<User class="h-6 w-6" />
										</Button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>{participation.is_present ? 'Marquer absent' : 'Marquer présent'}</p>
								</Tooltip.Content>
							</Tooltip.Root>
						</form>
					</Tooltip.Provider>
				</div>
			</div>

			<!-- Subject Display Section -->
			<div class="flex flex-col gap-1.5">
				{#each subjects as sub}
					{@const pin = subjectPinMap.get(sub.id)}
					<div class="flex items-center justify-between rounded-sm bg-muted/50 px-3 py-1.5">
						<div class="flex items-center gap-2 overflow-hidden">
							<BookOpen class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="truncate text-xs font-bold text-foreground">
								{sub.nom}
							</span>
						</div>
						<div class="flex items-center gap-2">
							{#if pin}
								<Badge
									variant="outline"
									class="gap-1 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-400"
								>
									<KeyRound class="h-2.5 w-2.5" />
									PIN : {pin}
								</Badge>
							{/if}
						{#if sub.link}
							<Tooltip.Provider delayDuration={300}>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												size="icon"
												href={sub.link}
												target="_blank"
												rel="noopener noreferrer"
												class="h-6 w-6 shrink-0 text-epi-blue hover:text-epi-blue/80"
												><ExternalLink class="h-3.5 w-3.5" /></Button
											>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content><p>Ouvrir le support original</p></Tooltip.Content>
								</Tooltip.Root>
							</Tooltip.Provider>
						{/if}
						</div>
					</div>
				{:else}
					<div
						class="rounded-sm border border-dashed p-2 text-center text-[10px] text-muted-foreground italic"
					>
						Aucun sujet assigné
					</div>
				{/each}
			</div>

			{#if participation.is_present}
				<div class="border-t border-border pt-2">
					<NoteInput
						id={participation.id}
						value={participation.note}
						placeholder="Observation (ex: Difficultés sur les boucles...)"
						class="h-9 text-xs"
					/>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<style>
	@keyframes slideUpFade {
		from {
			opacity: 0;
			transform: translateY(15px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.card-entry {
		animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
	}
	@keyframes spin-slow {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	.animate-spin-slow {
		animation: spin-slow 3s linear infinite;
	}
</style>
