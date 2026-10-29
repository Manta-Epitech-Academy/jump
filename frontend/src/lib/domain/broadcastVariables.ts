import {
  BROADCAST_VARIABLES,
  type BroadcastVariableKey,
} from '$lib/domain/broadcasts';

export interface VariableContext {
  prenom: string;
  nom: string;
  email: string | null;
  phone: string | null;
  campus: string;
  email_contact_campus: string | null;
  event_name: string | null;
  jours_restants: string | null;
  fastlogin_link: string | null;
  parent_fastlogin_link: string | null;
  otp_code: string | null;
  parent_prenom: string | null;
  parent_nom: string | null;
  child_prenom: string | null;
  child_nom: string | null;
  login_link: string | null;
  deletion_reason: string | null;
}

/**
 * Empty context with every variable set to its zero value. Callers can
 * spread their per-send vars on top: anything they don't set renders
 * empty via `substituteVariables` instead of throwing.
 */
export const EMPTY_VARIABLE_CONTEXT: VariableContext = {
  prenom: '',
  nom: '',
  email: null,
  phone: null,
  campus: '',
  email_contact_campus: null,
  event_name: null,
  jours_restants: null,
  fastlogin_link: null,
  parent_fastlogin_link: null,
  otp_code: null,
  parent_prenom: null,
  parent_nom: null,
  child_prenom: null,
  child_nom: null,
  login_link: null,
  deletion_reason: null,
};

export function buildDemoContext(eventName?: string | null): VariableContext {
  const demo = Object.fromEntries(
    BROADCAST_VARIABLES.map((v) => [v.key, v.demo]),
  ) as Record<BroadcastVariableKey, string>;
  return {
    ...demo,
    event_name: eventName ?? demo.event_name,
  };
}

const TOKEN_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

const LINK_KEYS: ReadonlySet<string> = new Set(
  BROADCAST_VARIABLES.filter((v) => v.link).map((v) => v.key),
);

const MULTILINE_KEYS: ReadonlySet<string> = new Set(
  BROADCAST_VARIABLES.filter((v) => v.multiline).map((v) => v.key),
);

// Every character that can open a Markdown construct able to add a link or a
// button (link, image, `:button`, autolink, raw HTML, a protocol URL) or to
// restyle the mail (emphasis, code, heading, quote, table). `. @ _ + -` are
// left alone: they make up email addresses, and escaping them would stop gfm
// linking `{{email_contact_campus}}` to itself, or for `_` and `+` link only
// the part after it. What they can still open is taken apart below: a bare
// `www.` host, which gfm links with no `:` to escape, and a block a line
// starts.
const MARKDOWN_SPECIAL_RE = /[\\`*~[\]()<>!#|:]/g;

// gfm's extended autolink, the one target a value could still add: `www.`
// where gfm starts one, at the start of a line or after a space or an `_`
// (`*`, `~` and `(` are escaped already). Not inside an address, which would
// cut `x@www.example.org` out of its own link.
const WWW_AUTOLINK_RE = /(^|[\s_])(www)\./gi;

// What a line can open at its start once the characters above are escaped: a
// list item or a rule (`-`, `+`, `_`), a setext heading (`=`), an ordered item
// (`1.`). Leading whitespace is dropped rather than escaped, since four spaces
// open a code block.
const LINE_START_RE = /^[-+=_]|^(\d+)(\.)/;

/**
 * A text value as Markdown that renders as the characters it is: escaped
 * inline, each line kept, and nothing a line starts with opening a block. A
 * `multiline` value reaches it as typed, so a reason keeps its paragraphs,
 * where folding every value onto one line ran them together; any other one
 * reaches it folded.
 */
function escapeMarkdownText(value: string): string {
  return value
    .split(/\r\n?|\n/)
    .map((line) =>
      line
        .replace(/[^\S\n]+/g, ' ')
        .trim()
        .replace(MARKDOWN_SPECIAL_RE, '\\$&')
        .replace(WWW_AUTOLINK_RE, '$1$2\\.')
        .replace(LINE_START_RE, (start, digits?: string, dot?: string) =>
          digits ? `${digits}\\${dot}` : `\\${start}`,
        ),
    )
    .join('\n');
}

/**
 * `markdown` is for a mail body, which `renderBroadcastEmail` parses after
 * substitution: a text value is backslash-escaped there, so a name such as
 * `[Cliquez ici](https://…)` renders as the characters it is instead of a link
 * in a mail sent under Epitech's name. `plain` is for a subject or an SMS.
 * Either way a text value is folded onto one line, except a `multiline` one in
 * a mail body: a line break would split the label a name sits in, end a
 * header, or split a message.
 */
export type VariableFormat = 'markdown' | 'plain';

export function substituteVariables(
  text: string,
  ctx: VariableContext,
  format: VariableFormat,
): string {
  return text.replace(TOKEN_RE, (_match, rawKey) => {
    const key = rawKey.toLowerCase() as keyof VariableContext;
    if (!(key in ctx)) return '';
    const value = ctx[key] ?? '';
    if (LINK_KEYS.has(key)) return value;
    const folded = value.replace(/\s+/g, ' ');
    if (format === 'plain') return folded;
    return escapeMarkdownText(MULTILINE_KEYS.has(key) ? value : folded);
  });
}

export function findUnknownTokens(text: string): string[] {
  const found = new Set<string>();
  const known = new Set(BROADCAST_VARIABLES.map((v) => v.key));
  for (const match of text.matchAll(TOKEN_RE)) {
    const key = match[1].toLowerCase();
    if (!known.has(key as BroadcastVariableKey)) found.add(key);
  }
  return [...found];
}
