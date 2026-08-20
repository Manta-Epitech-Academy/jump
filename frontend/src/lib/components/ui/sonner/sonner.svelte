<script lang="ts">
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import InfoIcon from '@lucide/svelte/icons/info';
  import Loader2Icon from '@lucide/svelte/icons/loader-2';
  import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import {
    Toaster as Sonner,
    type ToasterProps as SonnerProps,
  } from 'svelte-sonner';
  import { mode } from 'mode-watcher';

  let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
  theme={mode.current}
  class="toaster group"
  toastOptions={{
    classes: {
      toast:
        'group toast group-[.toaster]:p-4 group-[.toaster]:rounded-sm group-[.toaster]:border-2 group-[.toaster]:shadow-overlay w-full transition-ui',

      title:
        'font-heading text-display-s font-normal normal-case text-foreground/90',
      description: 'font-sans text-xs font-medium text-foreground/70 mt-1.5',

      success:
        'group-[.toaster]:border-epi-tech-ink group-[.toaster]:bg-epi-tech-ink/10',
      error:
        'group-[.toaster]:border-destructive group-[.toaster]:bg-destructive/10 dark:group-[.toaster]:bg-destructive/30',
      info: 'group-[.toaster]:border-epi-blue group-[.toaster]:bg-primary/10 dark:group-[.toaster]:bg-primary/30',
      warning:
        'group-[.toaster]:border-epi-together group-[.toaster]:bg-epi-together-ink/10 dark:group-[.toaster]:bg-epi-together-ink/30',

      actionButton:
        'group-[.toast]:bg-background group-[.toast]:border group-[.toast]:border-border group-[.toast]:text-foreground group-[.toast]:overline group-[.toast]:rounded-sm',
      cancelButton:
        'group-[.toast]:bg-transparent group-[.toast]:text-muted-foreground group-[.toast]:overline',

      // Close button inherits the toast's own text colour (currentColor) instead
      // of a fixed shade, so it reads on both the light staff toasts (dark text)
      // and the epi-blue reward toasts (white text via REWARD_TOAST_STYLE)
      // without per-toast overrides. The glyph sits at full currentColor at rest
      // (same contrast as the toast's own text, so it's visible without hovering);
      // hover only adds a subtle wash for tactile feedback.
      closeButton:
        'group-[.toast]:border-current/30 group-[.toast]:bg-transparent group-[.toast]:text-current hover:group-[.toast]:bg-current/10 group-[.toast]:transition-colors',

      default:
        'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border',
    },
  }}
  {...restProps}
>
  {#snippet loadingIcon()}
    <Loader2Icon class="size-5 animate-spin text-epi-blue" />
  {/snippet}
  {#snippet successIcon()}
    <CircleCheckIcon class="size-5 text-epi-tech-ink" />
  {/snippet}
  {#snippet errorIcon()}
    <OctagonXIcon class="size-5 text-destructive" />
  {/snippet}
  {#snippet infoIcon()}
    <InfoIcon class="size-5 text-epi-blue" />
  {/snippet}
  {#snippet warningIcon()}
    <TriangleAlertIcon class="size-5 text-epi-together" />
  {/snippet}
</Sonner>
