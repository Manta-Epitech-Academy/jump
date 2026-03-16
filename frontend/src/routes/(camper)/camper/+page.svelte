<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { resolve } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { triggerConfetti } from '$lib/actions/confetti';
	import {
		Rocket,
		Trophy,
		Sparkles,
		BookOpen,
		ArrowRight,
		Clock,
		Coffee,
		Hourglass,
		MapPin,
		Share2,
		ExternalLink,
		Check,
		FileDown,
		LoaderCircle
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let { student, participation, hasCompletedEvents } = data;

	let levelLabel =
		student?.level === 'Expert'
			? 'Expert ✦'
			: student?.level === 'Apprentice'
				? 'Apprenti'
				: 'Novice';

	// Assuming 1000 XP is the max for the progress bar visual (can be adjusted)
	let xpProgress = Math.min(((student?.xp || 0) / 1000) * 100, 100);

	let eventTitle = participation?.expand?.event?.titre || 'Atelier Epitech';
	let subjects = participation?.expand?.subjects || [];

	function formatTime(dateString: string | undefined) {
		if (!dateString) return '';
		return new Date(dateString).toLocaleTimeString('fr-FR', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Sharing Logic
	let copied = $state(false);
	// Construct the absolute URL using the current origin
	let shareUrl = $derived(`${page.url.origin}${resolve(`/p/${student?.id}`)}`);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			toast.success('Lien copié dans le presse-papier !');
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			toast.error('Erreur lors de la copie du lien.');
		}
	}

	// PDF Download Logic
	let isDownloading = $state(false);

	async function downloadCertificate() {
		isDownloading = true;
		try {
			const res = await fetch(resolve('/api/certificate'));
			if (!res.ok) throw new Error('Erreur réseau');

			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			const disposition = res.headers.get('Content-Disposition');
			let filename = 'Attestation_TekCamp.pdf';
			if (disposition && disposition.includes('filename=')) {
				filename = disposition.split('filename=')[1].replace(/"/g, '');
			}

			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
			toast.success('Attestation téléchargée !');
			triggerConfetti();
		} catch (e) {
			toast.error("Erreur lors de la génération de l'attestation.");
		} finally {
			isDownloading = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl px-4 py-8 pb-20 sm:py-12">
	<!-- HEADER: Greeting & Context -->
	<header class="mb-10" in:fly={{ y: -20, duration: 400, delay: 100 }}>
		<div class="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
			<div
				class="flex h-16 w-16 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-xl shadow-epi-blue/20"
			>
				<Rocket class="h-8 w-8" />
			</div>
			<div class="sm:ml-4">
				<h1 class="font-heading text-4xl tracking-tight text-slate-900 uppercase dark:text-white">
					Salut, <span class="text-epi-blue">{student?.prenom}</span> 👋
				</h1>
				<p class="font-bold text-slate-500 uppercase">Bienvenue dans ton cockpit.</p>
			</div>
		</div>
	</header>

	<div class="grid gap-6 md:grid-cols-12">
		<!-- LEFT COLUMN: Stats & Profile -->
		<div class="md:col-span-4" in:fly={{ x: -20, duration: 400, delay: 200 }}>
			<div
				class="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
			>
				<!-- Decorative background blur -->
				<div
					class="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-epi-orange/10 blur-2xl"
				></div>

				<div class="relative z-10 flex flex-col items-center text-center">
					<div
						class="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950/30"
					>
						<Trophy class="h-7 w-7 text-epi-orange" />
					</div>

					<Badge
						variant="outline"
						class="mb-4 border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-black tracking-widest text-orange-600 uppercase dark:border-orange-900/50 dark:bg-orange-900/20"
					>
						{levelLabel}
					</Badge>

					<div class="mb-6">
						<span class="text-5xl font-black tracking-tighter text-slate-900 dark:text-white">
							{student?.xp || 0}
						</span>
						<span class="text-lg font-bold text-epi-orange">XP</span>
					</div>

					<!-- Custom Thick Progress Bar -->
					<div class="w-full space-y-2">
						<div class="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
							<span>Progression</span>
							<span>{Math.round(xpProgress)}%</span>
						</div>
						<div class="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
							<div
								class="h-full rounded-full bg-epi-orange transition-all duration-1000 ease-out"
								style="width: {xpProgress}%"
							></div>
						</div>
					</div>

					<!-- Public Profile Share Section -->
					<div class="mt-8 w-full space-y-3 border-t border-slate-100 pt-6 dark:border-slate-800">
						<h3 class="text-xs font-bold text-slate-400 uppercase">Mon Profil Public</h3>
						<div class="flex flex-col gap-2">
							<Button
								variant="outline"
								class="w-full justify-between rounded-xl border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300"
								onclick={copyLink}
							>
								<span class="truncate text-xs">{shareUrl}</span>
								{#if copied}
									<Check class="ml-2 h-4 w-4 shrink-0 text-epi-teal" />
								{:else}
									<Share2 class="ml-2 h-4 w-4 shrink-0" />
								{/if}
							</Button>
							<Button
								variant="ghost"
								href={resolve(`/p/${student?.id}`)}
								target="_blank"
								class="w-full rounded-xl text-xs font-bold text-epi-blue hover:bg-blue-50 dark:hover:bg-blue-900/20"
							>
								<ExternalLink class="mr-2 h-4 w-4" />
								Voir la page
							</Button>
						</div>
					</div>

					<!-- PDF Download Section -->
					{#if hasCompletedEvents}
						<div class="mt-4 w-full space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
							<h3 class="text-xs font-bold text-slate-400 uppercase">Mes Documents</h3>
							<Button
								variant="secondary"
								class="h-auto w-full rounded-xl bg-blue-50/80 py-2.5 text-xs font-bold text-epi-blue transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
								onclick={downloadCertificate}
								disabled={isDownloading}
							>
								{#if isDownloading}
									<LoaderCircle class="mr-2 h-4 w-4 shrink-0 animate-spin" />
									<span class="truncate">Génération...</span>
								{:else}
									<FileDown class="mr-2 h-4 w-4 shrink-0" />
									<span class="truncate">Attestation Parcoursup</span>
								{/if}
							</Button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- RIGHT COLUMN: Today's Mission -->
		<div class="md:col-span-8" in:fly={{ x: 20, duration: 400, delay: 300 }}>
			<h2 class="mb-4 font-heading text-xl text-slate-800 uppercase dark:text-slate-200">
				Mission du jour<span class="text-epi-teal">_</span>
			</h2>

			{#if participation}
				<div
					class="flex min-h-62.5 flex-col overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
				>
					<div
						class="border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
					>
						<div class="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
							<MapPin class="h-4 w-4 text-epi-blue" />
							<span>{eventTitle}</span>
							<span class="text-slate-300 dark:text-slate-700">•</span>
							<Clock class="h-4 w-4" />
							<span>{formatTime(participation.expand?.event?.date)}</span>
						</div>
					</div>

					<div class="flex flex-1 flex-col p-6">
						{#if subjects.length > 0}
							<div class="mb-6 flex items-start gap-4">
								<div class="rounded-xl bg-teal-50 p-3 dark:bg-teal-950/30">
									<BookOpen class="h-6 w-6 text-epi-teal" />
								</div>
								<div>
									<h3 class="text-xl font-bold text-slate-900 dark:text-white">
										{subjects[0].nom}
									</h3>
									<p class="mt-1 line-clamp-2 text-sm text-slate-500">
										{subjects[0].description ||
											'Prépare-toi à coder et à relever de nouveaux défis !'}
									</p>
								</div>
							</div>

							<div class="mt-auto pt-4">
								<Button
									href={resolve(`/camper/${subjects[0].id}`)}
									class="h-14 w-full rounded-2xl bg-epi-blue text-lg font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-epi-blue/90 active:scale-[0.98]"
								>
									<Sparkles class="mr-2 h-5 w-5" />
									Démarrer la mission
									<ArrowRight class="ml-2 h-5 w-5" />
								</Button>
								{#if subjects.length > 1}
									<p class="mt-3 text-center text-xs font-bold text-slate-400">
										+ {subjects.length - 1} autre(s) sujet(s) t'attendent ensuite.
									</p>
								{/if}
							</div>
						{:else}
							<!-- Event exists but no subject assigned yet -->
							<div class="flex flex-1 flex-col items-center justify-center text-center">
								<div class="mb-4 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
									<Hourglass class="h-8 w-8 animate-pulse text-epi-blue" />
								</div>
								<h3 class="text-lg font-bold text-slate-900 dark:text-white">
									Ton sujet arrive...
								</h3>
								<p class="mt-2 max-w-sm text-sm text-slate-500">
									Le Manta est en train de préparer ta mission. Patiente quelques instants, la page
									se mettra à jour.
								</p>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<!-- No event today -->
				<div
					class="flex min-h-62.5 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/50"
				>
					<div class="mb-4 rounded-full bg-slate-200/50 p-4 dark:bg-slate-800">
						<Coffee class="h-8 w-8 text-slate-400" />
					</div>
					<h3 class="text-lg font-bold text-slate-700 uppercase dark:text-slate-300">
						Repos aujourd'hui
					</h3>
					<p class="mt-2 max-w-sm text-sm text-slate-500">
						Aucun atelier n'est planifié pour toi aujourd'hui. Profites-en pour te reposer ou revoir
						tes anciens projets !
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
