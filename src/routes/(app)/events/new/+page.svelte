<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Popover from '$lib/components/ui/popover';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Calendar } from '$lib/components/ui/calendar';
	import {
		ChevronLeft,
		Save,
		ChevronDown,
		FileSpreadsheet,
		PenTool,
		Upload,
		UserPlus,
		Link as LinkIcon,
		Split,
		ArrowRight,
		FileCheck,
		Laptop
	} from 'lucide-svelte';
	import { CalendarDateTime, getLocalTimeZone, today } from '@internationalized/date';
	import { untrack } from 'svelte';
	import { formatDateFr, cn } from '$lib/utils';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';
	import { enhance as kitEnhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Switch } from '$lib/components/ui/switch';

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

	// --- DRAG & DROP STATE ---
	let isDragActive = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let selectedFileName = $state<string>('');

	$effect(() => {
		if (dateValue) {
			$form.date = dateValue;
		}
		timeValue = `${hour}:${minute}`;
		$form.time = timeValue;
	});

	// Toggle function for the UI to switch between Link/Create
	function toggleDecision(rowId: string, newDecision: 'CREATE_NEW' | 'LINK_EXISTING') {
		if (!analysisResult) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const row = analysisResult.analysisData.find((r: any) => r.id === rowId);
		if (row) {
			row.decision = newDecision;
			analysisResult.analysisData = [...analysisResult.analysisData];
		}
	}

	// Toggle function for "Bring PC"
	function toggleBringPc(rowId: string) {
		if (!analysisResult) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const row = analysisResult.analysisData.find((r: any) => r.id === rowId);
		if (row) {
			row.bring_pc = !row.bring_pc;
			analysisResult.analysisData = [...analysisResult.analysisData];
		}
	}

	// --- DRAG & DROP HANDLERS ---
	function onDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragActive = true;
	}

	function onDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragActive = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragActive = false;

		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			const files = e.dataTransfer.files;
			// Only accept CSV
			if (files[0].type === 'text/csv' || files[0].name.endsWith('.csv')) {
				if (fileInput) {
					fileInput.files = files;
					selectedFileName = files[0].name;
				}
			} else {
				toast.error('Veuillez déposer un fichier CSV valide.');
			}
		}
	}

	function triggerFileInput() {
		fileInput?.click();
	}

	function onFileSelected() {
		if (fileInput?.files && fileInput.files.length > 0) {
			selectedFileName = fileInput.files[0].name;
		}
	}
</script>

<div class="mx-auto max-w-5xl space-y-6">
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
						Importez un fichier CSV. Vous pourrez ensuite spécifier si les élèves apportent leur PC.
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
							<!-- DRAG AND DROP ZONE -->
							<div
								role="button"
								tabindex="0"
								class={cn(
									'flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-10 text-center transition-all duration-200 outline-none',
									isDragActive
										? 'border-epi-blue bg-blue-50'
										: 'border-muted-foreground/25 hover:bg-muted/50',
									selectedFileName ? 'border-green-200 bg-green-50' : ''
								)}
								ondragover={onDragOver}
								ondragleave={onDragLeave}
								ondrop={onDrop}
								onclick={triggerFileInput}
								onkeydown={(e) => e.key === 'Enter' && triggerFileInput()}
							>
								{#if selectedFileName}
									<div
										class="animate-in rounded-full bg-green-100 p-4 text-green-600 duration-300 zoom-in"
									>
										<FileCheck class="h-8 w-8" />
									</div>
									<h3 class="mt-4 text-lg font-bold text-green-800">{selectedFileName}</h3>
									<p class="mb-4 text-sm text-green-600">Fichier prêt à l'analyse</p>
									<Button variant="outline" size="sm" class="pointer-events-none mt-2">
										Changer de fichier
									</Button>
								{:else}
									<div class="rounded-full bg-muted p-4">
										<Upload
											class={cn(
												'h-8 w-8',
												isDragActive ? 'text-epi-blue' : 'text-muted-foreground'
											)}
										/>
									</div>
									<h3 class="mt-4 text-lg font-bold">
										{isDragActive ? 'Déposez le fichier !' : 'Glissez le CSV ici'}
									</h3>
									<p class="mb-4 text-sm text-muted-foreground">
										Formats acceptés : CSV SalesForce
									</p>
									<Button variant="secondary" size="sm" class="pointer-events-none">
										Ou cliquer pour parcourir
									</Button>
								{/if}

								<!-- Hidden Input -->
								<input
									bind:this={fileInput}
									onchange={onFileSelected}
									id="csvFile"
									name="csvFile"
									type="file"
									accept=".csv"
									required
									class="hidden"
								/>
							</div>

							<div class="flex justify-end">
								<Button
									type="submit"
									class="bg-epi-blue hover:bg-epi-blue/90"
									disabled={isAnalyzing || !selectedFileName}
								>
									{isAnalyzing ? 'Analyse en cours...' : 'Analyser le fichier'}
								</Button>
							</div>
						</form>

						<!-- STEP 2: REVIEW & DECIDE -->
					{:else}
						<div class="space-y-6">
							<!-- Header Info -->
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
								<div
									class="flex items-center justify-between border-b bg-muted/50 px-4 py-2 text-xs font-bold uppercase"
								>
									<span>Revue des élèves ({analysisResult.analysisData.length})</span>
									<span class="text-muted-foreground">Cochez ceux qui apportent leur PC</span>
								</div>

								<ScrollArea class="h-125">
									<div class="divide-y">
										<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
										{#each analysisResult.analysisData as row (row.id)}
											{@const isNew = row.suggestedStatus === 'NEW'}
											{@const isConflict =
												row.suggestedStatus === 'CONFLICT' || row.suggestedStatus === 'SIBLING'}

											<div
												class="flex flex-col gap-4 p-4 md:flex-row md:items-center {isConflict
													? 'bg-yellow-50/50'
													: ''}"
											>
												<!-- 1. PC TOGGLE -->
												<div class="flex flex-col items-center justify-center border-r pr-4">
													<Button
														variant={row.bring_pc ? 'secondary' : 'outline'}
														size="icon"
														class="h-10 w-10 transition-colors {row.bring_pc
															? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
															: 'text-gray-400'}"
														onclick={() => toggleBringPc(row.id)}
														title="Apporte son PC ?"
													>
														<Laptop class="h-5 w-5" />
													</Button>
													<span class="mt-1 text-[9px] font-bold text-muted-foreground uppercase">
														{row.bring_pc ? 'Avec PC' : 'Sans PC'}
													</span>
												</div>

												<!-- 2. CSV DATA -->
												<div class="flex-1 space-y-1 pl-2">
													<div class="flex items-center gap-2">
														<span class="text-sm font-bold"
															>{row.csvData.prenom} {row.csvData.nom}</span
														>
														<Badge variant="outline" class="text-[10px]">{row.csvData.niveau}</Badge
														>
													</div>
													<div class="text-xs text-muted-foreground">{row.csvData.email}</div>
													{#if isNew}
														<Badge variant="default" class="bg-blue-500 text-[10px]">Nouveau</Badge>
													{/if}
													{#if isConflict}
														<Badge
															variant="outline"
															class="border-yellow-500 bg-yellow-100 text-[10px] text-yellow-700"
														>
															{row.suggestedStatus === 'SIBLING' ? 'Fratrie ?' : 'Homonyme ?'}
														</Badge>
													{/if}
												</div>

												<!-- 3. ARROW / REASON -->
												<div class="flex flex-col items-center justify-center px-2 text-center">
													{#if row.existingStudent}
														<ArrowRight class="h-4 w-4 text-muted-foreground" />
													{/if}
													{#if row.matchReason}
														<span class="mt-1 max-w-30 text-[9px] text-muted-foreground">
															{row.matchReason}
														</span>
													{/if}
												</div>

												<!-- 4. DB MATCH (If any) -->
												<div class="flex-1 space-y-1">
													{#if row.existingStudent}
														<div class="rounded border bg-white p-2 text-sm shadow-sm">
															<div class="font-bold text-muted-foreground">En Base :</div>
															<div class="font-medium">
																{row.existingStudent.prenom}
																{row.existingStudent.nom}
															</div>
															<div class="text-xs text-muted-foreground">
																{row.existingStudent.email}
															</div>
															<div class="text-xs text-muted-foreground">
																{row.existingStudent.niveau}
															</div>
														</div>
													{:else}
														<div
															class="flex h-full items-center justify-center text-xs text-muted-foreground italic"
														>
															Aucune correspondance
														</div>
													{/if}
												</div>

												<!-- 5. ACTION BUTTONS -->
												<div class="flex min-w-55 flex-col gap-2 border-l pl-4">
													<span class="text-[10px] font-bold text-muted-foreground uppercase"
														>Action à effectuer :</span
													>
													<div class="flex flex-col gap-1">
														<!-- CREATE NEW BUTTON -->
														<button
															type="button"
															class="flex items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-all
                                                            {row.decision === 'CREATE_NEW'
																? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
																: 'text-muted-foreground hover:bg-muted'}"
															onclick={() => toggleDecision(row.id, 'CREATE_NEW')}
														>
															<div class="flex items-center gap-2">
																{#if row.suggestedStatus === 'SIBLING'}
																	<Split class="h-3.5 w-3.5" />
																{:else}
																	<UserPlus class="h-3.5 w-3.5" />
																{/if}
																<span>Créer un nouveau</span>
															</div>
															{#if row.decision === 'CREATE_NEW'}
																<div class="h-2 w-2 rounded-full bg-blue-500"></div>
															{/if}
														</button>

														<!-- LINK EXISTING BUTTON -->
														{#if row.existingStudent}
															<button
																type="button"
																class="flex items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-all
                                                                {row.decision === 'LINK_EXISTING'
																	? 'border-teal-500 bg-teal-50 text-teal-700 ring-1 ring-teal-500'
																	: 'text-muted-foreground hover:bg-muted'}"
																onclick={() => toggleDecision(row.id, 'LINK_EXISTING')}
															>
																<div class="flex items-center gap-2">
																	<LinkIcon class="h-3.5 w-3.5" />
																	<span>Lier à l'existant</span>
																</div>
																{#if row.decision === 'LINK_EXISTING'}
																	<div class="h-2 w-2 rounded-full bg-teal-500"></div>
																{/if}
															</button>
														{/if}
													</div>
												</div>
											</div>
										{/each}
									</div>
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
								<!-- Send back the MODIFIED list with user decisions -->
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
									{isConfirming ? 'Création en cours...' : "Valider l'import et les décisions"}
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
