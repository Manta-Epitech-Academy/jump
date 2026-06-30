// Single source of truth for the news-post template variables.
//
// News posts (NewsPost rows, per stage event) are authored by staff/admins with
// placeholder tokens and rendered for each talent on the dashboard feed. This
// module owns BOTH the catalogue (so the admin editor's insert buttons and the
// substitution stay in lockstep) and the substitution itself (so every render
// site produces identical output). Add a variable here and it lights up
// everywhere - never substitute tokens ad hoc at a call site.

export type NewsPostContext = {
  prenom: string;
  nom: string;
  campusName: string;
  /** Campus contact email; null when the campus hasn't set one. */
  campusContactEmail: string | null;
  /** Title of the stage event the post belongs to. */
  stageName: string | null;
};

export type NewsPostVariable = {
  /** Literal token as it appears in the content, e.g. `{{PRENOM}}`. */
  token: string;
  /** Short FR label for the editor's insert button. */
  label: string;
  /** FR tooltip explaining what the token resolves to. */
  description: string;
  resolve: (ctx: NewsPostContext) => string;
};

// Tokens stay uppercase and French to match the existing `{{PRENOM}}`/`{{NOM}}`
// convention. Order here is the order of the editor's insert buttons.
export const NEWS_POST_VARIABLES: readonly NewsPostVariable[] = [
  {
    token: '{{PRENOM}}',
    label: 'Prénom',
    description: 'Prénom du talent',
    resolve: (c) => c.prenom,
  },
  {
    token: '{{NOM}}',
    label: 'Nom',
    description: 'Nom du talent',
    resolve: (c) => c.nom,
  },
  {
    token: '{{CAMPUS}}',
    label: 'Campus',
    description: 'Nom du campus du talent',
    resolve: (c) => c.campusName,
  },
  {
    token: '{{EMAIL_CAMPUS}}',
    label: 'Email campus',
    description: 'Adresse de contact du campus',
    resolve: (c) => c.campusContactEmail ?? '',
  },
  {
    token: '{{STAGE}}',
    label: 'Stage',
    description: 'Nom du stage en cours',
    resolve: (c) => c.stageName ?? '',
  },
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tokenPattern(token: string): RegExp {
  // Escape regex-significant chars (the braces) and match case-insensitively,
  // preserving the leniency the original `/\{\{PRENOM\}\}/gi` substitution had.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return new RegExp(escaped, 'gi');
}

/**
 * Replaces every known token in the (already DOMPurify-sanitized) HTML content
 * with its resolved value. Resolved values are HTML-escaped because they land
 * in markup rendered with `{@html}` - a campus name or email must never be able
 * to inject tags.
 */
export function renderNewsPost(content: string, ctx: NewsPostContext): string {
  let out = content;
  for (const variable of NEWS_POST_VARIABLES) {
    out = out.replace(tokenPattern(variable.token), () =>
      escapeHtml(variable.resolve(ctx)),
    );
  }
  return out;
}

/** Placeholder context for the admin preview when no real talent applies. */
export function sampleNewsPostContext(): NewsPostContext {
  return {
    prenom: 'Marie',
    nom: 'Dupont',
    campusName: 'Paris',
    campusContactEmail: 'contact@epitech.eu',
    stageName: 'Stage de seconde',
  };
}

/** Default expiration: 14 days from the given date (or now). */
export function defaultExpiresAt(from?: Date): Date {
  const base = from ?? new Date();
  return new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);
}
