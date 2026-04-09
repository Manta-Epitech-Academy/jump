<script lang="ts">
  import { enhance } from '$app/forms';
  import { Input } from '$lib/components/ui/input';
  import { LoaderCircle, Check, Save, TriangleAlert } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';

  let {
    id,
    value = '',
    placeholder = m.appel_note_placeholder(),
    class: className,
  } = $props();

  let currentValue = $state('');

  // Sync currentValue when the value prop changes from parent
  $effect.pre(() => {
    currentValue = value;
  });
  let status = $state<'idle' | 'loading' | 'saved' | 'error'>('idle');
  let formElement: HTMLFormElement;
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleSubmit() {
    if (currentValue !== value) {
      formElement.requestSubmit();
    }
  }

  function handleInput() {
    if (status !== 'loading') {
      status = 'idle';
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      handleSubmit();
    }, 2500);
  }

  onDestroy(() => {
    clearTimeout(debounceTimer);
  });
</script>

<form
  method="POST"
  action="?/updateNote"
  class={cn('relative flex w-full items-center', className)}
  bind:this={formElement}
  use:enhance={() => {
    status = 'loading';
    return async ({ result }) => {
      if (result.type === 'success') {
        value = currentValue;
        status = 'saved';
        setTimeout(() => {
          if (status === 'saved') status = 'idle';
        }, 2000);
      } else {
        status = 'error';
      }
    };
  }}
>
  <input type="hidden" name="id" value={id} />

  <div class="relative w-full">
    <Input
      name="note"
      bind:value={currentValue}
      {placeholder}
      class={cn(
        'pr-8 transition-all duration-500',
        // Normal states
        status === 'error' &&
          'border-destructive bg-destructive/10 ring-1 ring-destructive',
        // Saved state with pulse animation
        status === 'saved' &&
          'animate-save-success border-green-500 text-green-900 dark:text-green-100',
      )}
      oninput={handleInput}
      onblur={() => {
        clearTimeout(debounceTimer);
        handleSubmit();
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(debounceTimer);
          handleSubmit();
          e.currentTarget.blur();
        }
      }}
    />

    <!-- Status Indicator Icons -->
    <div
      class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground"
    >
      {#if status === 'idle'}
        <Save class="h-3 w-3 opacity-20" />
      {:else if status === 'loading'}
        <LoaderCircle class="h-3 w-3 animate-spin text-epi-blue" />
      {:else if status === 'saved'}
        <Check
          class="h-3.5 w-3.5 scale-100 text-green-600 transition-transform duration-300"
        />
      {:else if status === 'error'}
        <TriangleAlert class="h-3.5 w-3.5 text-destructive" />
      {/if}
    </div>
  </div>
</form>

<style>
  /* Define a gentle pulse animation for the success state */
  @keyframes save-success-pulse {
    0% {
      background-color: transparent;
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); /* green-500 transparent */
    }
    15% {
      background-color: rgba(34, 197, 94, 0.15); /* green-500 with opacity */
      box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1); /* light ring */
    }
    100% {
      background-color: transparent;
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
    }
  }

  :global(.animate-save-success) {
    animation: save-success-pulse 1.5s ease-out forwards;
  }
</style>
