import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startImpersonation, stopImpersonation } from './impersonate';
import { prisma } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import * as talentAccount from '$lib/server/services/talentAccount';
import type { Cookies } from '@sveltejs/kit';

// What BetterAuth's stop answers, set per test. The call is made with
// `asResponse: true`, an overload `vi.mocked` cannot type.
const stop = vi.hoisted(() => ({ response: new Response(null) }));

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
      stopImpersonating: vi.fn(async () => stop.response),
    },
  },
}));

vi.mock('$lib/server/auth/cookies', () => ({
  forwardAuthCookies: vi.fn(),
}));

const { forwardAuthCookies } = await import('$lib/server/auth/cookies');

describe('impersonate - startImpersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const startForTalent = () =>
    startImpersonation(
      { kind: 'talent', id: 'talent_123' },
      new Request('http://localhost/staff/admin/impersonate', {
        method: 'POST',
      }),
      {} as Cookies,
      'admin_user_789',
    );

  it('says a talent with no Salesforce address has no email, and starts nothing', async () => {
    vi.spyOn(talentAccount, 'ensureTalentUser').mockRejectedValue(
      new talentAccount.TalentAccountError('no_email', 'pas d’adresse'),
    );

    expect(await startForTalent()).toEqual({ ok: false, reason: 'no_email' });
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

  it('tells an address already held by another account from a missing one', async () => {
    vi.spyOn(talentAccount, 'ensureTalentUser').mockRejectedValue(
      new talentAccount.TalentAccountError('identity_conflict', 'déjà prise'),
    );

    expect(await startForTalent()).toEqual({
      ok: false,
      reason: 'identity_conflict',
    });
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

  it('lets a failure of ours through instead of calling it a missing email', async () => {
    vi.spyOn(talentAccount, 'ensureTalentUser').mockRejectedValue(
      new Error('database down'),
    );

    await expect(startForTalent()).rejects.toThrow('database down');
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

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

describe('impersonate - stopImpersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const request = new Request('http://localhost/api/impersonation/stop', {
    method: 'POST',
  });
  const cookies = {} as Cookies;

  it('closes the admin window when the admin leaves, not at their next start', async () => {
    stop.response = new Response(null, { status: 200 });

    expect(await stopImpersonation(request, cookies, 'admin_user_789')).toBe(
      true,
    );
    expect(auth.api.stopImpersonating).toHaveBeenCalledWith({
      headers: request.headers,
      asResponse: true,
    });
    expect(prisma.audit_ImpersonationEvent.updateMany).toHaveBeenCalledWith({
      where: { adminUserId: 'admin_user_789', endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
    expect(forwardAuthCookies).toHaveBeenCalledWith(stop.response, cookies);
  });

  it('writes nothing and sets no cookie when BetterAuth refuses', async () => {
    stop.response = new Response(null, { status: 400 });

    expect(await stopImpersonation(request, cookies, 'admin_user_789')).toBe(
      false,
    );
    expect(prisma.audit_ImpersonationEvent.updateMany).not.toHaveBeenCalled();
    expect(forwardAuthCookies).not.toHaveBeenCalled();
  });
});
