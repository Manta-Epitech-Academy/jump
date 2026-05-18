const TRACKING_PARAM = 'tracking_id';

function appendTracking(url: string, recipientId: string): string {
  if (
    url.startsWith('#') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('javascript:')
  ) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${TRACKING_PARAM}=${recipientId}`;
}

const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

export function rewriteHtmlLinks(html: string, recipientId: string): string {
  return html.replace(HREF_RE, (_match, doubleQuoted, singleQuoted) => {
    const url = doubleQuoted ?? singleQuoted ?? '';
    const quote = doubleQuoted !== undefined ? '"' : "'";
    return `href=${quote}${appendTracking(url, recipientId)}${quote}`;
  });
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'()\[\]{}]+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

export function rewriteSmsLinks(text: string, recipientId: string): string {
  return text.replace(URL_RE, (match) => {
    const trailing = match.match(TRAILING_PUNCT_RE)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `${appendTracking(url, recipientId)}${trailing}`;
  });
}
