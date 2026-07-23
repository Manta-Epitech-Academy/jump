import { describe, it, expect, vi } from 'vitest';
import { startImpersonation } from './impersonate';
import { prisma } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import * as talentAccount from '$lib/server/services/talentAccount';
import type { Cookies } from '@sveltejs/kit';

vi.mock('$lib/server/db', () => ({
  prisma: {
    staffProfile: { findUnique: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
    audit_ImpersonationEvent: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      impersonateUser: vi.fn().mockResolvedValue({ ok: true }),
    },
  },
}));

vi.mock('$lib/server/auth/cookies', () => ({
  forwardAuthCookies: vi.fn(),
}));

describe('impersonate - startImpersonation', () => {
  it('creates an Audit_ImpersonationEvent record upon successful impersonation start', async () => {
    vi.spyOn(talentAccount, 'ensureTalentUser').mockResolvedValue(
      'user_target_456',
    );

    const req = new Request('http://localhost/staff/admin/impersonate', {
      method: 'POST',
    });
    const cookies = {} as Cookies;

    const result = await startImpersonation(
      { kind: 'talent', id: 'talent_123' },
      req,
      cookies,
      'admin_user_789',
    );

    expect(result).toEqual({ ok: true, redirect: '/' });
    expect(auth.api.impersonateUser).toHaveBeenCalledWith({
      body: { userId: 'user_target_456' },
      headers: req.headers,
      asResponse: true,
    });

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
