<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import Placeholder from '@tiptap/extension-placeholder';
  import { Markdown } from 'tiptap-markdown';
  import { toast } from 'svelte-sonner';
  import {
    ResizableImage,
    MAX_DEFAULT_IMAGE_WIDTH,
    FALLBACK_IMAGE_WIDTH,
  } from './extensions/ResizableImage';
  import Bold from '@lucide/svelte/icons/bold';
  import Italic from '@lucide/svelte/icons/italic';
  import Strikethrough from '@lucide/svelte/icons/strikethrough';
  import List from '@lucide/svelte/icons/list';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import Heading1 from '@lucide/svelte/icons/heading-1';
  import Heading2 from '@lucide/svelte/icons/heading-2';
  import Heading3 from '@lucide/svelte/icons/heading-3';
  import Quote from '@lucide/svelte/icons/quote';
  import Code from '@lucide/svelte/icons/code';
  import Minus from '@lucide/svelte/icons/minus';
  import Undo from '@lucide/svelte/icons/undo';
  import Redo from '@lucide/svelte/icons/redo';
  import LinkIcon from '@lucide/svelte/icons/link';
  import Unlink from '@lucide/svelte/icons/unlink';
  import ImagePlus from '@lucide/svelte/icons/image-plus';
  import Link2 from '@lucide/svelte/icons/link-2';

  type Props = {
    content: string;
    placeholder?: string;
    /**
     * Allow uploading local image files (toolbar button, paste, or drop), which
     * stores them server-side and embeds a `/api/cms/images/<id>` proxy URL.
     *
     * Off by default, and deliberately so: the CMS-image GC sweep
     * (`server/cms/references.ts`) decides an image is live by scanning saved
     * content, and it only scans welcome pages. Enabling upload on a surface the
     * sweep does not scan would let an uploaded image land in content it never
     * sees, so the sweep would reclaim it as an orphan after 24h and break the
     * image. Only the welcome editors turn this on. Embedding an image by URL
     * stays available everywhere, since external URLs are not GC-managed.
     */
    allowImageUpload?: boolean;
  };

  let {
    content = $bindable(),
    placeholder = 'Commencez à écrire...',
    allowImageUpload = false,
  }: Props = $props();

  let element: HTMLDivElement;
  let editor: Editor | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  // Counter, not a boolean: several files can upload at once (multi-select, or
  // pasting/dropping many), and a shared boolean would clear the spinner the
  // moment the first one settled while the rest were still in flight.
  let uploadCount = $state(0);
  const uploading = $derived(uploadCount > 0);

  /**
   * Insert raw text at the cursor. Exposed as a component method (`bind:this`)
   * for callers that offer template-variable buttons — e.g. the admin
   * welcome-page editor inserting `{{PRENOM}}` (see `domain/welcomeMessage.ts`).
   */
  export function insertText(text: string) {
    editor?.chain().focus().insertContent(text).run();
  }

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
          validate: (href) => /^(https?|mailto|tel):/i.test(href),
        }),
        ResizableImage.configure({ HTMLAttributes: { class: 'rounded-lg' } }),
        Placeholder.configure({ placeholder }),
        // Lets referent devs paste a ready-made Markdown brief and have it
        // become rich text (headings, lists, images…) they can tweak before
        // saving. We still persist HTML via getHTML(); Markdown is input-only.
        Markdown.configure({ transformPastedText: true }),
      ],
      content,
      editorProps: {
        attributes: {
          class:
            'prose prose-slate dark:prose-invert max-w-none min-h-[300px] focus:outline-none p-4',
        },
        // Paste or drop an image file straight into the editor: upload it and
        // insert the result, same path as the toolbar button. Only when upload
        // is enabled; otherwise let the editor handle the event normally.
        handlePaste: (_view, event) => {
          if (!allowImageUpload) return false;
          const files = imageFilesFrom(event.clipboardData?.files);
          if (files.length === 0) return false;
          event.preventDefault();
          files.forEach((file) => void uploadAndInsert(file));
          return true;
        },
        handleDrop: (_view, event) => {
          if (!allowImageUpload) return false;
          const files = imageFilesFrom(
            (event as DragEvent).dataTransfer?.files,
          );
          if (files.length === 0) return false;
          event.preventDefault();
          files.forEach((file) => void uploadAndInsert(file));
          return true;
        },
      },
      onUpdate: ({ editor: e }) => {
        content = e.getHTML();
      },
      onTransaction: () => {
        editor = editor;
      },
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL du lien :', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp';

  function imageFilesFrom(list: FileList | null | undefined): File[] {
    return Array.from(list ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
  }

  // Primary path: upload a local image, then embed it by its proxy URL.
  async function uploadAndInsert(file: File) {
    if (!editor) return;
    uploadCount += 1;
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/cms/images', { method: 'POST', body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message ?? "Échec de l'import de l'image.");
        return;
      }
      const { url, width } = await res.json();
      // Default to the image's intrinsic width, capped so a high-resolution
      // upload doesn't render huge; the author can drag it from there.
      const displayWidth =
        typeof width === 'number'
          ? `${Math.min(width, MAX_DEFAULT_IMAGE_WIDTH)}px`
          : FALLBACK_IMAGE_WIDTH;
      editor
        .chain()
        .focus()
        .setCmsImage({ src: url, alt: '', width: displayWidth })
        .run();
    } catch {
      toast.error("Échec de l'import de l'image.");
    } finally {
      uploadCount -= 1;
    }
  }

  function onImagePicked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    imageFilesFrom(input.files).forEach((file) => void uploadAndInsert(file));
    input.value = '';
  }

  // Secondary path: keep the ability to embed an external image by URL.
  function insertImageByUrl() {
    if (!editor) return;
    const url = window.prompt("URL de l'image :");
    if (!url) return;
    const alt = window.prompt('Texte alternatif (description) :') ?? '';
    editor
      .chain()
      .focus()
      .setCmsImage({ src: url, alt, width: FALLBACK_IMAGE_WIDTH })
      .run();
  }

  type ToolbarAction = {
    icon: typeof Bold;
    label: string;
    action: () => void;
    isActive?: () => boolean;
  };

  const toolbarGroups: ToolbarAction[][] = $derived(
    editor
      ? [
          [
            {
              icon: Bold,
              label: 'Gras',
              action: () => editor!.chain().focus().toggleBold().run(),
              isActive: () => editor!.isActive('bold'),
            },
            {
              icon: Italic,
              label: 'Italique',
              action: () => editor!.chain().focus().toggleItalic().run(),
              isActive: () => editor!.isActive('italic'),
            },
            {
              icon: Strikethrough,
              label: 'Barré',
              action: () => editor!.chain().focus().toggleStrike().run(),
              isActive: () => editor!.isActive('strike'),
            },
          ],
          [
            {
              icon: Heading1,
              label: 'Titre 1',
              action: () =>
                editor!.chain().focus().toggleHeading({ level: 1 }).run(),
              isActive: () => editor!.isActive('heading', { level: 1 }),
            },
            {
              icon: Heading2,
              label: 'Titre 2',
              action: () =>
                editor!.chain().focus().toggleHeading({ level: 2 }).run(),
              isActive: () => editor!.isActive('heading', { level: 2 }),
            },
            {
              icon: Heading3,
              label: 'Titre 3',
              action: () =>
                editor!.chain().focus().toggleHeading({ level: 3 }).run(),
              isActive: () => editor!.isActive('heading', { level: 3 }),
            },
          ],
          [
            {
              icon: List,
              label: 'Liste',
              action: () => editor!.chain().focus().toggleBulletList().run(),
              isActive: () => editor!.isActive('bulletList'),
            },
            {
              icon: ListOrdered,
              label: 'Liste numérotée',
              action: () => editor!.chain().focus().toggleOrderedList().run(),
              isActive: () => editor!.isActive('orderedList'),
            },
            {
              icon: Quote,
              label: 'Citation',
              action: () => editor!.chain().focus().toggleBlockquote().run(),
              isActive: () => editor!.isActive('blockquote'),
            },
            {
              icon: Code,
              label: 'Code',
              action: () => editor!.chain().focus().toggleCodeBlock().run(),
              isActive: () => editor!.isActive('codeBlock'),
            },
            {
              icon: Minus,
              label: 'Ligne horizontale',
              action: () => editor!.chain().focus().setHorizontalRule().run(),
            },
          ],
          [
            {
              icon: LinkIcon,
              label: 'Lien',
              action: setLink,
              isActive: () => editor!.isActive('link'),
            },
            {
              icon: Unlink,
              label: 'Retirer le lien',
              action: () => editor!.chain().focus().unsetLink().run(),
            },
            ...(allowImageUpload
              ? [
                  {
                    icon: ImagePlus,
                    label: 'Importer une image',
                    action: () => fileInput?.click(),
                  },
                ]
              : []),
            {
              icon: Link2,
              label: 'Image par URL',
              action: insertImageByUrl,
              isActive: () => editor!.isActive('image'),
            },
          ],
          [
            {
              icon: Undo,
              label: 'Annuler',
              action: () => editor!.chain().focus().undo().run(),
            },
            {
              icon: Redo,
              label: 'Rétablir',
              action: () => editor!.chain().focus().redo().run(),
            },
          ],
        ]
      : [],
  );
</script>

<div class="rounded-lg border border-border bg-card">
  {#if editor}
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-1 border-b border-border p-2">
      {#each toolbarGroups as group, i}
        {#if i > 0}
          <div class="mx-1 h-6 w-px bg-border"></div>
        {/if}
        {#each group as { icon: Icon, label, action, isActive }}
          <button
            type="button"
            onclick={action}
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground {isActive?.()
              ? 'bg-accent text-accent-foreground'
              : ''}"
            title={label}
          >
            <Icon class="h-4 w-4" />
          </button>
        {/each}
      {/each}
      {#if uploading}
        <span
          class="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></span>
          Import de l'image…
        </span>
      {/if}
    </div>
  {/if}

  <!-- Editor -->
  <div bind:this={element}></div>

  {#if allowImageUpload}
    <input
      bind:this={fileInput}
      type="file"
      accept={ACCEPTED_IMAGE_TYPES}
      multiple
      class="hidden"
      onchange={onImagePicked}
    />
  {/if}
</div>

<style>
  /* Editor-only chrome for the resizable image node view
     (components/cms/extensions/ResizableImage.ts). The persisted HTML is a
     plain <img style="width:NN%">; this styling never ships to the talent. */
  :global(.cms-image) {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
  }
  :global(.cms-image img) {
    display: block;
    width: 100%;
    height: auto;
  }
  :global(.cms-image.ProseMirror-selectednode) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  :global(.cms-image__handle) {
    position: absolute;
    right: -6px;
    bottom: -6px;
    height: 14px;
    width: 14px;
    border-radius: 9999px;
    border: 2px solid white;
    background: var(--primary);
    cursor: nwse-resize;
    opacity: 0;
    transition: opacity 0.15s;
  }
  :global(.cms-image:hover .cms-image__handle),
  :global(.cms-image.ProseMirror-selectednode .cms-image__handle) {
    opacity: 1;
  }
  /* Alt-text editor pill (top-left). Amber while the image has no alt, as a
     gentle accessibility nudge; neutral once a description is set. */
  :global(.cms-image__alt) {
    position: absolute;
    top: -10px;
    left: -6px;
    padding: 0 6px;
    border-radius: 9999px;
    border: 2px solid white;
    background: var(--primary);
    color: var(--primary-foreground);
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }
  :global(.cms-image__alt--empty) {
    background: #d97706;
    color: white;
  }
  :global(.cms-image:hover .cms-image__alt),
  :global(.cms-image.ProseMirror-selectednode .cms-image__alt) {
    opacity: 1;
  }
</style>
