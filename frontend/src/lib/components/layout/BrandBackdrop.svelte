<!--
  The charte's own background texture for a full-height brand surface: the
  engineering grid, plus a few half-opacity pixel squares offset and overlapping.

  It replaces three copies of the same pair of blurred colour blobs. Those were
  off-brand twice over (the charte rules out both gradients as a default and
  colour glow, which it handles photographically) and they cost a 100px blur
  filter on every paint of a full-viewport element.

  Purely decorative, so the whole thing is aria-hidden and non-interactive.
-->
<div
  aria-hidden="true"
  class="pointer-events-none absolute inset-0 overflow-hidden"
>
  <div
    class="absolute inset-0 blueprint-grid opacity-70 dark:opacity-100"
  ></div>
  <div class="absolute top-[10%] -right-6 h-16 w-28 bg-epi-lavender/50"></div>
  <div class="absolute top-[16%] right-16 h-8 w-8 bg-epi-blue/10"></div>
  <div class="absolute bottom-[14%] -left-4 h-20 w-20 bg-epi-lavender/40"></div>
  <div class="absolute bottom-[26%] left-24 h-6 w-16 bg-epi-tech/20"></div>
</div>
