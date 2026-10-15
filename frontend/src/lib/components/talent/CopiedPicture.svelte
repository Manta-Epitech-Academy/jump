<script lang="ts">
  import { onImageBroken } from '$lib/actions/onImageBroken';
  import { reducedMotionUrl, type ShownPicture } from '$lib/domain/pictures';
  import { cn } from '$lib/utils';

  // A picture Jump copied (`ShownPicture`), drawn as it is: any proportion, any
  // size, still or animated. Decorative wherever it is drawn: the words beside
  // it carry the meaning.
  //
  // It lays itself out, in one of two places:
  //
  //   - `hero`: the picture column of a home hero. As wide as the column, but
  //     never wider than its own pixels nor taller than the bound (40% of a
  //     phone's screen, 20rem from `sm`), so a portrait leaves the hero's line
  //     and button on screen and a small picture is never blown up. The bound
  //     is a maximum WIDTH, worked out from the proportion, because only a
  //     definite width lets the browser reserve the box before the bytes land:
  //     bounded in height with both sides `auto`, the image is 0 x 0 until it
  //     loads and the hero jumps when it does.
  //   - `sprite`: a character drawn small beside a line of text, at a fixed
  //     height. A tiny one is pixel art, kept crisp rather than blurred.
  //
  // An animation gives way to a still for a talent who asked for reduced
  // motion: the one its author chose (`still`, a cover's poster) or, failing
  // that, its first frame, which Jump derived when it copied it
  // (`reducedMotionUrl`).
  let {
    picture,
    still = null,
    layout,
    onBroken,
  }: {
    picture: ShownPicture;
    still?: ShownPicture | null;
    layout: 'hero' | 'sprite';
    /** Called when the picture cannot be shown, so the host can drop it. */
    onBroken: () => void;
  } = $props();

  const motionless = $derived(reducedMotionUrl(picture, still));
</script>

<picture
  class={layout === 'hero'
    ? 'flex shrink-0 justify-center sm:w-2/5'
    : 'self-start'}
>
  {#if motionless}
    <source media="(prefers-reduced-motion: reduce)" srcset={motionless} />
  {/if}
  <!-- The two custom properties carry the picture's own size into the hero's
       bound, which no class can know in advance. -->
  <img
    src={picture.url}
    width={picture.width}
    height={picture.height}
    alt=""
    decoding="async"
    use:onImageBroken={onBroken}
    style:--picture-width="{picture.width}px"
    style:--picture-ratio={picture.width / picture.height}
    class={layout === 'hero'
      ? 'block h-auto w-full max-w-[min(var(--picture-width),calc(40svh*var(--picture-ratio)))] ring-1 ring-white/20 sm:max-w-[min(var(--picture-width),calc(20rem*var(--picture-ratio)))]'
      : cn(
          'h-12 w-auto max-w-full',
          picture.width < 128 && '[image-rendering:pixelated]',
        )}
  />
</picture>
