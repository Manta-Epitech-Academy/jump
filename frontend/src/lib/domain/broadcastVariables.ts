import { BROADCAST_VARIABLES, type BroadcastVariableKey } from './broadcasts';

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

const VERBATIM_KEYS: ReadonlySet<string> = new Set(
  BROADCAST_VARIABLES.filter((v) => v.verbatim).map((v) => v.key),
);

const MULTILINE_KEYS: ReadonlySet<string> = new Set(
  BROADCAST_VARIABLES.filter((v) => v.multiline).map((v) => v.key),
);

// Every ASCII punctuation character but `&`: the whole alphabet Markdown
// syntax is spelled in, gfm's autolinks included (`www.`, `@`, `://`). A value
// writes each one as the numeric character reference it stands for, which
// CommonMark never reads as syntax: decoded, it is text. So no link, autolink,
// button, emphasis or block can come out of a value, by the spec rather than
// by a table of what marked links, which had to guess and guessed wrong
// (`awww.`, `(www.` and `_x_` all got through it). `&` stays as typed: alone it
// opens nothing, and marked hands a decoded one to the text part as `&amp;`.
const MARKDOWN_PUNCTUATION_RE = /[!-%'-/:-@[-`{-~]/g;

/**
 * A text value as Markdown that renders as the characters it is: its
 * punctuation written as character references, each line kept, and leading
 * whitespace dropped, since four spaces open a code block. A `multiline` value
 * reaches it as typed, so a reason keeps its paragraphs, where folding every
 * value onto one line ran them together; any other one reaches it folded.
 */
function escapeMarkdownText(value: string): string {
  return value
    .split(/\r\n?|\n/)
    .map((line) =>
      line
        .replace(/[^\S\n]+/g, ' ')
        .trim()
        .replace(MARKDOWN_PUNCTUATION_RE, (c) => `&#${c.charCodeAt(0)};`),
    )
    .join('\n');
}

/**
 * `markdown` is for a mail body, which `renderBroadcastEmail` parses after
 * substitution: a text value's punctuation is written as character references
 * there, so a name such as `[Cliquez ici](https://…)` renders as the
 * characters it is instead of a link in a mail sent under Epitech's name. `plain` is for a subject or an SMS.
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
    if (VERBATIM_KEYS.has(key)) return value;
    const folded = value.replace(/\s+/g, ' ');
    if (format === 'plain') return folded;
    return escapeMarkdownText(MULTILINE_KEYS.has(key) ? value : folded);
  });
}

/**
 * The variable keys a text cites, as `substituteVariables` reads them: inner
 * spaces and case aside, so `{{ OTP_CODE }}` is `otp_code`. Whatever asks
 * whether a template uses a variable asks here, since a literal `{{otp_code}}`
 * search misses spellings the renderer fills.
 */
export function citedVariables(text: string): Set<string> {
  return new Set(
    [...text.matchAll(TOKEN_RE)].map((match) => match[1].toLowerCase()),
  );
}

export function findUnknownTokens(text: string): string[] {
  const known = new Set<string>(BROADCAST_VARIABLES.map((v) => v.key));
  return [...citedVariables(text)].filter((key) => !known.has(key));
}
