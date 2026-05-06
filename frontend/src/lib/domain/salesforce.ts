/**
 * Salesforce Lightning deep-link helpers.
 *
 * `Talent.externalId` holds the Salesforce Lead 18-char id seeded at CSV
 * import time (talents enter the funnel as Leads before being converted to
 * Contacts). `Event.externalId` holds the Salesforce Campaign id linked at
 * import time. The Epitech tenant URL is hardcoded here for now — when a
 * second org needs a different host, lift this to a runtime env var.
 */
const SF_TENANT_BASE = 'https://epitech.lightning.force.com';

export function salesforceContactUrl(externalId: string): string {
  return `${SF_TENANT_BASE}/lightning/r/Lead/${externalId}/view`;
}

export function salesforceCampaignUrl(externalId: string): string {
  return `${SF_TENANT_BASE}/lightning/r/Campaign/${externalId}/view`;
}
