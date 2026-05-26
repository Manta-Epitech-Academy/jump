<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import Image from '@tiptap/extension-image';
  import Placeholder from '@tiptap/extension-placeholder';
  import { Markdown } from 'tiptap-markdown';
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
  import ImageIcon from '@lucide/svelte/icons/image';

  type Props = {
    content: string;
    placeholder?: string;
  };

  let { content = $bindable(), placeholder = 'Commencez à écrire...' }: Props =
    $props();

  let element: HTMLDivElement;
  let editor: Editor | undefined = $state();

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
        Image.configure({ HTMLAttributes: { class: 'rounded-lg' } }),
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

  function setImage() {
    if (!editor) return;
    const url = window.prompt("URL de l'image :");
    if (!url) return;
    const alt = window.prompt('Texte alternatif (description) :') ?? '';
    editor.chain().focus().setImage({ src: url, alt }).run();
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
            {
              icon: ImageIcon,
              label: 'Image',
              action: setImage,
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
    </div>
  {/if}

  <!-- Editor -->
  <div bind:this={element}></div>
</div>
