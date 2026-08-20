<script lang="ts">
  import ParentFlowShell from '$lib/components/parent/ParentFlowShell.svelte';
  import CheckCircle from '@lucide/svelte/icons/check-circle';

  let { data } = $props();
</script>

<svelte:head>
  <title>Merci — Espace Parent</title>
</svelte:head>

<ParentFlowShell>
  <main
    class="relative z-10 flex flex-1 items-center justify-center overflow-y-auto p-4"
  >
    <div class="w-full max-w-lg text-center">
      <div
        class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-tech text-black shadow-lg shadow-epi-tech/20"
      >
        <CheckCircle class="h-7 w-7" />
      </div>

      <div
        class="rounded-2xl border border-slate-200/60 bg-white/80 px-6 py-8 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <h1
          class="mb-4 font-heading text-2xl tracking-wider text-epi-blue uppercase dark:text-epi-blue"
        >
          Merci pour votre confiance !
        </h1>

        <div
          class="space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
        >
          {#if data.childPrenom}
            <p>
              {#if data.childDecision === 'refused'}
                Votre refus concernant le droit à l'image de <strong
                  >{data.childPrenom}</strong
                > vient d'être enregistré.
              {:else}
                Votre accord pour le droit à l'image de <strong
                  >{data.childPrenom}</strong
                > vient d'être enregistré.
              {/if}
            </p>

            <p>
              Plus rien à faire de votre côté : <strong
                >{data.childPrenom}</strong
              >
              est attendu(e) sur notre campus de
              <strong>{data.campusName}</strong> du 15 au 26 juin. Nos équipes ont
              hâte de l'accueillir.
            </p>

            {#if data.contactEmail}
              <p>
                Si vous avez la moindre question d'ici là, écrivez-nous à<br />
                <a
                  href="mailto:{data.contactEmail}"
                  class="font-semibold text-epi-blue hover:underline"
                  >{data.contactEmail}</a
                >.
              </p>
            {/if}
          {:else}
            <p>
              Le droit à l'image de votre enfant est pris en charge par le
              parent référent. <strong>Aucune action n'est requise</strong> de votre
              part.
            </p>

            <p>Nos équipes ont hâte de l'accueillir.</p>
          {/if}

          <p class="pt-2 font-medium text-slate-700 dark:text-slate-200">
            Bien cordialement,<br />
            L'équipe Epitech{#if data.campusName}&nbsp;{data.campusName}{/if}
          </p>
        </div>
      </div>
    </div>
  </main>
</ParentFlowShell>
