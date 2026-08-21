<script lang="ts">
  import { mode } from 'mode-watcher';

  /**
   * The Epitech wordmark, in one of the two versions the charte authorises:
   * blue on a light surface, white on a coloured or dark one. The accolades are
   * part of the logo and are never removed.
   *
   * Each version is its own asset. It used to be the blue master recoloured with
   * `brightness-0 invert`, which the charte forbids (no effects on the logo) and
   * which would break silently the day the wordmark stops being a single colour.
   *
   * The asset is picked in script rather than with a pair of `dark:hidden`
   * images, so only the one in use is ever fetched.
   *
   * - `dark`: always-dark surfaces (sidebar, staff top bar, brand-blue hero).
   * - `auto`: theme-following surfaces (login, mobile bars).
   */
  let {
    tone = 'auto',
    class: className,
  }: {
    tone?: 'dark' | 'auto';
    /** Sizing and positioning utilities: the consumer owns the box. */
    class?: string;
  } = $props();

  const src = $derived(
    tone === 'dark' || mode.current === 'dark'
      ? '/EPITECH-LOGO-BLANC-2025.svg'
      : '/EPITECH-LOGO-BLEU-2025.svg',
  );
</script>

<img {src} alt="Epitech" class={className} />
