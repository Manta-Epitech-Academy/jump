<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { track, errReason, secondsBetween } from '$lib/analytics';
  import { WELCOME_XP_BONUS } from '$lib/domain/xp';
  import ContinueButton from './ContinueButton.svelte';

  let { error: formError }: { error?: string } = $props();
  const seenAt = Date.now();
  let submitting = $state(false);
  let city = $state('');
  let acceptedRules = $state(false);
  let acceptedCharter = $state(false);
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <BookOpen class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Dernière étape
  </h1>
</div>

{#if formError}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
  >
    {formError}
  </p>
{/if}

<form
  method="POST"
  action="?/signRules"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'redirect') {
        track('rules_signed', { secondsToSign: secondsBetween(seenAt) });
        track('onboarding_completed', { step: 'rules' });
        goto(result.location, { invalidateAll: true });
        return;
      }
      if (result.type === 'failure') {
        track('rules_signing_failed', { reason: errReason(result) });
      }
      await update();
      submitting = false;
    };
  }}
>
  <!-- ═══ Règlement intérieur ═══ -->
  <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
    <h2>Règlement intérieur - stagiaires Epitech</h2>
    <p>
      En tant qu'entreprise d'accueil et école d'enseignement supérieur, Epitech
      dispose d'un règlement intérieur garantissant un cadre respectueux et
      propice à l'apprentissage. Tout manquement entraîne la rupture immédiate
      de la convention de stage.
    </p>

    <h3>Présence et ponctualité</h3>
    <p>
      La présence sur le campus est obligatoire de 10h à 17h, hors pause
      méridienne (12h30–13h30), pendant laquelle les stagiaires ne sont plus
      sous la responsabilité d'Epitech. Toute absence ou retard doit être
      justifié par écrit par les responsables légaux avant 10h30. Un stagiaire
      arrivant plus de 15 minutes après le début d'une activité est considéré
      absent ; en deçà, il peut être redirigé vers une autre salle si son
      arrivée perturbe la session. Aucune sortie n'est autorisée en dehors de la
      pause méridienne, sauf demande justifiée auprès de la direction.
    </p>

    <h3>Comportement et respect d'autrui</h3>
    <p>
      Les stagiaires adoptent une tenue, un langage et un comportement
      respectueux envers leurs pairs et les encadrants. Tout propos injurieux ou
      comportement violent est strictement proscrit. Chacun fait preuve de
      neutralité religieuse et politique, et d'une attitude tolérante. Il est
      interdit de crier ou courir dans l'établissement. Les couvre-chefs sont
      interdits ; le voile religieux couvrant les cheveux est toléré s'il reste
      discret.
    </p>

    <h3>Matériel et responsabilité</h3>
    <p>
      Chaque stagiaire est responsable de son propre matériel : Epitech n'assure
      aucun prêt et ne pourra être tenue responsable en cas de casse ou de vol.
      Tout oubli de matériel informatique est considéré comme une absence, et
      toute détérioration est à la charge du stagiaire et de ses responsables
      légaux. L'usage du téléphone portable est interdit en salle d'activité,
      sauf autorisation d'un encadrant.
    </p>

    <h3>Travail et sécurité</h3>
    <p>
      Les consignes de sécurité et règles d'évacuation doivent être respectées
      en toute circonstance. Le travail en groupe se fait sans perturber les
      autres, et les salles doivent être laissées propres après chaque activité.
      Les stagiaires respectent les règles de confidentialité, de protection des
      données personnelles, ainsi que les droits d'auteur et la propriété
      intellectuelle (documents, images, musiques, usage d'internet et des
      réseaux sociaux). Il est interdit d'apporter boisson ou nourriture dans
      certaines salles (amphithéâtre, Lab', etc.).
    </p>

    <h3>Obligations du stagiaire</h3>
    <p>
      Les stagiaires s'engagent à participer activement aux activités proposées
      (conférences, ateliers, soutenances, jurys) et à remplir le questionnaire
      d'évaluation en fin de stage, dans le cadre de la démarche d'amélioration
      continue d'Epitech. Ils veillent également à utiliser le nom complet et le
      logo officiels de l'école dans tous leurs documents (convention, CV,
      présentations).
    </p>
  </div>

  <!-- ═══ Sécurité des données (police réduite) ═══ -->
  <div class="mt-8">
    <h2
      class="mb-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      Sécurité des données
    </h2>
    <p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
      On collecte ton nom, ton prénom et ta progression pédagogique (étapes
      complétées, compétences validées, XP, badges, créations de ton portfolio)
      pour suivre ton parcours, générer tes certifications et te permettre de
      partager ton portfolio. Ces données sont conservées 6 mois après ta
      dernière activité, puis automatiquement anonymisées. Tu peux à tout moment
      les consulter, les modifier ou les supprimer depuis ton espace personnel,
      et demander la suppression complète de ton compte. Tout est stocké en
      France, sur un serveur géré par l'équipe Epitech.
    </p>
  </div>

  <!-- ═══ Signature ═══ -->
  <div
    class="mt-6 flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <span class="text-sm font-medium text-slate-700 dark:text-slate-300"
      >Fait à</span
    >
    <input
      name="city"
      type="text"
      bind:value={city}
      placeholder="Ville"
      required
      class="w-40 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
    />
    <span class="text-sm font-medium text-slate-700 dark:text-slate-300"
      >, le {new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}</span
    >
  </div>

  <!-- ═══ Checkboxes ═══ -->
  <div class="mt-6 space-y-3">
    <label
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <Checkbox
        bind:checked={acceptedCharter}
        name="acceptedCharter"
        value="true"
        class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
        J'ai lu et j'accepte la politique de confidentialité d'Epitech
        concernant la collecte et le traitement de mes données personnelles.
      </span>
    </label>

    <label
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <Checkbox
        bind:checked={acceptedRules}
        name="acceptedRules"
        value="true"
        class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
        Je m'engage à respecter le règlement intérieur d'Epitech.
      </span>
    </label>

    <ContinueButton
      {submitting}
      disabled={!acceptedRules || !acceptedCharter || !city.trim()}
    >
      <Sparkles class="h-4 w-4 shrink-0" />
      Signer et obtenir mes {WELCOME_XP_BONUS} XP de bienvenue
    </ContinueButton>
  </div>
</form>
