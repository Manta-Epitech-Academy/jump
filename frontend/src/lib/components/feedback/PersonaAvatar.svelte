<script lang="ts">
  import { onImageBroken } from '#lib/actions/onImageBroken.ts';
  import { DEFAULT_MASCOT_LOOK, type MascotLook } from '#lib/domain/mascot.ts';
  import EpiDuck from '#lib/components/mascot/EpiDuck.svelte';
  import { cn } from '#lib/utils.ts';

  // The face of a form's persona, round. A form with no icon of its own is
  // hosted by EpiDuck (#539): the talent's own, dressed as they left him, or the
  // undressed one for a public respondent. A form's own icon is a stored
  // object, and a stored object can be missing (a generated database holds the
  // key and no bytes behind it, a deleted one leaves the key behind), so the
  // duck stands in for a broken one too.
  //
  // The size comes from the host (`class`), because each surface draws the
  // persona at its own scale.
  let {
    iconUrl,
    look = DEFAULT_MASCOT_LOOK,
    alt = '',
    class: className,
  }: {
    /** The form's own icon, when it has one (`personaIconUrl` of the schema). */
    iconUrl?: string;
    /** Whose duck hosts the form when it has no icon. */
    look?: Pick<MascotLook, 'glasses' | 'scarf' | 'hair'>;
    alt?: string;
    class?: string;
  } = $props();

  // The address that failed, not a flag: a new icon uploaded over a broken one
  // is a different address and is tried again without anything to reset.
  let failedUrl = $state<string | undefined>(undefined);
  const ownIcon = $derived(iconUrl && iconUrl !== failedUrl ? iconUrl : null);
</script>

{#if ownIcon}
  <img
    src={ownIcon}
    {alt}
    class={cn('rounded-full object-cover', className)}
    use:onImageBroken={() => (failedUrl = iconUrl)}
  />
{:else}
  <span
    role={alt ? 'img' : undefined}
    aria-label={alt || undefined}
    aria-hidden={alt ? undefined : 'true'}
    class={cn(
      'flex items-end justify-center overflow-hidden rounded-full bg-primary/15',
      className,
    )}
  >
    <EpiDuck
      pose="front"
      {look}
      class="h-[130%] w-auto shrink-0 translate-y-[26%]"
    />
  </span>
{/if}
