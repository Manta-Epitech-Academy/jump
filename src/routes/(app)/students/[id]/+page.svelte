<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import {
		ArrowLeft,
		Trophy,
		Calendar,
		Star,
		MessageSquareQuote,
		Pencil,
		CircleCheck,
		CircleX,
		Clock,
		BookOpen,
		Mail,
		Phone
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { formatDateFr } from '$lib/utils';

	let { data }: { data: PageData } = $props();

	const {
		form,
		errors,
		delayed,
		enhance: superEnhance
	} = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editOpen = false;
				toast.success('Profil mis à jour');
			}
		}
	});

	let editOpen = $state(false);

	function getInitials(prenom: string, nom: string) {
		return (prenom[0] + nom[0]).toUpperCase();
	}

	const niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];

	let xpProgress = $derived(Math.min((data.student.xp / 1000) * 100, 100));
</script>

<div class="space-y-6 pb-10">
	<!-- HEADER NAVIGATION -->
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/students">
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
						<Avatar.Fallback class="bg-secondary text-secondary-foreground text-2xl font-bold">
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
							<div class="flex items-center justify-center gap-2">
								<Mail class="h-3.5 w-3.5" />
								<span class="truncate">{data.student.email}</span>
							</div>
						{/if}
						{#if data.student.phone}
							<div class="flex items-center justify-center gap-2">
								<Phone class="h-3.5 w-3.5" />
								<span>{data.student.phone}</span>
							</div>
						{/if}
					</div>

					<Separator />

					<!-- XP SECTION -->
					<div class="space-y-2 text-center">
						<div class="flex items-center justify-center gap-2 text-2xl font-black text-epi-orange">
							<Trophy class="h-6 w-6" />
							<span>{data.student.xp} XP</span>
						</div>
						<Progress value={xpProgress} class="h-2" />
						<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
							Progression Globale
						</p>
					</div>

					<Separator />

					<!-- KPI GRID -->
					<div class="grid grid-cols-2 gap-4 text-center">
						<div class="rounded-sm bg-muted/30 p-2">
							<div class="text-lg font-bold">{data.stats.presentCount}</div>
							<div class="text-[9px] font-bold text-muted-foreground uppercase">Présences</div>
						</div>
						<div class="rounded-sm bg-muted/30 p-2">
							<div class="text-lg font-bold text-teal-600">
								{data.stats.validatedCount}
							</div>
							<div class="text-[9px] font-bold text-muted-foreground uppercase">Validés</div>
						</div>
					</div>

					<div
						class="rounded-sm border border-dashed border-epi-blue/30 bg-epi-blue/5 p-3 text-center"
					>
						<div class="mb-1 flex items-center justify-center gap-1.5 text-epi-blue">
							<Star class="h-4 w-4 fill-epi-blue" />
							<span class="text-xs font-bold uppercase">Thème Favori</span>
						</div>
						<span class="text-sm font-bold uppercase">{data.stats.favoriteTheme}</span>
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
				class="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:-translate-x-px before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent md:before:mx-auto md:before:translate-x-0"
			>
				{#each data.participations as p (p.id)}
					<div
						class="group is-active relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse"
					>
						<!-- TIMELINE DOT -->
						<div
							class="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-background shadow-sm md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2
							{p.is_validated
								? 'bg-epi-teal text-black'
								: p.is_present
									? 'bg-epi-blue text-white'
									: 'bg-gray-200 text-gray-400'}"
						>
							{#if p.is_validated}
								<Trophy class="h-5 w-5" />
							{:else if p.is_present}
								<CircleCheck class="h-5 w-5" />
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
											{#if !p.is_present}
												<Badge variant="destructive" class="h-5 px-1.5 text-[10px] uppercase"
													>Absent</Badge
												>
											{/if}
										</div>
										<Card.Title class="text-base leading-tight font-bold uppercase">
											{p.expand?.event?.titre || 'Événement inconnu'}
										</Card.Title>
									</div>
								</div>
							</Card.Header>

							<Card.Content class="space-y-3 p-4 pt-2">
								{#if p.expand?.subject}
									<div class="flex items-start gap-2 rounded-sm bg-muted/50 p-2">
										<BookOpen class="mt-0.5 h-4 w-4 text-muted-foreground" />
										<div>
											<p class="text-sm font-bold">{p.expand.subject.nom}</p>
											{#if p.expand.subject.expand?.themes}
												<div class="mt-1 flex flex-wrap gap-1">
													{#each p.expand.subject.expand.themes as theme}
														<span
															class="text-[9px] font-bold tracking-wider text-teal-700 uppercase"
															>#{theme.nom}</span
														>
													{/each}
												</div>
											{/if}
										</div>
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
							class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4"
						>
							<Calendar class="h-8 w-8 text-muted-foreground" />
						</div>
						<h3 class="text-lg font-bold uppercase text-muted-foreground">Aucun historique</h3>
						<p class="text-sm text-muted-foreground">
							Cet élève n'a pas encore participé à un événement.
						</p>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<Dialog.Root bind:open={editOpen}>
		<Dialog.Content class="sm:max-w-[500px]">
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
				<Dialog.Footer>
					<Button type="submit" disabled={$delayed}>
						{$delayed ? 'Sauvegarde...' : 'Enregistrer'}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
</div>
