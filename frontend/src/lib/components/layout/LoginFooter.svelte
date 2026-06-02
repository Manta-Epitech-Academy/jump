<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  type Props = {
    /** Prompt that introduces the cross-link, e.g. "Élève ou parent ?". */
    prompt: string;
    /** Cross-link label, e.g. "Se connecter" or "Espace staff". */
    linkLabel: string;
    /** Cross-link destination (already resolved). */
    linkHref: string;
  };

  let { prompt, linkLabel, linkHref }: Props = $props();
</script>

<!-- Shared footer for every login surface: the cross-link to the other
     audience's login, plus the constant Epitech credit. -->
<div class="space-y-3 text-center">
  <p class="text-sm text-muted-foreground">
    {prompt}
    <a
      href={linkHref}
      class="group ml-0.5 inline-flex items-center gap-1 font-semibold text-epi-blue transition-colors hover:underline"
    >
      {linkLabel}
      <ArrowRight
        class="size-3.5 transition-transform group-hover:translate-x-0.5"
      />
    </a>
  </p>

  <p class="text-xs text-muted-foreground">
    Propulsé par
    <a
      href="https://www.epitech.eu"
      target="_blank"
      rel="noopener noreferrer"
      class="font-bold text-epi-blue transition-colors hover:underline"
    >
      Epitech
    </a>
  </p>
</div>
