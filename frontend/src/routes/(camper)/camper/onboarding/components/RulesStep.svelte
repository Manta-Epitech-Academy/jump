<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { BookOpen } from '@lucide/svelte';

  let accepted = $state(false);
</script>

<!-- Header -->
<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <BookOpen class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    R&egrave;glement Int&eacute;rieur
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Prends connaissance du r&egrave;glement avant de continuer.
  </p>
</div>

<!-- Document content -->
<div
  class="max-h-[50vh] overflow-y-auto rounded-2xl border-none bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
>
  <div class="prose prose-sm prose-slate dark:prose-invert max-w-none">
    <p>
      En tant qu'entreprise d'accueil et &eacute;cole d'enseignement sup&eacute;rieur, <strong>Epitech</strong> dispose d'un r&egrave;glement int&eacute;rieur pour s'assurer d'une vie de campus respectueuse et propice &agrave; l'apprentissage.
    </p>
    <p>
      Tout manquement aux r&egrave;gles &eacute;tablies par le r&egrave;glement int&eacute;rieur entrainerait de fait une rupture &agrave; prise effet imm&eacute;diat de la convention de stage.
    </p>

    <h3>Pr&eacute;sence et ponctualit&eacute;</h3>
    <ul>
      <li>La pr&eacute;sence sur le campus est obligatoire de 10h &agrave; 17h, hors pause m&eacute;ridienne.</li>
      <li>Les stagiaires doivent &ecirc;tre ponctuels et respecter les horaires du stage. Tout retard ou absence doit &ecirc;tre justifi&eacute; par &eacute;crit par les responsables l&eacute;gaux avant 10h30.</li>
      <li>Un stagiaire est consid&eacute;r&eacute; en retard s'il se pr&eacute;sente jusqu'&agrave; 15 minutes apr&egrave;s l'heure de d&eacute;but de l'activit&eacute;. Au-del&agrave;, il est consid&eacute;r&eacute; comme absent.</li>
      <li>Les retardataires peuvent ne pas &ecirc;tre autoris&eacute;s &agrave; rejoindre l'activit&eacute; si leur retard perturbe le bon d&eacute;roul&eacute; de celle-ci.</li>
      <li>Les stagiaires sont autoris&eacute;s &agrave; quitter le campus pendant la pause m&eacute;diane pour d&eacute;jeuner. En dehors de cette pause, aucune sortie n'est autoris&eacute;e.</li>
      <li>Les stagiaires ne sont plus sous la responsabilit&eacute; d'<strong>Epitech</strong> de 12h30 &agrave; 13h30.</li>
      <li>Les stagiaires sont sous la responsabilit&eacute; d'<strong>Epitech</strong> d&egrave;s lors qu'ils ont &eacute;marg&eacute; en arrivant le matin et jusqu'&agrave; 17h, except&eacute; sur la pause m&eacute;diane.</li>
    </ul>

    <h3>Comportement et respect d'autrui</h3>
    <ul>
      <li>Les stagiaires doivent respecter les r&egrave;gles de bonne conduite et de savoir-vivre.</li>
      <li>Il est strictement proscrit de tenir des propos injurieux ou d'adopter un comportement violent envers un camarade, un encadrant ou un responsable.</li>
      <li>Chaque stagiaire se doit de faire preuve de neutralit&eacute; en mati&egrave;re de religion et de politique.</li>
      <li>Il est formellement interdit de crier ou de courir au sein de l'&eacute;tablissement.</li>
      <li>Le port de couvre-chef (casquette, bonnet&hellip;) est interdit sur le campus.</li>
      <li>Le voile religieux couvrant les cheveux est tol&eacute;r&eacute; s'il reste discret.</li>
    </ul>

    <h3>Mat&eacute;riel et responsabilit&eacute;</h3>
    <ul>
      <li>Aucun pr&ecirc;t de mat&eacute;riel informatique ne peut &ecirc;tre assur&eacute; par Epitech.</li>
      <li>Toute d&eacute;t&eacute;rioration constat&eacute;e sera &agrave; la charge du stagiaire responsable et de son responsable l&eacute;gal.</li>
      <li>Le stagiaire est enti&egrave;rement responsable de son mat&eacute;riel. En cas de casse ou de vol, <strong>Epitech</strong> ne pourra &ecirc;tre tenue responsable.</li>
      <li>Tout oubli de mat&eacute;riel informatique sera consid&eacute;r&eacute; comme une absence.</li>
      <li>L'utilisation du t&eacute;l&eacute;phone portable est interdite dans les salles d'activit&eacute;, sauf sur autorisation d'un encadrant.</li>
    </ul>

    <h3>Travail et s&eacute;curit&eacute;</h3>
    <ul>
      <li>Les stagiaires doivent respecter les consignes de s&eacute;curit&eacute; et les r&egrave;gles d'&eacute;vacuation en cas d'urgence.</li>
      <li>Le travail en groupe doit s'effectuer dans le respect des autres groupes.</li>
      <li>Les stagiaires doivent respecter les r&egrave;gles de confidentialit&eacute; et de protection des donn&eacute;es personnelles.</li>
      <li>Les stagiaires doivent respecter les r&egrave;gles relatives aux droits d'auteur et &agrave; la propri&eacute;t&eacute; intellectuelle.</li>
      <li>Les stagiaires doivent v&eacute;rifier et laisser la salle de classe propre avant de la quitter.</li>
      <li>Il est interdit d'apporter boisson ou nourriture dans certaines salles du campus comme l'amphith&eacute;&acirc;tre et le Lab'.</li>
    </ul>

    <h3>Obligations du stagiaire</h3>
    <ul>
      <li>Les stagiaires s'engagent &agrave; profiter activement des activit&eacute;s propos&eacute;es par <strong>Epitech</strong>.</li>
      <li>Les stagiaires doivent remplir &agrave; l'issue de leur stage un questionnaire d'&eacute;valuation.</li>
      <li>Les stagiaires veilleront &agrave; utiliser le bon logo et le bon nom de l'&eacute;cole en entier (<strong>Epitech</strong>).</li>
    </ul>
  </div>
</div>

<!-- Accept form -->
<form method="POST" action="?/signRules" use:enhance class="mt-6">
  <label
    class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <input
      type="checkbox"
      bind:checked={accepted}
      class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
    />
    <span class="text-sm text-slate-700 dark:text-slate-300">
      J'ai lu et j'accepte le r&egrave;glement int&eacute;rieur
    </span>
  </label>

  <Button
    type="submit"
    disabled={!accepted}
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Signer et continuer
  </Button>
</form>
