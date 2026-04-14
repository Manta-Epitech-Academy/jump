<script lang="ts">
  import { Upload, FileCheck } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';

  /** This component renders a hidden file input — it must be placed inside a <form> for submission to work. */
  let {
    selectedFileName = $bindable(),
    name = 'csvFile',
  }: {
    selectedFileName: string;
    /** The form field name for the file input. Must match the server action's expected field. */
    name?: string;
  } = $props();

  let isDragActive = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragActive = true;
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragActive = false;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragActive = false;

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const files = e.dataTransfer.files;
      if (files[0].type === 'text/csv' || files[0].name.endsWith('.csv')) {
        if (fileInput) {
          fileInput.files = files;
          selectedFileName = files[0].name;
        }
      } else {
        toast.error('Veuillez déposer un fichier CSV valide.');
      }
    }
  }

  function triggerFileInput() {
    fileInput?.click();
  }

  function onFileSelected() {
    if (fileInput?.files && fileInput.files.length > 0) {
      selectedFileName = fileInput.files[0].name;
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  class={cn(
    'flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-10 text-center transition-all duration-200 outline-none',
    isDragActive
      ? 'border-epi-blue bg-blue-50'
      : 'border-muted-foreground/25 hover:bg-muted/50',
    selectedFileName ? 'border-green-200 bg-green-50' : '',
  )}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  onclick={triggerFileInput}
  onkeydown={(e) => e.key === 'Enter' && triggerFileInput()}
>
  {#if selectedFileName}
    <div
      class="animate-in rounded-full bg-green-100 p-4 text-green-600 duration-300 zoom-in"
    >
      <FileCheck class="h-8 w-8" />
    </div>
    <h3 class="mt-4 text-lg font-bold text-green-800">
      {selectedFileName}
    </h3>
    <p class="mb-4 text-sm text-green-600">Fichier prêt à l'analyse</p>
    <Button variant="outline" size="sm" class="pointer-events-none mt-2">
      Changer de fichier
    </Button>
  {:else}
    <div class="rounded-full bg-muted p-4">
      <Upload
        class={cn(
          'h-8 w-8',
          isDragActive ? 'text-epi-blue' : 'text-muted-foreground',
        )}
      />
    </div>
    <h3 class="mt-4 text-lg font-bold">
      {isDragActive ? 'Déposez le fichier !' : 'Glissez le CSV ici'}
    </h3>
    <p class="mb-4 text-sm text-muted-foreground">Formats acceptés : CSV</p>
    <Button variant="secondary" size="sm" class="pointer-events-none">
      Ou cliquer pour parcourir
    </Button>
  {/if}

  <input
    bind:this={fileInput}
    onchange={onFileSelected}
    id={name}
    {name}
    type="file"
    accept=".csv"
    class="hidden"
  />
</div>
