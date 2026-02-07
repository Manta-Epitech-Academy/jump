<script lang="ts">
	import { formatDateFr } from '$lib/utils';
	import { Award } from 'lucide-svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let student: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let event: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let subject: any = null;

	const today = new Date();

	// Explicit Hex codes for html2canvas compatibility
	const colors = {
		white: '#ffffff',
		epiBlue: '#013afb',
		epiTeal: '#00ff97',
		slate900: '#0f172a',
		slate800: '#1e293b',
		slate600: '#475569',
		slate500: '#64748b',
		slate400: '#94a3b8',
		slate200: '#e2e8f0',
		slate100: '#f1f5f9',
		blue50: '#eff6ff'
	};
</script>

<!--
    A4 Landscape Aspect Ratio is roughly 297mm x 210mm.
    We set a fixed pixel size for the render target to ensure consistency.
    1123px x 794px corresponds to A4 at 96dpi.

    CRITICAL:
    We use explicit style="" attributes for colors because html2canvas
    crashes on modern CSS formats like 'oklch' which Tailwind v4 uses by default.
-->
<div
	id="diploma-render-target"
	class="relative flex h-[794px] w-[1123px] shrink-0 overflow-hidden font-sans"
	style="background-color: {colors.white}; color: {colors.slate900};"
>
	{#if student && event}
		<!-- 1. Background Geometric Design -->
		<!-- Left Accent Bar -->
		<div
			class="absolute top-0 bottom-0 left-0 w-5"
			style="background-color: {colors.epiBlue};"
		></div>

		<!-- Top Right Triangle Decoration -->
		<div
			class="absolute -top-32 -right-32 h-40 w-40 rotate-45 transform"
			style="background-color: {colors.epiBlue};"
		></div>

		<!-- Bottom Right Glow -->
		<div
			class="absolute -right-10 -bottom-32 h-96 w-96 rounded-full blur-3xl"
			style="background-color: {colors.epiTeal}; opacity: 0.2;"
		></div>

		<!-- Top Left Dot Pattern -->
		<div class="absolute top-10 left-16" style="opacity: 0.2;">
			<div class="grid grid-cols-6 gap-2">
				{#each Array(24) as _}
					<div class="h-1.5 w-1.5 rounded-full" style="background-color: {colors.slate400};"></div>
				{/each}
			</div>
		</div>

		<!-- 2. Content Container -->
		<div class="z-10 flex h-full w-full flex-col items-center justify-between px-24 py-16">
			<!-- HEADER -->
			<div class="flex w-full flex-col items-center gap-2 text-center">
				<div class="mb-2 flex items-center gap-3" style="color: {colors.epiBlue};">
					<Award class="h-10 w-10" />
					<span class="text-xl font-black tracking-[0.3em] uppercase">TekCamp</span>
				</div>

				<h1 class="font-heading text-7xl tracking-wide uppercase" style="color: {colors.slate900};">
					Certificat de Réussite
				</h1>
				<div class="mt-4 h-1.5 w-32 rounded-full" style="background-color: {colors.epiTeal};"></div>
			</div>

			<!-- BODY -->
			<div class="flex flex-1 flex-col items-center justify-center gap-6 text-center">
				<p class="text-2xl font-light italic" style="color: {colors.slate500};">
					Ce certificat est officiellement décerné à
				</p>

				<div class="relative py-4">
					<h2
						class="font-heading text-6xl tracking-normal uppercase"
						style="color: {colors.epiBlue};"
					>
						{student.prenom}
						{student.nom}
					</h2>
					<!-- Underline decoration -->
					<div
						class="absolute -bottom-2 left-1/2 h-0.5 w-2/3 -translate-x-1/2"
						style="background-color: {colors.slate200};"
					></div>
				</div>

				<p class="max-w-3xl text-xl" style="color: {colors.slate600};">
					Pour sa participation active, son sérieux et la validation des compétences du module :
				</p>

				<div
					class="rounded-lg border-2 px-12 py-5 shadow-sm backdrop-blur-sm"
					style="background-color: #eff6ff80; border-color: #013afb33;"
				>
					<h3 class="font-mono text-3xl font-bold" style="color: {colors.epiBlue};">
						&lt; {subject?.nom || 'Atelier Programmation'} /&gt;
					</h3>
				</div>
			</div>

			<!-- FOOTER -->
			<div
				class="mt-4 flex w-full items-end justify-between border-t-2 pt-8"
				style="border-color: {colors.slate100};"
			>
				<!-- Event Details (Left) -->
				<div class="flex flex-col gap-1 text-left">
					<span
						class="text-xs font-black tracking-widest uppercase"
						style="color: {colors.slate400};">Événement</span
					>
					<span class="text-xl font-bold uppercase" style="color: {colors.slate800};"
						>{event.titre}</span
					>
					<span class="text-sm font-medium" style="color: {colors.slate500};"
						>{formatDateFr(event.date)}</span
					>
				</div>

				<!-- Center Badge (Stamp) -->
				<div class="flex flex-col items-center justify-center pb-2">
					<div
						class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-double opacity-90"
						style="border-color: {colors.epiTeal}; color: {colors.epiTeal};"
					>
						<span class="-mt-2 -rotate-12 text-sm font-black tracking-widest uppercase">Validé</span
						>
					</div>
				</div>

				<!-- Signature (Right) -->
				<div class="flex flex-col items-end gap-2 text-right">
					<span
						class="text-xs font-black tracking-widest uppercase"
						style="color: {colors.slate400};">L'équipe Pédagogique</span
					>
					<!-- Fake Signature using a cursive-style font stack -->
					<div
						class="pr-4 text-4xl"
						style="font-family: 'Brush Script MT', 'Bradley Hand', cursive; color: {colors.slate800};"
					>
						Epitech Team
					</div>
					<span class="text-xs" style="color: {colors.slate400};"
						>Fait le {formatDateFr(today)}</span
					>
				</div>
			</div>
		</div>
	{/if}
</div>
