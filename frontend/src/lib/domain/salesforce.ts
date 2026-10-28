/**
 * Salesforce Lightning deep-link helpers.
 *
 * `Talent.externalId` holds the Salesforce person a talent is: its Contact once
 * it has one, its Lead while it never became a Contact. `Event.externalId`
 * holds the Campaign. Which record an id names is read off the id itself, from
 * its three-character key prefix, which Salesforce fixes per object in every
 * org: a caller used to say "lead" for a talent, and the link broke on every
 * talent keyed on a Contact. The Epitech tenant URL is hardcoded here for now:
 * when a second org needs a different host, lift this to a runtime env var.
 */
const SF_TENANT_BASE = 'https://epitech.lightning.force.com';

/** Salesforce's own key prefixes for the records Jump links to. */
const OBJECT_BY_KEY_PREFIX: Record<string, string> = {
  '00Q': 'Lead',
  '003': 'Contact',
  '701': 'Campaign',
};

/**
 * Deep-link to the record a Salesforce id names. An id of an object not listed
 * above still opens, through the bare-id address Salesforce redirects to the
 * record's page.
 */
export function salesforceUrl(externalId: string): string {
  const object = OBJECT_BY_KEY_PREFIX[externalId.slice(0, 3)];
  return object
    ? `${SF_TENANT_BASE}/lightning/r/${object}/${externalId}/view`
    : `${SF_TENANT_BASE}/${externalId}`;
}
