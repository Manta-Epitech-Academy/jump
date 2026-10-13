<script lang="ts">
  import { onImageBroken } from '$lib/actions/onImageBroken';
  import { DEFAULT_PERSONA } from '$lib/domain/feedbackForms/schema';
  import { cn } from '$lib/utils';

  // The face of a form's persona, round. A form's own icon is a stored object,
  // and a stored object can be missing: a generated database holds the key and
  // no bytes behind it, and a deleted one leaves the key behind. The default
  // mascot stands in rather than a broken-image glyph.
  //
  // The size comes from the host (`class`), because each surface draws the
  // persona at its own scale.
  let {
    iconUrl,
    alt = '',
    class: className,
  }: {
    /** The form's own icon, when it has one (`personaIconUrl` of the schema). */
    iconUrl?: string;
    alt?: string;
    class?: string;
  } = $props();

  // The address that failed, not a flag: a new icon uploaded over a broken one
  // is a different address and is tried again without anything to reset.
  let failedUrl = $state<string | undefined>(undefined);
  const src = $derived(
    iconUrl && iconUrl !== failedUrl ? iconUrl : DEFAULT_PERSONA.iconUrl,
  );
</script>

<img
  {src}
  {alt}
  class={cn('rounded-full object-cover', className)}
  use:onImageBroken={() => (failedUrl = iconUrl)}
/>
