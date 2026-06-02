import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';

const PHOTO_SIZE = 96;

export function avatarStorageKey(userId: string): string {
  return `avatars/${userId}.jpg`;
}

// Refresh bauth_user.image from MS Graph. BetterAuth's Microsoft provider
// only fetches the photo on first user creation, so pre-provisioned accounts
// (e.g. seeded via scripts/add-admin-user.ts) and subsequent logins never
// pick up profile photo changes. Best-effort: failures must not block login.
export async function syncMicrosoftAvatar(userId: string): Promise<void> {
  try {
    const account = await prisma.bauth_account.findFirst({
      where: { userId, providerId: 'microsoft' },
      select: { accessToken: true },
    });
    if (!account?.accessToken) return;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/photos/${PHOTO_SIZE}x${PHOTO_SIZE}/$value`,
      { headers: { Authorization: `Bearer ${account.accessToken}` } },
    );
    // 404 = user has no Graph photo set; skip silently.
    if (!res.ok) return;

    const buffer = Buffer.from(await res.arrayBuffer());
    await getStorage().save(avatarStorageKey(userId), buffer, 'image/jpeg');

    // Cache-busting token: changes on each sync so the proxy URL stored in
    // bauth_user.image can be served with `immutable` browser caching.
    const v = Date.now().toString(36);
    await prisma.bauth_user.update({
      where: { id: userId },
      data: { image: `/api/avatars/${userId}?v=${v}` },
    });
  } catch (err) {
    console.error('[microsoftProfile] avatar sync failed', err);
  }
}
