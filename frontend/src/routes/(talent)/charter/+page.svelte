<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ShieldCheck } from '@lucide/svelte';

  let accepted = $state(false);
</script>

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
  <!-- Visual background elements -->
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <div class="z-10 w-full max-w-lg">
    <!-- Header -->
    <div class="mb-6 text-center">
      <div
        class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
      >
        <ShieldCheck class="h-7 w-7" />
      </div>
      <h1
        class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
      >
        Charte de Protection des Donn&eacute;es
      </h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Avant de commencer, prends connaissance de ces informations.
      </p>
    </div>

    <!-- Charter content card -->
    <div
      class="max-h-[50vh] overflow-y-auto rounded-2xl border-none bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div
        class="space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
      >
        <section>
          <h2
            class="mb-1.5 text-base font-semibold text-slate-900 dark:text-white"
          >
            Quelles donn&eacute;es collectons-nous ?
          </h2>
          <p>
            Ton nom, pr&eacute;nom, et ta progression p&eacute;dagogique :
            &eacute;tapes compl&eacute;t&eacute;es, comp&eacute;tences
            valid&eacute;es, points d'exp&eacute;rience (XP), badges obtenus, et
            les cr&eacute;ations que tu ajoutes &agrave; ton portfolio.
          </p>
        </section>

        <section>
          <h2
            class="mb-1.5 text-base font-semibold text-slate-900 dark:text-white"
          >
            Pourquoi ?
          </h2>
          <p>
            Pour suivre ta progression pendant les ateliers,
            g&eacute;n&eacute;rer tes certifications, et te permettre de
            partager ton portfolio.
          </p>
        </section>

        <section>
          <h2
            class="mb-1.5 text-base font-semibold text-slate-900 dark:text-white"
          >
            Combien de temps ?
          </h2>
          <p>
            Tes donn&eacute;es sont conserv&eacute;es 6 mois apr&egrave;s ta
            derni&egrave;re activit&eacute; sur la plateforme. Pass&eacute; ce
            d&eacute;lai, elles sont automatiquement anonymis&eacute;es.
          </p>
        </section>

        <section>
          <h2
            class="mb-1.5 text-base font-semibold text-slate-900 dark:text-white"
          >
            Tes droits
          </h2>
          <p>
            Tu peux &agrave; tout moment consulter, modifier ou supprimer tes
            donn&eacute;es depuis ton cockpit. Tu peux aussi demander la
            suppression compl&egrave;te de ton compte.
          </p>
        </section>

        <section>
          <h2
            class="mb-1.5 text-base font-semibold text-slate-900 dark:text-white"
          >
            O&ugrave; sont stock&eacute;es tes donn&eacute;es ?
          </h2>
          <p>
            Sur un serveur situ&eacute; en France, g&eacute;r&eacute; par
            l'&eacute;quipe Epitech.
          </p>
        </section>
      </div>
    </div>

    <!-- Accept form -->
    <form method="POST" action="?/accept" use:enhance class="mt-6">
      <label
        class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <input
          type="checkbox"
          bind:checked={accepted}
          class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
        />
        <span class="text-sm text-slate-700 dark:text-slate-300">
          J'ai lu et j'accepte les conditions ci-dessus
        </span>
      </label>

      <Button
        type="submit"
        disabled={!accepted}
        class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
      >
        Commencer l'aventure
      </Button>
    </form>

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propuls&eacute; par Epitech Academy
    </p>
  </div>
</div>
