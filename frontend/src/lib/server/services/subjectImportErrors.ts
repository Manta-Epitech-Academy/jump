import type { ImportSubjectError } from './subjectImporter';

/**
 * Single source of truth for mapping {@link ImportSubjectError} kinds to
 * HTTP status codes. Used by both the import / resync API endpoints and the
 * admin templates form action.
 */
export function importErrorToHttpStatus(
  kind: ImportSubjectError['kind'],
): 400 | 409 | 422 | 500 {
  switch (kind) {
    case 'no_ref_comp':
      return 409;
    case 'duplicate_slug':
      return 409;
    case 'invalid_metadata':
    case 'fetch_failed':
    case 'unresolved_observable':
      return 422;
  }
}
