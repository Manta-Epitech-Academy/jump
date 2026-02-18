<script lang="ts">
	import type { PageData } from './$types';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import {
		ArrowLeft,
		Trophy,
		Calendar,
		MessageSquareQuote,
		Pencil,
		CircleCheck,
		CircleX,
		Clock,
		BookOpen,
		Mail,
		Phone,
		Users,
		ExternalLink,
		Trash2,
		CalendarClock
	} from 'lucide-svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { formatDateFr, cn } from '$lib/utils';
	import { enhance as kitEnhance } from '$app/forms';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	const {
		form,
		errors,
		delayed,
		enhance: superEnhance
	} = superForm(
		untrack(() => data.form),
		{
			onResult: ({ result }) => {
				if (result.type === 'success') {
					editOpen = false;
					toast.success('Profil mis à jour');
				}
			}
		}
	);

	let editOpen = $state(false);
	let deleteDialogOpen = $state(false);

	function getInitials(prenom: string, nom: string) {
		return (prenom[0] + nom[0]).toUpperCase();
	}

	const niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];

	let xpProgress = $derived(Math.min((data.student.xp / 1000) * 100, 100));
</script>

<div class="space-y-6 pb-10">
	<!-- HEADER NAVIGATION -->
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href={resolve('/students')}>
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<h1 class="text-3xl font-bold text-epi-blue uppercase">
			Dossier Élève<span class="text-epi-teal">_</span>
		</h1>
	</div>

	<div class="grid gap-6 md:grid-cols-12">
		<div class="space-y-6 md:col-span-4 lg:col-span-3">
			<Card.Root class="overflow-hidden border-t-4 border-t-epi-blue shadow-md">
				<Card.Header class="items-center pb-2 text-center">
					<Avatar.Root class="h-24 w-24 border-4 border-muted bg-white shadow-sm">
						<Avatar.Fallback class="bg-secondary text-2xl font-bold text-secondary-foreground">
							{getInitials(data.student.prenom, data.student.nom)}
						</Avatar.Fallback>
					</Avatar.Root>
					<Card.Title class="mt-4 text-xl uppercase">
						{data.student.prenom}
						{data.student.nom}
					</Card.Title>
					<Badge variant="outline" class="mt-1 border-epi-blue font-bold text-epi-blue uppercase">
						{data.student.niveau}
					</Badge>
				</Card.Header>
				<Card.Content class="space-y-6">
					<!-- Contact Info -->
					<div class="flex flex-col gap-2 text-sm text-muted-foreground">
						{#if data.student.email}
							<div class="flex items-center gap-2">
								<Mail class="h-3.5 w-3.5" />
								<span class="truncate">{data.student.email}</span>
							</div>
						{/if}
						{#if data.student.phone}
							<div class="flex items-center gap-2">
								<Phone class="h-3.5 w-3.5" />
								<span>{data.student.phone}</span>
							</div>
						{/if}
						{#if data.student.parent_email || data.student.parent_phone}
							<Separator class="my-1" />
							<div class="flex flex-col gap-1">
								<span
									class="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase"
								>
									<Users class="h-3 w-3" /> Contact Parent
								</span>
								{#if data.student.parent_email}
									<div class="flex items-center gap-2">
										<Mail class="h-3.5 w-3.5" />
										<span class="truncate">{data.student.parent_email}</span>
									</div>
								{/if}
								{#if data.student.parent_phone}
									<div class="flex items-center gap-2">
										<Phone class="h-3.5 w-3.5" />
										<span>{data.student.parent_phone}</span>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<Separator />

					<!-- XP SECTION -->
					<div class="space-y-3 text-center">
						<div class="relative inline-flex items-center justify-center">
							<!-- Glowing effect behind the icon -->
							<div class="absolute inset-0 rounded-full bg-epi-orange/30 blur-lg"></div>
							<Trophy class="duration-2000ms relative h-8 w-8 animate-bounce text-epi-orange" />
						</div>

						<div class="flex flex-col items-center">
							<!-- SHINY BADGE LOGIC -->
							<Badge
								variant="outline"
								class={cn(
									'mt-2 mb-2 px-3 py-1 text-sm font-black tracking-widest uppercase',
									data.student.xp >= 500
										? 'shiny-badge border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
										: 'border-border text-muted-foreground'
								)}
							>
								{data.student.xp >= 500 ? 'Expert ✦' : 'Novice'}
							</Badge>

							<span class="text-3xl font-black tracking-tighter text-foreground italic">
								{data.student.xp} <span class="text-lg text-epi-orange not-italic">XP</span>
							</span>
						</div>

						<div class="relative h-4 w-full overflow-hidden rounded-full bg-muted shadow-inner">
							<!-- Striped animated background for the progress bar -->
							<div
								class="relative h-full overflow-hidden bg-epi-orange transition-all duration-1000 ease-out"
								style="width: {xpProgress}%;"
							>
								<div
									class="animate-stripes absolute inset-0 h-full w-full bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)] bg-size-[1rem_1rem]"
								></div>
							</div>
						</div>

						<div
							class="flex justify-between px-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
						>
							<span>Novice</span>
							<span>Expert</span>
						</div>
					</div>

					<Separator />

					<!-- KPI GRID -->
					<div class="grid grid-cols-2 gap-4 text-center">
						<div class="rounded-sm bg-muted/30 p-2">
							<div class="text-lg font-bold">{data.stats.presentCount}</div>
							<div class="text-[9px] font-bold text-muted-foreground uppercase">Présences</div>
						</div>
					</div>

					<Button variant="outline" class="w-full" onclick={() => (editOpen = true)}>
						<Pencil class="mr-2 h-3.5 w-3.5" /> Modifier le profil
					</Button>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="space-y-6 md:col-span-8 lg:col-span-9">
			<div class="flex items-center justify-between">
				<h2 class="flex items-center gap-2 text-xl font-bold uppercase">
					<Clock class="h-5 w-5 text-muted-foreground" />
					Historique Pédagogique
				</h2>
				<Badge variant="secondary">{data.participations.length} sessions</Badge>
			</div>

			<div
				class="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:-translate-x-px before:bg-linear-to-b before:from-transparent before:via-slate-300 before:to-transparent md:before:mx-auto md:before:translate-x-0"
			>
				{#each data.participations as p (p.id)}
					{@const eventDate = new Date(p.expand?.event?.date)}
					{@const now = new Date()}
					{@const isUpcoming = eventDate > now}
					{@const isPresent = p.is_present}

					<div
						class="group is-active relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse"
					>
						<!-- TIMELINE DOT -->
						<div
							class={cn(
								'z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-background shadow-sm md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2',
								isPresent
									? 'bg-epi-teal text-black'
									: isUpcoming
										? 'bg-blue-100 text-epi-blue dark:bg-blue-900/30 dark:text-blue-400'
										: 'bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
							)}
						>
							{#if isPresent}
								<CircleCheck class="h-5 w-5" />
							{:else if isUpcoming}
								<CalendarClock class="h-5 w-5" />
							{:else}
								<CircleX class="h-5 w-5" />
							{/if}
						</div>

						<!-- CARD CONTENT -->
						<Card.Root
							class="w-[calc(100%-4rem)] shadow-sm transition-shadow hover:shadow-md md:w-[calc(50%-2.5rem)]"
						>
							<Card.Header class="p-4 pb-2">
								<div class="flex items-start justify-between">
									<div class="space-y-1">
										<div class="flex items-center gap-2">
											<Badge variant="outline" class="h-5 px-1.5 text-[10px] font-normal">
												{formatDateFr(p.expand?.event?.date)}
											</Badge>

											{#if !isPresent}
												{#if isUpcoming}
													<Badge
														variant="secondary"
														class="h-5 border-blue-200 bg-blue-100 px-1.5 text-[10px] text-blue-700 uppercase hover:bg-blue-200 dark:border-blue-900 dark:bg-blue-900/40 dark:text-blue-400"
													>
														Inscrit
													</Badge>
												{:else}
													<Badge variant="destructive" class="h-5 px-1.5 text-[10px] uppercase">
														Absent
													</Badge>
												{/if}
											{/if}
										</div>
										<Card.Title class="text-base leading-tight font-bold uppercase">
											{p.expand?.event?.titre || 'Événement inconnu'}
										</Card.Title>
									</div>
								</div>
							</Card.Header>

							<Card.Content class="space-y-3 p-4 pt-2">
								{#if p.expand?.subjects && p.expand.subjects.length > 0}
									<div class="flex flex-col gap-2">
										{#each p.expand.subjects as subject}
											<div
												class="flex items-start justify-between gap-2 rounded-sm bg-muted/50 p-2"
											>
												<div class="flex items-start gap-2">
													<BookOpen class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
													<div>
														<p class="text-sm font-bold">{subject.nom}</p>
														{#if subject.expand?.themes}
															<div class="mt-1 flex flex-wrap gap-1">
																{#each subject.expand.themes as theme}
																	<span
																		class="text-[9px] font-bold tracking-wider text-teal-700 uppercase"
																		>#{theme.nom}</span
																	>
																{/each}
															</div>
														{/if}
													</div>
												</div>
												{#if subject.link}
													<Tooltip.Provider delayDuration={300}>
														<Tooltip.Root>
															<Tooltip.Trigger>
																{#snippet child({ props })}
																	<Button
																		{...props}
																		variant="ghost"
																		size="icon"
																		href={subject.link}
																		target="_blank"
																		rel="noopener noreferrer"
																		class="h-6 w-6 shrink-0 text-epi-blue hover:text-epi-blue/80"
																	>
																		<ExternalLink class="h-3.5 w-3.5" />
																	</Button>
																{/snippet}
															</Tooltip.Trigger>
															<Tooltip.Content><p>Voir le support</p></Tooltip.Content>
														</Tooltip.Root>
													</Tooltip.Provider>
												{/if}
											</div>
										{/each}
									</div>
								{/if}

								{#if p.note}
									<div
										class="relative rounded-sm border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"
									>
										<MessageSquareQuote
											class="absolute -top-2 -right-2 h-6 w-6 fill-yellow-100 text-yellow-400"
										/>
										<span class="mb-1 block text-[10px] font-bold text-yellow-700/70 uppercase"
											>Observation encadrant :</span
										>
										<p class="italic">« {p.note} »</p>
									</div>
								{:else if p.is_present}
									<p class="pl-1 text-xs text-muted-foreground italic">
										Aucune observation enregistrée.
									</p>
								{/if}
							</Card.Content>
						</Card.Root>
					</div>
				{:else}
					<div class="py-12 text-center">
						<div
							class="inline-flex items-center justify-center mb-4 h-16 w-16 rounded-full bg-muted"
						>
							<Calendar class="h-8 w-8 text-muted-foreground" />
						</div>
						<h3 class="text-lg font-bold text-muted-foreground uppercase">Aucun historique</h3>
						<p class="text-sm text-muted-foreground">
							Cet élève n'a pas encore participé à un événement.
						</p>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<Dialog.Root bind:open={editOpen}>
		<Dialog.Content class="sm:max-w-125">
			<Dialog.Header>
				<Dialog.Title>Modifier le profil</Dialog.Title>
			</Dialog.Header>
			<form method="POST" action="?/update" use:superEnhance class="grid gap-4 py-4">
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label>Prénom</Label>
						<Input name="prenom" bind:value={$form.prenom} />
						{#if $errors.prenom}<p class="text-xs text-destructive">{$errors.prenom}</p>{/if}
					</div>
					<div class="space-y-2">
						<Label>Nom</Label>
						<Input name="nom" bind:value={$form.nom} />
						{#if $errors.nom}<p class="text-xs text-destructive">{$errors.nom}</p>{/if}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label>Email</Label>
						<Input name="email" type="email" bind:value={$form.email} />
						{#if $errors.email}<p class="text-xs text-destructive">{$errors.email}</p>{/if}
					</div>
					<div class="space-y-2">
						<Label>Téléphone</Label>
						<Input name="phone" type="tel" bind:value={$form.phone} />
						{#if $errors.phone}<p class="text-xs text-destructive">{$errors.phone}</p>{/if}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label>Email Parent</Label>
						<Input name="parent_email" type="email" bind:value={$form.parent_email} />
						{#if $errors.parent_email}<p class="text-xs text-destructive">
								{$errors.parent_email}
							</p>{/if}
					</div>
					<div class="space-y-2">
						<Label>Téléphone Parent</Label>
						<Input name="parent_phone" type="tel" bind:value={$form.parent_phone} />
						{#if $errors.parent_phone}<p class="text-xs text-destructive">
								{$errors.parent_phone}
							</p>{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label>Niveau</Label>
					<Select.Root type="single" name="niveau" bind:value={$form.niveau}>
						<Select.Trigger>{$form.niveau}</Select.Trigger>
						<Select.Content>
							{#each niveaux as n}
								<Select.Item value={n}>{n}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="niveau" value={$form.niveau} />
					{#if $errors.niveau}<p class="text-xs text-destructive">{$errors.niveau}</p>{/if}
				</div>

				<Dialog.Footer class="flex items-center justify-between">
					<Button type="submit" disabled={$delayed} class="w-full">
						{$delayed ? 'Sauvegarde...' : 'Enregistrer'}
					</Button>
				</Dialog.Footer>
			</form>

			<Separator class="my-2" />

			<div class="space-y-4 rounded-sm border border-destructive/20 bg-destructive/5 p-4">
				<div class="space-y-1">
					<h4 class="text-sm font-bold text-destructive uppercase">Zone de danger</h4>
					<p class="text-xs text-muted-foreground">
						La suppression d'un élève est définitive et entraînera la suppression de tout son
						historique.
					</p>
				</div>
				<Button
					type="button"
					variant="destructive"
					class="w-full"
					onclick={() => {
						editOpen = false;
						deleteDialogOpen = true;
					}}
				>
					<Trash2 class="mr-2 h-4 w-4" />
					Supprimer le dossier
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Root>

	<AlertDialog.Root bind:open={deleteDialogOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Confirmer la suppression</AlertDialog.Title>
				<AlertDialog.Description>
					Êtes-vous sûr de vouloir supprimer définitivement cet élève et tout son historique ?
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
				<form action="?/delete" method="POST" use:kitEnhance>
					<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
						Supprimer définitivement
					</AlertDialog.Action>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>

<style>
	/* Shiny badge effect for EXPERT level */
	@keyframes sheen {
		0% {
			background-position: 200% center;
		}
		100% {
			background-position: -200% center;
		}
	}

	:global(.shiny-badge) {
		background-image: linear-gradient(
			120deg,
			transparent 30%,
			rgba(255, 255, 255, 0.6) 50%,
			transparent 70%
		);
		background-size: 200% auto;
		animation: sheen 3s infinite linear;
		position: relative;
		overflow: hidden;
	}

	:global(.dark .shiny-badge) {
		background-image: linear-gradient(
			120deg,
			transparent 30%,
			rgba(255, 255, 255, 0.15) 50%,
			transparent 70%
		);
	}
</style>
