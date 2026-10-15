// Display typography shared by every surface that shows French prose it did
// not typeset itself. Pure string functions, importable from anywhere.

/**
 * Generalises the "never orphan a glyph at a line edge" rule to emoji: binds an
 * emoji to the word before it with a no-break space, so a label like
 * "…j'en veux plus 🔥" never drops the 🔥 alone onto its own line in a narrow
 * column. The emoji and its preceding word wrap together as one unit. A ZWJ /
 * skin-tone sequence (its parts are contiguous) is carried whole by the bind on
 * its first codepoint. Display-only: only existing spaces are tightened.
 */
function bindEmoji(text: string): string {
  return text.replace(/[   ]+(\p{Extended_Pictographic})/gu, ' $1');
}

/**
 * Display typography for French text a person reads: punctuation spacing then
 * emoji binding, so neither a lone "?" nor a lone emoji ever wraps onto its own
 * line. Used on the feedback chat's copy and option labels, and on the text of
 * Markdown staff author for talents (`renderAuthoredMarkdown`). Never run it on
 * a value that gets persisted: it rewrites spaces.
 */
export function typeset(text: string): string {
  return bindEmoji(applyFrenchSpacing(text));
}

/**
 * French punctuation spacing: binds the punctuation that takes a leading
 * space (`? ! : ;` and the closing guillemet) to the word before it with a
 * no-break space, and the opening guillemet to the word after it. This stops a
 * lone `?` (or `!`, `:`…) from wrapping onto its own line at a column's edge.
 * Display-only: only existing spaces are tightened, never inserted, so values
 * without French spacing (an e-mail, a time like `9:30`) are left untouched.
 */
function applyFrenchSpacing(text: string): string {
  return text
    .replace(/[\u0020\u00A0\u202F]+([?!:;»])/g, '\u00A0$1')
    .replace(/(«)[\u0020\u00A0\u202F]+/g, '$1\u00A0');
}
