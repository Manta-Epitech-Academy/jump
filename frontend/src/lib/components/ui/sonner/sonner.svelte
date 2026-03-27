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
        'group toast group-[.toaster]:p-4 group-[.toaster]:rounded-sm group-[.toaster]:border-2 group-[.toaster]:shadow-lg w-full transition-all',

      title:
        'font-heading text-lg font-normal normal-case tracking-normal text-foreground/90 leading-none',
      description: 'font-sans text-xs font-medium text-foreground/70 mt-1.5',

      success:
        'group-[.toaster]:border-epi-teal group-[.toaster]:bg-teal-50 dark:group-[.toaster]:bg-teal-950/30',
      error:
        'group-[.toaster]:border-destructive group-[.toaster]:bg-red-50 dark:group-[.toaster]:bg-red-950/30',
      info: 'group-[.toaster]:border-epi-blue group-[.toaster]:bg-blue-50 dark:group-[.toaster]:bg-blue-950/30',
      warning:
        'group-[.toaster]:border-epi-orange group-[.toaster]:bg-orange-50 dark:group-[.toaster]:bg-orange-950/30',

      actionButton:
        'group-[.toast]:bg-background group-[.toast]:border group-[.toast]:border-border group-[.toast]:text-foreground group-[.toast]:font-bold group-[.toast]:text-[10px] group-[.toast]:uppercase group-[.toast]:rounded-sm',
      cancelButton:
        'group-[.toast]:bg-transparent group-[.toast]:text-muted-foreground group-[.toast]:font-bold group-[.toast]:text-[10px] group-[.toast]:uppercase',

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
    <CircleCheckIcon class="size-5 text-epi-teal" />
  {/snippet}
  {#snippet errorIcon()}
    <OctagonXIcon class="size-5 text-destructive" />
  {/snippet}
  {#snippet infoIcon()}
    <InfoIcon class="size-5 text-epi-blue" />
  {/snippet}
  {#snippet warningIcon()}
    <TriangleAlertIcon class="size-5 text-epi-orange" />
  {/snippet}
</Sonner>
