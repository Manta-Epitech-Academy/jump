<script lang="ts">
  import type { Season } from '$lib/domain/season';

  /**
   * A small pixel motif on the brand-blue band of the talent fiche, for a
   * season the charte can draw (`seasonOn`). It stands in for the band's pixel
   * squares and keeps their grammar: square cells, charte colours, still.
   *
   * Each row is a string of nine characters, one per 8px cell: `o` orange, `g` green,
   * `w` white, `.` the blue band showing through (the jack-o'-lantern's eyes
   * and mouth).
   */
  let { season }: { season: Season } = $props();

  const MOTIFS: Record<Season, string[]> = {
    halloween: [
      '....gg...',
      '.ooo.ooo.',
      'ooooooooo',
      'oo.ooo.oo',
      'ooooooooo',
      'o.......o',
      'oo.o.o.oo',
      '.ooooooo.',
    ],
    winter: [
      '....w....',
      '.w..w..w.',
      '..w.w.w..',
      '...www...',
      'wwwwwwwww',
      '...www...',
      '..w.w.w..',
      '.w..w..w.',
      '....w....',
    ],
  };

  const CELL: Record<string, string> = {
    o: 'bg-epi-together',
    g: 'bg-epi-tech',
    w: 'bg-white/70',
  };
</script>

<div class="grid grid-cols-9" aria-hidden="true">
  {#each MOTIFS[season] as row, y (y)}
    {#each [...row] as cell, x (x)}
      <span class="size-2 {CELL[cell] ?? ''}"></span>
    {/each}
  {/each}
</div>
