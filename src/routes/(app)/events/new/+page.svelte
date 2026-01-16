<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import * as Popover from '$lib/components/ui/popover';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import Calendar from '$lib/components/ui/calendar/calendar.svelte';
	import {
		ChevronLeft,
		Save,
		ChevronDown,
		FileSpreadsheet,
		PenTool,
		Upload,
		CircleCheck,
		TriangleAlert,
		UserPlus
	} from 'lucide-svelte';
	import { CalendarDateTime, getLocalTimeZone, today } from '@internationalized/date';
	import { untrack } from 'svelte';
	import { formatDateFr } from '$lib/utils';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';
	import { enhance as kitEnhance } from '$app/forms';
	import { toast } from 'svelte-sonner';

	let { data }: { data: PageData } = $props();

	const { form, errors, delayed, enhance } = superForm(untrack(() => data.form));

	let open = $state(false);
	let dateValue = $state<CalendarDateTime | undefined>();
	const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
	const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
	let hour = $state('14');
	let minute = $state('00');
	let timeValue = $state('14:00');

	let isAnalyzing = $state(false);
	let isConfirming = $state(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let analysisResult = $state<any>(null);

	$effect(() => {
		if (dateValue) {
			$form.date = dateValue;
		}
		timeValue = `${hour}:${minute}`;
		$form.time = timeValue;
	});
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex items-center gap-4">
		<a href="/" class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
			<ChevronLeft class="h-4 w-4" />
		</a>
		<h1 class="text-3xl font-bold text-epi-blue uppercase">
			Nouvel Événement<span class="text-epi-teal">_</span>
		</h1>
	</div>

	<Tabs.Root value="import" class="w-full">
		<Tabs.List class="grid w-full grid-cols-2">
			<Tabs.Trigger value="import">
				<FileSpreadsheet class="mr-2 h-4 w-4" /> Import Campagne CSV
			</Tabs.Trigger>
			<Tabs.Trigger value="manual">
				<PenTool class="mr-2 h-4 w-4" /> Création Manuelle
			</Tabs.Trigger>
		</Tabs.List>

		<!-- IMPORT TAB -->
		<Tabs.Content value="import">
			<Card.Root class="mt-4 border-t-4 border-t-epi-teal shadow-md">
				<Card.Header>
					<Card.Title>Import Automatique (Campagne)</Card.Title>
					<Card.Description>
						Importez un fichier CSV "Campagne" pour créer l'événement et inscrire les élèves
						automatiquement.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<!-- STEP 1: UPLOAD & ANALYZE -->
					{#if !analysisResult}
						<form
							action="?/analyzeCampaign"
							method="POST"
							enctype="multipart/form-data"
							use:kitEnhance={() => {
								isAnalyzing = true;
								return async ({ result }) => {
									isAnalyzing = false;
									if (result.type === 'success' && result.data?.analysisSuccess) {
										analysisResult = result.data;
									} else {
										toast.error(result.data?.error || "Erreur d'analyse");
									}
								};
							}}
							class="space-y-6 py-6"
						>
							<div
								class="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 p-10 text-center transition-colors hover:bg-muted/50"
							>
								<div class="rounded-full bg-muted p-4">
									<Upload class="h-8 w-8 text-epi-blue" />
								</div>
								<h3 class="mt-4 text-lg font-bold">Glissez le CSV ici</h3>
								<p class="mb-4 text-sm text-muted-foreground">Formats acceptés : CSV SalesForce</p>
								<Input
									id="csvFile"
									name="csvFile"
									type="file"
									accept=".csv"
									required
									class="max-w-xs cursor-pointer"
								/>
							</div>

							<div class="rounded-sm bg-blue-50 p-4 text-xs text-blue-900">
								<p class="mb-1 font-bold">Fonctionnement :</p>
								<ul class="list-inside list-disc space-y-1">
									<li>
										Le nom de l'événement et la date sont extraits du champ "Nom de la campagne".
									</li>
									<li>Analyse des doublons d'élèves (Email ou Nom/Prénom).</li>
									<li>Extraction des contacts parents et du statut "PC Personnel".</li>
								</ul>
							</div>

							<div class="flex justify-end">
								<Button
									type="submit"
									class="bg-epi-blue hover:bg-epi-blue/90"
									disabled={isAnalyzing}
								>
									{isAnalyzing ? 'Analyse en cours...' : 'Analyser le fichier'}
								</Button>
							</div>
						</form>

						<!-- STEP 2: REVIEW & CONFIRM -->
					{:else}
						<div class="space-y-6">
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-2">
									<Label>Nom de l'événement détecté</Label>
									<Input value={analysisResult.eventName} readonly class="bg-muted font-bold" />
								</div>
								<div class="space-y-2">
									<Label>Date détectée</Label>
									<Input
										value={new Date(analysisResult.eventDate).toLocaleDateString()}
										readonly
										class="bg-muted font-bold"
									/>
								</div>
							</div>

							<div class="rounded-sm border">
								<div class="border-b bg-muted/50 p-2 text-center text-xs font-bold uppercase">
									Aperçu des élèves ({analysisResult.analysisData.length})
								</div>
								<ScrollArea class="h-100">
									<Table.Root>
										<Table.Header>
											<Table.Row>
												<Table.Head>Statut</Table.Head>
												<Table.Head>Candidat</Table.Head>
												<Table.Head>Contact Parent</Table.Head>
												<Table.Head>Action</Table.Head>
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{#each analysisResult.analysisData as row}
												<Table.Row class={row.status === 'CONFLICT' ? 'bg-destructive/10' : ''}>
													<Table.Cell>
														{#if row.status === 'NEW'}
															<Badge variant="default" class="bg-blue-500">Nouveau</Badge>
														{:else if row.status === 'CONFLICT'}
															<Badge variant="destructive">Conflit</Badge>
														{:else}
															<Badge variant="secondary" class="bg-epi-teal text-black"
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
														{#if row.csvData.parentEmail || row.csvData.parentPhone}
															<div class="flex flex-col text-xs text-muted-foreground">
																<span>{row.csvData.parentEmail}</span>
																<span>{row.csvData.parentPhone}</span>
															</div>
														{:else}
															<span class="text-xs text-muted-foreground italic">--</span>
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
							</div>

							<form
								action="?/confirmCampaignImport"
								method="POST"
								use:kitEnhance={() => {
									isConfirming = true;
									return async ({ update }) => {
										await update();
										isConfirming = false;
									};
								}}
								class="flex items-center justify-between pt-4"
							>
								<input
									type="hidden"
									name="importData"
									value={JSON.stringify(analysisResult.analysisData)}
								/>
								<input type="hidden" name="eventName" value={analysisResult.eventName} />
								<input type="hidden" name="eventDate" value={analysisResult.eventDate} />

								<Button variant="ghost" type="button" onclick={() => (analysisResult = null)}>
									Annuler et Retour
								</Button>

								<Button
									type="submit"
									disabled={isConfirming}
									class="bg-green-600 hover:bg-green-700"
								>
									{isConfirming ? 'Création en cours...' : "Confirmer et Créer l'événement"}
								</Button>
							</form>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<!-- MANUAL TAB -->
		<Tabs.Content value="manual">
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Configuration Manuelle</Card.Title>
					<Card.Description>Définissez les informations générales de l'événement.</Card.Description>
				</Card.Header>
				<Card.Content>
					<form method="POST" action="?/createManual" use:enhance id="event-form" class="space-y-6">
						<div class="space-y-2">
							<Label for="titre">Titre de l'événement</Label>
							<Input
								id="titre"
								name="titre"
								bind:value={$form.titre}
								placeholder="Ex: Atelier hebdomadaire - Mercredi"
							/>
							{#if $errors.titre}<p class="text-sm text-destructive">{$errors.titre}</p>{/if}
						</div>

						<div class="flex gap-4">
							<div class="flex-1 space-y-2">
								<Label for="date">Date</Label>
								<Popover.Root bind:open>
									<Popover.Trigger id="date">
										{#snippet child({ props })}
											<Button
												{...props}
												variant="outline"
												class="w-full justify-between font-normal"
											>
												{formatDateFr(dateValue)}
												<ChevronDown class="h-4 w-4" />
											</Button>
										{/snippet}
									</Popover.Trigger>
									<Popover.Content class="w-auto overflow-hidden p-0" align="start">
										<Calendar
											type="single"
											bind:value={dateValue}
											captionLayout="dropdown"
											onValueChange={() => {
												open = false;
											}}
											minValue={today(getLocalTimeZone())}
										/>
									</Popover.Content>
								</Popover.Root>
								<input
									type="hidden"
									name="date"
									value={dateValue
										? `${dateValue.year}-${String(dateValue.month).padStart(2, '0')}-${String(dateValue.day).padStart(2, '0')}`
										: ''}
								/>
								{#if $errors.date}<p class="text-sm text-destructive">{$errors.date}</p>{/if}
							</div>

							<div class="flex-1 space-y-2">
								<Label>Heure</Label>
								<div class="flex gap-2">
									<Select.Root type="single" bind:value={hour}>
										<Select.Trigger class="w-full">{hour}</Select.Trigger>
										<Select.Content class="h-50 overflow-y-auto">
											{#each hours as h (h)}<Select.Item value={h}>{h}</Select.Item>{/each}
										</Select.Content>
									</Select.Root>
									<span class="py-2 text-muted-foreground">:</span>
									<Select.Root type="single" bind:value={minute}>
										<Select.Trigger class="w-full">{minute}</Select.Trigger>
										<Select.Content>
											{#each minutes as m (m)}<Select.Item value={m}>{m}</Select.Item>{/each}
										</Select.Content>
									</Select.Root>
								</div>
								<input type="hidden" name="time" value={timeValue} />
							</div>
						</div>

						<div class="space-y-2">
							<Label for="theme">Thème (Optionnel)</Label>
							<ThemeSelect themes={data.themes} bind:value={$form.theme} name="theme" />
							<p class="text-[10px] font-bold text-muted-foreground uppercase">
								Sélectionnez un thème existant ou tapez-en un nouveau pour le créer.
							</p>
							{#if $errors.theme}<p class="text-sm text-destructive">{$errors.theme}</p>{/if}
						</div>
						<input type="hidden" name="statut" value="planifiee" />
					</form>
				</Card.Content>
				<Card.Footer class="justify-end border-t bg-muted/50 px-6 py-4">
					<button type="submit" form="event-form" class={buttonVariants()} disabled={$delayed}>
						<Save class="mr-2 h-4 w-4" />
						{#if $delayed}Création...{:else}Créer l'événement{/if}
					</button>
				</Card.Footer>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>
