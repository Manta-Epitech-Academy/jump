/**
 * What an event's document previews share: the recipient they are printed for,
 * and how the image is served.
 *
 * The recipient is a placeholder that reads as one ("Prénom Nom"), never a
 * talent of the cohort: a preview shows what the document looks like, and a
 * real name would put a minor's identity in an image the browser keeps.
 */
export const PREVIEW_RECIPIENT = { prenom: 'Prénom', nom: 'Nom' } as const;

/**
 * A preview image as a response. `private` keeps it out of any shared cache
 * (Cloudflare caches a `.png` by default, and this one is a campus's document);
 * a few minutes in the browser's own cache is what spares a second Chrome
 * render when the same tile is hovered again, short enough that a new
 * signatory or a moved date shows on the next visit.
 */
export function previewPngResponse(png: Uint8Array<ArrayBuffer>): Response {
  return new Response(new Blob([png], { type: 'image/png' }), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=600',
    },
  });
}
