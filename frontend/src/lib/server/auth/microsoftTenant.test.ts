import { describe, it, expect } from 'vitest';
import { pinnedMicrosoftTenant } from './microsoftTenant';

/**
 * Every value that lets more than one Entra directory complete the staff
 * Microsoft door must stop the server from booting. Unpinned, the provider
 * falls back to `common` silently, and any directory's administrator can assert
 * an admin's address and be linked onto their account.
 */
describe('pinnedMicrosoftTenant', () => {
  it('passes one directory id through', () => {
    const tenant = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
    expect(pinnedMicrosoftTenant(tenant)).toBe(tenant);
  });

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['the multi-directory endpoint', 'common'],
    ['every work directory', 'organizations'],
    ['every personal account', 'consumers'],
    ['the personal accounts directory', '9188040D-6C67-4C5B-B112-36A304B66DAD'],
    ['a domain name', 'epitech.eu'],
    ['a placeholder', 'ci-dummy'],
  ])('refuses %s', (_label, value) => {
    expect(() => pinnedMicrosoftTenant(value)).toThrow(/MICROSOFT_TENANT_ID/);
  });
});
