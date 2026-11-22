<!--
  The header's sleep button for EpiDuck (#539), beside the theme switch: it puts
  the duck to sleep, which lasts on every page and device until it is pressed
  again. Pressed reads as asleep, the state the talent chose, and its « zz » is
  the one sign of him while he sleeps under the water.

  A bird alone does not say what it does, so its tooltip and its name do: they
  say « ton canard » before his name, which the talent may have changed into
  anything.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '#lib/components/ui/button/index.ts';
  import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
  import { MASCOT_DEFAULT_NAME, mascotLookOf } from '#lib/domain/mascot.ts';
  import Bird from '@lucide/svelte/icons/bird';
  import { useMascot } from './mascotController.svelte.ts';

  const mascotOf = useMascot();
  let mascot = $derived(mascotOf());
  let name = $derived(
    page.data.talent
      ? mascotLookOf(page.data.talent).name
      : MASCOT_DEFAULT_NAME,
  );
  let label = $derived(
    mascot?.asleep
      ? `Réveiller ton canard ${name}`
      : `Endormir ton canard ${name}`,
  );
</script>

{#if mascot}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon"
          aria-pressed={mascot.asleep}
          aria-label={label}
          onclick={() => mascot.setAsleep(!mascot.asleep)}
          class="relative h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground-secondary aria-pressed:bg-muted aria-pressed:text-primary"
        >
          <Bird class="h-4 w-4" />
          {#if mascot.asleep}
            <span
              class="absolute top-0.5 right-0.5 font-mono text-overline leading-none font-bold"
              aria-hidden="true">zz</span
            >
          {/if}
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="bottom"><p>{label}</p></Tooltip.Content>
  </Tooltip.Root>
{/if}
