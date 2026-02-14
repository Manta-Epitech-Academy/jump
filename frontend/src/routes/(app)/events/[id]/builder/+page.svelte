<script lang="ts">
	import type { PageData } from './$types';
	import type { ThemesResponse } from '$lib/pocketbase-types';
	import { superForm } from 'sveltekit-superforms';
	import {
		Users,
		Search,
		Plus,
		Trash2,
		CircleCheck,
		Calendar as CalendarIcon,
		ArrowLeft,
		UserCheck,
		Settings,
		Tag,
		TriangleAlert,
		Sparkles
	} from 'lucide-svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { toast } from 'svelte-sonner';
	import { CalendarDateTime } from '@internationalized/date';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';
	import StudentParticipationRow from '$lib/components/events/StudentParticipationRow.svelte';
	import SubjectPicker from '$lib/components/events/SubjectPicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	const {
		form: addForm,
		enhance: addEnhance,
		delayed: addDelayed
	} = superForm(
		untrack(() => data.addForm),
		{ id: 'add-existing', invalidateAll: true }
	);

	const { form: createForm, enhance: createEnhance } = superForm(
		untrack(() => data.createStudentForm),
		{
			id: 'quick-create',
			onResult: ({ result }) => {
				if (result.type === 'success') openQuickCreate = false;
			}
		}
	);

	const {
		form: editForm,
		errors: editErrors,
		enhance: editEnhance,
		delayed: editDelayed
	} = superForm(
		untrack(() => data.editForm),
		{
			id: 'edit-event',
			resetForm: false,
			onResult: ({ result }) => {
				if (result.type === 'success') {
					openEditEvent = false;
					toast.success(result.data?.form.message);
				}
			}
		}
	);

	let isAutoAssigning = $state(false);

	let searchQuery = $state('');
	let openQuickCreate = $state(false);
	let openEditEvent = $state(false);

	let deleteEventDialogOpen = $state(false);
	let deleteParticipationDialogOpen = $state(false);
	let participationToDelete = $state<string | null>(null);

	// --- Subject Picker State ---
	let pickerOpen = $state(false);
	let pickerParticipationId = $state<string | null>(null);
	let pickerCurrentSubjectId = $state<string | null>(null);
	let pickerStudentLevel = $state<string | null>(null);
	let assignmentForm: HTMLFormElement;

	let participationGroups = $derived.by(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const assigned: Record<string, any[]> = {};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const unassigned: any[] = [];

		data.participations.forEach((p) => {
			if (p.expand?.subject) {
				const subjectName = p.expand.subject.nom;
				if (!assigned[subjectName]) assigned[subjectName] = [];
				assigned[subjectName].push(p);
			} else {
				unassigned.push(p);
			}
		});
		return { assigned, unassigned };
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function parseInitialDate(val: any) {
		if (!val) return undefined;
		try {
			const dateStr = typeof val === 'string' ? val : val.toString();
			const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
			return new CalendarDateTime(y, m, d);
		} catch (e) {
			return undefined;
		}
	}

	let dateValue = $state<CalendarDateTime | undefined>(parseInitialDate($editForm.date));
	const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
	const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
	let hour = $state($editForm.time?.split(':')[0] || '14');
	let minute = $state($editForm.time?.split(':')[1] || '00');

	$effect(() => {
		if (dateValue) {
			const y = dateValue.year;
			const m = String(dateValue.month).padStart(2, '0');
			const d = String(dateValue.day).padStart(2, '0');
			const newDateStr = `${y}-${m}-${d}`;
			if ($editForm.date !== newDateStr) {
				$editForm.date = newDateStr;
			}
		}
		const newTime = `${hour}:${minute}`;
		if ($editForm.time !== newTime) {
			$editForm.time = newTime;
		}
	});

	let filteredStudents = $derived(
		data.allStudents.filter((s) => {
			const fullName = `${s.prenom} ${s.nom}`.toLowerCase();
			return fullName.includes(searchQuery.toLowerCase());
		})
	);

	function isAlreadyInEvent(studentId: string) {
		return data.participations.some((p) => p.expand?.student?.id === studentId);
	}

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}

	function confirmDeleteParticipation(id: string) {
		participationToDelete = id;
		deleteParticipationDialogOpen = true;
	}

	// --- Subject Picker Handlers ---
	function openSubjectPicker(participationId: string, currentSubjectId: string | null) {
		pickerParticipationId = participationId;
		pickerCurrentSubjectId = currentSubjectId;

		const p = data.participations.find((x) => x.id === participationId);
		pickerStudentLevel = p?.expand?.student?.niveau || null;

		pickerOpen = true;
	}

	function handleSubjectPicked(subjectId: string | null) {
		if (!pickerParticipationId) return;

		// Set values in the hidden form and submit
		const pIdInput = assignmentForm.querySelector(
			'input[name="participationId"]'
		) as HTMLInputElement;
		const sIdInput = assignmentForm.querySelector('input[name="subjectId"]') as HTMLInputElement;

		if (pIdInput && sIdInput) {
			pIdInput.value = pickerParticipationId;
			sIdInput.value = subjectId || 'none';
			assignmentForm.requestSubmit();
		}
	}

	const niveauxScolaires = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];
</script>

<div class="flex h-auto min-h-[calc(100vh-8rem)] flex-col space-y-4 md:h-[calc(100vh-10rem)]">
	<div class="flex items-center justify-between border-b pb-4">
		<div class="flex items-center gap-4">
			<a href={resolve('/')} class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<ArrowLeft class="h-4 w-4" />
			</a>
			<div>
				<h1 class="text-3xl font-bold text-epi-blue uppercase">
					Événement<span class="text-epi-teal">_</span>
				</h1>
				<div
					class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-muted-foreground uppercase"
				>
					<div class="flex items-center gap-2">
						<CalendarIcon class="h-3 w-3" />
						<span style:view-transition-name="event-title-{data.event.id}">
							{data.event.titre}
						</span>
						<span>
							• {new Date(data.event.date).toLocaleDateString('fr-FR', {
								day: 'numeric',
								month: 'short',
								hour: '2-digit',
								minute: '2-digit'
							})}
						</span>
					</div>
					{#if (data.event as { expand?: { theme?: ThemesResponse } }).expand?.theme}
						<div class="flex items-center gap-1">
							<Tag class="h-3 w-3 text-teal-700" />
							<span class="text-teal-800"
								>{(data.event as { expand?: { theme?: ThemesResponse } }).expand?.theme?.nom}</span
							>
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div class="flex gap-2">
			<Dialog.Root bind:open={openEditEvent}>
				<Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'icon' })}>
					<Settings class="h-4 w-4" />
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-125">
					<Dialog.Header>
						<Dialog.Title>Paramètres de l'événement</Dialog.Title>
					</Dialog.Header>
					<div class="space-y-6">
						<form method="POST" action="?/updateEvent" use:editEnhance class="space-y-4 py-2">
							<div class="space-y-2">
								<Label>Titre</Label>
								<Input name="titre" bind:value={$editForm.titre} />
								{#if $editErrors.titre}<p class="text-xs text-destructive">
										{$editErrors.titre}
									</p>{/if}
							</div>

							<div class="space-y-2">
								<Label>Thème</Label>
								<ThemeSelect themes={data.themes} bind:value={$editForm.theme} name="theme" />
								{#if $editErrors.theme}<p class="text-xs text-destructive">
										{$editErrors.theme}
									</p>{/if}
							</div>

							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-2">
									<Label>Date</Label>
									<DatePicker bind:value={dateValue} name="date" />
									{#if $editErrors.date}<p class="text-xs text-destructive">
											{$editErrors.date}
										</p>{/if}
								</div>
								<div class="space-y-2">
									<Label>Heure</Label>
									<div class="flex gap-2">
										<Select.Root type="single" bind:value={hour}>
											<Select.Trigger>{hour}</Select.Trigger>
											<Select.Content class="h-50">
												{#each hours as h}<Select.Item value={h}>{h}</Select.Item>{/each}
											</Select.Content>
										</Select.Root>
										<Select.Root type="single" bind:value={minute}>
											<Select.Trigger>{minute}</Select.Trigger>
											<Select.Content>
												{#each minutes as m}<Select.Item value={m}>{m}</Select.Item>{/each}
											</Select.Content>
										</Select.Root>
									</div>
									<input type="hidden" name="time" value={$editForm.time} />
									{#if $editErrors.time}<p class="text-xs text-destructive">
											{$editErrors.time}
										</p>{/if}
								</div>
							</div>
							<div class="space-y-2">
								<Label>Statut</Label>
								<Select.Root type="single" name="statut" bind:value={$editForm.statut}>
									<Select.Trigger class="capitalize"
										>{$editForm.statut.replace('_', ' ')}</Select.Trigger
									>
									<Select.Content>
										<Select.Item value="planifiee">Planifiée</Select.Item>
										<Select.Item value="en_cours">En cours</Select.Item>
										<Select.Item value="terminee">Terminée</Select.Item>
									</Select.Content>
								</Select.Root>
								<input type="hidden" name="statut" value={$editForm.statut} />
							</div>

							<div class="flex justify-end pt-4">
								<Button type="submit" disabled={$editDelayed}>Sauvegarder les modifications</Button>
							</div>
						</form>

						<Separator />

						<div class="space-y-4 rounded-sm border border-destructive/20 bg-destructive/5 p-4">
							<div class="space-y-1">
								<h4 class="text-sm font-bold text-destructive uppercase">Zone de danger</h4>
								<p class="text-xs text-muted-foreground">
									La suppression d'un événement est irréversible. Les XP des élèves validés seront
									automatiquement retirés.
								</p>
							</div>
							<Button
								type="button"
								variant="destructive"
								class="w-full"
								onclick={() => (deleteEventDialogOpen = true)}
							>
								<Trash2 class="mr-2 h-4 w-4" />
								Supprimer définitivement l'événement
							</Button>
						</div>
					</div>
				</Dialog.Content>
			</Dialog.Root>

			<Button variant="default" href={resolve(`/events/${data.event.id}/appel`)} class="shadow-lg">
				<UserCheck class="mr-2 h-4 w-4" />
				<span class="hidden sm:inline">Faire l'appel</span>
				<span class="sm:hidden">Appel</span>
			</Button>
		</div>
	</div>

	<!-- MAIN GRID CONTAINER -->
	<div class="min-0 grid h-auto flex-1 gap-6 md:h-full md:grid-cols-12">
		<Card.Root class="flex h-125 flex-col rounded-sm md:col-span-8 md:h-full md:max-h-full">
			<Card.Header class="pb-3">
				<Card.Title class="flex items-center gap-2 uppercase">
					<Users class="h-5 w-5 text-epi-blue" /> Organisation des Groupes
				</Card.Title>
				<Card.Description class="font-bold uppercase">Répartition par sujet</Card.Description>
			</Card.Header>
			<Separator />

			<ScrollArea class="min-h-0 flex-1">
				<div class="space-y-8 p-6">
					{#if participationGroups.unassigned.length > 0}
						<div class="rounded-sm border-2 border-dashed border-epi-orange/30 bg-epi-orange/5 p-4">
							<div class="mb-3 flex items-center justify-between">
								<div class="flex items-center gap-2">
									<TriangleAlert class="h-4 w-4 text-epi-orange" />
									<h3 class="font-heading text-lg tracking-tight text-epi-orange uppercase">
										Élèves à assigner
									</h3>
								</div>
								<div class="flex gap-2">
									<!-- AUTO ASSIGN FORM -->
									<form
										action="?/autoAssignAll"
										method="POST"
										use:enhance={() => {
											isAutoAssigning = true;
											return async ({ result, update }) => {
												isAutoAssigning = false;
												if (result.type === 'success') {
													const data = result.data as { message?: string } | undefined;
													toast.success(data?.message || 'Assignation terminée');
													await update();
												} else {
													toast.error("Erreur lors de l'auto-assignation");
												}
											};
										}}
									>
										<Button
											type="submit"
											variant="outline"
											size="sm"
											disabled={isAutoAssigning}
											class="h-7 border-epi-orange text-epi-orange hover:bg-epi-orange hover:text-white"
										>
											{#if isAutoAssigning}
												<span class="mr-2 flex gap-1">
													<span class="h-1 w-1 animate-bounce rounded-full bg-current delay-0"
													></span>
													<span class="h-1 w-1 animate-bounce rounded-full bg-current delay-150"
													></span>
													<span class="h-1 w-1 animate-bounce rounded-full bg-current delay-300"
													></span>
												</span>
												Calcul de la meilleure trajectoire...
											{:else}
												<Sparkles class="mr-2 h-3 w-3" />
												Auto-assigner ({participationGroups.unassigned.length})
											{/if}
										</Button>
									</form>

									<Badge
										variant="outline"
										class="rounded-sm border-epi-orange text-[10px] text-epi-orange"
										>{participationGroups.unassigned.length} élèves</Badge
									>
								</div>
							</div>
							<div class="grid gap-2">
								{#each participationGroups.unassigned as p (p.id)}
									<StudentParticipationRow
										participation={p}
										isUnassigned={true}
										onDelete={confirmDeleteParticipation}
										onAssignSubject={openSubjectPicker}
									/>
								{/each}
							</div>
						</div>
					{/if}

					{#each Object.entries(participationGroups.assigned) as [subjectName, members]}
						<div>
							<div class="mb-3 flex items-center gap-2">
								<div class="h-2 w-2 rounded-full bg-epi-teal"></div>
								<h3 class="font-heading text-lg tracking-tight uppercase">{subjectName}</h3>
								<Badge variant="secondary" class="rounded-sm text-[10px]"
									>{members.length} élèves</Badge
								>
							</div>
							<div class="grid gap-2">
								{#each members as p (p.id)}
									<StudentParticipationRow
										participation={p}
										onDelete={confirmDeleteParticipation}
										onAssignSubject={openSubjectPicker}
									/>
								{/each}
							</div>
						</div>
					{:else}
						{#if participationGroups.unassigned.length === 0}
							<div class="flex flex-col items-center justify-center py-20 text-center">
								<Users class="mb-4 h-12 w-12 text-muted" />
								<h3 class="text-lg font-bold uppercase">Aucun participant</h3>
								<p class="text-sm font-bold text-muted-foreground uppercase">
									Ajoutez des élèves via le panneau latéral.
								</p>
							</div>
						{/if}
					{/each}
				</div>
			</ScrollArea>
		</Card.Root>

		<div class="flex h-auto flex-col gap-4 md:col-span-4 md:h-full">
			<Card.Root class="flex h-100 flex-col rounded-sm md:h-full md:max-h-full md:flex-1">
				<Card.Header class="space-y-4 pb-3">
					<Card.Title class="uppercase">Inscrire des élèves</Card.Title>
					<div class="relative">
						<Search class="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
						<Input placeholder="Rechercher..." class="rounded-sm pl-8" bind:value={searchQuery} />
					</div>
				</Card.Header>
				<ScrollArea class="min-h-0 flex-1 border-t bg-muted/10">
					<div class="space-y-1 p-2">
						{#each filteredStudents as student (student.id)}
							{@const isAdded = isAlreadyInEvent(student.id)}
							<form
								method="POST"
								action="?/addExisting"
								use:addEnhance
								class="flex items-center justify-between rounded-sm border bg-background p-2"
							>
								<input type="hidden" name="studentId" value={student.id} />
								<div class="flex flex-col overflow-hidden">
									<span class="truncate text-sm font-bold">
										{formatFirstName(student.prenom)}
										<span class="uppercase">{student.nom}</span>
									</span>
									<span class="text-xs font-bold text-muted-foreground uppercase"
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
									{#if isAdded}<CircleCheck class="h-4 w-4" />{:else}<Plus class="h-4 w-4" />{/if}
								</Button>
							</form>
						{/each}
					</div>
				</ScrollArea>
				<div class="border-t p-4">
					<Dialog.Root bind:open={openQuickCreate}>
						<Dialog.Trigger class={buttonVariants({ variant: 'outline', class: 'w-full' })}>
							<Plus class="mr-2 h-4 w-4" /> Nouvel élève
						</Dialog.Trigger>
						<Dialog.Content>
							<Dialog.Header><Dialog.Title>Ajout Rapide</Dialog.Title></Dialog.Header>
							<form
								method="POST"
								action="?/quickCreateStudent"
								use:createEnhance
								class="space-y-4 py-4"
							>
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label>Prénom</Label><Input name="prenom" bind:value={$createForm.prenom} />
									</div>
									<div class="space-y-2">
										<Label>Nom</Label><Input name="nom" bind:value={$createForm.nom} />
									</div>
								</div>

								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label>Email (Optionnel)</Label>
										<Input name="email" type="email" bind:value={$createForm.email} />
									</div>
									<div class="space-y-2">
										<Label>Téléphone (Optionnel)</Label>
										<Input name="phone" type="tel" bind:value={$createForm.phone} />
									</div>
								</div>

								<div class="space-y-2">
									<Label>Niveau</Label>
									<Select.Root type="single" name="niveau" bind:value={$createForm.niveau}>
										<Select.Trigger>{$createForm.niveau || 'Sélectionner'}</Select.Trigger>
										<Select.Content
											>{#each niveauxScolaires as nv}<Select.Item value={nv}>{nv}</Select.Item
												>{/each}</Select.Content
										>
									</Select.Root>
									<input type="hidden" name="niveau" value={$createForm.niveau} />
								</div>
								<Dialog.Footer><Button type="submit">Créer et Inscrire</Button></Dialog.Footer>
							</form>
						</Dialog.Content>
					</Dialog.Root>
				</div>
			</Card.Root>
		</div>
	</div>
</div>

<!-- Hidden form for Subject Assignment -->
<form action="?/assignSubject" method="POST" use:enhance bind:this={assignmentForm} class="hidden">
	<input type="hidden" name="participationId" />
	<input type="hidden" name="subjectId" />
</form>

<!-- Global Subject Picker Modal -->
<SubjectPicker
	bind:open={pickerOpen}
	subjects={data.subjects}
	themes={data.themes}
	currentSubjectId={pickerCurrentSubjectId}
	studentLevel={pickerStudentLevel}
	onSelect={handleSubjectPicked}
/>

<AlertDialog.Root bind:open={deleteEventDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Supprimer définitivement ?</AlertDialog.Title>
			<AlertDialog.Description>
				Cette action est irréversible. Toutes les données associées à cet événement seront perdues.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
			<form
				action="?/deleteEvent"
				method="POST"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'redirect') {
							toast.success('Événement supprimé');
							await goto(result.location);
						}
					};
				}}
			>
				<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
					Confirmer la suppression
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={deleteParticipationDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Retirer l'élève ?</AlertDialog.Title>
			<AlertDialog.Description>
				Voulez-vous retirer cet élève de l'événement ? S'il était validé, son XP sera annulé.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
			{#if participationToDelete}
				<form
					action="?/remove&id={participationToDelete}"
					method="POST"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								deleteParticipationDialogOpen = false;
								toast.success("Élève retiré de l'événement");
								await update();
							} else {
								toast.error('Erreur lors du retrait');
							}
						};
					}}
				>
					<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
						Retirer
					</AlertDialog.Action>
				</form>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
