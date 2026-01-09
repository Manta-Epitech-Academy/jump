<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { Plus, GraduationCap, Funnel } from 'lucide-svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, delayed, enhance } = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') open = false;
		}
	});

	let open = $state(false);

	let selectedLevel = $state(page.url.searchParams.get('niveau') || 'all');

	function handleFilterChange(value: string) {
		const url = new URL(page.url);
		if (value && value !== 'all') {
			url.searchParams.set('niveau', value);
		} else {
			url.searchParams.delete('niveau');
		}
		goto(url);
	}

	const niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight text-epi-blue uppercase">
				Élèves<span class="text-epi-teal">_</span>
			</h1>
			<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
				Annuaire et progression des étudiants du camp.
			</p>
		</div>

		<div class="flex items-center gap-2">
			<div class="w-[180px]">
				<Select.Root type="single" value={selectedLevel} onValueChange={handleFilterChange}>
					<Select.Trigger>
						<Funnel class="mr-2 h-4 w-4 text-muted-foreground" />
						{selectedLevel === 'all' ? 'Tous les niveaux' : selectedLevel}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">Tous les niveaux</Select.Item>
						{#each niveaux as niveau}
							<Select.Item value={niveau}>{niveau}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<Dialog.Root bind:open>
				<Dialog.Trigger class={buttonVariants()}>
					<Plus class="mr-2 h-4 w-4" />
					Nouvel Élève
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-[425px]">
					<Dialog.Header>
						<Dialog.Title>Ajouter un élève</Dialog.Title>
						<Dialog.Description>
							Créez le profil d'un nouvel étudiant pour l'inscrire aux sessions.
						</Dialog.Description>
					</Dialog.Header>

					<form method="POST" action="?/create" use:enhance class="grid gap-4 py-4">
						<div class="grid grid-cols-2 gap-4">
							<div class="grid gap-2">
								<Label for="prenom">Prénom</Label>
								<Input id="prenom" name="prenom" bind:value={$form.prenom} placeholder="Jean" />
								{#if $errors.prenom}<span class="text-sm text-destructive">{$errors.prenom}</span
									>{/if}
							</div>
							<div class="grid gap-2">
								<Label for="nom">Nom</Label>
								<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Dupont" />
								{#if $errors.nom}<span class="text-sm text-destructive">{$errors.nom}</span>{/if}
							</div>
						</div>

						<div class="grid gap-2">
							<Label for="niveau">Niveau Scolaire</Label>
							<Select.Root type="single" name="niveau" bind:value={$form.niveau}>
								<Select.Trigger>
									{$form.niveau ? $form.niveau : 'Sélectionner...'}
								</Select.Trigger>
								<Select.Content>
									{#each niveaux as niveau}
										<Select.Item value={niveau}>{niveau}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<input type="hidden" name="niveau" value={$form.niveau} />
							{#if $errors.niveau}<span class="text-sm text-destructive">{$errors.niveau}</span
								>{/if}
						</div>

						<Dialog.Footer>
							<button type="submit" class={buttonVariants()} disabled={$delayed}>
								{#if $delayed}Enregistrement...{:else}Créer l'élève{/if}
							</button>
						</Dialog.Footer>
					</form>
				</Dialog.Content>
			</Dialog.Root>
		</div>
	</div>

	<div class="rounded-sm border bg-card shadow-sm">
		<Table.Root>
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="text-xs font-bold uppercase">Étudiant</Table.Head>
					<Table.Head class="text-xs font-bold uppercase">Niveau</Table.Head>
					<Table.Head class="text-right text-xs font-bold uppercase">XP / Sessions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.students as student (student.id)}
					<Table.Row class="hover:bg-muted/30">
						<Table.Cell class="font-bold">
							<div class="flex items-center gap-3">
								<div class="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
									<GraduationCap class="h-5 w-5 text-muted-foreground" />
								</div>
								<div class="flex flex-col">
									<span class="tracking-tight uppercase">{student.prenom} {student.nom}</span>
									<span class="text-xs text-muted-foreground sm:hidden">{student.niveau}</span>
								</div>
							</div>
						</Table.Cell>
						<Table.Cell>
							<Badge variant="secondary" class="rounded-sm font-bold uppercase"
								>{student.niveau}</Badge
							>
						</Table.Cell>
						<Table.Cell class="text-right text-muted-foreground">
							<div class="flex flex-col items-end">
								<span class="font-black text-foreground">{student.xp} XP</span>
								<span class="text-[10px] font-bold tracking-widest uppercase"
									>{student.sessionsCount} session{student.sessionsCount > 1 ? 's' : ''}</span
								>
							</div>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={3} class="h-24 text-center text-muted-foreground">
							Aucun élève trouvé.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>
