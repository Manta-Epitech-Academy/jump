<script lang="ts">
  import { onImageBroken } from '$lib/actions/onImageBroken';
  import type { ShownPicture } from '$lib/domain/pictures';

  // A picture Jump copied (`ShownPicture`), drawn as it is: any proportion, any
  // size, still or animated. The host bounds it through `class` (a maximum
  // height, a maximum width) and the intrinsic size keeps the proportion, so a
  // portrait never pushes the page's button off a phone screen and a small
  // picture is never stretched past its own pixels.
  //
  // An animation gives way to a still for a talent who asked for reduced
  // motion: the one its author chose (`still`, a cover's poster) or, failing
  // that, its first frame, which Jump derived when it copied it.
  let {
    picture,
    still = null,
    alt = '',
    class: className = '',
    pictureClass = '',
    onBroken,
  }: {
    picture: ShownPicture;
    still?: ShownPicture | null;
    alt?: string;
    class?: string;
    pictureClass?: string;
    /** Called when the picture cannot be shown, so the host can drop it. */
    onBroken: () => void;
  } = $props();

  const reducedMotionUrl = $derived(still?.url ?? picture.stillUrl);
</script>

<picture class={pictureClass}>
  {#if reducedMotionUrl && reducedMotionUrl !== picture.url}
    <source
      media="(prefers-reduced-motion: reduce)"
      srcset={reducedMotionUrl}
    />
  {/if}
  <img
    src={picture.url}
    width={picture.width}
    height={picture.height}
    {alt}
    decoding="async"
    use:onImageBroken={onBroken}
    class={className}
  />
</picture>
