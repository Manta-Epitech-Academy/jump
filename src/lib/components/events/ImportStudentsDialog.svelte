<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Table from '$lib/components/ui/table';
	import { ArrowRight, CircleCheck, TriangleAlert, Upload, UserPlus } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	let { open = $bindable(false) } = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let analysisResult = $state<any[] | null>(null);
	let isAnalyzing = $state(false);
	let isConfirming = $state(false);

	// Reset when dialog closes
	$effect(() => {
		if (!open) analysisResult = null;
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'icon' })}>
		<Upload class="h-4 w-4" />
	</Dialog.Trigger>
	<Dialog.Content class={analysisResult ? 'sm:max-w-[800px]' : 'sm:max-w-[500px]'}>
		<Dialog.Header>
			<Dialog.Title>Import de masse (CSV)</Dialog.Title>
			<Dialog.Description>
				{#if !analysisResult}
					Sélectionnez un fichier CSV (Nom, Prénom, Email, Niveau) pour analyse.
				{:else}
					Vérifiez les correspondances avant de valider l'import.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if !analysisResult}
			<form
				action="?/analyzeCsv"
				method="POST"
				enctype="multipart/form-data"
				use:enhance={() => {
					isAnalyzing = true;
					return async ({ result }) => {
						isAnalyzing = false;
						if (result.type === 'success' && result.data?.analysisSuccess) {
							analysisResult = result.data.analysisData;
						} else {
							toast.error("Erreur lors de l'analyse");
						}
					};
				}}
				class="space-y-4 py-4"
			>
				<div class="grid w-full max-w-sm items-center gap-1.5">
					<Label for="csv">Fichier CSV</Label>
					<Input id="csv" name="csv" type="file" accept=".csv" required />
				</div>
				<div class="rounded-sm bg-muted p-3 text-xs text-muted-foreground">
					<p class="mb-1 font-bold">Fonctionnement :</p>
					<ul class="list-inside list-disc space-y-1">
						<li>Analyse les doublons par Email ou Nom/Prénom.</li>
						<li>Détecte les conflits potentiels.</li>
						<li>Prépare l'assignation automatique des sujets.</li>
					</ul>
				</div>
				<Dialog.Footer>
					<Button type="submit" disabled={isAnalyzing}>
						{isAnalyzing ? 'Analyse en cours...' : 'Analyser le fichier'}
					</Button>
				</Dialog.Footer>
			</form>
		{:else}
			<ScrollArea class="h-[400px] rounded-md border p-4">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Statut</Table.Head>
							<Table.Head>Données CSV</Table.Head>
							<Table.Head></Table.Head>
							<Table.Head>Correspondance</Table.Head>
							<Table.Head>Action</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each analysisResult as row}
							<Table.Row class={row.status === 'CONFLICT' ? 'bg-destructive/10' : ''}>
								<Table.Cell>
									{#if row.status === 'NEW'}
										<Badge variant="default" class="bg-blue-500 hover:bg-blue-600">Nouveau</Badge>
									{:else if row.status === 'CONFLICT'}
										<Badge variant="destructive">Conflit</Badge>
									{:else}
										<Badge variant="secondary" class="bg-epi-teal text-black hover:bg-epi-teal"
											>Existant</Badge
										>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<div class="flex flex-col">
										<span class="font-bold">{row.csvData.prenom} {row.csvData.nom}</span>
										<span class="text-xs text-muted-foreground">{row.csvData.email}</span>
										<span class="text-[10px] font-black text-muted-foreground uppercase"
											>{row.csvData.niveau}</span
										>
									</div>
								</Table.Cell>
								<Table.Cell>
									<ArrowRight class="h-4 w-4 text-muted-foreground" />
								</Table.Cell>
								<Table.Cell>
									{#if row.existingStudent}
										<div class="flex flex-col">
											<span class="font-bold"
												>{row.existingStudent.prenom} {row.existingStudent.nom}</span
											>
											<span class="text-xs text-muted-foreground">{row.existingStudent.email}</span>
											<span class="text-[10px] font-black text-muted-foreground uppercase"
												>{row.existingStudent.niveau}</span
											>
										</div>
									{:else}
										<span class="text-xs text-muted-foreground italic">Aucune correspondance</span>
									{/if}
								</Table.Cell>
								<Table.Cell>
									{#if row.status === 'NEW'}
										<div class="flex items-center text-xs font-bold text-blue-600">
											<UserPlus class="mr-1 h-3 w-3" /> Création
										</div>
									{:else if row.status === 'CONFLICT'}
										<div class="flex items-center text-xs font-bold text-destructive">
											<TriangleAlert class="mr-1 h-3 w-3" /> Fusion forcée
										</div>
									{:else}
										<div class="flex items-center text-xs font-bold text-teal-700">
											<CircleCheck class="mr-1 h-3 w-3" /> Liaison
										</div>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</ScrollArea>

			<div
				class="mt-4 flex items-center justify-between rounded border border-yellow-200 bg-yellow-50 p-2"
			>
				<div class="flex items-center gap-2">
					<TriangleAlert class="h-4 w-4 text-yellow-600" />
					<span class="text-xs font-medium text-yellow-800">
						Vérifiez attentivement les lignes en rouge. Valider entraînera la fusion des dossiers.
					</span>
				</div>
			</div>

			<form
				action="?/confirmImport"
				method="POST"
				use:enhance={() => {
					isConfirming = true;
					return async ({ result }) => {
						isConfirming = false;
						if (result.type === 'success') {
							toast.success(result.data?.message);
							open = false;
							analysisResult = null;
							location.reload();
						} else {
							toast.error("Erreur lors de l'import");
						}
					};
				}}
				class="flex justify-end gap-2 pt-4"
			>
				<input type="hidden" name="importData" value={JSON.stringify(analysisResult)} />
				<Button variant="ghost" type="button" onclick={() => (analysisResult = null)}>
					Retour
				</Button>
				<Button type="submit" disabled={isConfirming}>
					{isConfirming ? 'Traitement...' : 'Confirmer et Importer'}
				</Button>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
