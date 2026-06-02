import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize the welcome-message HTML before persisting it.
 *
 * Same baseline guarantees as `sanitizeRichHtml` (scripts, event handlers and
 * `javascript:` URIs are stripped), plus one addition: the rich-text editor
 * persists the author-chosen display size of an image as an inline
 * `style="width: NNpx"` (see `components/cms/extensions/ResizableImage.ts`), and
 * that style must survive so the image renders at the intended size.
 *
 * DOMPurify keeps *arbitrary* style declarations by default (it only neutralises
 * `javascript:` and the like), so we additionally constrain inline styles to a
 * sizing allowlist on `<img>` and drop them everywhere else. Without this, a
 * compromised staff account could inject e.g. `position: fixed` overlays
 * (clickjacking) or `background: url(...)` trackers into content rendered to
 * every talent. The hook is added and removed around the single synchronous
 * `sanitize` call, so it never leaks into the other DOMPurify callers
 * (broadcast emails, subjects, activities) that share this singleton.
 */
const ALLOWED_IMG_STYLE_PROPS = new Set([
  'width',
  'height',
  'max-width',
  'aspect-ratio',
]);

// Simple dimensions only: digits, units, %, decimal point, slash (aspect-ratio),
// spaces and hyphens. Anything with `(`, `:` or `;` (url(), nested props) fails.
const SAFE_STYLE_VALUE = /^[a-z0-9.%/\s-]+$/;

function constrainImgStyle(
  node: Element,
  data: { attrName: string; attrValue: string; keepAttr: boolean },
): void {
  if (data.attrName !== 'style') return;
  if (node.nodeName !== 'IMG') {
    data.keepAttr = false;
    return;
  }
  const safe = data.attrValue
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const colon = declaration.indexOf(':');
      if (colon === -1) return false;
      const prop = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration
        .slice(colon + 1)
        .trim()
        .toLowerCase();
      return ALLOWED_IMG_STYLE_PROPS.has(prop) && SAFE_STYLE_VALUE.test(value);
    });
  if (safe.length === 0) data.keepAttr = false;
  else data.attrValue = safe.join('; ');
}

export function sanitizeWelcomeHtml(raw: string): string {
  DOMPurify.addHook('uponSanitizeAttribute', constrainImgStyle);
  try {
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['style', 'width', 'height'] });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}
