/**
 * The `{token}` convention every authored text in Jump shares: the feedback
 * form's bot copy, a certificate design, EpiDuck's lines. One pattern, so a
 * token written for one reads the same in the others.
 *
 * What a token resolves to, and what happens to one nobody resolves, is each
 * vocabulary's own contract (`interpolate`, `interpolateCertificate`,
 * `fillLine`): this module only finds and replaces.
 */

const TOKEN_PATTERN = /\{(\w+)\}/g;

/**
 * Replace each `{token}` by what `resolve` returns for its name. `undefined`
 * leaves the token exactly as written, which is how a vocabulary keeps authored
 * braces or a value it does not have yet.
 */
export function fillTokens(
  text: string,
  resolve: (name: string) => string | undefined,
): string {
  return text.replace(
    TOKEN_PATTERN,
    (whole, name: string) => resolve(name) ?? whole,
  );
}

/**
 * The tokens a text names that `known` does not hold, in the order they first
 * appear, each reported once. Empty means the text is safe to store.
 */
export function unknownTokens(
  text: string,
  known: ReadonlySet<string>,
): string[] {
  const unknown = new Set<string>();
  for (const [, name] of text.matchAll(TOKEN_PATTERN)) {
    if (!known.has(name)) unknown.add(name);
  }
  return [...unknown];
}
