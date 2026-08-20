<script lang="ts">
  import type { Snippet } from 'svelte';
  import EpitechLogo from './EpitechLogo.svelte';
  import { cn } from '$lib/utils';

  type Props = {
    /**
     * Page-specific baseline — the headline + copy that sits between the logo
     * and the signature. The surrounding brand chrome (grid, pixels, logo,
     * signature) is constant across every login surface.
     */
    children: Snippet;
    class?: string;
  };

  let { children, class: className }: Props = $props();
</script>

<!-- Brand panel — full-bleed Epitech blue, blueprint grid + pixel overlays.
     Hidden below lg; consuming pages carry a compact logo on mobile. -->
<aside
  class={cn(
    'on-dark relative hidden flex-col justify-between overflow-hidden bg-epi-blue p-12 text-white lg:flex xl:p-16',
    className,
  )}
>
  <!-- Blueprint grid texture -->
  <div aria-hidden="true" class="absolute inset-0 blueprint-grid-inverse"></div>
  <!-- Pixel overlays — 50% squares, offset, overlapping (brand signature) -->
  <div aria-hidden="true" class="absolute inset-0">
    <div class="absolute top-[18%] right-[22%] h-16 w-24 bg-card"></div>
    <div class="absolute top-[24%] right-[12%] h-20 w-16 bg-card"></div>
    <div
      class="absolute bottom-[26%] left-[14%] h-14 w-20 bg-epi-tech/15"
    ></div>
  </div>

  <!-- Always-dark brand panel → white logo. -->
  <div class="relative z-10">
    <EpitechLogo tone="dark" class="h-8 w-auto" />
  </div>

  <!-- Baseline + keywords (page-specific) -->
  <div class="relative z-10 space-y-6">
    {@render children()}
  </div>

  <!-- Signature block -->
  <div class="relative z-10 font-mono text-xs text-white/60">
    <span class="text-epi-tech">&#123;</span>
    &lt;Tech Together Tomorrow&gt;
    <span class="text-epi-tech">&#125;</span>
    <span class="ml-2 tracking-widest uppercase">Since 1999</span>
  </div>
</aside>
