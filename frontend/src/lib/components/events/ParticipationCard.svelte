<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		CircleCheck,
		User,
		Laptop,
		MonitorX,
		ExternalLink,
		BookOpen,
		Award,
		Sprout
	} from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import NoteInput from '$lib/components/events/NoteInput.svelte';

	let {
		participation = $bindable(),
		event,
		optimisticToggle,
		onDownload,
		index = 0
	}: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		participation: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		event: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		optimisticToggle: (id: string, field: 'is_present' | 'bring_pc') => any;
		onDownload?: () => void;
		index?: number;
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
		class="overflow-hidden border-2 shadow-sm transition-all duration-200 {participation.is_present
			? 'border-epi-teal bg-card'
			: 'border-transparent opacity-80'}"
	>
		<Card.Content class="flex flex-col gap-4 p-4">
			<div class="flex w-full items-center justify-between">
				<div class="flex flex-1 items-center gap-4">
					<div class="relative">
						<Avatar.Root
							class="h-12 w-12 rounded-full border-2 {participation.is_present
								? 'border-epi-teal'
								: 'border-border'}"
						>
							<Avatar.Fallback class="bg-muted font-bold">
								{(participation.expand?.student?.prenom?.[0] ?? '').toUpperCase()}
								{(participation.expand?.student?.nom?.[0] ?? '').toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
						{#if participation.is_present}
							<div
								class="absolute -right-1 -bottom-1 rounded-full bg-epi-teal p-0.5 text-black ring-2 ring-card"
							>
								<CircleCheck class="h-3 w-3" />
							</div>
						{/if}
					</div>
					<div class="flex flex-col items-start gap-1">
						<div class="flex items-center gap-2">
							<span class="text-base leading-none font-bold">
								{formatFirstName(participation.expand?.student?.prenom)}
								<span class="uppercase">{participation.expand?.student?.nom}</span>
							</span>
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
												? 'bg-epi-teal text-black hover:bg-epi-teal'
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
					<div class="flex items-center justify-between rounded-sm bg-muted/50 px-3 py-1.5">
						<div class="flex items-center gap-2 overflow-hidden">
							<BookOpen class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="truncate text-xs font-bold text-foreground">
								{sub.nom}
							</span>
						</div>
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
											>
												<ExternalLink class="h-3.5 w-3.5" />
											</Button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<p>Ouvrir le sujet</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Tooltip.Provider>
						{/if}
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
</style>
