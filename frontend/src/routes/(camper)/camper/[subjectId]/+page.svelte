<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { marked } from 'marked';
	import { fade, fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { StepsProgressStatusOptions } from '$lib/pocketbase-types';
	import { triggerConfetti } from '$lib/actions/confetti';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		ArrowLeft,
		CircleCheck,
		Lock,
		Map as MapIcon,
		LifeBuoy,
		Trophy,
		CirclePlay,
		Send,
		ArrowRight,
		ShieldCheck,
		FolderOpen,
		X,
		ImagePlus,
		Link as LinkIcon,
		Trash2,
		LoaderCircle
	} from 'lucide-svelte';
	import PocketBase from 'pocketbase';
	import { pbUrl } from '$lib/pocketbase';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let progress = $derived(data.progress);
	let steps = $derived(data.content.steps || []);
	let portfolioItems = $derived(data.portfolioItems || []);

	let currentIndex = $derived(steps.findIndex((s) => s.id === progress.current_step_id));
	let unlockedIndex = $derived(
		progress.unlocked_step_id === 'COMPLETED'
			? steps.length
			: steps.findIndex((s) => s.id === progress.unlocked_step_id)
	);

	let currentStep = $derived(steps[currentIndex] || steps[0]);
	let isCompleted = $derived(progress.status === 'completed');
	let parsedHtml = $derived(marked.parse(currentStep.content_markdown) as string);

	let selectedAnswer = $state<number | null>(null);
	let qcmFails = $state(0);
	let isValidating = $state(false);
	let isCallingManta = $state(false);

	let showRoadmapMobile = $state(false);
	let showPortfolio = $state(false);
	let isUploadingPortfolio = $state(false);

	let portfolioFile = $state<File | null>(null);
	let portfolioUrl = $state('');
	let portfolioCaption = $state('');
	let fileInputRef = $state<HTMLInputElement>(undefined!);

	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		currentStep.id;
		selectedAnswer = null;
		qcmFails = 0;
	});

	// Real-time listener for remote Manta unlocks
	const realtimePb = browser ? new PocketBase(pbUrl) : null;

	if (browser && realtimePb) {
		const studentCookie = document.cookie
			.split(';')
			.find((c) => c.trim().startsWith('pb_student_auth='));
		if (studentCookie) {
			const value = studentCookie.substring(studentCookie.indexOf('=') + 1);
			const { token, model } = JSON.parse(decodeURIComponent(value));
			realtimePb.authStore.save(token, model);
		}
	}

	let progressId = $derived(data.progress.id);

	$effect(() => {
		if (!realtimePb) return;

		const id = progressId;
		realtimePb.collection('steps_progress').subscribe(id, async (e) => {
			if (e.action === 'update') {
				if (e.record.unlocked_step_id !== progress.unlocked_step_id) {
					toast.success('Le Manta a validé ton étape !', { duration: 4000 });
					if (e.record.unlocked_step_id === 'COMPLETED') triggerConfetti();
					await invalidateAll();
				} else if (e.record.status !== progress.status) {
					await invalidateAll();
				}
			}
		});

		return () => {
			realtimePb.collection('steps_progress').unsubscribe(id);
		};
	});

	function getStepStatus(index: number) {
		if (progress.unlocked_step_id === 'COMPLETED' || index < unlockedIndex) return 'done';
		if (index === unlockedIndex) return 'active';
		return 'locked';
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			portfolioFile = target.files[0];
		}
	}
</script>

<div class="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
	<!-- TOP NAVIGATION BAR -->
	<header
		class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-6 dark:border-slate-800 dark:bg-slate-900"
	>
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="icon" href={resolve('/camper')} class="h-9 w-9 shrink-0">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div>
				<h1 class="line-clamp-1 font-heading text-lg tracking-wide uppercase">
					{data.subject.nom}<span class="text-epi-teal">_</span>
				</h1>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				class="md:hidden"
				onclick={() => (showRoadmapMobile = !showRoadmapMobile)}
			>
				<MapIcon class="mr-2 h-4 w-4" /> Carte
			</Button>

			<!-- Portfolio Trigger -->
			<Button
				variant="secondary"
				size="sm"
				class="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
				onclick={() => (showPortfolio = true)}
			>
				<FolderOpen class="mr-2 h-4 w-4" />
				<span class="hidden sm:inline">Mon Portfolio</span>
				{#if portfolioItems.length > 0}
					<Badge
						variant="default"
						class="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 p-0 text-[10px]"
						>{portfolioItems.length}</Badge
					>
				{/if}
			</Button>

			<div
				class="hidden items-center gap-3 rounded-full bg-slate-100 px-3 py-1.5 md:flex dark:bg-slate-800"
			>
				<div class="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
					<div
						class="h-full bg-epi-teal transition-all duration-500"
						style="width: {(Math.min(unlockedIndex, steps.length) / steps.length) * 100}%"
					></div>
				</div>
				<span class="text-xs font-bold text-slate-500 uppercase">
					{Math.min(unlockedIndex, steps.length)} / {steps.length}
				</span>
			</div>
		</div>
	</header>

	<div class="relative flex flex-1 overflow-hidden">
		<!-- LEFT SIDEBAR: The Roadmap -->
		<aside
			class={cn(
				'absolute inset-y-0 left-0 z-20 w-72 flex-col border-r border-slate-200 bg-slate-50 transition-transform duration-300 md:relative md:flex md:translate-x-0 dark:border-slate-800 dark:bg-slate-950',
				showRoadmapMobile ? 'flex translate-x-0 shadow-2xl' : '-translate-x-full'
			)}
		>
			<div class="flex items-center justify-between p-4 md:hidden">
				<span class="font-bold text-slate-500 uppercase">Plan de vol</span>
				<Button variant="ghost" size="icon" onclick={() => (showRoadmapMobile = false)}>
					<ArrowLeft class="h-4 w-4" />
				</Button>
			</div>

			<ScrollArea class="flex-1 p-4">
				<div class="space-y-2">
					{#each steps as step, i (step.id)}
						{@const status = getStepStatus(i)}
						{@const isCurrent = i === currentIndex}

						<form
							method="POST"
							action="?/changeStep"
							use:enhance={() => {
								return async ({ update }) => {
									await update({ reset: false });
									showRoadmapMobile = false;
								};
							}}
						>
							<input type="hidden" name="stepId" value={step.id} />
							<input type="hidden" name="progressId" value={progress.id} />

							<button
								type="submit"
								disabled={status === 'locked'}
								class={cn(
									'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
									isCurrent
										? 'border-epi-teal bg-teal-50 shadow-sm dark:bg-teal-950/20'
										: 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800',
									status === 'locked' && 'cursor-not-allowed opacity-50 hover:bg-transparent'
								)}
							>
								<div
									class={cn(
										'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
										status === 'done'
											? 'bg-epi-teal text-black'
											: isCurrent
												? 'bg-white text-epi-teal shadow-sm dark:bg-slate-900'
												: 'bg-slate-200 text-slate-500 dark:bg-slate-800'
									)}
								>
									{#if status === 'done'}<CircleCheck
											class="h-4 w-4"
										/>{:else if status === 'locked'}<Lock class="h-4 w-4" />{:else}{i + 1}{/if}
								</div>
								<div class="flex flex-col overflow-hidden">
									<span
										class={cn(
											'truncate text-sm font-bold',
											isCurrent
												? 'text-slate-900 dark:text-white'
												: 'text-slate-600 dark:text-slate-400'
										)}>{step.title}</span
									>
									<span class="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
										{#if step.type === 'theory'}Théorie{:else if step.type === 'exercise'}Exercice{:else}Validation{/if}
									</span>
								</div>
							</button>
						</form>
					{/each}
				</div>
			</ScrollArea>
		</aside>

		{#if showRoadmapMobile}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-0 z-10 bg-slate-900/50 backdrop-blur-sm md:hidden"
				transition:fade={{ duration: 200 }}
				onclick={() => (showRoadmapMobile = false)}
			></div>
		{/if}

		<!-- MAIN CONTENT AREA -->
		<main class="relative flex-1 overflow-y-auto bg-white dark:bg-slate-900">
			{#if isCompleted && currentIndex === steps.length - 1}
				<div
					class="flex h-full flex-col items-center justify-center p-8 text-center"
					in:fly={{ y: 20, duration: 500 }}
				>
					<div class="mb-6 rounded-full bg-teal-50 p-6 dark:bg-teal-950/30">
						<Trophy class="h-16 w-16 text-epi-teal" />
					</div>
					<h2 class="mb-4 font-heading text-4xl text-slate-900 uppercase dark:text-white">
						Sujet Terminé !
					</h2>
					<p class="mb-8 max-w-md text-lg text-slate-500">
						Excellent travail. Tu as validé toutes les étapes de cette mission.
					</p>

					<div class="flex gap-4">
						<Button
							size="lg"
							href={resolve('/camper')}
							class="rounded-xl bg-epi-blue font-bold text-white shadow-lg hover:bg-epi-blue/90"
							>Retourner au Cockpit</Button
						>
						<Button
							size="lg"
							variant="outline"
							class="rounded-xl border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
							onclick={() => (showPortfolio = true)}
						>
							<FolderOpen class="mr-2 h-5 w-5" /> Gérer mon Portfolio
						</Button>
					</div>
				</div>
			{:else}
				{#key currentStep.id}
					<div
						class="mx-auto max-w-3xl px-6 py-8 pb-32 md:py-12"
						in:fly={{ y: 15, duration: 300, delay: 100 }}
					>
						<Badge
							variant="outline"
							class="mb-4 border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950"
						>
							Étape {currentIndex + 1}
						</Badge>

						<h2
							class="mb-8 font-heading text-3xl tracking-wide text-slate-900 uppercase dark:text-white"
						>
							{currentStep.title}
						</h2>

						<div
							class="markdown-content prose prose-slate dark:prose-invert max-w-none text-base leading-relaxed"
						>
							{@html parsedHtml}
						</div>

						<hr class="my-10 border-slate-200 dark:border-slate-800" />

						<div
							class="rounded-2xl border-2 border-slate-100 bg-slate-50 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/50"
						>
							{#if currentIndex < unlockedIndex}
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3 text-epi-teal">
										<CircleCheck class="h-6 w-6" />
										<span class="font-bold uppercase">Étape validée</span>
									</div>
									{#if currentIndex < steps.length - 1}
										<form method="POST" action="?/changeStep" use:enhance>
											<input type="hidden" name="stepId" value={steps[currentIndex + 1].id} />
											<input type="hidden" name="progressId" value={progress.id} />
											<Button type="submit" variant="outline" class="gap-2 rounded-xl">
												Passer à la suite <ArrowRight class="h-4 w-4" />
											</Button>
										</form>
									{/if}
								</div>
							{:else if currentStep.validation?.type === 'auto_qcm' && currentStep.validation.qcm_data}
								<div class="space-y-6">
									<div class="flex items-center gap-2">
										<CirclePlay class="h-5 w-5 text-epi-blue" />
										<h3 class="font-bold text-slate-900 uppercase dark:text-white">
											Validation Requise
										</h3>
									</div>
									<p class="text-sm font-medium text-slate-700 dark:text-slate-300">
										{currentStep.validation.qcm_data.question}
									</p>

									<form
										action="?/validateStep"
										method="POST"
										use:enhance={() => {
											isValidating = true;
											return async ({ result, update }) => {
												isValidating = false;
												if (result.type === 'success') {
													toast.success('Bonne réponse !');
													triggerConfetti();
													qcmFails = 0;
												} else if (result.type === 'failure') {
													qcmFails++;
													toast.error(
														((result.data as Record<string, unknown>)?.message as string) ||
															'Mauvaise réponse.'
													);
												}
												await update({ reset: false });
											};
										}}
									>
										<input type="hidden" name="stepId" value={currentStep.id} />
										<input type="hidden" name="progressId" value={progress.id} />
										<input type="hidden" name="answerIndex" value={selectedAnswer} />

										<div class="grid gap-3">
											{#each currentStep.validation.qcm_data.options as option, idx}
												<button
													type="button"
													onclick={() => (selectedAnswer = idx)}
													class={cn(
														'flex items-center rounded-xl border-2 p-4 text-left transition-all',
														selectedAnswer === idx
															? 'border-epi-blue bg-blue-50 text-epi-blue shadow-md dark:bg-blue-900/20'
															: 'border-slate-200 bg-white hover:border-epi-blue/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-epi-blue/50'
													)}
												>
													<div
														class={cn(
															'mr-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
															selectedAnswer === idx
																? 'border-epi-blue bg-epi-blue'
																: 'border-slate-300 dark:border-slate-600'
														)}
													>
														{#if selectedAnswer === idx}<div
																class="h-2 w-2 rounded-full bg-white"
															></div>{/if}
													</div>
													<span class="text-sm font-medium">{option}</span>
												</button>
											{/each}
										</div>

										<div
											class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
										>
											<Button
												type="submit"
												disabled={selectedAnswer === null || isValidating || qcmFails >= 3}
												class="w-full rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90 sm:w-auto"
											>
												{#if isValidating}Vérification...{:else}<Send class="mr-2 h-4 w-4" /> Valider
													ma réponse{/if}
											</Button>

											{#if qcmFails >= 3}
												<span
													class="animate-pulse text-center text-xs font-bold text-epi-orange uppercase sm:text-right"
												>
													Bloqué ? Utilise le bouton "Appeler un Manta" 👇
												</span>
											{/if}
										</div>
									</form>
								</div>
							{:else if currentStep.validation?.type === 'manual_manta'}
								<div class="flex flex-col items-center justify-center py-6 text-center">
									<div class="mb-4 rounded-full bg-orange-50 p-4 dark:bg-orange-950/30">
										<Lock class="h-8 w-8 text-epi-orange" />
									</div>
									<h3 class="mb-2 font-bold text-slate-900 uppercase dark:text-white">
										Validation Manta
									</h3>
									<p class="mb-6 max-w-sm text-sm text-slate-500">
										Montre ton travail, puis clique sur "Appeler un Manta". Le Manta validera à
										distance.
									</p>

									<!-- Fallback local PIN form -->
									<div
										class="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
									>
										<p class="mb-3 text-[10px] font-bold text-slate-400 uppercase">
											Secours Manta (Local PIN)
										</p>
										<form
											action="?/validateStep"
											method="POST"
											use:enhance={() => {
												isValidating = true;
												return async ({ result, update }) => {
													isValidating = false;
													if (result.type === 'success') {
														toast.success('Étape débloquée localement !');
														if (currentIndex === steps.length - 1) triggerConfetti();
													} else {
														toast.error((result as any).data?.message || 'PIN Incorrect');
													}
													await update({ reset: false });
												};
											}}
											class="flex gap-2"
										>
											<input type="hidden" name="stepId" value={currentStep.id} />
											<input type="hidden" name="progressId" value={progress.id} />
											<Input
												name="pin"
												type="password"
												placeholder="••••"
												maxlength={4}
												class="h-10 text-center font-mono font-bold tracking-widest"
											/>
											<Button
												type="submit"
												disabled={isValidating}
												variant="secondary"
												class="h-10 px-3"
											>
												<ShieldCheck class="h-4 w-4" />
											</Button>
										</form>
									</div>
								</div>
							{:else}
								<div class="flex items-center justify-between">
									<div>
										<h3 class="font-bold text-slate-900 uppercase dark:text-white">
											Fin de la lecture
										</h3>
										<p class="text-sm text-slate-500">Prêt pour la suite ?</p>
									</div>
									<form
										method="POST"
										action="?/validateStep"
										use:enhance={() => {
											return async ({ update }) => {
												await update({ reset: false });
											};
										}}
									>
										<input type="hidden" name="stepId" value={currentStep.id} />
										<input type="hidden" name="progressId" value={progress.id} />
										<Button
											type="submit"
											class="rounded-xl bg-epi-teal font-bold text-black shadow-md transition-transform hover:bg-epi-teal/80 active:scale-95"
										>
											Continuer <ArrowRight class="ml-2 h-4 w-4" />
										</Button>
									</form>
								</div>
							{/if}
						</div>
					</div>
				{/key}
			{/if}
		</main>

		<!-- THE MANTA SIGNAL BUTTON -->
		<div class="absolute right-6 bottom-6 z-30">
			<form
				method="POST"
				action="?/toggleHelp"
				use:enhance={() => {
					isCallingManta = true;
					// Optimistic UI update
					const previousStatus = progress.status;
					progress.status =
						previousStatus === 'needs_help'
							? StepsProgressStatusOptions.active
							: StepsProgressStatusOptions.needs_help;

					return async ({ result, update }) => {
						isCallingManta = false;
						if (result.type !== 'success') {
							progress.status = previousStatus;
							toast.error('Impossible de contacter le serveur.');
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="progressId" value={progress.id} />
				<input type="hidden" name="currentStatus" value={progress.status} />

				<Button
					type="submit"
					size="lg"
					disabled={isCallingManta || isCompleted}
					class={cn(
						'h-14 gap-2 rounded-full font-bold text-white shadow-xl transition-all duration-300',
						progress.status === 'needs_help'
							? 'scale-100 bg-slate-700 ring-2 shadow-slate-900/20 ring-slate-400 ring-offset-2 hover:bg-slate-800 dark:ring-offset-slate-950'
							: 'bg-epi-orange shadow-epi-orange/30 hover:scale-105 hover:bg-epi-orange/90 active:scale-95'
					)}
				>
					{#if progress.status === 'needs_help'}
						<CircleCheck class="h-5 w-5" />
						<span class="hidden sm:inline">Manta prévenu ! (Annuler)</span>
					{:else}
						<LifeBuoy class={cn('h-5 w-5', isCompleted ? '' : 'animate-pulse')} />
						<span class="hidden sm:inline">Appeler un Manta</span>
					{/if}
				</Button>
			</form>
		</div>
	</div>

	<!-- PORTFOLIO SLIDING DRAWER -->
	{#if showPortfolio}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
			transition:fade={{ duration: 200 }}
			onclick={() => (showPortfolio = false)}
		></div>

		<div
			class="absolute inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900"
			transition:fly={{ x: 100, duration: 300 }}
		>
			<div
				class="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800"
			>
				<div class="flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
					>
						<FolderOpen class="h-5 w-5" />
					</div>
					<h2 class="font-heading text-lg uppercase">Mon Portfolio</h2>
				</div>
				<Button variant="ghost" size="icon" onclick={() => (showPortfolio = false)}
					><X class="h-5 w-5" /></Button
				>
			</div>

			<ScrollArea class="flex-1 p-6">
				<!-- Upload Form -->
				<div
					class="mb-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50"
				>
					<h3 class="mb-4 text-xs font-bold text-slate-500 uppercase">Ajouter une création</h3>
					<form
						method="POST"
						action="?/addPortfolioItem"
						enctype="multipart/form-data"
						use:enhance={() => {
							isUploadingPortfolio = true;
							return async ({ result, update }) => {
								isUploadingPortfolio = false;
								if (result.type === 'success') {
									toast.success('Élément ajouté au portfolio !');
									portfolioFile = null;
									portfolioUrl = '';
									portfolioCaption = '';
									if (fileInputRef) fileInputRef.value = '';
								} else {
									toast.error((result as any).data?.message || "Erreur lors de l'ajout.");
								}
								await update();
							};
						}}
						class="space-y-4"
					>
						<input type="hidden" name="eventId" value={data.eventId} />

						<!-- File Upload -->
						<div class="space-y-2">
							<div class="flex w-full items-center justify-center">
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<label
									for="dropzone-file"
									class="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
								>
									<div class="flex flex-col items-center justify-center pt-5 pb-6">
										{#if portfolioFile}
											<CircleCheck class="mb-2 h-6 w-6 text-epi-teal" />
											<p class="text-sm font-bold text-slate-700 dark:text-slate-300">
												{portfolioFile.name}
											</p>
										{:else}
											<ImagePlus class="mb-2 h-6 w-6 text-slate-400" />
											<p class="text-xs text-slate-500">
												<span class="font-bold text-epi-blue">Clique</span> pour ajouter une image
											</p>
										{/if}
									</div>
									<input
										bind:this={fileInputRef}
										id="dropzone-file"
										name="file"
										type="file"
										accept="image/png, image/jpeg, image/webp"
										class="hidden"
										onchange={handleFileChange}
									/>
								</label>
							</div>
						</div>

						<div class="relative flex items-center py-2">
							<div class="grow border-t border-slate-200 dark:border-slate-800"></div>
							<span class="shrink-0 px-3 text-[10px] font-bold text-slate-400 uppercase">OU</span>
							<div class="grow border-t border-slate-200 dark:border-slate-800"></div>
						</div>

						<!-- URL Input -->
						<div class="relative">
							<LinkIcon class="absolute top-3 left-3 h-4 w-4 text-slate-400" />
							<Input
								name="url"
								bind:value={portfolioUrl}
								placeholder="Lien GitHub, Replit, Figma..."
								class="h-10 rounded-xl pl-9"
							/>
						</div>

						<!-- Caption -->
						<Input
							name="caption"
							bind:value={portfolioCaption}
							placeholder="Petite description (Ex: Mon premier jeu Python)"
							class="h-10 rounded-xl"
						/>

						<Button
							type="submit"
							disabled={isUploadingPortfolio || (!portfolioFile && !portfolioUrl)}
							class="w-full rounded-xl bg-purple-600 font-bold text-white hover:bg-purple-700"
						>
							{#if isUploadingPortfolio}
								<LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Ajout en cours...
							{:else}
								Enregistrer dans mon Portfolio
							{/if}
						</Button>
					</form>
				</div>

				<!-- Gallery -->
				<div class="space-y-4">
					<h3 class="text-xs font-bold text-slate-500 uppercase">
						Mes Créations ({portfolioItems.length})
					</h3>

					{#if portfolioItems.length === 0}
						<div
							class="flex flex-col items-center justify-center rounded-xl bg-slate-100 p-8 text-center dark:bg-slate-800/50"
						>
							<FolderOpen class="mb-2 h-8 w-8 text-slate-300" />
							<p class="text-sm text-slate-500">Ton portfolio est vide pour le moment.</p>
						</div>
					{:else}
						<div class="grid gap-4 sm:grid-cols-2">
							{#each portfolioItems as item (item.id)}
								<div
									class="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
								>
									{#if item.file}
										<a
											href={`${pbUrl}/api/files/${item.collectionId}/${item.id}/${item.file}`}
											target="_blank"
											rel="noopener noreferrer"
											class="block aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800"
											title="Voir l'image en plein écran"
										>
											<img
												src={`${pbUrl}/api/files/${item.collectionId}/${item.id}/${item.file}`}
												alt={item.caption || 'Création'}
												class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
											/>
										</a>
									{:else if item.url}
										<div
											class="flex aspect-video w-full flex-col items-center justify-center bg-purple-50 p-4 dark:bg-purple-900/20"
										>
											<LinkIcon class="mb-2 h-8 w-8 text-purple-400" />
											<a
												href={item.url}
												target="_blank"
												rel="noopener noreferrer"
												class="line-clamp-2 text-center text-xs font-bold break-all text-purple-600 hover:underline"
											>
												{item.url}
											</a>
										</div>
									{/if}

									{#if item.caption}
										<div class="p-3">
											<p
												class="line-clamp-2 text-xs font-medium text-slate-700 dark:text-slate-300"
											>
												{item.caption}
											</p>
										</div>
									{/if}

									<!-- Delete Button -->
									<div
										class="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
									>
										<form
											action="?/deletePortfolioItem"
											method="POST"
											use:enhance={() => {
												return async ({ update }) => {
													toast.success('Élément supprimé');
													await update();
												};
											}}
										>
											<input type="hidden" name="itemId" value={item.id} />
											<Button
												type="submit"
												variant="destructive"
												size="icon"
												class="h-8 w-8 rounded-full shadow-md"
											>
												<Trash2 class="h-4 w-4" />
											</Button>
										</form>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</ScrollArea>
		</div>
	{/if}
</div>
