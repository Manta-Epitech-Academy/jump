/**
 * Fetch a generated file and hand it to the browser as a download.
 *
 * Every producer in the dev workspace repeated this dance, and two details in it
 * are not obvious enough to keep re-deriving.
 *
 * `?t=` and `cache: 'no-store'` are two different caches. Cloudflare caches by
 * extension, so a `.pdf` endpoint needs a unique query key per request or a
 * second click serves the first render - and these documents are rebuilt from
 * live data every time (a signatory's role or image can change between two
 * clicks). `no-store` covers the browser's own cache. An extension-less endpoint
 * only needs the second, but paying for both costs nothing and removes a
 * per-endpoint judgement call.
 *
 * Going through `fetch` rather than a plain `<a download>` is what makes a
 * failure visible: an anchor pointed at a 404 navigates away to an error page,
 * or silently does nothing. This throws, and the caller decides what the wait
 * and the failure look like - a toast, or a full-screen ceremony for a render
 * long enough that a spinner reads as a hang.
 */
export async function downloadArtifact(
  endpoint: string,
  filename: string,
  init?: RequestInit,
): Promise<void> {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('t', String(Date.now()));

  const res = await fetch(url, { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`${endpoint} failed: ${res.status}`);

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
