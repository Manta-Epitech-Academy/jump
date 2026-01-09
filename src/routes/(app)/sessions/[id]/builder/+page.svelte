<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import {
		Users,
		Search,
		Plus,
		Trash2,
		CircleCheck,
		Calendar,
		ArrowLeft,
		ExternalLink,
		Cuboid
	} from 'lucide-svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import { ScrollArea } from '$lib/components/ui/scroll-area';

	let { data }: { data: PageData } = $props();

	const {
		form: addForm,
		enhance: addEnhance,
		message: addMessage,
		delayed: addDelayed
	} = superForm(data.addForm, {
		id: 'add-existing'
	});

	const {
		form: createForm,
		errors: createErrors,
		enhance: createEnhance,
		delayed: createDelayed,
		message: createMessage
	} = superForm(data.createStudentForm, {
		id: 'quick-create',
		onResult: ({ result }) => {
			if (result.type === 'success') openQuickCreate = false;
		}
	});

	let searchQuery = $state('');
	let openQuickCreate = $state(false);

	let filteredStudents = $derived(
		data.allStudents.filter((s) => {
			const fullName = `${s.prenom} ${s.nom}`.toLowerCase();
			return fullName.includes(searchQuery.toLowerCase());
		})
	);

	function isAlreadyInSession(studentId: string) {
		return data.participations.some((p) => p.expand?.student?.id === studentId);
	}

	const niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];
</script>

<div class="flex h-[calc(100vh-8rem)] flex-col space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between border-b pb-4">
		<div class="flex items-center gap-4">
			<a href="/" class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<ArrowLeft class="h-4 w-4" />
			</a>
			<div>
				<h1 class="text-3xl font-bold tracking-tight text-epi-blue uppercase">
					Session<span class="text-epi-teal">_</span>
				</h1>
				<div
					class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-muted-foreground uppercase"
				>
					<div class="flex items-center gap-2">
						<Calendar class="h-3 w-3" />
						<span
							>{data.session.titre} • {new Date(data.session.date).toLocaleDateString('fr-FR', {
								day: 'numeric',
								month: 'short'
							})}</span
						>
					</div>

					{#if data.session.expand?.activity}
						<div class="flex items-center gap-2 text-epi-blue">
							<Cuboid class="h-3 w-3" />
							<span>{data.session.expand.activity.nom}</span>
							<Badge
								variant="outline"
								class="ml-1 h-4 border-epi-blue px-1 text-[8px] text-epi-blue"
							>
								{data.session.expand.activity.difficulte}
							</Badge>
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div class="flex gap-2">
			<Button variant="default" href={`/sessions/${data.session.id}/live`} class="shadow-lg">
				Lancer le Live
				<ExternalLink class="ml-2 h-4 w-4" />
			</Button>
		</div>
	</div>

	<div class="grid h-full min-h-0 flex-1 gap-6 md:grid-cols-12">
		<Card.Root class="flex h-full max-h-full flex-col rounded-sm md:col-span-8">
			<Card.Header class="pb-3">
				<div class="flex items-center justify-between">
					<Card.Title class="flex items-center gap-2 uppercase">
						<Users class="h-5 w-5 text-epi-blue" />
						Participants
						<Badge variant="secondary" class="rounded-sm">{data.participations.length}</Badge>
					</Card.Title>
				</div>
				<Card.Description class="font-bold tracking-tight uppercase"
					>Liste des élèves inscrits</Card.Description
				>
			</Card.Header>
			<Separator />

			<ScrollArea class="flex-1">
				<div class="space-y-2 p-4">
					{#if data.participations.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Users class="mb-4 h-12 w-12 text-muted" />
							<h3 class="text-lg font-bold uppercase">Aucun participant</h3>
							<p class="text-sm font-bold text-muted-foreground uppercase">
								Utilisez le panneau de droite pour ajouter des élèves.
							</p>
						</div>
					{:else}
						{#each data.participations as p (p.id)}
							<div
								class="flex items-center justify-between rounded-sm border bg-card p-3 transition-colors hover:bg-muted/30"
							>
								<div class="flex items-center gap-3">
									<Avatar.Root class="rounded-sm">
										<Avatar.Fallback class="bg-primary/10 font-bold text-primary">
											{p.expand?.student?.prenom?.[0] ?? '?'}{p.expand?.student?.nom?.[0] ?? '?'}
										</Avatar.Fallback>
									</Avatar.Root>
									<div>
										<p class="font-bold tracking-tight uppercase">
											{p.expand?.student?.prenom}
											{p.expand?.student?.nom}
										</p>
										<p class="text-xs font-bold text-muted-foreground uppercase">
											{p.expand?.student?.niveau}
										</p>
									</div>
								</div>

								<div class="flex items-center gap-2">
									{#if p.is_validated}
										<Badge variant="default" class="rounded-sm bg-epi-teal font-black text-black"
											>Validé</Badge
										>
									{/if}

									<form action="?/remove&id={p.id}" method="POST">
										<Button
											variant="ghost"
											size="icon"
											type="submit"
											class="text-muted-foreground hover:text-destructive"
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</form>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</ScrollArea>
		</Card.Root>

		<div class="flex h-full flex-col gap-4 md:col-span-4">
			<Card.Root class="flex max-h-full flex-1 flex-col rounded-sm">
				<Card.Header class="space-y-4 pb-3">
					<Card.Title class="uppercase">Ajouter des élèves</Card.Title>
					<div class="relative">
						<Search class="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
						<Input placeholder="Rechercher..." class="rounded-sm pl-8" bind:value={searchQuery} />
					</div>
				</Card.Header>

				<ScrollArea class="flex-1 border-t bg-muted/10">
					<div class="space-y-1 p-2">
						{#each filteredStudents as student (student.id)}
							{@const isAdded = isAlreadyInSession(student.id)}
							<form
								method="POST"
								action="?/addExisting"
								use:addEnhance
								class="flex items-center justify-between rounded-sm border bg-background p-2"
							>
								<input type="hidden" name="studentId" value={student.id} />

								<div class="flex flex-col overflow-hidden">
									<span class="truncate text-sm font-bold uppercase"
										>{student.prenom} {student.nom}</span
									>
									<span class="text-[10px] font-bold text-muted-foreground uppercase"
										>{student.niveau}</span
									>
								</div>

								<Button
									variant={isAdded ? 'secondary' : 'default'}
									size="sm"
									type="submit"
									disabled={isAdded || $addDelayed}
									class="h-8 px-2"
								>
									{#if isAdded}
										<CircleCheck class="h-4 w-4" />
									{:else}
										<Plus class="h-4 w-4" />
									{/if}
								</Button>
							</form>
						{:else}
							<div class="py-4 text-center text-xs font-bold text-muted-foreground uppercase">
								Aucun élève trouvé.
							</div>
						{/each}
					</div>
				</ScrollArea>

				<div class="border-t p-4">
					{#if $addMessage}
						<div class="mb-2 text-center text-xs font-bold text-destructive uppercase">
							{$addMessage}
						</div>
					{/if}

					<Dialog.Root bind:open={openQuickCreate}>
						<Dialog.Trigger class={buttonVariants({ variant: 'outline', class: 'w-full' })}>
							<Plus class="mr-2 h-4 w-4" />
							Créer un nouvel élève
						</Dialog.Trigger>
						<Dialog.Content>
							<Dialog.Header>
								<Dialog.Title>Ajout Rapide</Dialog.Title>
								<Dialog.Description>
									Créez un élève et ajoutez-le immédiatement à la session.
								</Dialog.Description>
							</Dialog.Header>

							<form
								method="POST"
								action="?/quickCreateStudent"
								use:createEnhance
								class="space-y-4 py-4"
							>
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label>Prénom</Label>
										<Input name="prenom" bind:value={$createForm.prenom} />
										{#if $createErrors.prenom}<span class="text-xs text-destructive"
												>{$createErrors.prenom}</span
											>{/if}
									</div>
									<div class="space-y-2">
										<Label>Nom</Label>
										<Input name="nom" bind:value={$createForm.nom} />
										{#if $createErrors.nom}<span class="text-xs text-destructive"
												>{$createErrors.nom}</span
											>{/if}
									</div>
								</div>
								<div class="space-y-2">
									<Label>Niveau</Label>
									<Select.Root type="single" name="niveau" bind:value={$createForm.niveau}>
										<Select.Trigger>{$createForm.niveau || 'Sélectionner'}</Select.Trigger>
										<Select.Content>
											{#each niveaux as nv}
												<Select.Item value={nv}>{nv}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
									<input type="hidden" name="niveau" value={$createForm.niveau} />
								</div>

								<Dialog.Footer>
									<Button type="submit" disabled={$createDelayed}>Créer et Ajouter</Button>
								</Dialog.Footer>
							</form>
						</Dialog.Content>
					</Dialog.Root>
				</div>
			</Card.Root>
		</div>
	</div>
</div>
