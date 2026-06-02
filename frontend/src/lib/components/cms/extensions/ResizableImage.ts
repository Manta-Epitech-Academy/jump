import Image from '@tiptap/extension-image';

// Image node that carries an author-chosen display width and is resizable in
// the editor via a drag handle. The width is stored in pixels (e.g. "320px"),
// matching how images rendered before this feature existed: a source rendered
// at its intrinsic size, which read well in the talent space. On the talent
// side `max-width: 100%` keeps a px width from ever overflowing a narrow
// viewport. Persisted as inline `style="width: NNpx"`, which
// `sanitizeWelcomeHtml` is configured to keep.

/**
 * Default insert width = the image's intrinsic width, capped at this many px.
 * A small (e.g. 320px) image therefore renders at its natural size, while a 4K
 * upload is capped to a comfortable default the author can still drag larger.
 */
export const MAX_DEFAULT_IMAGE_WIDTH = 480;
/** Fallback when intrinsic dimensions are unknown (e.g. an image added by URL). */
export const FALLBACK_IMAGE_WIDTH = '320px';
/** Smallest width the drag handle allows (px). */
const MIN_IMAGE_WIDTH = 40;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cmsImage: {
      setCmsImage: (options: {
        src: string;
        alt?: string;
        width?: string;
      }) => ReturnType;
    };
  }
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) =>
          element.style.width || element.getAttribute('width') || null,
        renderHTML: (attributes) =>
          attributes.width ? { style: `width: ${attributes.width}` } : {},
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCmsImage:
        (options) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      // The node handed in is the one at creation time; ProseMirror passes later
      // versions to `update()`. Track the latest so independent edits compose:
      // each edit re-dispatches the *current* attrs plus its one change, so
      // setting the alt and then resizing must read the post-alt attrs (and vice
      // versa) or the second edit would revert the first.
      let currentNode = node;

      const wrapper = document.createElement('div');
      wrapper.className = 'cms-image';
      if (node.attrs.width) wrapper.style.width = node.attrs.width;

      const img = document.createElement('img');
      img.className = 'rounded-lg';
      img.src = node.attrs.src;
      img.alt = node.attrs.alt ?? '';
      img.draggable = false;
      wrapper.appendChild(img);

      // Alt-text editor. The "image by URL" toolbar action prompts for alt, but
      // uploaded / pasted / dropped images insert with an empty alt and would
      // otherwise have no way to gain a description. This pill makes alt editable
      // on every image regardless of how it was inserted, which matters for the
      // talents (some minors) who read the welcome message with a screen reader.
      // It turns amber while the alt is empty as a gentle nudge.
      const altButton = document.createElement('button');
      altButton.type = 'button';
      altButton.className = 'cms-image__alt';
      altButton.setAttribute('contenteditable', 'false');
      altButton.textContent = 'Alt';
      const syncAlt = (alt: string | null | undefined) => {
        const has = Boolean(alt && alt.trim());
        altButton.classList.toggle('cms-image__alt--empty', !has);
        altButton.title = has
          ? 'Modifier le texte alternatif'
          : 'Ajouter un texte alternatif (accessibilité)';
      };
      syncAlt(node.attrs.alt);
      // preventDefault on mousedown keeps ProseMirror from moving the selection
      // when the pill is pressed; the click handler still fires.
      altButton.addEventListener('mousedown', (event) =>
        event.preventDefault(),
      );
      altButton.addEventListener('click', (event) => {
        event.preventDefault();
        const pos = getPos?.();
        if (typeof pos !== 'number') return;
        const next = window.prompt(
          'Texte alternatif (description) :',
          currentNode.attrs.alt ?? '',
        );
        if (next === null) return; // cancelled: leave the alt untouched
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            alt: next,
          }),
        );
      });
      wrapper.appendChild(altButton);

      const handle = document.createElement('span');
      handle.className = 'cms-image__handle';
      handle.setAttribute('contenteditable', 'false');
      wrapper.appendChild(handle);

      // Removes an in-flight drag's window listeners. Set while dragging, then
      // called on pointerup and on node-view destroy, so a resize interrupted
      // by unmount (editor closed mid-drag) cannot leak listeners.
      let endDrag: (() => void) | null = null;

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = img.getBoundingClientRect().width;
        const columnWidth = (editor.view.dom as HTMLElement).clientWidth;

        const onMove = (move: PointerEvent) => {
          const next = Math.round(startWidth + (move.clientX - startX));
          const clamped = Math.max(
            MIN_IMAGE_WIDTH,
            Math.min(columnWidth, next),
          );
          wrapper.style.width = `${clamped}px`;
        };
        const onUp = () => {
          endDrag?.();
          const pos = getPos?.();
          if (typeof pos === 'number') {
            editor.view.dispatch(
              editor.view.state.tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                width: wrapper.style.width,
              }),
            );
          }
        };
        endDrag = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          endDrag = null;
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      return {
        dom: wrapper,
        update: (updated) => {
          if (updated.type.name !== currentNode.type.name) return false;
          currentNode = updated;
          img.src = updated.attrs.src;
          img.alt = updated.attrs.alt ?? '';
          wrapper.style.width = updated.attrs.width ?? '';
          syncAlt(updated.attrs.alt);
          return true;
        },
        destroy: () => endDrag?.(),
      };
    };
  },
});
