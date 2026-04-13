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
  <p
    class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
  >
    Le contenu du r&egrave;glement int&eacute;rieur sera bient&ocirc;t
    disponible.
  </p>
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
